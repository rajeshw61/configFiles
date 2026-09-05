import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { auditDockerfile, parseInstructions } from '../engines/dockerfile/linter';
import { parseDockerStages } from '../engines/dockerfile/stages';

describe('Production Docker & Container Configuration Validation', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const dockerfilePath = path.join(rootDir, 'Dockerfile');
  const dockerignorePath = path.join(rootDir, '.dockerignore');
  const nginxConfPath = path.join(rootDir, 'nginx.conf');

  describe('Dockerfile Security & Multi-Stage Architecture', () => {
    it('ensures Dockerfile exists and parses without critical security defects', () => {
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      const content = fs.readFileSync(dockerfilePath, 'utf-8');

      const instructions = parseInstructions(content);
      const stageAnalysis = parseDockerStages(instructions);

      // Multi-stage verification
      expect(stageAnalysis.isMultiStage).toBe(true);
      expect(stageAnalysis.totalStages).toBe(2);

      // Stage 1: Build stage
      const builderStage = stageAnalysis.stages[0];
      expect(builderStage.alias).toBe('builder');
      expect(builderStage.baseImage).toBe('node:22-alpine');
      expect(builderStage.isFinal).toBe(false);

      // Stage 2: Runtime stage
      const runnerStage = stageAnalysis.stages[1];
      expect(runnerStage.alias).toBe('runner');
      expect(runnerStage.baseImage).toBe('nginxinc/nginx-unprivileged:1.27-alpine');
      expect(runnerStage.isFinal).toBe(true);

      // Run full audit through OpsHardener Dockerfile linter engine
      const audit = auditDockerfile(content);

      // Verify no critical severity security vulnerabilities
      const criticalIssues = audit.issues.filter(
        (issue) => issue.severity === 'critical'
      );
      expect(criticalIssues).toEqual([]);

      // Verify non-root user directive check passes (CK-01)
      const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
      expect(userIssue).toBeUndefined();

      // Verify healthcheck check passes (CK-04)
      const healthIssue = audit.issues.find((i) => i.ruleCode === 'CK-04');
      expect(healthIssue).toBeUndefined();

      // Verify base images are pinned (CK-03)
      const unpinnedIssue = audit.issues.find((i) => i.ruleCode === 'CK-03');
      expect(unpinnedIssue).toBeUndefined();
    });

    it('ensures builder dependencies are not copied to the final runtime stage', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');

      // Ensure no COPY from host directly into final runtime stage without filtering
      // Stage 2 should only copy /app/dist from builder and nginx.conf
      expect(content).toContain('COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html');
      expect(content).not.toMatch(/COPY\s+node_modules/i);
      expect(content).not.toMatch(/COPY\s+--from=builder\s+.*node_modules/i);
    });

    it('ensures non-root user UID 101 (nginx) and unprivileged port 8080 are exposed', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toMatch(/USER\s+nginx/i);
      expect(content).toMatch(/EXPOSE\s+8080/);
    });
  });

  describe('Nginx SPA Configuration (nginx.conf)', () => {
    it('ensures nginx.conf exists and complies with zero-backend guarantee', () => {
      expect(fs.existsSync(nginxConfPath)).toBe(true);
      const content = fs.readFileSync(nginxConfPath, 'utf-8');

      // Zero-Backend guarantee: no reverse proxy or external telemetry proxying
      expect(content).not.toContain('proxy_pass');
      expect(content).not.toContain('upstream');

      // Listening on non-root port 8080
      expect(content).toMatch(/listen\s+8080;/);

      // SPA client-side route fallback to index.html
      expect(content).toContain('try_files $uri $uri/ /index.html;');

      // Dedicated /healthz endpoint
      expect(content).toMatch(/location\s*=\s*\/healthz/);

      // Security hardening headers & directives
      expect(content).toContain('server_tokens off;');
      expect(content).toMatch(/add_header\s+X-Frame-Options\s+"DENY"/);
      expect(content).toMatch(/add_header\s+X-Content-Type-Options\s+"nosniff"/);
      expect(content).toMatch(/add_header\s+Referrer-Policy\s+"strict-origin-when-cross-origin"/);
      expect(content).toMatch(/add_header\s+Permissions-Policy/);

      // Static assets long-term caching
      expect(content).toMatch(/location\s+\/assets\//);
      expect(content).toContain('max-age=31536000, immutable');

      // Dotfile blocking
      expect(content).toMatch(/location\s+~\s+\/\\\./);
      expect(content).toContain('deny all;');
    });

    it('guarantees security headers are preserved inside location blocks avoiding Nginx add_header inheritance drop', () => {
      const content = fs.readFileSync(nginxConfPath, 'utf-8');

      // In Nginx, if a location block defines any add_header directive,
      // all parent-level add_header directives are dropped unless re-declared.
      const rootLocationMatch = content.match(/location\s+\/\s*\{([^}]+)\}/);
      expect(rootLocationMatch).not.toBeNull();
      const rootLocationBlock = rootLocationMatch![1];

      expect(rootLocationBlock).toContain('X-Frame-Options');
      expect(rootLocationBlock).toContain('X-Content-Type-Options');
      expect(rootLocationBlock).toContain('Referrer-Policy');

      const assetsLocationMatch = content.match(/location\s+\/assets\/\s*\{([^}]+)\}/);
      expect(assetsLocationMatch).not.toBeNull();
      const assetsLocationBlock = assetsLocationMatch![1];

      expect(assetsLocationBlock).toContain('X-Frame-Options');
      expect(assetsLocationBlock).toContain('X-Content-Type-Options');
    });

    it('ensures nginx.conf serves /robots.txt and /favicon.ico directly without falling back to SPA index.html', () => {
      const content = fs.readFileSync(nginxConfPath, 'utf-8');

      // Static robots.txt location
      const robotsMatch = content.match(/location\s+=\s+\/robots\.txt\s*\{([^}]+)\}/);
      expect(robotsMatch).not.toBeNull();
      const robotsBlock = robotsMatch![1];
      expect(robotsBlock).toContain('try_files $uri =404;');
      expect(robotsBlock).toContain('X-Frame-Options');
      expect(robotsBlock).toContain('X-Content-Type-Options');

      // Static favicon.ico and favicon.svg locations
      const faviconMatch = content.match(/location\s+=\s+\/favicon\.ico\s*\{([^}]+)\}/);
      expect(faviconMatch).not.toBeNull();
      const faviconBlock = faviconMatch![1];
      expect(faviconBlock).toContain('try_files $uri =404;');
      expect(faviconBlock).toContain('X-Frame-Options');
      expect(faviconBlock).toContain('X-Content-Type-Options');

      // SPA fallback remains intact for general deep paths
      expect(content).toContain('try_files $uri $uri/ /index.html;');
    });
  });

  describe('Static SEO & Browser Assets (public/)', () => {
    it('ensures public/robots.txt and favicon assets exist with proper formatting and links', () => {
      const robotsPath = path.join(rootDir, 'public', 'robots.txt');
      const faviconSvgPath = path.join(rootDir, 'public', 'favicon.svg');
      const faviconIcoPath = path.join(rootDir, 'public', 'favicon.ico');

      expect(fs.existsSync(robotsPath)).toBe(true);
      const robotsContent = fs.readFileSync(robotsPath, 'utf-8');
      expect(robotsContent).toContain('User-agent: *');
      expect(robotsContent).toContain('Allow: /');
      expect(robotsContent).toContain('Sitemap: https://opshardener.dev/sitemap.xml');

      expect(fs.existsSync(faviconSvgPath)).toBe(true);
      const svgContent = fs.readFileSync(faviconSvgPath, 'utf-8');
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('</svg>');

      expect(fs.existsSync(faviconIcoPath)).toBe(true);
      const icoStats = fs.statSync(faviconIcoPath);
      expect(icoStats.size).toBeGreaterThan(100);
    });
  });

  describe('.dockerignore Context Security', () => {
    it('ensures .dockerignore excludes sensitive and unnecessary directories', () => {
      expect(fs.existsSync(dockerignorePath)).toBe(true);
      const content = fs.readFileSync(dockerignorePath, 'utf-8');

      const requiredPatterns = [
        'node_modules/',
        '.git/',
        'coverage/',
        'dist/',
        '*.test.ts',
        'src/__tests__/',
        '.vscode/',
        '*.md',
      ];

      for (const pattern of requiredPatterns) {
        expect(content).toContain(pattern);
      }
    });
  });
});
