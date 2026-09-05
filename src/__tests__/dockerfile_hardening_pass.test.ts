import { describe, it, expect } from 'vitest';
import { auditDockerfile } from '../engines/dockerfile/linter';

describe('Dockerfile Hardening Pass: Scoping & Extended Security Checks', () => {
  describe('CK-04 HEALTHCHECK Stage Scoping', () => {
    it('flags missing HEALTHCHECK on final stage even if builder stage defined one', () => {
      const dockerfile = `FROM node:20-alpine AS builder
HEALTHCHECK CMD curl -f http://localhost/ || exit 1
RUN npm run build

FROM nginx:alpine
USER nginx
COPY --from=builder /app/dist /usr/share/nginx/html`;

      const audit = auditDockerfile(dockerfile);
      const healthIssue = audit.issues.find((i) => i.ruleCode === 'CK-04');
      expect(healthIssue).toBeDefined();
    });

    it('passes when final runtime stage defines HEALTHCHECK, regardless of builder stage', () => {
      const dockerfile = `FROM node:20-alpine AS builder
RUN npm run build

FROM nginx:alpine
USER nginx
COPY --from=builder /app/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const healthIssue = audit.issues.find((i) => i.ruleCode === 'CK-04');
      expect(healthIssue).toBeUndefined();
    });
  });

  describe('CK-03 Base Image Pinning & Local Stage Aliases', () => {
    it('does NOT flag local stage alias in subsequent FROM as unpinned image', () => {
      const dockerfile = `FROM node:20-alpine AS base
RUN npm install

FROM base AS builder
RUN npm run build

FROM nginx:1.27-alpine
USER nginx
COPY --from=builder /dist /html
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const unpinnedIssues = audit.issues.filter((i) => i.ruleCode === 'CK-03');
      expect(unpinnedIssues.length).toBe(0);
    });

    it('flags unpinned external images using :latest or no tag', () => {
      const dockerfile = `FROM node:latest AS builder
RUN npm run build

FROM nginx
USER nginx
COPY --from=builder /dist /html
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const unpinnedIssues = audit.issues.filter((i) => i.ruleCode === 'CK-03');
      expect(unpinnedIssues.length).toBe(2);
    });
  });

  describe('CK-05 Consecutive RUN Stage Scoping', () => {
    it('does not flag RUN instructions across stage boundaries as consecutive', () => {
      const dockerfile = `FROM node:20-alpine AS builder
RUN npm run build

FROM nginx:1.27-alpine
RUN echo "setting up"
USER nginx
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const consecutiveIssue = audit.issues.find((i) => i.ruleCode === 'CK-05');
      expect(consecutiveIssue).toBeUndefined();
    });

    it('flags consecutive RUN instructions within the same stage', () => {
      const dockerfile = `FROM node:20-alpine
RUN npm install
RUN npm run build
USER node
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const consecutiveIssue = audit.issues.find((i) => i.ruleCode === 'CK-05');
      expect(consecutiveIssue).toBeDefined();
    });
  });

  describe('CK-15 Insecure Remote Script Execution via Shell Pipe', () => {
    it('detects curl piped directly to sh or bash (CK-15)', () => {
      const dockerfile = `FROM alpine:3.19
RUN curl -fsSL https://get.docker.com | sh
USER appuser
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const pipeIssue = audit.issues.find((i) => i.ruleCode === 'CK-15');
      expect(pipeIssue).toBeDefined();
      expect(pipeIssue?.severity).toBe('warning');
    });

    it('detects wget piped directly to sh or bash (CK-15)', () => {
      const dockerfile = `FROM alpine:3.19
RUN wget -O- https://example.com/install.sh | bash
USER appuser
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const pipeIssue = audit.issues.find((i) => i.ruleCode === 'CK-15');
      expect(pipeIssue).toBeDefined();
    });

    it('does NOT flag regular curl or wget file downloads', () => {
      const dockerfile = `FROM alpine:3.19
RUN curl -fsSL -o /tmp/archive.tar.gz https://example.com/archive.tar.gz && tar -xzf /tmp/archive.tar.gz
USER appuser
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const pipeIssue = audit.issues.find((i) => i.ruleCode === 'CK-15');
      expect(pipeIssue).toBeUndefined();
    });
  });

  describe('CK-16 Dangerous Port Exposure', () => {
    it('detects EXPOSE 22 (SSH daemon) and EXPOSE 2375 (Docker socket)', () => {
      const dockerfile = `FROM node:20-alpine
EXPOSE 22/tcp 2375 8080
USER node
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const portIssues = audit.issues.filter((i) => i.ruleCode === 'CK-16');
      expect(portIssues.length).toBe(2);
      expect(portIssues[0].title).toContain('22');
      expect(portIssues[1].title).toContain('2375');
    });

    it('does NOT flag standard web/application ports', () => {
      const dockerfile = `FROM node:20-alpine
EXPOSE 80 443 3000 8080 5432
USER node
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const portIssues = audit.issues.filter((i) => i.ruleCode === 'CK-16');
      expect(portIssues.length).toBe(0);
    });
  });

  describe('CK-17 Duplicate CMD and ENTRYPOINT in Same Stage', () => {
    it('flags earlier overridden CMD and ENTRYPOINT within the same build stage', () => {
      const dockerfile = `FROM node:20-alpine
ENTRYPOINT ["node"]
ENTRYPOINT ["node", "server.js"]
CMD ["--port", "3000"]
CMD ["--port", "8080"]
USER node
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const dupIssues = audit.issues.filter((i) => i.ruleCode === 'CK-17');
      expect(dupIssues.length).toBe(2);
      expect(dupIssues.some((i) => i.title.includes('ENTRYPOINT'))).toBe(true);
      expect(dupIssues.some((i) => i.title.includes('CMD'))).toBe(true);
    });

    it('does NOT flag CMD / ENTRYPOINT defined in different build stages', () => {
      const dockerfile = `FROM node:20-alpine AS builder
CMD ["npm", "run", "build"]

FROM node:20-alpine AS runner
CMD ["node", "index.js"]
USER node
HEALTHCHECK CMD wget http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      const dupIssues = audit.issues.filter((i) => i.ruleCode === 'CK-17');
      expect(dupIssues.length).toBe(0);
    });
  });
});
