import { describe, it, expect } from 'vitest';
import { auditDockerfile } from '../engines/dockerfile/linter';
import { optimizeDockerfile } from '../engines/dockerfile/optimizer';
import { applyQuickFix } from '../engines/dockerfile/quickFix';

describe('Realistic Dockerfile End-to-End Production Flows', () => {
  // 1. Simple Node application
  it('analyzes and optimizes a simple Node application', () => {
    const rawNode = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`;

    // Analyzer detects missing USER (CK-01) and missing HEALTHCHECK (CK-04)
    const auditBefore = auditDockerfile(rawNode);
    expect(auditBefore.issues.some((i) => i.ruleCode === 'CK-01')).toBe(true);
    expect(auditBefore.issues.some((i) => i.ruleCode === 'CK-04')).toBe(true);

    // Apply optimizer
    const optResult = optimizeDockerfile(rawNode);
    expect(optResult.optimizedContent).toContain('USER 10001');
    expect(optResult.optimizedContent).toContain('HEALTHCHECK');

    // Re-audit optimized content
    const auditAfter = auditDockerfile(optResult.optimizedContent);
    expect(auditAfter.issues.some((i) => i.ruleCode === 'CK-01')).toBe(false);
    expect(auditAfter.issues.some((i) => i.ruleCode === 'CK-04')).toBe(false);
    expect(auditAfter.score).toBeGreaterThanOrEqual(90);
  });

  // 2. Multi-stage Node application (stage 1 USER vs stage 2 unprivileged USER)
  it('correctly scopes optimizer to ensure final runtime stage gets non-root USER and HEALTHCHECK', () => {
    const rawMultiStage = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
CMD ["nginx", "-g", "daemon off;"]`;

    const auditBefore = auditDockerfile(rawMultiStage);
    expect(auditBefore.issues.some((i) => i.ruleCode === 'CK-01')).toBe(true);
    expect(auditBefore.issues.some((i) => i.ruleCode === 'CK-04')).toBe(true);

    const optResult = optimizeDockerfile(rawMultiStage);
    expect(optResult.optimizedContent).toContain('FROM nginx:1.25-alpine');

    // Ensure USER and HEALTHCHECK are placed in the final stage before CMD
    const finalStagePart = optResult.optimizedContent.split(/FROM nginx:1.25-alpine/i)[1];
    expect(finalStagePart).toContain('USER 10001');
    expect(finalStagePart).toContain('HEALTHCHECK');

    const auditAfter = auditDockerfile(optResult.optimizedContent);
    expect(auditAfter.issues.some((i) => i.ruleCode === 'CK-01')).toBe(false);
    expect(auditAfter.issues.some((i) => i.ruleCode === 'CK-04')).toBe(false);
  });

  // 3. Nginx static SPA
  it('handles Nginx SPA container with custom unprivileged base and healthcheck', () => {
    const spaDockerfile = `FROM nginxinc/nginx-unprivileged:1.27-alpine
USER nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]`;

    const audit = auditDockerfile(spaDockerfile);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.criticalCount).toBe(0);
    expect(audit.warningCount).toBe(0);
    expect(audit.score).toBe(100);
    expect(audit.grade).toBe('A+');
  });

  // 4. Python application with apt cache hygiene
  it('optimizes Python Dockerfile with apt-get cache cleanup and unpinned image', () => {
    const rawPython = `FROM python:latest
WORKDIR /code
RUN apt-get update && apt-get install -y gcc
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "app.py"]`;

    const optResult = optimizeDockerfile(rawPython);
    expect(optResult.optimizedContent).toContain('FROM python:3.11-slim');
    expect(optResult.optimizedContent).toContain('--no-install-recommends');
    expect(optResult.optimizedContent).toContain('rm -rf /var/lib/apt/lists/*');
    expect(optResult.optimizedContent).toContain('USER 10001');
  });

  // 5. Alpine minimal application
  it('handles minimal Alpine utility container with APK cache cleanup', () => {
    const rawAlpine = `FROM alpine:3.19
RUN apk add --no-cache curl jq
USER 1000
HEALTHCHECK CMD curl -f http://localhost:8080/ || exit 1
ENTRYPOINT ["/bin/sh"]`;

    const audit = auditDockerfile(rawAlpine);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.issues.some((i) => i.ruleCode === 'CK-06')).toBe(false);
    expect(audit.issues.some((i) => i.ruleCode === 'CK-01')).toBe(false);
  });

  // 6. Dockerfile containing intentional security findings & sequential quick-fixes
  it('detects multiple security violations and resolves them sequentially via quick-fixes', () => {
    let dockerfile = `FROM node:latest
ADD https://example.com/data.tar.gz /data/
ADD app.js /app/
RUN npm install
USER root
CMD ["node", "/app/app.js"]`;

    const audit1 = auditDockerfile(dockerfile);

    // Should detect: CK-03 (unpinned), CK-07 (ADD for local file), CK-01 (USER root)
    const ck03 = audit1.issues.find((i) => i.ruleCode === 'CK-03');
    const ck07 = audit1.issues.find((i) => i.ruleCode === 'CK-07');
    const ck01 = audit1.issues.find((i) => i.ruleCode === 'CK-01');

    expect(ck03).toBeDefined();
    expect(ck07).toBeDefined();
    expect(ck01).toBeDefined();

    // Quick-fix 1: Fix base image pinning
    dockerfile = applyQuickFix(dockerfile, ck03!);
    expect(dockerfile).toContain('node:20-alpine');

    // Quick-fix 2: Fix ADD app.js
    dockerfile = applyQuickFix(dockerfile, ck07!);
    expect(dockerfile).toContain('COPY app.js /app/');

    // Quick-fix 3: Fix USER root
    dockerfile = applyQuickFix(dockerfile, ck01!);
    expect(dockerfile).toContain('USER appuser');
    expect(dockerfile).not.toContain('USER root');

    // Verify resolved issues are no longer flagged
    const audit2 = auditDockerfile(dockerfile);
    expect(audit2.issues.some((i) => i.ruleCode === 'CK-03')).toBe(false);
    expect(audit2.issues.some((i) => i.ruleCode === 'CK-07')).toBe(false);
    expect(audit2.issues.some((i) => i.ruleCode === 'CK-01' && i.title.includes('Root'))).toBe(false);
  });

  // 7. Complex multiline Dockerfile with line continuations and comments
  it('preserves multiline line-continuation instructions and inline comments', () => {
    const complex = `# Base image layer
FROM debian:12-slim

# Package installation layer
RUN apt-get update && \\
    apt-get install -y --no-install-recommends \\
      ca-certificates \\
      curl && \\
    rm -rf /var/lib/apt/lists/*

USER 1001
HEALTHCHECK --interval=30s CMD curl -f http://localhost/ || exit 1
CMD ["/bin/bash"]`;

    const audit = auditDockerfile(complex);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.criticalCount).toBe(0);

    const optResult = optimizeDockerfile(complex);
    // Preserves comments and does not alter already-hardened RUN instruction
    expect(optResult.optimizedContent).toContain('# Base image layer');
    expect(optResult.optimizedContent).toContain('# Package installation layer');
    expect(optResult.optimizedContent).toContain('ca-certificates');
    expect(optResult.optimizedContent).toContain('curl');
  });

  // 8. CRLF line ending preservation in quick-fix
  it('preserves Windows CRLF (\\r\\n) line endings cleanly without introducing mixed line breaks', () => {
    const crlfDockerfile = `FROM node:latest\r\nWORKDIR /app\r\nUSER root\r\nCMD ["node", "server.js"]\r\n`;

    const audit = auditDockerfile(crlfDockerfile);
    const rootIssue = audit.issues.find((i) => i.ruleCode === 'CK-01' && i.patch);
    expect(rootIssue).toBeDefined();

    const fixed = applyQuickFix(crlfDockerfile, rootIssue!);
    expect(fixed).toContain('\r\n');
    expect(fixed).toContain('USER appuser');
    // Verify no isolated LF without CR
    const withoutCrlf = fixed.replace(/\r\n/g, '');
    expect(withoutCrlf).not.toContain('\n');
  });

  // 9. Optimizer Idempotency
  it('is strictly idempotent: running optimizer twice produces identical content with 0 MB savings', () => {
    const rawDockerfile = `FROM node:latest
WORKDIR /app
RUN npm install
RUN npm test
ADD src /app/src
CMD ["node", "index.js"]`;

    const pass1 = optimizeDockerfile(rawDockerfile);
    expect(pass1.optimizationsApplied.length).toBeGreaterThan(0);
    expect(pass1.optimizedContent).toContain('node:20-alpine');
    expect(pass1.optimizedContent).toContain('COPY src /app/src');
    expect(pass1.optimizedContent).toContain('USER 10001');

    // Run optimizer a second time on the already optimized content
    const pass2 = optimizeDockerfile(pass1.optimizedContent);
    expect(pass2.optimizedContent).toBe(pass1.optimizedContent);
    expect(pass2.optimizationsApplied).toEqual([]);
    expect(pass2.estimatedSavings).toBe('0 MB');
  });

  // 10. Large-file parsing performance & stability
  it('safely parses large Dockerfiles (> 1,200 lines) within performance budget without memory issues', () => {
    const lines: string[] = ['FROM node:20-alpine AS builder', 'WORKDIR /app'];
    for (let i = 1; i <= 600; i++) {
      lines.push(`RUN echo "step ${i}"`);
      lines.push(`COPY file${i}.txt ./dest/`);
    }
    lines.push('USER 10001');
    lines.push('HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1');
    lines.push('CMD ["node", "server.js"]');

    const largeDockerfile = lines.join('\n');
    expect(lines.length).toBeGreaterThan(1200);

    const startTime = performance.now();
    const result = auditDockerfile(largeDockerfile);
    const duration = performance.now() - startTime;

    expect(result.syntaxValid).toBe(true);
    // Parsing 1,200 lines should complete well under 150ms
    expect(duration).toBeLessThan(150);
  });

  // 11. CRLF line ending preservation in optimizeDockerfile
  it('preserves Windows CRLF (\\r\\n) line endings in optimizeDockerfile without introducing mixed line breaks', () => {
    const crlfDockerfile = 'FROM node:latest\r\nWORKDIR /app\r\nRUN npm install\r\nRUN npm test\r\nADD src /app/src\r\nCMD ["node", "index.js"]\r\n';
    const optResult = optimizeDockerfile(crlfDockerfile);

    expect(optResult.optimizedContent).toContain('\r\n');
    expect(optResult.optimizedContent).toContain('node:20-alpine');
    expect(optResult.optimizedContent).toContain('COPY src /app/src');
    expect(optResult.optimizedContent).toContain('USER 10001');

    // Verify all line endings are consistently CRLF (no isolated LF)
    const withoutCrlf = optResult.optimizedContent.replace(/\r\n/g, '');
    expect(withoutCrlf).not.toContain('\n');
  });

  // 12. Re-audit optimized Dockerfile confirms significant score improvement
  it('re-auditing optimized Dockerfile confirms significant score improvement to Grade A+', () => {
    const unhardened = `FROM node:latest
WORKDIR /app
RUN npm install
RUN npm test
ADD . /app
CMD ["node", "server.js"]`;

    const beforeAudit = auditDockerfile(unhardened);
    expect(beforeAudit.score).toBeLessThan(50);
    expect(beforeAudit.grade).toBe('F');
    expect(beforeAudit.criticalCount).toBeGreaterThanOrEqual(1);

    const optResult = optimizeDockerfile(unhardened);
    const afterAudit = auditDockerfile(optResult.optimizedContent);

    expect(afterAudit.syntaxValid).toBe(true);
    expect(afterAudit.criticalCount).toBe(0);
    expect(afterAudit.score).toBe(100);
    expect(afterAudit.grade).toBe('A+');
  });
});

