import { describe, it, expect } from 'vitest';
import { generateNginxConf, generateSecurityHeadersConf } from '../engines/nginx/generator';
import { calculateNginxSecurityScore } from '../engines/nginx/score';
import { auditDockerfile } from '../engines/dockerfile/linter';
import { generateCspString, formatCspOutput } from '../engines/csp/generator';
import { NGINX_PRESETS } from '../engines/nginx/presets';

describe('Nginx Config Generator Engine', () => {
  it('generates hardened Nginx configuration with TLS 1.3 and rate limiting', () => {
    const state = {
      domainNames: 'api.testdomain.com',
      listenPort: 443,
      enableHttps: true,
      http2: true,
      http3Quic: false,
      serverTokensOff: true,
      workerProcesses: 'auto',
      workerConnections: 8192,
      sslProfile: 'modern' as const,
      hstsEnabled: true,
      hstsSubdomains: true,
      hstsPreload: true,
      ocspStapling: true,
      dhParamBits: 2048,
      rateLimitEnabled: true,
      rateLimitZone: 'ip_limit',
      rateLimitRps: 20,
      rateLimitBurst: 10,
      rateLimitNoDelay: true,
      xFrameOptions: 'DENY' as const,
      xContentTypeOptions: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: true,
      contentSecurityPolicy: "default-src 'self'",
      proxyPassUrl: 'http://127.0.0.1:3000',
      enableWebsockets: true,
      proxyConnectTimeout: 60,
      proxyReadTimeout: 60,
      proxySendTimeout: 60,
      gzipEnabled: true,
      brotliEnabled: false,
      clientMaxBodySize: 16,
      keepaliveTimeout: 65,
    };

    const conf = generateNginxConf(state);

    expect(conf).toContain('server_name api.testdomain.com;');
    expect(conf).toContain('ssl_protocols TLSv1.3;');
    expect(conf).toContain('limit_req_zone $binary_remote_addr zone=ip_limit:10m rate=20r/s;');
    expect(conf).toContain('limit_req zone=ip_limit burst=10 nodelay;');
    expect(conf).toContain('proxy_pass http://127.0.0.1:3000;');
    expect(conf).toContain('ssl_stapling on;');
  });

  it('calculates A+ security score for hardened profile', () => {
    const hardenedPreset = NGINX_PRESETS[0].config;
    const score = calculateNginxSecurityScore(hardenedPreset as any);
    expect(score.score).toBeGreaterThanOrEqual(90);
    expect(score.grade).toBe('A+');
  });

  it('generates valid configs for all presets without throwing', () => {
    for (const preset of NGINX_PRESETS) {
      const conf = generateNginxConf(preset.config);
      expect(conf).toBeDefined();
      expect(conf.length).toBeGreaterThan(100);
      expect(conf).toContain('events {');
      expect(conf).toContain('http {');
      expect(conf).toContain('server {');
    }
  });

  it('correctly applies specific preset directives', () => {
    const spaConf = generateNginxConf(NGINX_PRESETS.find(p => p.id === 'spa-api-proxy')!.config);
    expect(spaConf).toContain('proxy_pass http://127.0.0.1:4000;');
    expect(spaConf).toContain('TLSv1.2 TLSv1.3');

    const wsConf = generateNginxConf(NGINX_PRESETS.find(p => p.id === 'websocket-realtime')!.config);
    expect(wsConf).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(wsConf).toContain('worker_connections 16384;');
    expect(wsConf).toContain('proxy_read_timeout 3600s;');
  });

  it('generates security headers snippet', () => {
    const headers = generateSecurityHeadersConf({
      hstsEnabled: true,
      hstsSubdomains: true,
      hstsPreload: true,
      xFrameOptions: 'DENY',
      xContentTypeOptions: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: true,
      contentSecurityPolicy: "default-src 'self'",
    } as any);

    expect(headers).toContain('Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;');
    expect(headers).toContain('X-Frame-Options "DENY" always;');
    expect(headers).toContain('X-Content-Type-Options "nosniff" always;');
  });
});

describe('Dockerfile Security Auditor Engine', () => {
  it('detects unpinned images, root execution, and missing healthcheck', () => {
    const dockerfile = `
FROM node:latest
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]
`;

    const result = auditDockerfile(dockerfile);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.ruleCode === 'CK-03')).toBe(true); // unpinned tag
    expect(result.issues.some((i) => i.ruleCode === 'CK-01')).toBe(true); // missing user
    expect(result.issues.some((i) => i.ruleCode === 'CK-04')).toBe(true); // missing healthcheck
  });

  it('detects leaked AWS secret keys', () => {
    const dockerfile = `
FROM node:20-alpine
ENV AWS_SECRET=AKIAIOSFODNN7EXAMPLE
USER node
HEALTHCHECK CMD curl http://localhost/ || exit 1
`;
    const result = auditDockerfile(dockerfile);
    expect(result.issues.some((i) => i.ruleCode === 'CK-02')).toBe(true);
  });
});

describe('Content Security Policy Generator', () => {
  it('generates valid CSP strings and formats', () => {
    const directives = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://js.stripe.com'],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: true,
      blockAllMixedContent: false,
    };

    const csp = generateCspString(directives);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' https://js.stripe.com");
    expect(csp).toContain("object-src 'none'");

    const nginxFormat = formatCspOutput(csp, 'nginx');
    expect(nginxFormat.startsWith('add_header Content-Security-Policy "')).toBe(true);
    expect(nginxFormat.endsWith('" always;')).toBe(true);
  });
});
