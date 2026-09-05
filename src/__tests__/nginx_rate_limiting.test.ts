import { describe, it, expect } from 'vitest';
import {
  auditCustomNginx,
  parseActiveNginxDirectives,
  resolveEffectiveNginxRateLimiting,
} from '../engines/nginx/parser';
import { parseNginxToToggles } from '../engines/nginx/mutator';

describe('Nginx Rate Limiting Semantic Validation Engine', () => {
  // TEST 1 — Zone only
  it('TEST 1: zone definition without enforcement is not considered enforced and awards no credit', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.definedZones).toContain('mylimit');
    expect(res.enforcements.length).toBe(0);
    expect(res.isEnforced).toBe(false);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Rate limiting'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Rate Limit Zone Defined But Unenforced'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.rateLimitEnabled).toBe(false);
  });

  // TEST 2 — Zone + server-level enforcement
  it('TEST 2: zone definition combined with server-level limit_req is considered enforced', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

    server {
        limit_req zone=mylimit;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.definedZones).toContain('mylimit');
    expect(res.enforcements.length).toBe(1);
    expect(res.enforcements[0].isValid).toBe(true);
    expect(res.isEnforced).toBe(true);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('Rate limiting / DDoS shield configured and active');

    const toggles = parseNginxToToggles(config);
    expect(toggles.rateLimitEnabled).toBe(true);
  });

  // TEST 3 — Zone + location enforcement
  it('TEST 3: zone definition combined with location-level limit_req is considered enforced', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

    server {
        location /api {
            limit_req zone=mylimit burst=20 nodelay;
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.definedZones).toContain('mylimit');
    expect(res.enforcements.length).toBe(1);
    expect(res.enforcements[0].isValid).toBe(true);
    expect(res.enforcements[0].context).toBe('location');
    expect(res.enforcements[0].contextPath).toEqual(['http', 'server', 'location']);
    expect(res.isEnforced).toBe(true);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('Rate limiting / DDoS shield configured and active');

    const toggles = parseNginxToToggles(config);
    expect(toggles.rateLimitEnabled).toBe(true);
  });

  // TEST 4 — Unknown zone
  it('TEST 4: limit_req referencing unknown/undefined zone does not award credit and reports undefined zone', () => {
    const config = `
http {
    server {
        location / {
            limit_req zone=doesnotexist;
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.definedZones.length).toBe(0);
    expect(res.enforcements.length).toBe(1);
    expect(res.enforcements[0].isValid).toBe(false);
    expect(res.undefinedReferencedZones).toContain('doesnotexist');
    expect(res.isEnforced).toBe(false);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Rate limiting'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Undefined Rate Limit Zone Referenced'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.rateLimitEnabled).toBe(false);
  });

  // TEST 5 — Commented-out enforcement
  it('TEST 5: commented-out limit_req directive is ignored and does not count as enforcement', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

    server {
        # limit_req zone=mylimit;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.enforcements.length).toBe(0);
    expect(res.isEnforced).toBe(false);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Rate limiting'))).toBe(false);

    const toggles = parseNginxToToggles(config);
    expect(toggles.rateLimitEnabled).toBe(false);
  });

  // TEST 6 — Commented-out zone
  it('TEST 6: commented-out limit_req_zone does not satisfy active limit_req directive', () => {
    const config = `
http {
    # limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

    server {
        limit_req zone=mylimit;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.definedZones.length).toBe(0);
    expect(res.enforcements[0].isValid).toBe(false);
    expect(res.isEnforced).toBe(false);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Rate limiting'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Undefined Rate Limit Zone Referenced'))).toBe(true);
  });

  // TEST 7 — Multiple zones
  it('TEST 7: correctly recognizes and matches multiple independent rate-limit zones without cross-contamination', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/s;

    server {
        location /api {
            limit_req zone=api;
        }

        location /login {
            limit_req zone=login;
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.definedZones).toEqual(expect.arrayContaining(['api', 'login']));
    expect(res.enforcements.length).toBe(2);
    expect(res.enforcements.every((e) => e.isValid)).toBe(true);
    expect(res.isEnforced).toBe(true);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('Rate limiting / DDoS shield configured and active');
  });

  // TEST 8 — Wrong zone reference
  it('TEST 8: mismatched zone reference fails validation and does not award credit', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    server {
        limit_req zone=login;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.definedZones).toContain('api');
    expect(res.definedZones).not.toContain('login');
    expect(res.enforcements[0].isValid).toBe(false);
    expect(res.isEnforced).toBe(false);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Rate limiting'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Undefined Rate Limit Zone Referenced'))).toBe(true);
  });

  // TEST 9 — Zone defined and inherited enforcement
  it('TEST 9: valid limit_req placed at http context applies globally across server blocks', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=global:10m rate=10r/s;
    limit_req zone=global;

    server {
        listen 443 ssl;
        location / {
            proxy_pass http://backend;
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const res = resolveEffectiveNginxRateLimiting(directives);

    expect(res.definedZones).toContain('global');
    expect(res.enforcements.length).toBe(1);
    expect(res.enforcements[0].context).toBe('http');
    expect(res.enforcements[0].isValid).toBe(true);
    expect(res.isEnforced).toBe(true);

    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('Rate limiting / DDoS shield configured and active');
  });

  // TEST 10 — Multiple server isolation
  it('TEST 10: server with limit_req does not leak rate-limiting status to unconfigured sibling server', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

    server {
        listen 443 ssl;
        limit_req zone=mylimit;
    }

    server {
        listen 443 ssl;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const serverBlocks = directives.filter((d) => d.name === 'server' && d.isBlock);
    expect(serverBlocks.length).toBe(2);

    const srv1Directives = directives.filter((d) => d.blockId === serverBlocks[0].blockId);
    const srv2Directives = directives.filter((d) => d.blockId === serverBlocks[1].blockId);

    const srv1HasLimit = srv1Directives.some((d) => d.name === 'limit_req');
    const srv2HasLimit = srv2Directives.some((d) => d.name === 'limit_req');

    expect(srv1HasLimit).toBe(true);
    expect(srv2HasLimit).toBe(false);
  });
});
