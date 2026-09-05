import { ScoreBreakdown } from './score';
import { tokenizeNginx } from './tokenizer';

export interface NginxAuditResult extends ScoreBreakdown {
  issues: {
    severity: 'critical' | 'warning' | 'optimal';
    title: string;
    description: string;
    lineNumber?: number;
  }[];
  syntaxValid: boolean;
  isEmpty?: boolean;
  unresolvedIncludes?: string[];
}

export interface NginxSyntaxError {
  line: number;
  message: string;
}

/**
 * Validates Nginx block structures, brace matching, minimum signature, and syntax rules (client-side nginx -t simulation)
 * Powered by lexical tokenizer to eliminate false positives from quoted strings and comments.
 */
export function validateNginxSyntax(content: string): NginxSyntaxError[] {
  // If content is empty, do not throw syntax errors
  if (!content || !content.trim()) {
    return [];
  }

  const errors: NginxSyntaxError[] = [];
  const tokens = tokenizeNginx(content, { includeComments: false });

  // 1. Check for comments-only or whitespace-only content
  if (tokens.length === 0) {
    return [];
  }

  // 2. Minimum Signature Check: Must contain recognized Nginx blocks or directives
  const recognizedConstructs = new Set([
    'events', 'http', 'server', 'location', 'upstream', 'stream', 'mail', 'types', 'map',
    'add_header', 'listen', 'server_name', 'proxy_pass', 'include', 'root', 'index',
    'ssl_certificate', 'ssl_protocols', 'server_tokens', 'limit_req', 'worker_processes',
    'sendfile', 'gzip', 'user', 'pid'
  ]);

  const hasRecognizedNginxConstruct = tokens.some(
    (t) => t.type === 'word' && recognizedConstructs.has(t.value.toLowerCase())
  );

  if (!hasRecognizedNginxConstruct) {
    return [
      {
        line: 1,
        message:
          "Invalid file format: Not a recognized Nginx configuration. Expected core blocks ('http', 'server', 'location', 'events') or valid Nginx directives.",
      },
    ];
  }

  // 3. Root Level Structure Check: If events/worker_processes are defined (full root config), http/stream/server must exist
  const isRootConfig = tokens.some(
    (t) =>
      t.type === 'word' &&
      ['events', 'worker_processes', 'worker_rlimit_nofile', 'pid'].includes(t.value.toLowerCase())
  );
  const hasServerOrHttp = tokens.some(
    (t) =>
      t.type === 'word' &&
      ['http', 'server', 'stream', 'mail'].includes(t.value.toLowerCase())
  );

  if (isRootConfig && !hasServerOrHttp) {
    errors.push({
      line: 1,
      message: "Missing 'http {' or 'server {' block in root Nginx configuration.",
    });
  }

  // 4. Token-Driven Structural Validation (Block Balances & Semicolons)
  interface BlockStackItem {
    name: string;
    line: number;
  }
  const blockStack: BlockStackItem[] = [];

  const singleLineDirectives = new Set([
    'user', 'pid', 'worker_processes', 'worker_connections', 'worker_rlimit_nofile',
    'sendfile', 'tcp_nopush', 'tcp_nodelay', 'server_tokens', 'keepalive_timeout',
    'client_max_body_size', 'default_type', 'server_name', 'listen', 'ssl_certificate',
    'ssl_certificate_key', 'ssl_protocols', 'ssl_ciphers', 'ssl_prefer_server_ciphers',
    'ssl_stapling', 'ssl_stapling_verify', 'ssl_session_timeout', 'ssl_session_cache',
    'ssl_session_tickets', 'ssl_dhparam', 'resolver', 'resolver_timeout', 'proxy_pass',
    'proxy_http_version', 'proxy_set_header', 'proxy_connect_timeout', 'proxy_read_timeout',
    'proxy_send_timeout', 'add_header', 'limit_req', 'limit_req_zone', 'limit_req_status',
    'gzip', 'gzip_vary', 'gzip_proxied', 'gzip_comp_level', 'gzip_min_length', 'deny',
    'allow', 'return', 'root', 'index'
  ]);

  let currentDirective: { name: string; line: number } | null = null;
  let lastWordBeforeBlock = 'block';

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];

    if (token.type === 'word') {
      const wordLower = token.value.toLowerCase();
      lastWordBeforeBlock = token.value;

      if (currentDirective === null) {
        if (singleLineDirectives.has(wordLower)) {
          currentDirective = { name: wordLower, line: token.line };
        }
      } else {
        // If we are tracking a singleLineDirective and encounter another known directive start on a subsequent line
        if (token.line > currentDirective.line && singleLineDirectives.has(wordLower)) {
          errors.push({
            line: currentDirective.line,
            message: `Directive '${currentDirective.name}' is missing a terminating semicolon ';'`,
          });
          currentDirective = { name: wordLower, line: token.line };
        }
      }
    } else if (token.type === 'block_open') {
      // Clear any pending directive
      currentDirective = null;
      blockStack.push({ name: lastWordBeforeBlock, line: token.line });
      lastWordBeforeBlock = 'block';
    } else if (token.type === 'block_close') {
      if (currentDirective !== null) {
        errors.push({
          line: currentDirective.line,
          message: `Directive '${currentDirective.name}' is missing a terminating semicolon ';'`,
        });
        currentDirective = null;
      }

      if (blockStack.length === 0) {
        errors.push({
          line: token.line,
          message: `Unexpected closing brace '}' without matching opening block. Check for missing 'http {' or extra '}'.`,
        });
      } else {
        blockStack.pop();
      }
    } else if (token.type === 'semicolon') {
      currentDirective = null;
    }
  }

  // Trailing directive missing semicolon at EOF
  if (currentDirective !== null) {
    errors.push({
      line: currentDirective.line,
      message: `Directive '${currentDirective.name}' is missing a terminating semicolon ';'`,
    });
  }

  // Check for unclosed blocks at EOF
  while (blockStack.length > 0) {
    const unclosed = blockStack.pop();
    if (unclosed) {
      errors.push({
        line: unclosed.line,
        message: `Unclosed '${unclosed.name}' block opened at line ${unclosed.line}. Missing closing brace '}'.`,
      });
    }
  }

  return errors;
}

