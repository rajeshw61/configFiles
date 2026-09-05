import { describe, it, expect } from 'vitest';
import { auditCustomNginx, parseActiveNginxDirectives } from '../engines/nginx/parser';
import { parseNginxToToggles } from '../engines/nginx/mutator';

describe('Nginx Include Directives & Unresolved File Isolation', () => {
  const includeOnlyConfig = `
http {
    server {
        listen 443 ssl;
        include security-headers.conf;
    }
}
`;

  // TEST 1 — Include does NOT prove HSTS
  it('TEST 1: does not assume HSTS is configured solely because of an include directive', () => {
    const audit = auditCustomNginx(includeOnlyConfig);

    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Missing HSTS Header'))).toBe(true);

    const toggles = parseNginxToToggles(includeOnlyConfig);
    expect(toggles.hstsEnabled).toBe(false);
  });

  // TEST 2 — Include does NOT prove X-Frame-Options
  it('TEST 2: does not assume X-Frame-Options is configured solely because of an include directive', () => {
    const audit = auditCustomNginx(includeOnlyConfig);

    expect(audit.passedChecks.some((c) => c.includes('X-Frame-Options'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Missing X-Frame-Options'))).toBe(true);

    const toggles = parseNginxToToggles(includeOnlyConfig);
    expect(toggles.xFrameOptions).toBe(false);
  });

  // TEST 3 — Include does NOT prove X-Content-Type-Options
  it('TEST 3: does not assume X-Content-Type-Options is configured solely because of an include directive', () => {
    const audit = auditCustomNginx(includeOnlyConfig);

    expect(audit.passedChecks.some((c) => c.includes('nosniff'))).toBe(false);
    const toggles = parseNginxToToggles(includeOnlyConfig);
    expect(toggles.xContentTypeOptions).toBe(false);
  });

  // TEST 4 — Actual headers still pass
  it('TEST 4: detects all explicit security headers with full credit when directly configured', () => {
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

  // TEST 5 — Include plus explicit header
  it('TEST 5: detects explicit header without assuming missing headers from adjacent include', () => {
    const config = `
http {
    server {
        listen 443 ssl;

        include security-headers.conf;
        add_header X-Frame-Options "DENY";
    }
}
`;
    const audit = auditCustomNginx(config);

    // Explicitly declared header passes
    expect(audit.passedChecks.some((c) => c.includes('X-Frame-Options'))).toBe(true);

    // Undeclared headers are NOT assumed
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Missing HSTS Header'))).toBe(true);
    expect(audit.passedChecks.some((c) => c.includes('nosniff'))).toBe(false);

    const toggles = parseNginxToToggles(config);
    expect(toggles.xFrameOptions).toBe(true);
    expect(toggles.hstsEnabled).toBe(false);
    expect(toggles.xContentTypeOptions).toBe(false);
  });

  // TEST 6 — Commented include
  it('TEST 6: ignores commented-out includes completely', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        # include security-headers.conf;
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.unresolvedIncludes).toBeUndefined();
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);

    const directives = parseActiveNginxDirectives(config);
    expect(directives.some((d) => d.name === 'include')).toBe(false);
  });

  // TEST 7 — Arbitrary include name
  it('TEST 7: treats arbitrary include headers.conf as unresolved without assuming security headers', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        include headers.conf;
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.unresolvedIncludes).toContain('headers.conf');
    expect(audit.passedChecks.some((c) => c.includes('Strict-Transport-Security'))).toBe(false);
    expect(audit.passedChecks.some((c) => c.includes('X-Frame-Options'))).toBe(false);
    expect(audit.passedChecks.some((c) => c.includes('nosniff'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Missing HSTS Header'))).toBe(true);
  });
});
