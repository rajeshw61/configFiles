import { describe, it, expect } from 'vitest';
import { auditCustomNginx, parseActiveNginxDirectives } from '../engines/nginx/parser';
import { parseNginxToToggles } from '../engines/nginx/mutator';

describe('Nginx Security Analysis Comment & Directive Isolation', () => {
  // TEST 1 — Commented HSTS
  it('TEST 1: correctly reports HSTS as NOT configured when directive is commented out', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        # add_header Strict-Transport-Security "max-age=63072000";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Missing HSTS Header'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(false);
  });

  // TEST 2 — Commented security headers
  it('TEST 2: reports X-Frame-Options and X-Content-Type-Options as NOT configured when commented out', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        # add_header X-Frame-Options "SAMEORIGIN";
        # add_header X-Content-Type-Options "nosniff";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('X-Frame-Options'))).toBe(false);
    expect(audit.passedChecks.some((c) => c.includes('nosniff'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Missing X-Frame-Options'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.xFrameOptions).toBe(false);
    expect(toggles.xContentTypeOptions).toBe(false);
  });

  // TEST 3 — Commented TLS versions
  it('TEST 3: ignores commented-out legacy TLS versions and does not trigger false SSL protocol flags', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        # ssl_protocols TLSv1.0 TLSv1.1;
    }
}
`;
    const audit = auditCustomNginx(config);
    // Should NOT report legacy insecure protocols detected because the directive is commented out
    expect(audit.issues.some((i) => i.title.includes('Legacy Insecure SSL Protocols Detected'))).toBe(false);

    const toggles = parseNginxToToggles(config);
    expect(toggles.sslModern).toBe(false); // TLS 1.3 is not active
  });

  // TEST 4 — Commented rate limiting
  it('TEST 4: reports rate limiting as NOT configured when directive is commented out', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        # limit_req zone=one burst=10;
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Rate limiting'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('No Rate Limiting'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.rateLimitEnabled).toBe(false);
  });

  // TEST 5 — Active directive must still work
  it('TEST 5: correctly detects all active security headers and directives', () => {
    const config = `
http {
    server {
        listen 443 ssl;

        add_header Strict-Transport-Security "max-age=63072000";
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(true);
    expect(audit.passedChecks.some((c) => c.includes('X-Frame-Options'))).toBe(true);
    expect(audit.passedChecks.some((c) => c.includes('nosniff'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(true);
    expect(toggles.xFrameOptions).toBe(true);
    expect(toggles.xContentTypeOptions).toBe(true);
  });

  // TEST 6 — Comment and active directive together
  it('TEST 6: detects active directive when preceded by commented-out directive', () => {
    const config = `
http {
    server {
        listen 443 ssl;

        # add_header X-Frame-Options "DENY";
        add_header X-Frame-Options "SAMEORIGIN";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('X-Frame-Options'))).toBe(true);

    const directives = parseActiveNginxDirectives(config);
    const frameDirectives = directives.filter(
      (d) => d.name === 'add_header' && d.args.some((a) => a.toLowerCase() === 'x-frame-options')
    );
    expect(frameDirectives.length).toBe(1);
    expect(frameDirectives[0].args).toContain('SAMEORIGIN');

    const toggles = parseNginxToToggles(config);
    expect(toggles.xFrameOptions).toBe(true);
  });

  it('correctly parses directives with quoted arguments and inline comments', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        server_tokens off; # suppress version info
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
        ssl_protocols TLSv1.3;
        limit_req_zone $binary_remote_addr zone=ip_limit:10m rate=10r/s;
        limit_req zone=ip_limit;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    expect(directives.some((d) => d.name === 'server_tokens' && d.args.includes('off'))).toBe(true);
    expect(directives.some((d) => d.name === 'ssl_protocols' && d.args.includes('TLSv1.3'))).toBe(true);
    expect(directives.some((d) => d.name === 'limit_req_zone')).toBe(true);
    expect(directives.some((d) => d.name === 'limit_req')).toBe(true);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('Server version tokens hidden (server_tokens off)');
    expect(audit.passedChecks).toContain('Modern TLS 1.3 protocol enabled');
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');
    expect(audit.passedChecks).toContain('HSTS Preload & Subdomains configured');
    expect(audit.passedChecks).toContain('Rate limiting / DDoS shield configured and active');
  });
});