export interface ActiveNginxDirective {
  name: string;
  args: string[];
  rawArgs: string;
  line: number;
  isBlock: boolean;
  context: string;
  contextPath: string[];
  blockId: number;
}

interface BlockFrame {
  id: number;
  name: string;
  line: number;
}

/**
 * Extracts active Nginx directives from configuration content, ignoring all comments
 * while preserving quoted string arguments, structure, and structural block context hierarchy.
 */
export function parseActiveNginxDirectives(content: string): ActiveNginxDirective[] {
  const tokens = tokenizeNginx(content || '', { includeComments: false });
  const directives: ActiveNginxDirective[] = [];

  let currentName: string | null = null;
  let currentArgs: string[] = [];
  let startLine = 1;

  let blockCounter = 0;
  const blockStack: BlockFrame[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'word' || token.type === 'string') {
      if (currentName === null) {
        currentName = token.value.toLowerCase();
        currentArgs = [];
        startLine = token.line;
      } else {
        currentArgs.push(token.value);
      }
    } else if (token.type === 'semicolon') {
      if (currentName !== null) {
        const currentContext = blockStack.length > 0 ? blockStack[blockStack.length - 1].name : 'root';
        const currentContextPath = blockStack.map((b) => b.name);
        const currentBlockId = blockStack.length > 0 ? blockStack[blockStack.length - 1].id : 0;

        directives.push({
          name: currentName,
          args: currentArgs,
          rawArgs: currentArgs.join(' '),
          line: startLine,
          isBlock: false,
          context: currentContext,
          contextPath: currentContextPath,
          blockId: currentBlockId,
        });
        currentName = null;
        currentArgs = [];
      }
    } else if (token.type === 'block_open') {
      if (currentName !== null) {
        const parentContext = blockStack.length > 0 ? blockStack[blockStack.length - 1].name : 'root';
        const parentContextPath = blockStack.map((b) => b.name);

        blockCounter++;
        const thisBlockId = blockCounter;

        directives.push({
          name: currentName,
          args: currentArgs,
          rawArgs: currentArgs.join(' '),
          line: startLine,
          isBlock: true,
          context: parentContext,
          contextPath: parentContextPath,
          blockId: thisBlockId,
        });

        blockStack.push({
          id: thisBlockId,
          name: currentName,
          line: startLine,
        });

        currentName = null;
        currentArgs = [];
      }
    } else if (token.type === 'block_close') {
      if (currentName !== null) {
        const currentContext = blockStack.length > 0 ? blockStack[blockStack.length - 1].name : 'root';
        const currentContextPath = blockStack.map((b) => b.name);
        const currentBlockId = blockStack.length > 0 ? blockStack[blockStack.length - 1].id : 0;

        directives.push({
          name: currentName,
          args: currentArgs,
          rawArgs: currentArgs.join(' '),
          line: startLine,
          isBlock: false,
          context: currentContext,
          contextPath: currentContextPath,
          blockId: currentBlockId,
        });
        currentName = null;
        currentArgs = [];
      }

      if (blockStack.length > 0) {
        blockStack.pop();
      }
    }
  }

  if (currentName !== null) {
    const currentContext = blockStack.length > 0 ? blockStack[blockStack.length - 1].name : 'root';
    const currentContextPath = blockStack.map((b) => b.name);
    const currentBlockId = blockStack.length > 0 ? blockStack[blockStack.length - 1].id : 0;

    directives.push({
      name: currentName,
      args: currentArgs,
      rawArgs: currentArgs.join(' '),
      line: startLine,
      isBlock: false,
      context: currentContext,
      contextPath: currentContextPath,
      blockId: currentBlockId,
    });
  }

  return directives;
}

