import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseNginxToToggles, applyNginxDirectiveMutation, applyNginxPresetToContent } from '../engines/nginx/mutator';
import { auditCustomNginx } from '../engines/nginx/parser';

describe('Nginx AST Mutator & Toggle Synchronization Engine', () => {
  const samplePath = path.resolve(__dirname, '../../samples/nginx-sample.conf');
  const sampleContent = fs.readFileSync(samplePath, 'utf-8');

  it('correctly parses toggle states from samples/nginx-sample.conf', () => {
    const toggles = parseNginxToToggles(sampleContent);

    expect(toggles.serverTokensOff).toBe(true);
    expect(toggles.ocspStapling).toBe(true);
    expect(toggles.sslModern).toBe(true);
    expect(toggles.hstsEnabled).toBe(false);
    expect(toggles.rateLimitEnabled).toBe(false);
    expect(toggles.xFrameOptions).toBe(false);
  });

  it('directly injects HSTS directive and raises security score', () => {
    const togglesBefore = parseNginxToToggles(sampleContent);
    expect(togglesBefore.hstsEnabled).toBe(false);

    const updated = applyNginxDirectiveMutation(sampleContent, 'hstsEnabled', true);
    const togglesAfter = parseNginxToToggles(updated);

    expect(togglesAfter.hstsEnabled).toBe(true);
    expect(updated).toContain('Strict-Transport-Security');

    const auditBefore = auditCustomNginx(sampleContent);
    const auditAfter = auditCustomNginx(updated);
    expect(auditAfter.score).toBeGreaterThan(auditBefore.score);
  });

  it('directly injects Rate Limiting directive and increases security score', () => {
    const updated = applyNginxDirectiveMutation(sampleContent, 'rateLimitEnabled', true);
    const togglesAfter = parseNginxToToggles(updated);

    expect(togglesAfter.rateLimitEnabled).toBe(true);
    expect(updated).toContain('limit_req_zone');

    const auditBefore = auditCustomNginx(sampleContent);
    const auditAfter = auditCustomNginx(updated);
    expect(auditAfter.score).toBeGreaterThan(auditBefore.score);
  });

  it('toggles Server Tokens off and on with exact string and whitespace reversibility', () => {
    // 1. Toggle to server_tokens on (insecure)
    const insecure = applyNginxDirectiveMutation(sampleContent, 'serverTokensOff', false);
    const togglesInsecure = parseNginxToToggles(insecure);
    expect(togglesInsecure.serverTokensOff).toBe(false);
    expect(insecure).not.toBe(sampleContent);

    // 2. Toggle back to server_tokens off (restores original state)
    const restored = applyNginxDirectiveMutation(insecure, 'serverTokensOff', true);
    const togglesRestored = parseNginxToToggles(restored);
    expect(togglesRestored.serverTokensOff).toBe(true);
    expect(restored).toBe(sampleContent); // Exact match with original baseline!
  });

  it('hardens custom multi-server Looker configuration in-place preserving all user structures', () => {
    const lookerConf = `
user www-data;
worker_processes 4;
pid /var/run/nginx.pid;

events {
  worker_connections 768;
}

http {
  sendfile on;
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  server {
    listen 443;
    ssl on;
    ssl_certificate /etc/looker/ssl/certs/self-ssl.crt;
    ssl_certificate_key /etc/looker/ssl/private/self-ssl.key;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers RC4:HIGH:!aNULL:!MD5;

    location / {
      proxy_pass https://looker.domain.com:9999;
      proxy_read_timeout 3600;
    }
  }

  server {
    listen 19999;
    ssl on;
    ssl_certificate /etc/looker/ssl/certs/self-ssl.crt;
    ssl_certificate_key /etc/looker/ssl/private/self-ssl.key;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers RC4:HIGH:!aNULL:!MD5;

    location / {
      proxy_pass https://looker.domain.com:19999;
      proxy_read_timeout 3600;
    }
  }
}
`;
    const hardened = applyNginxPresetToContent(lookerConf, 'hardened-production');

    // 1. Verifies user-specific structures are 100% preserved
    expect(hardened).toContain('user www-data;');
    expect(hardened).toContain('worker_processes 4;');
    expect(hardened).toContain('worker_connections 768;');
    expect(hardened).toContain('proxy_pass https://looker.domain.com:9999;');
    expect(hardened).toContain('proxy_pass https://looker.domain.com:19999;');
    expect(hardened).toContain('/etc/looker/ssl/certs/self-ssl.crt');
    expect(hardened).toContain('listen 19999');

    // 2. Verifies hardening was applied in-place
    expect(hardened).toContain('server_tokens off;');
    expect(hardened).toContain('ssl_protocols TLSv1.3;');
    expect(hardened).not.toContain('TLSv1 TLSv1.1');
    expect(hardened).toContain('Strict-Transport-Security');
    expect(hardened).toContain('X-Frame-Options');
    expect(hardened).toContain('X-Content-Type-Options');

    // 3. Verifies SPA preset in-place behavior
    const spa = applyNginxPresetToContent(lookerConf, 'spa-api-proxy');
    expect(spa).toContain('proxy_pass https://looker.domain.com:9999;');
    expect(spa).toContain('ssl_protocols TLSv1.2 TLSv1.3;');
    expect(spa).toContain('server_tokens off;');

    // 4. Verifies WebSocket preset in-place behavior
    const ws = applyNginxPresetToContent(lookerConf, 'websocket-realtime');
    expect(ws).toContain('proxy_pass https://looker.domain.com:9999;');
    expect(ws).toContain('worker_connections 16384;');
    expect(ws).toContain('Upgrade $http_upgrade');
  });

  it('toggles HTTP/2 Binary Protocol on and off for legacy listen directives', () => {
    const rawConf = `
server {
    listen 443;
    ssl on;
}
server {
    listen 19999;
    ssl on;
}
`;
    // 1. Initial state is false
    expect(parseNginxToToggles(rawConf).http2).toBe(false);

    // 2. Toggle ON
    const withHttp2 = applyNginxDirectiveMutation(rawConf, 'http2', true);
    expect(parseNginxToToggles(withHttp2).http2).toBe(true);
    expect(withHttp2).toContain('listen 443 ssl http2;');
    expect(withHttp2).toContain('listen 19999 ssl http2;');

    // 3. Toggle OFF
    const withoutHttp2 = applyNginxDirectiveMutation(withHttp2, 'http2', false);
    expect(parseNginxToToggles(withoutHttp2).http2).toBe(false);
    expect(withoutHttp2).not.toContain('http2');
  });
});
