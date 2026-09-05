import {
  parseActiveNginxDirectives,
  resolveEffectiveNginxSecurityHeaders,
  parseHstsMaxAge,
  resolveEffectiveNginxRateLimiting,
} from './parser';

/**
 * AST & Regex Directive Mutator for Nginx Configurations
 * Directly modifies, injects, or toggles hardening directives inside the user's active file.
 */

export interface ParsedNginxToggles {
  serverTokensOff: boolean;
  http2: boolean;
  hstsEnabled: boolean;
  sslModern: boolean;
  rateLimitEnabled: boolean;
  ocspStapling: boolean;
  xFrameOptions: boolean;
  xContentTypeOptions: boolean;
  gzipEnabled: boolean;
}

export function parseNginxToToggles(content: string): ParsedNginxToggles {
  const directives = parseActiveNginxDirectives(content);
  const resolved = resolveEffectiveNginxSecurityHeaders(directives);
  const rateLimitResult = resolveEffectiveNginxRateLimiting(directives);

  const httpsServers = resolved.servers.filter((s) => s.isHttps);
  const effectiveHstsDirective =
    httpsServers.length > 0
      ? httpsServers.find((s) => s.effectiveHeaders.hsts)?.effectiveHeaders.hsts
      : resolved.servers.find((s) => s.effectiveHeaders.hsts)?.effectiveHeaders.hsts || resolved.httpHeaders.hsts;

  const hstsMaxAge = effectiveHstsDirective
    ? parseHstsMaxAge(effectiveHstsDirective.rawArgs || effectiveHstsDirective.value)
    : null;
  const effectiveHsts = effectiveHstsDirective !== undefined && hstsMaxAge !== null && hstsMaxAge > 0;

  const effectiveXFrame =
    resolved.servers.some((s) => s.effectiveHeaders.xFrameOptions) || !!resolved.httpHeaders.xFrameOptions;
  const effectiveXContentType =
    resolved.servers.some((s) => s.effectiveHeaders.xContentTypeOptions) ||
    !!resolved.httpHeaders.xContentTypeOptions;

  const sslProtoDirectives = directives.filter((d) => d.name === 'ssl_protocols');
  const allSslArgs = sslProtoDirectives.flatMap((d) => d.args).map((a) => a.toLowerCase());
  const hasTls13 = allSslArgs.some((a) => a.includes('tlsv1.3'));
  const hasLegacySsl = allSslArgs.some((a) =>
    /tlsv1\.0|tlsv1\.1|sslv3|tlsv1(?!\.[23])/i.test(a)
  );

  const hasHttp2 = directives.some(
    (d) =>
      (d.name === 'listen' && d.args.some((a) => a.toLowerCase() === 'http2')) ||
      (d.name === 'http2' && d.args.some((a) => a.toLowerCase() === 'on'))
  );

  return {
    serverTokensOff: directives.some(
      (d) => d.name === 'server_tokens' && d.args.some((a) => a.toLowerCase() === 'off')
    ),
    http2: hasHttp2,
    hstsEnabled: effectiveHsts,
    sslModern: hasTls13 && !hasLegacySsl,
    rateLimitEnabled: rateLimitResult.isEnforced,
    ocspStapling: directives.some((d) => d.name === 'ssl_stapling' && d.args.some((a) => a.toLowerCase() === 'on')),
    xFrameOptions: effectiveXFrame,
    xContentTypeOptions: effectiveXContentType,
    gzipEnabled: directives.some((d) => d.name === 'gzip' && d.args.some((a) => a.toLowerCase() === 'on')),
  };
}

