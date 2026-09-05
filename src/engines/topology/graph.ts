import { TopologyGraph, TopologyNode, ServerBlockNode, LocationRouteNode, RouteActionType } from '../../types/topology';
import { parseNginxToToggles } from '../nginx/mutator';

/**
 * Extracts and parses all `server { ... }` blocks and their nested `location` routes from Nginx config.
 */
export function extractServerBlocks(content: string): ServerBlockNode[] {
  const serverBlocks: ServerBlockNode[] = [];
  const serverRegex = /server\s*\{([\s\S]*?)(?=\n\s*server\s*\{|\n\s*\}\s*$|$)/gi;

  let match: RegExpExecArray | null;
  let serverIndex = 1;

  while ((match = serverRegex.exec(content)) !== null) {
    const serverBody = match[1];

    // 1. Listen Port & Protocol flags
    const listenMatch = serverBody.match(/listen\s+([^;]+);/i);
    const listenStr = listenMatch ? listenMatch[1].trim() : '80';
    const isSsl = /\bssl\b/i.test(listenStr) || /ssl\s+on;/i.test(serverBody) || /ssl_certificate/i.test(serverBody);
    const http2 = /\bhttp2\b/i.test(listenStr) || /http2\s+on;/i.test(serverBody);

    const portMatch = listenStr.match(/(?:^|[^\d])(\d{2,5})(?:[^\d]|$)/);
    const port = portMatch ? portMatch[1] : isSsl ? '443' : '80';

    // 2. Server Name (Domain)
    const serverNameMatch = serverBody.match(/server_name\s+([^;]+);/i);
    const serverName = serverNameMatch ? serverNameMatch[1].trim().split(/\s+/)[0] : isSsl ? 'production.app.com' : 'default_server';

    // 3. SSL Protocols
    const sslProtoMatch = serverBody.match(/ssl_protocols\s+([^;]+);/i);
    const sslProfile = sslProtoMatch ? sslProtoMatch[1].trim() : isSsl ? 'TLSv1.3' : undefined;

    // 4. Locations parsing
    const locations: LocationRouteNode[] = [];
    const locationRegex = /location\s+([^{]+)\{([\s\S]*?)\}/gi;
    let locMatch: RegExpExecArray | null;
    let locIndex = 1;

    while ((locMatch = locationRegex.exec(serverBody)) !== null) {
      const locPath = locMatch[1].trim();
      const locBody = locMatch[2];

      let actionType: RouteActionType = 'static';
      let target = 'Static Files';
      const directives: string[] = [];

      // Proxy Pass
      const proxyMatch = locBody.match(/proxy_pass\s+([^;]+);/i);
      if (proxyMatch) {
        actionType = 'proxy';
        target = proxyMatch[1].trim();
        directives.push(`Reverse Proxy: ${target}`);
      }

      // Return / Redirect
      const returnMatch = locBody.match(/return\s+(301|302|307|308)\s+([^;]+);/i);
      if (returnMatch) {
        actionType = 'redirect';
        target = `HTTP ${returnMatch[1]} -> ${returnMatch[2].trim()}`;
        directives.push(`Redirect: ${target}`);
      }

      // Root / Static
      const rootMatch = locBody.match(/(?:root|alias)\s+([^;]+);/i);
      if (rootMatch && actionType !== 'proxy' && actionType !== 'redirect') {
        actionType = 'static';
        target = `DocRoot: ${rootMatch[1].trim()}`;
        directives.push(`Webroot: ${rootMatch[1].trim()}`);
      }

      // Deny
      if (/deny\s+all;/i.test(locBody)) {
        actionType = 'deny';
        target = '403 Forbidden (Blocked)';
        directives.push('Access Rule: deny all');
      }

      // Rate Limiting
      let rateLimit: string | undefined;
      const rateLimitMatch = locBody.match(/limit_req\s+([^;]+);/i);
      if (rateLimitMatch) {
        rateLimit = rateLimitMatch[1].trim();
        directives.push(`Rate Limit: ${rateLimit}`);
      }

      // WebSockets
      const websocket = /Upgrade\s+\$http_upgrade/i.test(locBody);
      if (websocket) {
        directives.push('WebSocket Upgrade: Enabled');
      }

      // Timeouts
      let timeout: string | undefined;
      const timeoutMatch = locBody.match(/proxy_read_timeout\s+([^;]+);/i);
      if (timeoutMatch) {
        timeout = timeoutMatch[1].trim();
        directives.push(`Read Timeout: ${timeout}`);
      }

      locations.push({
        id: `server-${serverIndex}-loc-${locIndex++}`,
        path: locPath,
        actionType,
        target,
        directives,
        rateLimit,
        websocket,
        timeout,
      });
    }

    // Default root location if none parsed
    if (locations.length === 0) {
      locations.push({
        id: `server-${serverIndex}-loc-1`,
        path: '/',
        actionType: isSsl ? 'proxy' : 'redirect',
        target: isSsl ? 'http://127.0.0.1:3000' : 'https://$host$request_uri',
        directives: [isSsl ? 'Default Reverse Proxy' : 'HTTP to HTTPS Upgrade'],
      });
    }

    serverBlocks.push({
      id: `server-block-${serverIndex++}`,
      serverName,
      listenPort: port,
      isSsl,
      http2,
      sslProfile,
      locations,
    });
  }

  // If content is empty or no server blocks matched, return empty list without injecting fake dummy servers
  return serverBlocks;
}

export function buildTopologyGraphFromNginx(content: string): TopologyGraph {
  if (!content || !content.trim()) {
    return {
      targetDomain: '',
      ingress: {
        domain: '',
        ports: [],
        protocol: 'HTTP/1.1',
      },
      serverBlocks: [],
      nodes: [],
    };
  }

  const toggles = parseNginxToToggles(content);
  const serverBlocks = extractServerBlocks(content);

  if (serverBlocks.length === 0) {
    return {
      targetDomain: '',
      ingress: {
        domain: '',
        ports: [],
        protocol: toggles.http2 ? 'HTTP/2' : 'HTTP/1.1',
      },
      serverBlocks: [],
      nodes: [],
    };
  }

  const primaryDomain = serverBlocks.find((s) => s.isSsl)?.serverName || serverBlocks[0]?.serverName || 'production.app.com';
  const allPorts = Array.from(new Set(serverBlocks.map((s) => s.listenPort)));

  const nodes: TopologyNode[] = [];

  // 1. Ingress Source Node
  nodes.push({
    id: 'node-ingress',
    stepNumber: 1,
    icon: '🌐',
    title: '1. Client Ingress',
    subtext: `https://${primaryDomain} · Ports ${allPorts.join(', ')}`,
    status: 'active',
    statusLabel: 'INGRESS ACTIVE',
    port: allPorts.map((p) => `${p} TCP`).join(' / '),
    nodeType: 'source',
    metrics: {
      primaryLabel: 'Ingress Protocol',
      primaryValue: toggles.http2 ? 'HTTP/2 Binary' : 'HTTP/1.1 Standard',
      secondaryLabel: 'Virtual Hosts',
      secondaryValue: `${serverBlocks.length} Server Blocks`,
    },
    details: [
      `Target Domain: ${primaryDomain}`,
      `Listening Ports: ${allPorts.join(', ')}`,
      `Protocol: ${toggles.http2 ? 'HTTP/2 (Multiplexed Streams)' : 'HTTP/1.1'}`,
      `Total Server Blocks: ${serverBlocks.length}`,
    ],
  });

  // 2. Server Block Nodes
  serverBlocks.forEach((sb, idx) => {
    nodes.push({
      id: sb.id,
      stepNumber: idx + 2,
      icon: sb.isSsl ? '🔒' : '🌐',
      title: `Server: ${sb.serverName}:${sb.listenPort}`,
      subtext: sb.isSsl ? `${sb.sslProfile || 'TLS 1.3'} ${sb.http2 ? '(HTTP/2)' : ''}` : 'HTTP Listener',
      status: sb.isSsl ? 'active' : 'warning',
      statusLabel: sb.isSsl ? `PORT ${sb.listenPort} (SSL)` : `PORT ${sb.listenPort} (HTTP)`,
      port: `Port ${sb.listenPort}`,
      nodeType: 'server',
      metrics: {
        primaryLabel: 'Routing Rules',
        primaryValue: `${sb.locations.length} Locations`,
        secondaryLabel: 'Security',
        secondaryValue: sb.isSsl ? (sb.sslProfile || 'TLS Modern') : 'Plain HTTP',
      },
      details: [
        `Server Name: ${sb.serverName}`,
        `Listen Port: ${sb.listenPort} ${sb.isSsl ? 'SSL' : 'HTTP'} ${sb.http2 ? 'HTTP/2' : ''}`,
        `Locations Configured: ${sb.locations.map((l) => l.path).join(', ')}`,
      ],
    });
  });

  // 3. Destination Upstream Nodes
  const proxyTargets = Array.from(new Set(serverBlocks.flatMap((sb) => sb.locations.map((l) => l.target))));
  proxyTargets.forEach((tgt, idx) => {
    const isProxy = tgt.startsWith('http');
    const isRedirect = tgt.includes('Redirect');
    const isDeny = tgt.includes('Blocked');

    nodes.push({
      id: `node-upstream-${idx + 1}`,
      stepNumber: serverBlocks.length + idx + 2,
      icon: isProxy ? '🚀' : isRedirect ? '🔁' : isDeny ? '🚫' : '📁',
      title: `Destination: ${tgt}`,
      subtext: isProxy ? 'Backend Upstream' : isRedirect ? 'HTTPS Upgrade' : isDeny ? 'Access Guard' : 'Webroot',
      status: isDeny ? 'warning' : 'active',
      statusLabel: isProxy ? 'UPSTREAM LIVE' : isRedirect ? 'REDIRECT' : isDeny ? 'BLOCKED' : 'STATIC ROOT',
      port: isProxy ? tgt.replace(/https?:\/\//i, '').split('/')[0] : 'App Layer',
      nodeType: 'destination',
      metrics: {
        primaryLabel: 'Action Type',
        primaryValue: isProxy ? 'Reverse Proxy' : isRedirect ? 'HTTP 301' : isDeny ? 'Deny Rule' : 'Static Files',
        secondaryLabel: 'Target',
        secondaryValue: tgt,
      },
      details: [
        `Target Destination: ${tgt}`,
        `Compression: ${toggles.gzipEnabled ? 'Gzip Active' : 'Off'}`,
        `Origin Protection: Shielded by Nginx`,
      ],
    });
  });

  return {
    targetDomain: primaryDomain,
    ingress: {
      domain: primaryDomain,
      ports: allPorts,
      protocol: toggles.http2 ? 'HTTP/2' : 'HTTP/1.1',
    },
    serverBlocks,
    nodes,
  };
}
