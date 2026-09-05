import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { auditCustomNginx } from '../engines/nginx/parser';
import { generateNginxConf, generateSecurityHeadersConf } from '../engines/nginx/generator';
import { calculateNginxSecurityScore } from '../engines/nginx/score';

describe('Sample Nginx Files End-to-End Regression Suite', () => {
  const samplesDir = path.resolve(__dirname, '../../samples');

  it('audits samples/nginx-sample.conf correctly with all fields verified', () => {
    const filePath = path.join(samplesDir, 'nginx-sample.conf');
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = auditCustomNginx(content);

    // Verify all return properties exist
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('grade');
    expect(result).toHaveProperty('passedChecks');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('recommendations');

    // Expected score: base (30) + TLS 1.3 (15) + Legacy TLS disabled (10) + server_tokens off (10) + OCSP stapling (5) = 70 (Grade B)
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.passedChecks).toContain('Modern TLS 1.3 protocol enabled');
    expect(result.passedChecks).toContain('Legacy TLS 1.0/1.1 and SSLv3 disabled');
    expect(result.passedChecks).toContain('Server version tokens hidden (server_tokens off)');
    expect(result.passedChecks).toContain('OCSP Stapling enabled for fast TLS validation');

    // Missing checks flagged as issues
    const issueTitles = result.issues.map((i) => i.title);
    expect(issueTitles).toContain('Missing HSTS Header');
    expect(issueTitles).toContain('No Rate Limiting / DDoS Shield');
    expect(issueTitles).toContain('Missing X-Frame-Options');
  });

  it('audits samples/nginx-sample-2.conf (insecure legacy looker config)', () => {
    const filePath = path.join(samplesDir, 'nginx-sample-2.conf');
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = auditCustomNginx(content);

    // This config uses TLSv1 TLSv1.1 TLSv1.2 (insecure legacy TLS)
    const issueTitles = result.issues.map((i) => i.title);
    expect(issueTitles).toContain('Legacy Insecure SSL Protocols Detected');
    expect(issueTitles).toContain('Missing HSTS Header');
    expect(issueTitles).toContain('No Rate Limiting / DDoS Shield');
    expect(issueTitles).toContain('Server Tokens Exposed');
    expect(result.grade).toMatch(/^[C-F]$/);
  });

  it('audits samples/nginx-sample-3.conf (basic auth / reverse proxy without TLS)', () => {
    const filePath = path.join(samplesDir, 'nginx-sample-3.conf');
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = auditCustomNginx(content);

    const issueTitles = result.issues.map((i) => i.title);
    expect(issueTitles).toContain('Missing HSTS Header');
    expect(issueTitles).toContain('No Rate Limiting / DDoS Shield');
    expect(issueTitles).toContain('Server Tokens Exposed');
    expect(issueTitles).toContain('Missing X-Frame-Options');
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it('validates 100% field coverage between Form Generator output and Parser audit', () => {
    const state = {
      domainNames: 'sample.app.internal',
      listenPort: 443,
      enableHttps: true,
      http2: true,
      http3Quic: false,
      serverTokensOff: true,
      workerProcesses: 'auto',
      workerConnections: 4096,
      sslProfile: 'modern' as const,
      hstsEnabled: true,
      hstsSubdomains: true,
      hstsPreload: true,
      ocspStapling: true,
      dhParamBits: 2048,
      rateLimitEnabled: true,
      rateLimitZone: 'ip_limit',
      rateLimitRps: 15,
      rateLimitBurst: 20,
      rateLimitNoDelay: true,
      xFrameOptions: 'DENY' as const,
      xContentTypeOptions: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: true,
      contentSecurityPolicy: "default-src 'self'",
      proxyPassUrl: 'http://127.0.0.1:8080',
      enableWebsockets: true,
      proxyConnectTimeout: 30,
      proxyReadTimeout: 30,
      proxySendTimeout: 30,
      gzipEnabled: true,
      brotliEnabled: false,
      clientMaxBodySize: 32,
      keepaliveTimeout: 65,
    };

    const generatedConf = generateNginxConf(state);
    const securityHeaders = generateSecurityHeadersConf(state);
    const fullConf = generatedConf.replace('include /etc/nginx/security-headers.conf;', securityHeaders);
    const genScore = calculateNginxSecurityScore(state);
    const auditResult = auditCustomNginx(fullConf);

    expect(genScore.score).toBeGreaterThanOrEqual(95);
    expect(genScore.grade).toBe('A+');
    expect(auditResult.issues.length).toBe(0);
    expect(auditResult.score).toBeGreaterThanOrEqual(95);
  });
});
