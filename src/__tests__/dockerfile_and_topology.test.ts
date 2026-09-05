import { describe, it, expect } from 'vitest';
import { auditDockerfile } from '../engines/dockerfile/linter';
import { applyQuickFix } from '../engines/dockerfile/quickFix';
import { buildTopologyGraphFromNginx } from '../engines/topology/graph';
import { buildDockerfileTopologyGraph } from '../engines/topology/dockerfileGraph';
import { optimizeDockerfile } from '../engines/dockerfile/optimizer';

describe('Dockerfile Linter & Quick-Fix Engine', () => {
  const sampleDockerfile = `
FROM node:latest
WORKDIR /app
COPY . .
RUN apt-get update && apt-get install -y curl
RUN npm install
USER root
CMD ["node", "server.js"]
`;

  it('audits insecure Dockerfile and identifies root, latest tag, and consecutive RUNs', () => {
    const audit = auditDockerfile(sampleDockerfile);

    expect(audit.criticalCount).toBeGreaterThan(0);
    expect(audit.issues.some((i) => i.ruleCode === 'CK-01')).toBe(true); // Root user
    expect(audit.issues.some((i) => i.ruleCode === 'CK-03')).toBe(true); // Latest tag
    expect(audit.score).toBeLessThan(70);
    expect(audit.syntaxValid).toBe(true);
  });

  it('applies quick-fix for root user and fixes vulnerability', () => {
    const audit = auditDockerfile(sampleDockerfile);
    const rootIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(rootIssue).toBeDefined();

    if (rootIssue) {
      const fixed = applyQuickFix(sampleDockerfile, rootIssue);
      expect(fixed).toContain('USER appuser');
      const auditFixed = auditDockerfile(fixed);
      expect(auditFixed.issues.some((i) => i.id === rootIssue.id)).toBe(false);
    }
  });

  it('handles empty Dockerfile with clean idle state', () => {
    const audit = auditDockerfile('');
    expect(audit.issues.length).toBe(0);
    expect(audit.score).toBe(0);
    expect(audit.syntaxValid).toBe(true);
  });

  it('detects syntax errors in broken Dockerfile (empty FROM, bare CMD, undefined --from stage)', () => {
    const brokenDockerfile = `FROM
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN yarn
COPY . ./
RUN yarn build
FROM nginx:1.12-alpine
COPY --from=build-deps /usr/src/app/build /usr/share/nginx/html
CMD`;

    const audit = auditDockerfile(brokenDockerfile);

    expect(audit.syntaxValid).toBe(false);
    expect(audit.score).toBe(0);
    expect(audit.grade).toBe('F');

    // Check line 1: bare FROM
    const fromIssue = audit.issues.find((i) => i.lineNumber === 1 && i.ruleCode === 'SYNTAX-01');
    expect(fromIssue).toBeDefined();
    expect(fromIssue?.title).toContain('Invalid FROM Instruction');

    // Check line 8: undefined build-deps stage
    const stageIssue = audit.issues.find((i) => i.lineNumber === 8 && i.ruleCode === 'SYNTAX-04');
    expect(stageIssue).toBeDefined();
    expect(stageIssue?.description).toContain('build-deps');

    // Check line 9: bare CMD
    const cmdIssue = audit.issues.find((i) => i.lineNumber === 9 && i.ruleCode === 'SYNTAX-01');
    expect(cmdIssue).toBeDefined();
    expect(cmdIssue?.title).toContain('Invalid CMD Instruction');
  });

  it('detects unknown instructions and common instruction typos with quick fixes', () => {
    const typoDockerfile = `FORM node:20-alpine
WORKDIR /app
COP index.js ./
CMD ["node", "index.js"]`;

    const audit = auditDockerfile(typoDockerfile);
    expect(audit.syntaxValid).toBe(false);

    const typoFrom = audit.issues.find((i) => i.snippet?.includes('FORM'));
    expect(typoFrom).toBeDefined();
    expect(typoFrom?.title).toContain('Unknown Instruction');

    if (typoFrom) {
      const fixed = applyQuickFix(typoDockerfile, typoFrom);
      expect(fixed).toContain('FROM node:20-alpine');
    }
  });

  it('detects direct shell commands written without RUN keyword', () => {
    const rawShellDockerfile = `FROM node:20-alpine
WORKDIR /app
npm install
CMD ["node", "index.js"]`;

    const audit = auditDockerfile(rawShellDockerfile);
    expect(audit.syntaxValid).toBe(false);

    const shellIssue = audit.issues.find((i) => i.title.includes('Direct Shell Command'));
    expect(shellIssue).toBeDefined();
    expect(shellIssue?.lineNumber).toBe(3);

    if (shellIssue) {
      const fixed = applyQuickFix(rawShellDockerfile, shellIssue);
      expect(fixed).toContain('RUN npm install');
    }
  });

  it('detects single quotes in exec form and provides quick fix to double quotes', () => {
    const singleQuoteDockerfile = `FROM node:20-alpine
WORKDIR /app
CMD ['node', 'index.js']`;

    const audit = auditDockerfile(singleQuoteDockerfile);
    expect(audit.syntaxValid).toBe(false);

    const quoteIssue = audit.issues.find((i) => i.ruleCode === 'SYNTAX-05');
    expect(quoteIssue).toBeDefined();

    if (quoteIssue) {
      const fixed = applyQuickFix(singleQuoteDockerfile, quoteIssue);
      expect(fixed).toContain('CMD ["node", "index.js"]');
    }
  });

  it('applies quick-fix on trailing bare CMD without corrupting preceding HEALTHCHECK CMD', () => {
    const dockerfileWithHealthcheckAndCmd = `FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM nginx:1.25-alpine
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

COPY --from=builder /app/build /usr/share/nginx/html
CMD`;

    const audit = auditDockerfile(dockerfileWithHealthcheckAndCmd);
    const cmdIssue = audit.issues.find((i) => i.ruleCode === 'SYNTAX-01' && i.title.includes('CMD'));
    expect(cmdIssue).toBeDefined();

    if (cmdIssue) {
      const fixed = applyQuickFix(dockerfileWithHealthcheckAndCmd, cmdIssue);
      // Ensure HEALTHCHECK CMD is pristine
      expect(fixed).toContain('CMD wget --no-verbose');
      // Ensure trailing CMD on last line was replaced
      expect(fixed).toContain('CMD ["node", "dist/index.js"]');
      // Ensure HEALTHCHECK wasn't duplicated or injected with extra CMD tokens
      expect((fixed.match(/CMD wget/g) || []).length).toBe(1);
    }
  });

  it('detects sudo usage and missing initial FROM', () => {
    const noFromDockerfile = `WORKDIR /app
RUN sudo apt-get update
CMD ["node", "index.js"]`;

    const audit = auditDockerfile(noFromDockerfile);
    expect(audit.syntaxValid).toBe(false);
    expect(audit.issues.some((i) => i.ruleCode === 'SYNTAX-03')).toBe(true);
    expect(audit.issues.some((i) => i.ruleCode === 'CK-08')).toBe(true);
  });
});