export interface EffectiveSecurityHeader {
  name: string;
  value: string;
  rawArgs: string;
  line: number;
  source: 'http' | 'server' | 'location';
}

export interface ContextResolvedHeaders {
  hsts?: EffectiveSecurityHeader;
  xFrameOptions?: EffectiveSecurityHeader;
  xContentTypeOptions?: EffectiveSecurityHeader;
  otherHeaders: string[];
  overrodeParent: boolean;
}

export interface ResolvedNginxServerContext {
  blockId: number;
  isHttps: boolean;
  listenPorts: number[];
  effectiveHeaders: ContextResolvedHeaders;
  locations: {
    blockId: number;
    effectiveHeaders: ContextResolvedHeaders;
  }[];
}

function extractHeadersFromDirectives(
  addHeaders: ActiveNginxDirective[],
  source: 'http' | 'server' | 'location'
): {
  hsts?: EffectiveSecurityHeader;
  xFrameOptions?: EffectiveSecurityHeader;
  xContentTypeOptions?: EffectiveSecurityHeader;
  otherHeaders: string[];
} {
  let hsts: EffectiveSecurityHeader | undefined;
  let xFrameOptions: EffectiveSecurityHeader | undefined;
  let xContentTypeOptions: EffectiveSecurityHeader | undefined;
  const otherHeaders: string[] = [];

  for (const d of addHeaders) {
    if (d.args.length === 0) continue;
    const headerName = d.args[0].toLowerCase();
    const headerVal = d.args.slice(1).join(' ');

    if (headerName === 'strict-transport-security') {
      hsts = {
        name: 'Strict-Transport-Security',
        value: headerVal,
        rawArgs: d.rawArgs,
        line: d.line,
        source,
      };
    } else if (headerName === 'x-frame-options') {
      xFrameOptions = {
        name: 'X-Frame-Options',
        value: headerVal,
        rawArgs: d.rawArgs,
        line: d.line,
        source,
      };
    } else if (headerName === 'x-content-type-options') {
      xContentTypeOptions = {
        name: 'X-Content-Type-Options',
        value: headerVal,
        rawArgs: d.rawArgs,
        line: d.line,
        source,
      };
    } else {
      otherHeaders.push(d.args[0]);
    }
  }

  return { hsts, xFrameOptions, xContentTypeOptions, otherHeaders };
}

/**
 * Resolves effective security headers across Nginx http, server, and location block inheritance hierarchies.
 */
