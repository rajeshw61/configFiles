import { describe, it, expect } from 'vitest';
import { auditCustomNginx } from '../engines/nginx/parser';

describe('Real-World Nginx Configuration Validation Matrix (15 Scenarios)', () => {
  // Scenario 1: Very basic HTTP server
  it('Scenario 1: Very basic HTTP server', () => {
    const config = `
server {
    listen 80;
    server_name example.com;
    root /var/www/html;
    index index.html;
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.score).toBe(30); // Base baseline
    expect(audit.grade).toBe('F');
    expect(audit.passedChecks.length).toBe(0);
    expect(audit.issues.some((i) => i.title.includes('Server Tokens Exposed'))).toBe(true);
    expect(audit.issues.some((i) => i.title.includes('Missing HSTS Header'))).toBe(true);
    expect(audit.issues.some((i) => i.title.includes('No Rate Limiting'))).toBe(true);
  });

  // Scenario 2: Basic HTTPS server
  it('Scenario 2: Basic HTTPS server with TLS 1.3 and HSTS', () => {
    const config = `
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000" always;
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    // 30 base + 15 (TLS 1.3) + 10 (no legacy SSL) + 15 (HSTS) = 70
    expect(audit.score).toBe(70);
    expect(audit.grade).toBe('B');
    expect(audit.passedChecks).toContain('Modern TLS 1.3 protocol enabled');
    expect(audit.passedChecks).toContain('Legacy TLS 1.0/1.1 and SSLv3 disabled');
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');
  });

  // Scenario 3: Properly hardened HTTPS reverse proxy
  it('Scenario 3: Properly hardened HTTPS reverse proxy', () => {
    const config = `
http {
    server_tokens off;
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    server {
        listen 443 ssl http2;
        server_name api.example.com;

        ssl_certificate /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_stapling on;

        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;

        location / {
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://127.0.0.1:8080;
        }
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    // 30 + 15(TLS1.3) + 10(no legacy) + 15(HSTS) + 5(preload) + 15(rate limit) + 10(tokens) + 5(X-Frame) + 5(X-Content-Type) + 5(OCSP) = 115 -> clamped to 100
    expect(audit.score).toBe(100);
    expect(audit.grade).toBe('A+');
    expect(audit.issues.length).toBe(0);
    expect(audit.passedChecks.length).toBe(9);
  });

  // Scenario 4: Insecure HTTPS configuration
  it('Scenario 4: Insecure HTTPS configuration (Legacy protocols & tokens exposed)', () => {
    const config = `
server {
    listen 443 ssl;
    server_name legacy.example.com;

    ssl_protocols SSLv3 TLSv1 TLSv1.1 TLSv1.2;
    server_tokens on;
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    // 30 base + 0 = 30
    expect(audit.score).toBe(30);
    expect(audit.grade).toBe('F');
    expect(audit.issues.some((i) => i.title.includes('Legacy Insecure SSL Protocols Detected'))).toBe(true);
    expect(audit.issues.some((i) => i.title.includes('Missing TLS 1.3 Support'))).toBe(true);
    expect(audit.issues.some((i) => i.title.includes('Server Tokens Exposed'))).toBe(true);
  });

  // Scenario 5: HTTP -> HTTPS redirect configuration
  it('Scenario 5: HTTP -> HTTPS redirect configuration', () => {
    const config = `
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com www.example.com;

    ssl_protocols TLSv1.3;
    server_tokens off;
    add_header Strict-Transport-Security "max-age=31536000" always;
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    // 30 base + 15(TLS1.3) + 10(no legacy) + 15(HSTS) + 10(tokens) = 80
    expect(audit.score).toBe(80);
    expect(audit.grade).toBe('A');
    expect(audit.passedChecks).toContain('Modern TLS 1.3 protocol enabled');
    expect(audit.passedChecks).toContain('Server version tokens hidden (server_tokens off)');
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');
  });

  // Scenario 6: Multiple server blocks
  it('Scenario 6: Multiple server blocks with distinct configurations', () => {
    const config = `
http {
    server_tokens off;

    server {
        listen 80;
        server_name app1.local;
    }

    server {
        listen 443 ssl;
        server_name app2.local;
        ssl_protocols TLSv1.3;
        add_header Strict-Transport-Security "max-age=31536000";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    // 30 base + 15(TLS1.3) + 10(no legacy) + 15(HSTS) + 10(tokens) = 80
    expect(audit.score).toBe(80);
    expect(audit.grade).toBe('A');
  });

  // Scenario 7: Multiple location blocks
  it('Scenario 7: Multiple location blocks with selective overrides', () => {
    const config = `
http {
    server_tokens off;
    limit_req_zone $binary_remote_addr zone=global_limit:10m rate=10r/s;

    server {
        listen 443 ssl;
        ssl_protocols TLSv1.3;
        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header X-Frame-Options "DENY" always;

        location / {
            limit_req zone=global_limit burst=10;
            proxy_pass http://backend;
        }

        location /static/ {
            expires 30d;
        }
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    // 30 + 15(TLS1.3) + 10(no legacy) + 15(HSTS) + 15(rate limit) + 10(tokens) + 5(X-Frame) = 100
    expect(audit.score).toBe(100);
    expect(audit.grade).toBe('A+');
  });

  // Scenario 8: Docker-style Nginx configuration
  it('Scenario 8: Docker-style Nginx container configuration', () => {
    const config = `
events { worker_connections 1024; }

http {
    server_tokens off;

    server {
        listen 8080;
        location /healthz {
            return 200 "OK\\n";
        }
        location / {
            proxy_pass http://app_upstream:3000;
        }
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    // 30 base + 10(tokens) = 40
    expect(audit.score).toBe(40);
    expect(audit.grade).toBe('D');
    expect(audit.passedChecks).toContain('Server version tokens hidden (server_tokens off)');
  });

  // Scenario 9: Configuration using include files
  it('Scenario 9: Configuration with external include directives', () => {
    const config = `
http {
    include /etc/nginx/mime.types;
    include /etc/nginx/security-headers.conf;

    server {
        listen 443 ssl;
        ssl_protocols TLSv1.3;
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.unresolvedIncludes).toContain('/etc/nginx/mime.types');
    expect(audit.unresolvedIncludes).toContain('/etc/nginx/security-headers.conf');
    expect(audit.passedChecks.some((c) => c.includes('HSTS'))).toBe(false);
    expect(audit.recommendations.some((r) => r.includes('External include(s) detected'))).toBe(true);
  });

  // Scenario 10: Configuration with commented-out security directives
  it('Scenario 10: Configuration with commented-out security directives', () => {
    const config = `
server {
    listen 443 ssl;
    # server_tokens off;
    # add_header Strict-Transport-Security "max-age=63072000" always;
    # ssl_protocols TLSv1.3;
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.score).toBe(30);
    expect(audit.grade).toBe('F');
    expect(audit.passedChecks.length).toBe(0);
  });

  // Scenario 11: Configuration with HSTS max-age=0
  it('Scenario 11: Configuration with HSTS max-age=0 (disabled HSTS)', () => {
    const config = `
server {
    listen 443 ssl;
    ssl_protocols TLSv1.3;
    add_header Strict-Transport-Security "max-age=0" always;
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.passedChecks.some((c) => c.includes('HSTS'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('HSTS Ineffective (max-age=0)'))).toBe(true);
    // 30 base + 15(TLS1.3) + 10(no legacy) = 55
    expect(audit.score).toBe(55);
    expect(audit.grade).toBe('C');
  });

  // Scenario 12: Configuration with rate-limit zone but no enforcement
  it('Scenario 12: Rate-limit zone defined but unenforced in server/location blocks', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;

    server {
        listen 80;
        location / {
            proxy_pass http://backend;
        }
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.passedChecks.some((c) => c.includes('Rate limiting'))).toBe(false);
    expect(audit.issues.some((i) => i.title.includes('Rate Limit Zone Defined But Unenforced'))).toBe(true);
    expect(audit.score).toBe(30);
    expect(audit.grade).toBe('F');
  });

  // Scenario 13: Configuration with valid rate limiting
  it('Scenario 13: Configuration with valid rate limiting definition and enforcement', () => {
    const config = `
http {
    limit_req_zone $binary_remote_addr zone=req_limit:10m rate=5r/s;

    server {
        listen 80;
        location /api/ {
            limit_req zone=req_limit burst=10 nodelay;
        }
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.passedChecks).toContain('Rate limiting / DDoS shield configured and active');
    // 30 base + 15 (rate limit) = 45
    expect(audit.score).toBe(45);
    expect(audit.grade).toBe('D');
  });

  // Scenario 14: Configuration with mixed secure/insecure settings
  it('Scenario 14: Mixed secure/insecure settings', () => {
    const config = `
http {
    server_tokens off;

    server {
        listen 443 ssl;
        ssl_protocols TLSv1.0 TLSv1.2 TLSv1.3;
        add_header Strict-Transport-Security "max-age=31536000";
    }
}
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(true);
    // 30 + 15(TLS1.3) + 0(has TLS1.0) + 15(HSTS) + 10(tokens) = 70
    expect(audit.score).toBe(70);
    expect(audit.grade).toBe('B');
    expect(audit.issues.some((i) => i.title.includes('Legacy Insecure SSL Protocols Detected'))).toBe(true);
    expect(audit.passedChecks).toContain('Modern TLS 1.3 protocol enabled');
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');
    expect(audit.passedChecks).toContain('Server version tokens hidden (server_tokens off)');
  });

  // Scenario 15: A deliberately malformed configuration
  it('Scenario 15: Deliberately malformed configuration (unclosed block)', () => {
    const config = `
http {
    server {
        listen 80;
        location / {
            return 200 "Hello";
    }
`;
    const audit = auditCustomNginx(config);
    expect(audit.syntaxValid).toBe(false);
    expect(audit.score).toBe(0);
    expect(audit.grade).toBe('F');
    expect(audit.passedChecks.length).toBe(0);
    expect(audit.issues.some((i) => i.title.includes('Nginx Syntax / Block Error'))).toBe(true);
  });
});
