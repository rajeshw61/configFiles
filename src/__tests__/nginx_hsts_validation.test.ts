import { describe, it, expect } from 'vitest';
import {
  auditCustomNginx,
  parseActiveNginxDirectives,
  parseHstsMaxAge,
  resolveEffectiveNginxSecurityHeaders,
} from '../engines/nginx/parser';
import { parseNginxToToggles } from '../engines/nginx/mutator';

describe('Nginx Strict-Transport-Security (HSTS) Validation Engine', () => {
  // TEST 1 — Valid positive max-age
  it('TEST 1: awards full security credit for valid positive max-age', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "max-age=63072000";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(true);
  });

  // TEST 2 — max-age=0
  it('TEST 2: denies security credit when max-age=0 and reports HSTS as disabled/ineffective', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "max-age=0";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('HSTS Ineffective (max-age=0)'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(false);
  });

  // TEST 3 — Missing max-age
  it('TEST 3: denies security credit when max-age is missing completely', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "includeSubDomains";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Invalid HSTS Header'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(false);
  });

  // TEST 4 — Negative max-age
  it('TEST 4: denies security credit for negative max-age', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "max-age=-100";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Invalid HSTS Header'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(false);
  });

  // TEST 5 — Non-numeric max-age
  it('TEST 5: denies security credit for non-numeric max-age value', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "max-age=abc";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Invalid HSTS Header'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(false);
  });

  // TEST 6 — Valid max-age plus includeSubDomains
  it('TEST 6: passes valid max-age with includeSubDomains without requiring preload for basic credit', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(true);
  });

  // TEST 7 — Valid max-age plus preload
  it('TEST 7: passes valid max-age with preload', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "max-age=63072000; preload";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(true);
  });

  // TEST 8 — Case and whitespace variations
  it('TEST 8: handles case-insensitivity and whitespace around equals operator correctly', () => {
    expect(parseHstsMaxAge('MAX-AGE=63072000')).toBe(63072000);
    expect(parseHstsMaxAge('max-age = 63072000')).toBe(63072000);
    expect(parseHstsMaxAge('max-age= 63072000 ; includeSubDomains')).toBe(63072000);
    expect(parseHstsMaxAge('"MAX-AGE = 31536000"')).toBe(31536000);

    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "MAX-AGE = 63072000; includeSubDomains";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');
  });

  // TEST 9 — HSTS in HTTP server only
  it('TEST 9: does not credit HSTS on HTTPS server when HSTS is only placed on port 80 HTTP server', () => {
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
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Missing HSTS Header'))).toBe(true);

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(false);
  });

  // TEST 10 — HSTS inherited by HTTPS server
  it('TEST 10: allows HTTPS server to inherit valid HSTS from parent http context', () => {
    const config = `
http {
    add_header Strict-Transport-Security "max-age=63072000";

    server {
        listen 443 ssl;
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');

    const toggles = parseNginxToToggles(config);
    expect(toggles.hstsEnabled).toBe(true);
  });

  // TEST 11 — Invalid child overrides valid parent
  it('TEST 11: child max-age=0 overrides parent valid HSTS at location scope', () => {
    const config = `
http {
    server {
        listen 443 ssl;

        add_header Strict-Transport-Security "max-age=63072000";

        location / {
            add_header Strict-Transport-Security "max-age=0";
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    expect(resolved.servers[0].effectiveHeaders.hsts?.value).toContain('max-age=63072000');
    expect(parseHstsMaxAge(resolved.servers[0].effectiveHeaders.hsts?.value || '')).toBe(63072000);

    const loc = resolved.servers[0].locations[0];
    expect(loc.effectiveHeaders.hsts?.value).toContain('max-age=0');
    expect(parseHstsMaxAge(loc.effectiveHeaders.hsts?.value || '')).toBe(0);
  });

  // TEST 12 — Valid child replaces valid parent
  it('TEST 12: valid child HSTS replaces parent value at location scope without conflict', () => {
    const config = `
http {
    server {
        listen 443 ssl;

        add_header Strict-Transport-Security "max-age=31536000";

        location / {
            add_header Strict-Transport-Security "max-age=63072000";
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);
    const resolved = resolveEffectiveNginxSecurityHeaders(directives);

    const loc = resolved.servers[0].locations[0];
    expect(loc.effectiveHeaders.hsts?.value).toContain('max-age=63072000');
    expect(parseHstsMaxAge(loc.effectiveHeaders.hsts?.value || '')).toBe(63072000);
  });
});
