import { describe, it, expect } from 'vitest';
import { auditDockerfile } from '../engines/dockerfile/linter';
import { parseInstructions } from '../engines/dockerfile/linter';
import { parseDockerStages, evaluateStageUser } from '../engines/dockerfile/stages';

describe('Dockerfile USER / Root Security Analysis (Step 3)', () => {
  // Case 1: No USER instruction -> treated as default root
  it('Case 1: flags missing USER directive in single-stage build as CK-01', () => {
    const dockerfile = `FROM node:22\nCMD ["node", "app.js"]`;
    const audit = auditDockerfile(dockerfile);

    const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(userIssue).toBeDefined();
    expect(userIssue?.title).toBe('Missing Non-Root USER Directive');
    expect(userIssue?.severity).toBe('critical');
  });

  // Case 2: Explicit root -> flagged as explicit root
  it('Case 2: flags explicit USER root as CK-01 critical vulnerability', () => {
    const dockerfile = `FROM node:22\nUSER root\nCMD ["node", "app.js"]`;
    const audit = auditDockerfile(dockerfile);

    const rootIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(rootIssue).toBeDefined();
    expect(rootIssue?.title).toBe('Container Explicitly Configured as Root');
    expect(rootIssue?.severity).toBe('critical');
    expect(rootIssue?.lineNumber).toBe(2);
  });

  // Case 3: Explicit non-root -> recognized as secure
  it('Case 3: recognizes named non-root user (USER node) with zero CK-01 findings', () => {
    const dockerfile = `FROM node:22\nUSER node\nCMD ["node", "app.js"]`;
    const audit = auditDockerfile(dockerfile);

    const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(userIssue).toBeUndefined();
  });

  // Case 4: Numeric UID -> recognized as secure
  it('Case 4: recognizes numeric non-root UID (USER 1000) as secure', () => {
    const dockerfile = `FROM node:22\nUSER 1000\nCMD ["node", "app.js"]`;
    const audit = auditDockerfile(dockerfile);

    const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(userIssue).toBeUndefined();
  });

  // Case 5: UID:GID pair -> recognized as secure
  it('Case 5: recognizes numeric UID:GID pair (USER 1000:1000) as secure', () => {
    const dockerfile = `FROM node:22\nUSER 1000:1000\nCMD ["node", "app.js"]`;
    const audit = auditDockerfile(dockerfile);

    const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(userIssue).toBeUndefined();
  });

  // Case 6: Multi-stage builder root + final non-root -> recognized as secure
  it('Case 6: builder stage with USER root does not taint final runtime stage running as USER nginx', () => {
    const dockerfile = `FROM node:22 AS builder
USER root
RUN npm run build

FROM nginx:alpine
USER nginx
COPY --from=builder /app/dist /usr/share/nginx/html`;

    const audit = auditDockerfile(dockerfile);

    const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(userIssue).toBeUndefined();
  });

  // Case 7: Multi-stage builder root + final stage missing USER -> flagged
  it('Case 7: final stage missing USER is flagged even if builder stage defined a USER', () => {
    const dockerfile = `FROM node:22 AS builder
USER root
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html`;

    const audit = auditDockerfile(dockerfile);

    const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(userIssue).toBeDefined();
    expect(userIssue?.title).toBe('Missing Non-Root USER Directive');
  });

  // Case 8: USER inheritance within a stage -> last USER directive determines effective identity
  it('Case 8: last USER root in stage overrides earlier USER node', () => {
    const dockerfile = `FROM node:22
USER node
RUN echo setup
USER root
CMD ["node", "app.js"]`;

    const audit = auditDockerfile(dockerfile);

    const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(userIssue).toBeDefined();
    expect(userIssue?.title).toBe('Container Explicitly Configured as Root');
    expect(userIssue?.lineNumber).toBe(4);
  });

  // Case 9: USER node before subsequent instructions remains effective
  it('Case 9: USER node followed by RUN instructions remains effective non-root', () => {
    const dockerfile = `FROM node:22
USER node
RUN echo "running as node"`;

    const audit = auditDockerfile(dockerfile);

    const userIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(userIssue).toBeUndefined();
  });

  // Case 10: USER using ARG / ENV variable resolution
  it('Case 10: resolves ARG and ENV variables in USER directive', () => {
    const nonRootArgDockerfile = `ARG APP_USER=appuser
FROM node:22
USER \${APP_USER}
CMD ["node", "app.js"]`;

    const auditNonRoot = auditDockerfile(nonRootArgDockerfile);
    expect(auditNonRoot.issues.some((i) => i.ruleCode === 'CK-01')).toBe(false);

    const rootArgDockerfile = `ARG APP_USER=root
FROM node:22
USER \${APP_USER}
CMD ["node", "app.js"]`;

    const auditRoot = auditDockerfile(rootArgDockerfile);
    const rootIssue = auditRoot.issues.find((i) => i.ruleCode === 'CK-01');
    expect(rootIssue).toBeDefined();
    expect(rootIssue?.title).toBe('Container Explicitly Configured as Root');

    // Dynamic unresolved variable
    const dynamicDockerfile = `FROM node:22\nUSER \${UNRESOLVED_USER}`;
    const instructions = parseInstructions(dynamicDockerfile);
    const stages = parseDockerStages(instructions);
    const userAnalysis = evaluateStageUser(stages.finalStage!, stages.globalInstructions);
    expect(userAnalysis.isDynamic).toBe(true);
    expect(userAnalysis.isRoot).toBe(false);
    expect(userAnalysis.isNonRoot).toBe(false);
  });

  // Additional Test: Case insensitivity of USER keyword and value
  it('handles lowercase/mixed-case user and values (e.g. user ROOT, User 0)', () => {
    const lowerDockerfile = `FROM node:22\nuser ROOT\nCMD ["node", "app.js"]`;
    const auditLower = auditDockerfile(lowerDockerfile);
    expect(auditLower.issues.some((i) => i.ruleCode === 'CK-01' && i.title.includes('Configured as Root'))).toBe(true);

    const mixedDockerfile = `FROM node:22\nUser node\nCMD ["node", "app.js"]`;
    const auditMixed = auditDockerfile(mixedDockerfile);
    expect(auditMixed.issues.some((i) => i.ruleCode === 'CK-01')).toBe(false);
  });

  // Additional Test: Comments containing USER root do not affect security status
  it('ignores comments containing # USER root', () => {
    const dockerfile = `FROM node:22
# USER root
USER node
CMD ["node", "app.js"]`;

    const audit = auditDockerfile(dockerfile);
    expect(audit.issues.some((i) => i.ruleCode === 'CK-01')).toBe(false);
  });

  // Additional Test: Numeric 0 and 0:0 are flagged as root
  it('flags USER 0 and USER 0:0 as root execution', () => {
    const dockerfileZero = `FROM node:22\nUSER 0\nCMD ["node", "app.js"]`;
    const auditZero = auditDockerfile(dockerfileZero);
    expect(auditZero.issues.some((i) => i.ruleCode === 'CK-01' && i.title.includes('Configured as Root'))).toBe(true);

    const dockerfilePair = `FROM node:22\nUSER 0:0\nCMD ["node", "app.js"]`;
    const auditPair = auditDockerfile(dockerfilePair);
    expect(auditPair.issues.some((i) => i.ruleCode === 'CK-01' && i.title.includes('Configured as Root'))).toBe(true);

    const dockerfileRootColonZero = `FROM node:22\nUSER root:0\nCMD ["node", "app.js"]`;
    const auditRootZero = auditDockerfile(dockerfileRootColonZero);
    expect(auditRootZero.issues.some((i) => i.ruleCode === 'CK-01' && i.title.includes('Configured as Root'))).toBe(true);
  });

  // Additional Test: Whitespace variations in USER argument
  it('handles whitespace variations in USER arguments cleanly', () => {
    const dockerfile = `FROM node:22\nUSER    appuser  :  appgroup \nCMD ["node", "app.js"]`;
    const audit = auditDockerfile(dockerfile);
    expect(audit.issues.some((i) => i.ruleCode === 'CK-01')).toBe(false);
  });

  // Additional Test: Multi-stage with builder non-root and runner root
  it('flags final stage running as root even if builder stage ran as non-root', () => {
    const dockerfile = `FROM node:22 AS builder
USER node
RUN npm run build

FROM nginx:alpine
USER root
COPY --from=builder /app/dist /usr/share/nginx/html`;

    const audit = auditDockerfile(dockerfile);
    const rootIssue = audit.issues.find((i) => i.ruleCode === 'CK-01');
    expect(rootIssue).toBeDefined();
    expect(rootIssue?.title).toBe('Container Explicitly Configured as Root');
  });
});