describe('Live Topology Graph Engine', () => {
  const nginxConf = `
events {
    worker_connections 1024;
}
http {
    server_tokens off;
    server {
        listen 443 ssl http2;
        server_name api.mycompany.com;
        ssl_protocols TLSv1.3;
        add_header Strict-Transport-Security "max-age=63072000" always;
        limit_req_zone $binary_remote_addr zone=ip_limit:10m rate=10r/s;
        location / {
            proxy_pass http://backend-app:8080;
        }
    }
}
`;

  it('builds full server blocks and location routing topology graph from Nginx configuration', () => {
    const graph = buildTopologyGraphFromNginx(nginxConf);

    expect(graph.targetDomain).toBe('api.mycompany.com');
    expect(graph.serverBlocks.length).toBe(1);

    const sb = graph.serverBlocks[0];
    expect(sb.listenPort).toBe('443');
    expect(sb.isSsl).toBe(true);
    expect(sb.http2).toBe(true);
    expect(sb.locations.length).toBe(1);
    expect(sb.locations[0].path).toBe('/');
    expect(sb.locations[0].actionType).toBe('proxy');
    expect(sb.locations[0].target).toBe('http://backend-app:8080');
  });

  it('correctly parses multi-server Looker configuration with custom ports and locations', () => {
    const multiServerConf = `
    server {
        listen 443;
        ssl on;
        server_name looker.domain.com;
        location / {
            proxy_pass https://looker.domain.com:9999;
            proxy_read_timeout 3600;
        }
    }
    server {
        listen 19999;
        ssl on;
        server_name looker.domain.com;
        location / {
            proxy_pass https://looker.domain.com:19999;
        }
    }
    `;

    const graph = buildTopologyGraphFromNginx(multiServerConf);
    expect(graph.serverBlocks.length).toBe(2);
    expect(graph.serverBlocks[0].listenPort).toBe('443');
    expect(graph.serverBlocks[0].locations[0].target).toBe('https://looker.domain.com:9999');
    expect(graph.serverBlocks[0].locations[0].timeout).toBe('3600');

    expect(graph.serverBlocks[1].listenPort).toBe('19999');
    expect(graph.serverBlocks[1].locations[0].target).toBe('https://looker.domain.com:19999');
  });

  it('handles empty or blank Nginx configuration without injecting fallback dummy servers', () => {
    const graph = buildTopologyGraphFromNginx('');
    expect(graph.serverBlocks.length).toBe(0);
    expect(graph.nodes.length).toBe(0);
    expect(graph.ingress.ports.length).toBe(0);
  });
});