export function resolveEffectiveNginxSecurityHeaders(directives: ActiveNginxDirective[]): {
  httpHeaders: ContextResolvedHeaders;
  servers: ResolvedNginxServerContext[];
} {
  const httpAddHeaders = directives.filter((d) => d.name === 'add_header' && d.context === 'http');
  const extractedHttp = extractHeadersFromDirectives(httpAddHeaders, 'http');
  const httpHeaders: ContextResolvedHeaders = {
    ...extractedHttp,
    overrodeParent: false,
  };

  const serverBlockDirectives = directives.filter((d) => d.name === 'server' && d.isBlock);
  const servers: ResolvedNginxServerContext[] = [];

  // If no explicit server blocks exist, create a synthetic server representing the root/http context
  if (serverBlockDirectives.length === 0) {
    const rootAddHeaders = directives.filter((d) => d.name === 'add_header');
    const extractedRoot = extractHeadersFromDirectives(rootAddHeaders, 'server');
    const isHttps = directives.some(
      (d) =>
        (d.name === 'listen' && d.args.some((a) => a.toLowerCase() === 'ssl' || a === '443')) ||
        d.name === 'ssl_certificate' ||
        d.name === 'ssl_protocols'
    );
    servers.push({
      blockId: 0,
      isHttps,
      listenPorts: [],
      effectiveHeaders: {
        ...extractedRoot,
        overrodeParent: false,
      },
      locations: [],
    });
    return { httpHeaders, servers };
  }

  for (const srv of serverBlockDirectives) {
    const srvDirectives = directives.filter((d) => d.blockId === srv.blockId && !d.isBlock);
    const listenDirectives = srvDirectives.filter((d) => d.name === 'listen');
    const listenPorts: number[] = [];
    let isHttps = false;

    for (const l of listenDirectives) {
      for (const arg of l.args) {
        const portNum = parseInt(arg, 10);
        if (!isNaN(portNum)) listenPorts.push(portNum);
        if (arg.toLowerCase() === 'ssl' || arg === '443') {
          isHttps = true;
        }
      }
    }

    if (
      srvDirectives.some(
        (d) => d.name === 'ssl_certificate' || (d.name === 'ssl' && d.args.includes('on'))
      )
    ) {
      isHttps = true;
    }

    // Direct add_header inside this server block
    const srvAddHeaders = srvDirectives.filter((d) => d.name === 'add_header');

    let serverEffective: ContextResolvedHeaders;
    if (srvAddHeaders.length === 0) {
      // Inherits from http
      serverEffective = {
        hsts: httpHeaders.hsts,
        xFrameOptions: httpHeaders.xFrameOptions,
        xContentTypeOptions: httpHeaders.xContentTypeOptions,
        otherHeaders: [...httpHeaders.otherHeaders],
        overrodeParent: false,
      };
    } else {
      const extractedSrv = extractHeadersFromDirectives(srvAddHeaders, 'server');
      serverEffective = {
        ...extractedSrv,
        overrodeParent: httpAddHeaders.length > 0,
      };
    }

    // Find location blocks inside this server
    const nextServer = serverBlockDirectives.find((s) => s.blockId > srv.blockId);
    const maxBlockId = nextServer ? nextServer.blockId : Infinity;

    const locBlockDirectives = directives.filter(
      (d) =>
        d.name === 'location' &&
        d.isBlock &&
        d.blockId > srv.blockId &&
        d.blockId < maxBlockId
    );

    const locations: ResolvedNginxServerContext['locations'] = [];

    for (const loc of locBlockDirectives) {
      const locDirectives = directives.filter((d) => d.blockId === loc.blockId && !d.isBlock);
      const locAddHeaders = locDirectives.filter((d) => d.name === 'add_header');

      let locEffective: ContextResolvedHeaders;
      if (locAddHeaders.length === 0) {
        // Inherits from server
        locEffective = {
          hsts: serverEffective.hsts,
          xFrameOptions: serverEffective.xFrameOptions,
          xContentTypeOptions: serverEffective.xContentTypeOptions,
          otherHeaders: [...serverEffective.otherHeaders],
          overrodeParent: false,
        };
      } else {
        // Overrides parent server and http headers completely
        const extractedLoc = extractHeadersFromDirectives(locAddHeaders, 'location');
        locEffective = {
          ...extractedLoc,
          overrodeParent: srvAddHeaders.length > 0 || httpAddHeaders.length > 0,
        };
      }

      locations.push({
        blockId: loc.blockId,
        effectiveHeaders: locEffective,
      });
    }

    servers.push({
      blockId: srv.blockId,
      isHttps,
      listenPorts,
      effectiveHeaders: serverEffective,
      locations,
    });
  }

  return { httpHeaders, servers };
}

/**
 * Parses and extracts the numeric max-age value from a Strict-Transport-Security header value or arguments string.
 * Returns the parsed non-negative integer if valid, or null if missing, non-numeric, negative, or malformed.
 */
