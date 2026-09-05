import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveAutoFixDirective } from '../engines/nginx/mutator';
import { useSuiteStore } from '../store/useSuiteStore';

describe('Pre-Launch Deployment Readiness Regressions', () => {
  const rootDir = path.resolve(__dirname, '../../');

  describe('1. Docker Public Assets & Build Context', () => {
    it('verifies Dockerfile builder stage copies public/ to ensure static asset emission', () => {
      const dockerfilePath = path.join(rootDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      const content = fs.readFileSync(dockerfilePath, 'utf-8');

      // Stage 1 must copy public/ directory
      expect(content).toContain('COPY public ./public');
    });

    it('verifies public SEO & browser assets exist in public/', () => {
      const publicDir = path.join(rootDir, 'public');
      expect(fs.existsSync(path.join(publicDir, 'favicon.ico'))).toBe(true);
      expect(fs.existsSync(path.join(publicDir, 'favicon.svg'))).toBe(true);
      expect(fs.existsSync(path.join(publicDir, 'robots.txt'))).toBe(true);
      expect(fs.existsSync(path.join(publicDir, 'sitemap.xml'))).toBe(true);
      expect(fs.existsSync(path.join(publicDir, 'og-preview.png'))).toBe(true);

      const ogStats = fs.statSync(path.join(publicDir, 'og-preview.png'));
      expect(ogStats.size).toBeGreaterThan(10000); // High-res preview image

      const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf-8');
      expect(sitemap).toContain('<loc>https://opshardener.dev/</loc>');
      expect(sitemap).toContain('<loc>https://opshardener.dev/#nginx</loc>');
      expect(sitemap).toContain('<loc>https://opshardener.dev/#dockerfile</loc>');
      expect(sitemap).toContain('<loc>https://opshardener.dev/#csp</loc>');
      expect(sitemap).toContain('<loc>https://opshardener.dev/#topology</loc>');
    });
  });

  describe('2. Nginx Studio Auto-Fix Correctness', () => {
    it('maps X-Content-Type-Options findings to xContentTypeOptions (NOT hstsEnabled)', () => {
      expect(resolveAutoFixDirective('Missing X-Content-Type-Options')).toBe('xContentTypeOptions');
      expect(resolveAutoFixDirective('Missing MIME Sniffing Protection (nosniff)')).toBe('xContentTypeOptions');
      expect(resolveAutoFixDirective('Content-Type Header Vulnerability')).toBe('xContentTypeOptions');
    });

    it('maps Missing HTTPS / TLS findings to sslModern', () => {
      expect(resolveAutoFixDirective('Missing HTTPS / SSL Termination')).toBe('sslModern');
      expect(resolveAutoFixDirective('Insecure HTTP: Missing HTTPS')).toBe('sslModern');
      expect(resolveAutoFixDirective('Legacy Insecure SSL Protocols Detected')).toBe('sslModern');
      expect(resolveAutoFixDirective('Missing TLS 1.3 Support')).toBe('sslModern');
    });

    it('maps HSTS findings strictly to hstsEnabled', () => {
      expect(resolveAutoFixDirective('Missing HSTS Header')).toBe('hstsEnabled');
      expect(resolveAutoFixDirective('HSTS Ineffective (max-age=0)')).toBe('hstsEnabled');
      expect(resolveAutoFixDirective('Invalid HSTS Header')).toBe('hstsEnabled');
    });

    it('maps Clickjacking / X-Frame findings to xFrameOptions', () => {
      expect(resolveAutoFixDirective('Missing X-Frame-Options')).toBe('xFrameOptions');
      expect(resolveAutoFixDirective('Clickjacking Vulnerability')).toBe('xFrameOptions');
    });

    it('maps Rate Limiting / DDoS findings to rateLimitEnabled', () => {
      expect(resolveAutoFixDirective('No Rate Limiting / DDoS Shield')).toBe('rateLimitEnabled');
      expect(resolveAutoFixDirective('Rate Limit Zone Defined But Unenforced')).toBe('rateLimitEnabled');
    });

    it('maps Server Tokens findings to serverTokensOff', () => {
      expect(resolveAutoFixDirective('Server Tokens Exposed')).toBe('serverTokensOff');
    });

    it('returns null for syntax errors, unresolved includes, and unrecognized titles (prevents accidental mutations)', () => {
      expect(resolveAutoFixDirective('Nginx Syntax / Block Error')).toBeNull();
      expect(resolveAutoFixDirective('Invalid file format')).toBeNull();
      expect(resolveAutoFixDirective('External include detected')).toBeNull();
      expect(resolveAutoFixDirective('')).toBeNull();
    });
  });

  describe('3. Tool Hash Navigation & State Preservation', () => {
    beforeEach(() => {
      useSuiteStore.setState({ activeTool: 'nginx' });
    });

    it('switches tool directly when hash matches tool names', () => {
      const store = useSuiteStore.getState();

      expect(store.loadFromUrlHash('#dockerfile')).toBe(true);
      expect(useSuiteStore.getState().activeTool).toBe('dockerfile');

      expect(store.loadFromUrlHash('#csp')).toBe(true);
      expect(useSuiteStore.getState().activeTool).toBe('csp');

      expect(store.loadFromUrlHash('#topology')).toBe(true);
      expect(useSuiteStore.getState().activeTool).toBe('topology');

      expect(store.loadFromUrlHash('#nginx')).toBe(true);
      expect(useSuiteStore.getState().activeTool).toBe('nginx');
    });

    it('handles hashes with leading slashes (#/dockerfile)', () => {
      const store = useSuiteStore.getState();
      expect(store.loadFromUrlHash('#/dockerfile')).toBe(true);
      expect(useSuiteStore.getState().activeTool).toBe('dockerfile');
    });

    it('preserves full LZString compressed-state serialization and restoration roundtrip', () => {
      const store = useSuiteStore.getState();
      store.setActiveTool('dockerfile');
      store.setDockerfileContent('FROM alpine:3.20\nCMD ["sh"]');

      const compressedHash = store.serializeToUrlHash();
      expect(compressedHash.length).toBeGreaterThan(10);

      // Reset store to default
      useSuiteStore.setState({ activeTool: 'nginx', dockerfileContent: '' });

      // Restore from compressed hash
      const success = store.loadFromUrlHash(`#${compressedHash}`);
      expect(success).toBe(true);
      expect(useSuiteStore.getState().activeTool).toBe('dockerfile');
      expect(useSuiteStore.getState().dockerfileContent).toBe('FROM alpine:3.20\nCMD ["sh"]');
    });

    it('returns false on empty or invalid hash without modifying state', () => {
      useSuiteStore.setState({ activeTool: 'csp' });
      const store = useSuiteStore.getState();

      expect(store.loadFromUrlHash('')).toBe(false);
      expect(store.loadFromUrlHash('#')).toBe(false);
      expect(store.loadFromUrlHash('#unknown-nonexistent-tool')).toBe(false);
      expect(useSuiteStore.getState().activeTool).toBe('csp');
    });
  });
});