describe('Dockerfile Multi-Stage Build & Layer Topology Engine', () => {
  const multiStageDockerfile = `
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
USER appuser
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
`;

  it('builds multi-stage Dockerfile 4-stage pipeline with Base OS, Cache, Multi-Stage, and Production Runtime', () => {
    const graph = buildDockerfileTopologyGraph(multiStageDockerfile);

    expect(graph.isMultiStage).toBe(true);
    expect(graph.totalStages).toBe(2);
    expect(graph.pipeline.length).toBe(4);

    // Stage 1: Base OS
    const baseStage = graph.pipeline.find((s) => s.stageType === 'base');
    expect(baseStage?.badge).toBe('PINNED OS');
    expect(baseStage?.status).toBe('active');

    // Stage 2: Cache & Compilation
    const buildStage = graph.pipeline.find((s) => s.stageType === 'build');
    expect(buildStage?.badge).toBe('LAYER CACHED');
    expect(buildStage?.status).toBe('active');

    // Stage 3: Artifact Transfer
    const artifactStage = graph.pipeline.find((s) => s.stageType === 'artifact');
    expect(artifactStage?.badge).toBe('SLIM MULTI-STAGE');
    expect(artifactStage?.status).toBe('active');

    // Stage 4: Production Runtime
    const runtimeStage = graph.pipeline.find((s) => s.stageType === 'runtime');
    expect(runtimeStage?.badge).toBe('NON-ROOT SECURED');
    expect(runtimeStage?.metrics.primaryValue).toBe('appuser');
    expect(runtimeStage?.status).toBe('active');
  });

  it('handles empty Dockerfile with clean fallback state', () => {
    const graph = buildDockerfileTopologyGraph('');
    expect(graph.totalStages).toBe(0);
    expect(graph.totalLayers).toBe(0);
    expect(graph.securityScore).toBe(0);
    expect(graph.pipeline.length).toBe(0);
  });
});

describe('Dockerfile In-Place Optimizer & Layer Shrinker', () => {
  const unoptimizedDockerfile = `
FROM node:latest
WORKDIR /app
ADD . .
RUN apt-get update
RUN apt-get install -y curl
RUN npm install
RUN npm run build
CMD ["node", "dist/index.js"]
`;

  it('optimizes base image, converts ADD to COPY, merges RUNs, and enforecs non-root user', () => {
    const result = optimizeDockerfile(unoptimizedDockerfile);

    expect(result.optimizedContent).toContain('FROM node:20-alpine');
    expect(result.optimizedContent).toContain('COPY . .');
    expect(result.optimizedContent).toContain('USER 10001');
    expect(result.optimizedContent).toContain('HEALTHCHECK');
    expect(result.optimizationsApplied.length).toBeGreaterThanOrEqual(4);
    expect(result.optimizedLayers).toBeLessThan(result.originalLayers);
  });

  it('does not double-tag already pinned base images and preserves multi-line RUN instructions', () => {
    const complexDockerfile = `FROM komljen/ruby-rails:20-alpine
LABEL maintainer=Alen Komljen <alen.komljen@live.com>
ENV APP_ROOT /data/app

RUN \\
  git clone https://github.com/railstutorial/sample_app_2nd_ed.git \${APP_ROOT} && \\
  cd \${APP_ROOT} && \\
  /bin/bash -c -l 'bundle install'

COPY start.sh start.sh
VOLUME ["$APP_ROOT"]
RUN rm /usr/sbin/policy-rc.d
CMD ["/start.sh"]
EXPOSE 3000

USER 1001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1`;

    const result = optimizeDockerfile(complexDockerfile);

    // Ensure base image was NOT double-tagged
    expect(result.optimizedContent).toContain('FROM komljen/ruby-rails:20-alpine');
    expect(result.optimizedContent).not.toContain('alpine:20-alpine');

    // Ensure multi-line RUN command is preserved
    expect(result.optimizedContent).toContain('git clone https://github.com/railstutorial');

    // Audit the optimized output to verify 100% valid syntax and 0 errors
    const audit = auditDockerfile(result.optimizedContent);
    expect(audit.syntaxValid).toBe(true);
    expect(audit.score).toBeGreaterThanOrEqual(95);
  });
});