export function parseHstsMaxAge(rawOrValue: string): number | null {
  if (!rawOrValue) return null;
  const match = rawOrValue.match(/\bmax-age\s*=\s*([^\s;]+)/i);
  if (!match) return null;

  const valStr = match[1].replace(/^["']|["']$/g, '');
  if (!/^\d+$/.test(valStr)) {
    return null;
  }

  const num = parseInt(valStr, 10);
  if (isNaN(num)) return null;
  return num;
}

/**
 * Extracts zone name from a limit_req_zone directive arguments string (e.g. "zone=mylimit:10m" -> "mylimit").
 */
export function extractRateLimitZoneName(rawOrArgs: string): string | null {
  if (!rawOrArgs) return null;
  const match = rawOrArgs.match(/\bzone\s*=\s*([^:\s;]+)/i);
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * Extracts referenced zone name from a limit_req directive arguments string (e.g. "zone=mylimit burst=20" -> "mylimit").
 */
export function extractRateLimitRefZone(rawOrArgs: string): string | null {
  if (!rawOrArgs) return null;
  const match = rawOrArgs.match(/\bzone\s*=\s*([^\s;]+)/i);
  return match ? match[1].trim().toLowerCase() : null;
}

export interface EffectiveRateLimitingResult {
  isEnforced: boolean;
  definedZones: string[];
  enforcements: {
    zone: string;
    line: number;
    context: string;
    contextPath: string[];
    blockId: number;
    isValid: boolean;
  }[];
  unreferencedZones: string[];
  undefinedReferencedZones: string[];
}

export function resolveEffectiveNginxRateLimiting(directives: ActiveNginxDirective[]): EffectiveRateLimitingResult {
  const zoneDirectives = directives.filter((d) => d.name === 'limit_req_zone');
  const definedZoneNames = new Set<string>();

  for (const zd of zoneDirectives) {
    const zName = extractRateLimitZoneName(zd.rawArgs);
    if (zName) {
      definedZoneNames.add(zName);
    }
  }

  const enforcementDirectives = directives.filter((d) => d.name === 'limit_req');
  const enforcements: EffectiveRateLimitingResult['enforcements'] = [];
  const referencedZones = new Set<string>();
  const undefinedReferencedZones: string[] = [];

  for (const ed of enforcementDirectives) {
    const refZone = extractRateLimitRefZone(ed.rawArgs);
    if (refZone) {
      referencedZones.add(refZone);
      const isValid = definedZoneNames.has(refZone);
      enforcements.push({
        zone: refZone,
        line: ed.line,
        context: ed.context,
        contextPath: ed.contextPath,
        blockId: ed.blockId,
        isValid,
      });
      if (!isValid && !undefinedReferencedZones.includes(refZone)) {
        undefinedReferencedZones.push(refZone);
      }
    }
  }

  const unreferencedZones = Array.from(definedZoneNames).filter((z) => !referencedZones.has(z));
  const hasValidEnforcement = enforcements.some((e) => e.isValid);

  return {
    isEnforced: hasValidEnforcement,
    definedZones: Array.from(definedZoneNames),
    enforcements,
    unreferencedZones,
    undefinedReferencedZones,
  };
}

export function auditCustomNginx(content: string): NginxAuditResult {
  // If content is empty or contains only comments/whitespace, return clean idle result
  const tokens = tokenizeNginx(content || '', { includeComments: false });

  if (!content || !content.trim() || tokens.length === 0) {
    return {
      score: 0,
      grade: 'F',
      passedChecks: [],
      recommendations: [],
      issues: [],
      syntaxValid: true,
      isEmpty: true,
    };
  }

  const issues: NginxAuditResult['issues'] = [];
  const passed: string[] = [];
  const recs: string[] = [];
  let score = 30; // Base baseline score

  // 0. Minimum Validation & Nginx Syntax Rules
  const syntaxErrors = validateNginxSyntax(content);
  const syntaxValid = syntaxErrors.length === 0;

  for (const err of syntaxErrors) {
    issues.push({
      severity: 'critical',
      title: 'Nginx Syntax / Block Error',
      description: err.message,
      lineNumber: err.line,
    });
    recs.push(`Fix syntax error at line ${err.line}: ${err.message}`);
  }

  // Extract active directives (guaranteed 0 comments)
  const directives = parseActiveNginxDirectives(content);

  // Identify unresolved includes (e.g. include security-headers.conf;)
  const includeDirectives = directives.filter((d) => d.name === 'include');
  const unresolvedIncludes = includeDirectives.map((d) => d.args.join(' ')).filter(Boolean);

  if (unresolvedIncludes.length > 0) {
    recs.push(
      `External include(s) detected: ${unresolvedIncludes.join(', ')}. Directives in external files are not inspected automatically.`
    );
  }

  // Resolve Context-Aware Effective Headers
  const resolved = resolveEffectiveNginxSecurityHeaders(directives);
  const httpsServers = resolved.servers.filter((s) => s.isHttps);
  const allServers = resolved.servers;

  // 1. TLS Protocols & Legacy SSL Checks
  const sslProtoDirectives = directives.filter((d) => d.name === 'ssl_protocols');
  const allSslArgs = sslProtoDirectives.flatMap((d) => d.args).map((a) => a.toLowerCase());
  const hasSslProtocols = sslProtoDirectives.length > 0;
  const hasTls13 = allSslArgs.some((a) => a.includes('tlsv1.3'));
  const hasLegacySsl = allSslArgs.some((a) =>
    /tlsv1\.0|tlsv1\.1|sslv3|tlsv1(?!\.[23])/i.test(a)
  );

  if (hasTls13) {
    score += 15;
    passed.push('Modern TLS 1.3 protocol enabled');
  } else if (hasSslProtocols) {
    issues.push({
      severity: 'warning',
      title: 'Missing TLS 1.3 Support',
      description: 'Your ssl_protocols directive does not explicitly enable TLSv1.3.',
    });
    recs.push('Add TLSv1.3 to ssl_protocols for forward secrecy and 1-RTT handshake speed');
  }

  if (hasSslProtocols || hasTls13 || hasLegacySsl) {
    if (!hasLegacySsl) {
      score += 10;
      passed.push('Legacy TLS 1.0/1.1 and SSLv3 disabled');
    } else {
      issues.push({
        severity: 'critical',
        title: 'Legacy Insecure SSL Protocols Detected',
        description: 'TLSv1.0 or TLSv1.1 detected in ssl_protocols. Vulnerable to POODLE and BEAST attacks.',
      });
      recs.push('Remove TLSv1 and TLSv1.1 from ssl_protocols; use only TLSv1.2 and TLSv1.3');
    }
  }

  // 2. HSTS (Context-aware & max-age validated: checked against HTTPS server contexts)
  let effectiveHsts: EffectiveSecurityHeader | undefined;
  if (httpsServers.length > 0) {
    effectiveHsts = httpsServers.find((s) => s.effectiveHeaders.hsts)?.effectiveHeaders.hsts;
  } else {
    effectiveHsts =
      allServers.find((s) => s.effectiveHeaders.hsts)?.effectiveHeaders.hsts || resolved.httpHeaders.hsts;
  }

  const hstsMaxAge = effectiveHsts ? parseHstsMaxAge(effectiveHsts.rawArgs || effectiveHsts.value) : null;
  const isHstsSecure = effectiveHsts !== undefined && hstsMaxAge !== null && hstsMaxAge > 0;

  if (isHstsSecure) {
    score += 15;
    passed.push('HSTS (Strict-Transport-Security) header active');
    const hstsRaw = (effectiveHsts?.rawArgs || effectiveHsts?.value || '').toLowerCase();
    if (hstsRaw.includes('preload') && hstsRaw.includes('includesubdomains')) {
      score += 5;
      passed.push('HSTS Preload & Subdomains configured');
    }
  } else if (effectiveHsts && hstsMaxAge === 0) {
    issues.push({
      severity: 'critical',
      title: 'HSTS Ineffective (max-age=0)',
      description:
        'Strict-Transport-Security header is configured with max-age=0, which explicitly disables HSTS protection.',
    });
    recs.push('Increase Strict-Transport-Security max-age to at least 1 year (max-age=31536000 or max-age=63072000)');
  } else if (effectiveHsts) {
    issues.push({
      severity: 'critical',
      title: 'Invalid HSTS Header',
      description: 'Strict-Transport-Security header is missing a valid positive numeric max-age directive.',
    });
    recs.push('Add a valid max-age to Strict-Transport-Security (e.g. "max-age=63072000; includeSubDomains; preload")');
  } else {
    issues.push({
      severity: 'critical',
      title: 'Missing HSTS Header',
      description:
        unresolvedIncludes.length > 0
          ? 'Strict-Transport-Security header is not explicitly configured in this file (unresolved includes are not assumed).'
          : 'Strict-Transport-Security header is not configured. Vulnerable to SSL-stripping attacks.',
    });
    recs.push('Add Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;');
  }

  // 3. Rate Limiting (Hardened zone definition + active enforcement validation)
  const rateLimitResult = resolveEffectiveNginxRateLimiting(directives);

  if (rateLimitResult.isEnforced) {
    score += 15;
    passed.push('Rate limiting / DDoS shield configured and active');
  } else if (rateLimitResult.definedZones.length > 0 && rateLimitResult.enforcements.length === 0) {
    issues.push({
      severity: 'warning',
      title: 'Rate Limit Zone Defined But Unenforced',
      description: `limit_req_zone is defined for zone(s) "${rateLimitResult.definedZones.join(', ')}", but no active limit_req directive applies it to request handling.`,
    });
    recs.push('Add "limit_req zone=..." inside your server or location blocks to enforce request throttling');
  } else if (rateLimitResult.undefinedReferencedZones.length > 0) {
    issues.push({
      severity: 'warning',
      title: 'Undefined Rate Limit Zone Referenced',
      description: `limit_req references zone "${rateLimitResult.undefinedReferencedZones.join(', ')}", but no matching limit_req_zone definition exists.`,
    });
    recs.push(
      `Define the rate limiting zone with "limit_req_zone $binary_remote_addr zone=${rateLimitResult.undefinedReferencedZones[0]}:10m rate=10r/s;" in the http block`
    );
  } else {
    issues.push({
      severity: 'warning',
      title: 'No Rate Limiting / DDoS Shield',
      description: 'No limit_req directives found. Endpoints may be susceptible to brute-force or volumetric DoS.',
    });
    recs.push('Configure limit_req_zone $binary_remote_addr to throttle abusive clients');
  }

  // 4. Server Tokens
  const hasServerTokensOff = directives.some(
    (d) => d.name === 'server_tokens' && d.args.some((a) => a.toLowerCase() === 'off')
  );
  if (hasServerTokensOff) {
    score += 10;
    passed.push('Server version tokens hidden (server_tokens off)');
  } else {
    issues.push({
      severity: 'warning',
      title: 'Server Tokens Exposed',
      description: 'Nginx version is exposed in headers and error pages. Attackers can look up known CVEs.',
    });
    recs.push('Add "server_tokens off;" inside the http block');
  }

  // 5. X-Frame-Options (Context-aware: checked across effective server / http contexts)
  const effectiveXFrame =
    allServers.find((s) => s.effectiveHeaders.xFrameOptions)?.effectiveHeaders.xFrameOptions ||
    resolved.httpHeaders.xFrameOptions;

  if (effectiveXFrame) {
    score += 5;
    passed.push('Clickjacking protection active (X-Frame-Options)');
  } else {
    issues.push({
      severity: 'warning',
      title: 'Missing X-Frame-Options',
      description:
        unresolvedIncludes.length > 0
          ? 'X-Frame-Options header is not explicitly configured in this file (unresolved includes are not assumed).'
          : 'Pages may be embedded inside malicious third-party iframes (Clickjacking).',
    });
  }

  // 6. X-Content-Type-Options (Context-aware: checked across effective server / http contexts)
  const effectiveXContentType =
    allServers.find((s) => s.effectiveHeaders.xContentTypeOptions)?.effectiveHeaders.xContentTypeOptions ||
    resolved.httpHeaders.xContentTypeOptions;

  if (effectiveXContentType) {
    score += 5;
    passed.push('MIME sniffing protection active (nosniff)');
  }

  // 7. OCSP Stapling
  const hasOcspStapling = directives.some(
    (d) => d.name === 'ssl_stapling' && d.args.some((a) => a.toLowerCase() === 'on')
  );
  if (hasOcspStapling) {
    score += 5;
    passed.push('OCSP Stapling enabled for fast TLS validation');
  }

  // If there are syntax or structure errors, invalidate score
  if (!syntaxValid) {
    score = 0;
  }

  // Clamp score
  const finalScore = Math.min(100, Math.max(0, score));
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (syntaxValid) {
    if (finalScore >= 95) grade = 'A+';
    else if (finalScore >= 80) grade = 'A';
    else if (finalScore >= 65) grade = 'B';
    else if (finalScore >= 50) grade = 'C';
    else if (finalScore >= 40) grade = 'D';
  } else {
    grade = 'F';
  }

  return {
    score: finalScore,
    grade,
    passedChecks: syntaxValid ? passed : [],
    recommendations: recs,
    issues,
    syntaxValid,
    isEmpty: false,
    unresolvedIncludes: unresolvedIncludes.length > 0 ? unresolvedIncludes : undefined,
  };
}
