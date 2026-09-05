import { describe, it, expect } from 'vitest';
import { auditDockerfile } from '../engines/dockerfile/linter';
import { optimizeDockerfile } from '../engines/dockerfile/optimizer';
import { applyQuickFix } from '../engines/dockerfile/quickFix';

describe('Real-World Dockerfile Validation & Edge Case Audit', () => {
  describe('Complex Real-World Multi-Stage Dockerfile', () => {
    const enterpriseDockerfile = `# Production Next.js multi-stage build
FROM node:20.11-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production

# Dependency installation stage
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application compilation stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Final production runtime stage
FROM node:20.11-alpine AS runner
WORKDIR /app
ENV PORT=3000 \\
    HOSTNAME="0.0.0.0" \\
    NODE_ENV=production

# Create dedicated non-root application user
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]`;

    it('passes enterprise production Next.js Dockerfile with 100 score and Grade A+', () => {
      const audit = auditDockerfile(enterpriseDockerfile);
      expect(audit.syntaxValid).toBe(true);
      expect(audit.criticalCount).toBe(0);
      expect(audit.warningCount).toBe(0);
      expect(audit.optimizationCount).toBe(0);
      expect(audit.score).toBe(100);
      expect(audit.grade).toBe('A+');
    });

    it('optimizer preserves local stage aliases in multi-stage build', () => {
      const result = optimizeDockerfile(enterpriseDockerfile);
      expect(result.optimizedContent).toContain('FROM base AS deps');
      expect(result.optimizedContent).toContain('FROM base AS builder');
      expect(result.optimizedContent).not.toContain('base:alpine');
      expect(result.optimizedContent).not.toContain('base:20-alpine');
    });
  });

  describe('Complex ENV Values with Quotes, Hashes, and URLs', () => {
    it('correctly handles ENV variables containing URLs, fragments, and quotes without false comment stripping', () => {
      const dockerfile = `FROM node:20-alpine
ENV API_URL="https://api.example.com/v1/auth?client_id=123#token_fragment"
ENV QUERY_STRING='key=value&tag=prod#main'
USER node
HEALTHCHECK CMD wget -q http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      expect(audit.syntaxValid).toBe(true);
      expect(audit.criticalCount).toBe(0);
    });
  });

  describe('Complex Multi-line Instructions & Comments Inside Continuations', () => {
    it('parses complex chained multiline RUN instructions with embedded comments cleanly', () => {
      const dockerfile = `FROM alpine:3.19
RUN apk add --no-cache \\
      # Security packages
      ca-certificates \\
      curl \\
      # Networking tools
      bind-tools \\
    && rm -rf /tmp/*
USER appuser
HEALTHCHECK CMD wget -q http://localhost/ || exit 1`;

      const audit = auditDockerfile(dockerfile);
      expect(audit.syntaxValid).toBe(true);
      expect(audit.issues.some((i) => i.ruleCode === 'CK-06')).toBe(false);
    });
  });

  describe('Scoring Boundary & Penalty Calculations', () => {
    it('severely broken Dockerfile with fatal syntax error results in score 0 and Grade F', () => {
      const brokenDockerfile = `RUN echo "no from first"
FROM
COPY missing_dest`;

      const audit = auditDockerfile(brokenDockerfile);
      expect(audit.syntaxValid).toBe(false);
      expect(audit.score).toBe(0);
      expect(audit.grade).toBe('F');
    });

    it('calculates exact weighted score for combined critical, warning, and optimization findings', () => {
      // 1 critical (-30: root user) + 1 warning (-12: unpinned tag) + 1 warning (-12: missing healthcheck) + 1 opt (-5: relative workdir)
      // Expected score: 100 - (30 + 12 + 12 + 5) = 41 (Grade F)
      const dockerfile = `FROM node:latest
WORKDIR app
USER root
CMD ["node", "index.js"]`;

      const audit = auditDockerfile(dockerfile);
      expect(audit.syntaxValid).toBe(true);
      expect(audit.criticalCount).toBe(1); // root user
      expect(audit.warningCount).toBe(2);  // unpinned tag + missing healthcheck
      expect(audit.optimizationCount).toBe(1); // relative workdir
      expect(audit.score).toBe(41);
      expect(audit.grade).toBe('F');
    });
  });

  describe('Multi-Stage Quick Fix Application', () => {
    it('applies missing USER and HEALTHCHECK quick fixes to the final stage of a multi-stage Dockerfile', () => {
      const multiStageMissingUser = `FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY . .
RUN go build -o /app/server .

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/server .
CMD ["/app/server"]`;

      const audit = auditDockerfile(multiStageMissingUser);
      const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
      expect(userIssue).toBeDefined();

      if (userIssue) {
        const fixed = applyQuickFix(multiStageMissingUser, userIssue);
        expect(fixed).toContain('USER 1001');
        // Verify USER is placed in final stage (after FROM alpine:3.19)
        const runnerIndex = fixed.indexOf('FROM alpine:3.19');
        const userIndex = fixed.indexOf('USER 1001');
        expect(userIndex).toBeGreaterThan(runnerIndex);

        const auditFixed = auditDockerfile(fixed);
        expect(auditFixed.issues.some((i) => i.ruleCode === 'CK-01')).toBe(false);
      }
    });
  });
});