export function applyNginxDirectiveMutation(
  content: string,
  key: keyof ParsedNginxToggles,
  enabled: boolean
): string {
  let updated = content;

  switch (key) {
    case 'serverTokensOff': {
      if (enabled) {
        if (/server_tokens\s+on;/i.test(updated)) {
          // Preserve original indentation and inter-token whitespace
          updated = updated.replace(/([ \t]*)server_tokens(\s+)on;/gi, '$1server_tokens$2off;');
        } else if (!/server_tokens\s+off;/i.test(updated)) {
          updated = insertInBlock(updated, 'http', '    server_tokens off;');
        }
      } else {
        if (/server_tokens\s+off;/i.test(updated)) {
          // Preserve original indentation and inter-token whitespace
          updated = updated.replace(/([ \t]*)server_tokens(\s+)off;/gi, '$1server_tokens$2on;');
        }
      }
      break;
    }

    case 'hstsEnabled': {
      if (enabled) {
        if (!/strict-transport-security/i.test(updated)) {
          const hstsLine = '    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;';
          updated = insertInBlock(updated, 'server', hstsLine, 'http');
        }
      } else {
        updated = updated.replace(/^[ \t]*add_header\s+Strict-Transport-Security[^\n]*\n?/gim, '');
      }
      break;
    }

    case 'http2': {
      if (enabled) {
        if (/listen\s+[^;]*\bssl\b/i.test(updated)) {
          // If listen ... ssl ... exists, append http2 if not already present
          updated = updated.replace(/(listen\s+[^;]*\bssl\b)(?!.*http2)([^;]*;)/gi, '$1 http2$2');
        } else if (/listen\s+\d+/i.test(updated)) {
          // If listen 443; or listen 19999; exists (e.g. with "ssl on;"), upgrade to listen <port> ssl http2;
          updated = updated.replace(/(listen\s+\d+)(?!.*http2)(\s*;)/gi, '$1 ssl http2$2');
        } else if (!/http2\s+on/i.test(updated)) {
          updated = insertInBlock(updated, 'server', '    http2 on;', 'http');
        }
      } else {
        // Remove http2 from listen directives and remove standalone http2 on directive
        updated = updated.replace(/(listen\s+[^;]*)\bhttp2\s*([^;]*;)/gi, '$1$2');
        updated = updated.replace(/^[ \t]*http2\s+on;?[^\n]*\n?/gim, '');
      }
      break;
    }

    case 'sslModern': {
      if (enabled) {
        // Switch to Modern TLS 1.3 only
        if (/ssl_protocols\s+[^;]+;/i.test(updated)) {
          updated = updated.replace(/([ \t]*)ssl_protocols(\s+)[^;]+;/gi, '$1ssl_protocols$2TLSv1.3;');
        } else {
          updated = insertInBlock(updated, 'server', '    ssl_protocols TLSv1.3;', 'http');
        }
        // Upgrade legacy/weak cipher suites
        if (/ssl_ciphers\s+[^;]+;/i.test(updated)) {
          updated = updated.replace(
            /([ \t]*)ssl_ciphers(\s+)[^;]+;/gi,
            '$1# Modern TLSv1.3 cipher suite enforcement\n$1ssl_ciphers HIGH:!aNULL:!MD5:!RC4:!3DES;\n$1ssl_prefer_server_ciphers off;'
          );
        }
      } else {
        // Intermediate TLS 1.2 + 1.3
        if (/ssl_protocols\s+[^;]+;/i.test(updated)) {
          updated = updated.replace(/([ \t]*)ssl_protocols(\s+)[^;]+;/gi, '$1ssl_protocols$2TLSv1.2 TLSv1.3;');
        } else {
          updated = insertInBlock(updated, 'server', '    ssl_protocols TLSv1.2 TLSv1.3;', 'http');
        }
      }
      break;
    }

    case 'rateLimitEnabled': {
      if (enabled) {
        if (!/limit_req_zone/i.test(updated)) {
          updated = insertInBlock(
            updated,
            'http',
            '    limit_req_zone $binary_remote_addr zone=ip_limit:10m rate=10r/s;\n    limit_req_status 429;'
          );
        }
        if (!/limit_req\s+zone/i.test(updated)) {
          updated = insertInBlock(updated, 'location', '        limit_req zone=ip_limit burst=10 nodelay;', 'server');
        }
      } else {
        updated = updated.replace(/^[ \t]*limit_req_zone[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*limit_req_status[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*limit_req\s+zone[^\n]*\n?/gim, '');
      }
      break;
    }

    case 'ocspStapling': {
      if (enabled) {
        if (!/ssl_stapling\s+on/i.test(updated)) {
          const ocspBlock =
            '    ssl_stapling on;\n    ssl_stapling_verify on;\n    resolver 1.1.1.1 1.0.0.1 8.8.8.8 valid=300s;\n    resolver_timeout 5s;';
          updated = insertInBlock(updated, 'server', ocspBlock, 'http');
        }
      } else {
        updated = updated.replace(/^[ \t]*ssl_stapling[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*ssl_stapling_verify[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*resolver[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*resolver_timeout[^\n]*\n?/gim, '');
      }
      break;
    }

    case 'xFrameOptions': {
      if (enabled) {
        if (!/x-frame-options/i.test(updated)) {
          updated = insertInBlock(updated, 'server', '    add_header X-Frame-Options "DENY" always;', 'http');
        }
      } else {
        updated = updated.replace(/^[ \t]*add_header\s+X-Frame-Options[^\n]*\n?/gim, '');
      }
      break;
    }

    case 'xContentTypeOptions': {
      if (enabled) {
        if (!/x-content-type-options/i.test(updated)) {
          updated = insertInBlock(updated, 'server', '    add_header X-Content-Type-Options "nosniff" always;', 'http');
        }
      } else {
        updated = updated.replace(/^[ \t]*add_header\s+X-Content-Type-Options[^\n]*\n?/gim, '');
      }
      break;
    }

    case 'gzipEnabled': {
      if (enabled) {
        if (!/gzip\s+on/i.test(updated)) {
          const gzipBlock =
            '    gzip on;\n    gzip_vary on;\n    gzip_proxied any;\n    gzip_comp_level 6;\n    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;';
          updated = insertInBlock(updated, 'http', gzipBlock);
        }
      } else {
        updated = updated.replace(/^[ \t]*gzip[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*gzip_vary[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*gzip_proxied[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*gzip_comp_level[^\n]*\n?/gim, '');
        updated = updated.replace(/^[ \t]*gzip_types[^\n]*\n?/gim, '');
      }
      break;
    }
  }

  return updated;
}

/**
 * Helper to insert directive into target block (e.g. `http {` or `server {`)
 */
function insertInBlock(
  content: string,
  targetBlock: 'http' | 'server' | 'location',
  directive: string,
  fallbackBlock?: 'http' | 'server'
): string {
  const blockRegex = new RegExp(`(${targetBlock}\\s*\\{[^\\n]*\\n)`, 'i');
  if (blockRegex.test(content)) {
    return content.replace(blockRegex, `$1${directive}\n`);
  }

  if (fallbackBlock) {
    const fallbackRegex = new RegExp(`(${fallbackBlock}\\s*\\{[^\\n]*\\n)`, 'i');
    if (fallbackRegex.test(content)) {
      return content.replace(fallbackRegex, `$1${directive}\n`);
    }
  }

  // If no block found (e.g. fragment file), append at top or bottom
  return `${directive}\n\n${content}`;
}

/**
 * Applies a hardening preset directly in-place to an existing Nginx configuration,
 * preserving all custom server blocks, upstream URLs, ports, certificates, and proxy directives.
 */
export function applyNginxPresetToContent(content: string, presetId: string): string {
  if (!content || !content.trim()) {
    return content;
  }

  let updated = content;

  if (presetId === 'hardened-production') {
    updated = applyNginxDirectiveMutation(updated, 'serverTokensOff', true);
    updated = applyNginxDirectiveMutation(updated, 'http2', true);
    updated = applyNginxDirectiveMutation(updated, 'sslModern', true);
    updated = applyNginxDirectiveMutation(updated, 'hstsEnabled', true);
    updated = applyNginxDirectiveMutation(updated, 'ocspStapling', true);
    updated = applyNginxDirectiveMutation(updated, 'xFrameOptions', true);
    updated = applyNginxDirectiveMutation(updated, 'xContentTypeOptions', true);
    updated = applyNginxDirectiveMutation(updated, 'rateLimitEnabled', true);
    updated = applyNginxDirectiveMutation(updated, 'gzipEnabled', true);
  } else if (presetId === 'spa-api-proxy') {
    updated = applyNginxDirectiveMutation(updated, 'serverTokensOff', true);
    updated = applyNginxDirectiveMutation(updated, 'http2', true);
    updated = applyNginxDirectiveMutation(updated, 'sslModern', false);
    updated = applyNginxDirectiveMutation(updated, 'hstsEnabled', true);
    updated = applyNginxDirectiveMutation(updated, 'xFrameOptions', true);
    updated = applyNginxDirectiveMutation(updated, 'xContentTypeOptions', true);
    updated = applyNginxDirectiveMutation(updated, 'rateLimitEnabled', true);
    updated = applyNginxDirectiveMutation(updated, 'gzipEnabled', true);
  } else if (presetId === 'websocket-realtime') {
    updated = applyNginxDirectiveMutation(updated, 'serverTokensOff', true);
    updated = applyNginxDirectiveMutation(updated, 'http2', true);
    updated = applyNginxDirectiveMutation(updated, 'sslModern', false);
    updated = applyNginxDirectiveMutation(updated, 'xFrameOptions', true);
    updated = applyNginxDirectiveMutation(updated, 'xContentTypeOptions', true);
    updated = applyNginxDirectiveMutation(updated, 'rateLimitEnabled', false);
    if (/worker_connections\s+\d+;/i.test(updated)) {
      updated = updated.replace(/worker_connections\s+\d+;/gi, 'worker_connections 16384;');
    }
    if (/location\s+[^\{]*\{/i.test(updated) && !/http_upgrade/i.test(updated)) {
      updated = updated.replace(
        /(location\s+[^\{]*\{[^\n]*\n)/gi,
        '$1        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n'
      );
    }
  }

  return updated;
}

/**
 * Maps an Nginx security audit issue title to its corresponding Auto-Fix directive toggle.
 * Returns null if the issue has no direct automated one-click fix (e.g. syntax error or unrecognized pattern).
 * Guarantees that no unrelated directive (like HSTS) is enabled accidentally.
 */
export function resolveAutoFixDirective(issueTitle: string): keyof ParsedNginxToggles | null {
  const title = (issueTitle || '').toLowerCase();

  // 1. MIME Sniffing & X-Content-Type-Options protection (must NOT trigger HSTS)
  if (
    title.includes('x-content-type-options') ||
    title.includes('mime sniffing') ||
    title.includes('nosniff') ||
    title.includes('content-type')
  ) {
    return 'xContentTypeOptions';
  }

  // 2. Clickjacking & X-Frame-Options
  if (
    title.includes('x-frame-options') ||
    title.includes('clickjacking') ||
    title.includes('x-frame')
  ) {
    return 'xFrameOptions';
  }

  // 3. HSTS / Strict-Transport-Security (Must only match explicit HSTS titles)
  if (
    title.includes('hsts') ||
    title.includes('strict-transport-security')
  ) {
    return 'hstsEnabled';
  }

  // 4. HTTPS / TLS Protocols / Modern SSL Termination
  if (
    title.includes('tls 1.3') ||
    title.includes('ssl protocols') ||
    title.includes('legacy insecure ssl') ||
    title.includes('missing https') ||
    title.includes('insecure http') ||
    title.includes('ssl termination')
  ) {
    return 'sslModern';
  }

  // 5. Rate Limiting / DDoS Shield
  if (
    title.includes('rate limit') ||
    title.includes('rate limiting') ||
    title.includes('ddos shield')
  ) {
    return 'rateLimitEnabled';
  }

  // 6. Server Tokens Disclosure
  if (title.includes('server tokens')) {
    return 'serverTokensOff';
  }

  // 7. OCSP Stapling
  if (title.includes('ocsp')) {
    return 'ocspStapling';
  }

  // 8. Gzip Compression
  if (title.includes('gzip')) {
    return 'gzipEnabled';
  }

  // 9. HTTP/2 Protocol
  if (title.includes('http/2') || title.includes('http2')) {
    return 'http2';
  }

  // Safe fallback: No accidental enablement of unrelated directives!
  return null;
}
