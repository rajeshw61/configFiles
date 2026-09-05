import { describe, it, expect } from 'vitest';
import {
  auditCustomNginx,
  parseActiveNginxDirectives,
  resolveEffectiveNginxSecurityHeaders,
} from '../engines/nginx/parser';
import { parseNginxToToggles } from '../engines/nginx/mutator';

describe('Nginx Security Header Context & Block Inheritance Engine', () => {
  // TEST 1 — Server header
  it('TEST 1: detects explicit server-level header and awards appropriate credit', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header X-Frame-Options "DENY";
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    expect(resolved.servers.length).toBe(1);
    expect(resolved.servers[0].effectiveHeaders.xFrameOptions?.value).toBe('DENY');
    expect(resolved.servers[0].effectiveHeaders.xFrameOptions?.source).toBe('server');

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('Clickjacking protection active (X-Frame-Options)');

    const toggles = parseNginxToToggles(config);
    expect(toggles.xFrameOptions).toBe(true);
  });

  // TEST 2 — HTTP-level inheritance
  it('TEST 2: inherits security headers from parent http block into child server blocks', () => {
    const config = `
http {
    add_header X-Frame-Options "DENY";

    server {
        listen 443 ssl;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    expect(resolved.httpHeaders.xFrameOptions?.value).toBe('DENY');
    expect(resolved.servers[0].effectiveHeaders.xFrameOptions?.value).toBe('DENY');
    expect(resolved.servers[0].effectiveHeaders.xFrameOptions?.source).toBe('http');

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('Clickjacking protection active (X-Frame-Options)');
  });

  // TEST 3 — Location inherits server header
  it('TEST 3: location inherits server header when location defines no add_header of its own', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header X-Frame-Options "DENY";

        location / {
            proxy_pass http://backend;
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    expect(resolved.servers[0].locations.length).toBe(1);
    const loc = resolved.servers[0].locations[0];
    expect(loc.effectiveHeaders.xFrameOptions?.value).toBe('DENY');
    expect(loc.effectiveHeaders.overrodeParent).toBe(false);
  });

  // TEST 4 — Child add_header overrides parent add_header set
  it('TEST 4: child add_header overrides parent header set and prevents unstated parent headers from inheriting', () => {
    const config = `
http {
    server {
        listen 443 ssl;

        add_header X-Frame-Options "DENY";
        add_header X-Content-Type-Options "nosniff";

        location / {
            add_header X-Frame-Options "SAMEORIGIN";
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    const loc = resolved.servers[0].locations[0];
    expect(loc.effectiveHeaders.xFrameOptions?.value).toBe('SAMEORIGIN');
    expect(loc.effectiveHeaders.xFrameOptions?.source).toBe('location');
    expect(loc.effectiveHeaders.xContentTypeOptions).toBeUndefined();
    expect(loc.effectiveHeaders.overrodeParent).toBe(true);
  });

  // TEST 5 — Child header value replaces parent value
  it('TEST 5: child location header value replaces parent value without duplicating', () => {
    const config = `
http {
    server {
        add_header X-Frame-Options "DENY";

        location /admin {
            add_header X-Frame-Options "SAMEORIGIN";
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    const loc = resolved.servers[0].locations[0];
    expect(loc.effectiveHeaders.xFrameOptions?.value).toBe('SAMEORIGIN');
    expect(loc.effectiveHeaders.xFrameOptions?.source).toBe('location');
  });

  // TEST 6 — Child unrelated add_header disables inherited headers
  it('TEST 6: unrelated add_header in child location disables parent security header inheritance', () => {
    const config = `
http {
    server {
        add_header X-Frame-Options "DENY";
        add_header X-Content-Type-Options "nosniff";

        location / {
            add_header Cache-Control "no-store";
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    const loc = resolved.servers[0].locations[0];
    expect(loc.effectiveHeaders.xFrameOptions).toBeUndefined();
    expect(loc.effectiveHeaders.xContentTypeOptions).toBeUndefined();
    expect(loc.effectiveHeaders.otherHeaders).toContain('Cache-Control');
    expect(loc.effectiveHeaders.overrodeParent).toBe(true);
  });

  // TEST 7 — No parent headers
  it('TEST 7: reports all security headers missing when neither parent nor child define them', () => {
    const config = `
http {
    server {
        listen 443 ssl;

        location / {
            return 200;
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    expect(resolved.servers[0].effectiveHeaders.hsts).toBeUndefined();
    expect(resolved.servers[0].effectiveHeaders.xFrameOptions).toBeUndefined();
    expect(resolved.servers[0].effectiveHeaders.xContentTypeOptions).toBeUndefined();

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.passedChecks.some((c) => c.includes('X-Frame-Options'))).toBe(false);
    expect(audit.passedChecks.some((c) => c.includes('nosniff'))).toBe(false);
  });

  // TEST 8 — Commented child header
  it('TEST 8: commented-out child header does not override parent inheritance', () => {
    const config = `
http {
    server {
        add_header X-Frame-Options "DENY";

        location / {
            # add_header X-Frame-Options "SAMEORIGIN";
            proxy_pass http://backend;
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    const loc = resolved.servers[0].locations[0];
    expect(loc.effectiveHeaders.xFrameOptions?.value).toBe('DENY');
    expect(loc.effectiveHeaders.xFrameOptions?.source).toBe('server');
  });

  // TEST 9 — Separate server isolation
  it('TEST 9: maintains strict isolation between separate sibling server blocks', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header X-Frame-Options "DENY";
    }

    server {
        listen 443 ssl;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    expect(resolved.servers.length).toBe(2);
    expect(resolved.servers[0].effectiveHeaders.xFrameOptions?.value).toBe('DENY');
    expect(resolved.servers[1].effectiveHeaders.xFrameOptions).toBeUndefined();
  });

  // TEST 10 — HTTP and HTTPS separation
  it('TEST 10: does not credit HSTS on HTTPS server when HSTS is only placed on port 80 HTTP server', () => {
    const config = `
http {
    server {
        listen 80;
        add_header Strict-Transport-Security "max-age=63072000";
    }

    server {
        listen 443 ssl;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    const httpServer = resolved.servers.find((s) => !s.isHttps);
    const httpsServer = resolved.servers.find((s) => s.isHttps);

    expect(httpServer?.effectiveHeaders.hsts?.value).toBe('max-age=63072000');
    expect(httpsServer?.effectiveHeaders.hsts).toBeUndefined();

    const audit = auditCustomNginx(config);
    // HSTS must not be credited for the HTTPS server
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Missing HSTS Header'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(false);
  });
});
