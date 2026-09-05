import { describe, it, expect } from 'vitest';
import { validateNginxSyntax, auditCustomNginx } from '../engines/nginx/parser';

describe('Nginx Syntax & Block Structural Validator', () => {
  it('detects non-nginx file formats', () => {
    const invalidFile = `
const express = require('express');
const app = express();
app.listen(3000);
`;
    const errors = validateNginxSyntax(invalidFile);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Not a recognized Nginx configuration');

    const audit = auditCustomNginx(invalidFile);
    expect(audit.syntaxValid).toBe(false);
    expect(audit.score).toBe(0);
  });

  it('treats empty or whitespace-only files as idle empty state with zero errors', () => {
    const emptyFile = `   \n# only comments\n   `;
    const errors = validateNginxSyntax(emptyFile);
    expect(errors.length).toBe(0);

    const audit = auditCustomNginx(emptyFile);
    expect(audit.isEmpty).toBe(true);
    expect(audit.issues.length).toBe(0);
  });

  it('detects missing http or server block in root config', () => {
    const brokenRoot = `
user nginx;
events {
    worker_connections 1024;
}
`;
    const errors = validateNginxSyntax(brokenRoot);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes("Missing 'http {' or 'server {' block"))).toBe(true);
  });

  it('detects missing http block / unexpected closing brace when http { is deleted', () => {
    const brokenNginx = `
user nginx;
events {
    worker_connections 1024;
}

# http { was removed here
    server {
        listen 80;
        server_name example.com;
    }
}
`;

    const errors = validateNginxSyntax(brokenNginx);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes("Unexpected closing brace '}'"))).toBe(true);

    const audit = auditCustomNginx(brokenNginx);
    expect(audit.syntaxValid).toBe(false);
    expect(audit.score).toBe(0);
    expect(audit.grade).toBe('F');
    expect(audit.issues.some((i) => i.title.includes('Syntax'))).toBe(true);
  });

  it('detects unclosed blocks (missing closing brace)', () => {
    const unclosedNginx = `
http {
    server {
        listen 443 ssl;
        server_name test.com;
`;

    const errors = validateNginxSyntax(unclosedNginx);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Unclosed'))).toBe(true);
  });

  it('detects missing semicolons on simple directives', () => {
    const missingSemicolon = `
http {
    server_tokens off
    sendfile on;
}
`;

    const errors = validateNginxSyntax(missingSemicolon);
    expect(errors.some((e) => e.message.includes("missing a terminating semicolon ';'"))).toBe(true);
  });

  it('passes valid Nginx configurations without syntax errors', () => {
    const validNginx = `
user nginx;
events {
    worker_connections 1024;
}
http {
    server_tokens off;
    server {
        listen 443 ssl;
        server_name example.com;
        ssl_protocols TLSv1.3;
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
        add_header X-Frame-Options "DENY" always;
        limit_req_zone $binary_remote_addr zone=ip_limit:10m rate=10r/s;
    }
}
`;

    const errors = validateNginxSyntax(validNginx);
    expect(errors.length).toBe(0);

    const audit = auditCustomNginx(validNginx);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.score).toBeGreaterThan(80);
  });

  // TEST 1 — Braces in quoted strings
  it('TEST 1: correctly considers config valid when braces are inside quoted strings', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header X-Test "hello { world }";
    }
}
`;
    const errors = validateNginxSyntax(config);
    expect(errors.length).toBe(0);

    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
  });

  // TEST 2 — Semicolon in quoted string
  it('TEST 2: correctly considers config valid when semicolons are inside quoted strings', () => {
    const config = `
http {
    server {
        add_header X-Test "hello;world";
    }
}
`;
    const errors = validateNginxSyntax(config);
    expect(errors.length).toBe(0);

    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
  });

  // TEST 3 — Syntax characters in comments
  it('TEST 3: ignores syntax characters { } ; and quotes inside comments', () => {
    const config = `
http {
    # comment containing { } ; "quoted"
    server {
        listen 80;
    }
}
`;
    const errors = validateNginxSyntax(config);
    expect(errors.length).toBe(0);

    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
  });

  // TEST 4 — Commented-out block
  it('TEST 4: ignores commented-out server blocks without affecting block nesting', () => {
    const config = `
http {
    # server {
    #     listen 9999;
    # }
    server {
        listen 80;
    }
}
`;
    const errors = validateNginxSyntax(config);
    expect(errors.length).toBe(0);

    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
  });

  // TEST 5 — Real unmatched opening brace
  it('TEST 5: detects real unmatched opening brace when closing brace is missing', () => {
    const config = `
http {
    server {
        listen 80;
}
`;
    const errors = validateNginxSyntax(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Unclosed'))).toBe(true);

    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(false);
  });

  // TEST 6 — Real unmatched closing brace
  it('TEST 6: detects real unmatched closing brace when extra brace is present', () => {
    const config = `
http {
    server {
        listen 80;
    }}
}
`;
    const errors = validateNginxSyntax(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes("Unexpected closing brace '}'"))).toBe(true);

    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(false);
  });
});
