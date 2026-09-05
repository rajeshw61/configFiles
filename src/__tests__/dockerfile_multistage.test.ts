import { describe, it, expect } from 'vitest';
import { parseInstructions, auditDockerfile } from '../engines/dockerfile/linter';
import { parseDockerStages, resolveCopyFromReference } from '../engines/dockerfile/stages';

describe('Multi-Stage Dockerfile Context Awareness (Step 2)', () => {
  // TEST 1: Basic 2-stage build with AS alias and local COPY --from reference
  it('TEST 1: detects 2 stages, builder as stage 1, nginx:alpine as final stage, and resolves local stage reference', () => {
    const dockerfile = `FROM node:22 AS builder
RUN npm install

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    expect(analysis.totalStages).toBe(2);
    expect(analysis.isMultiStage).toBe(true);

    // Stage 1
    const stage1 = analysis.stages[0];
    expect(stage1.stageNumber).toBe(1);
    expect(stage1.baseImage).toBe('node:22');
    expect(stage1.alias).toBe('builder');
    expect(stage1.isFinal).toBe(false);
    expect(stage1.instructions.some((i) => i.instruction === 'RUN')).toBe(true);

    // Stage 2 (Final)
    const stage2 = analysis.stages[1];
    expect(stage2.stageNumber).toBe(2);
    expect(stage2.baseImage).toBe('nginx:alpine');
    expect(stage2.alias).toBeUndefined();
    expect(stage2.isFinal).toBe(true);
    expect(analysis.finalStage).toBe(stage2);

    // Resolve COPY --from=builder in stage 2
    const resolution = resolveCopyFromReference('builder', 1, analysis.stageAliases, analysis.stages);
    expect(resolution.isValid).toBe(true);
    expect(resolution.isLocalStage).toBe(true);
    expect(resolution.localStage).toBe(stage1);
    expect(resolution.isExternalImage).toBe(false);

    // Full linter audit should have no SYNTAX-04 errors
    const audit = auditDockerfile(dockerfile);
    expect(audit.issues.some((i) => i.ruleCode === 'SYNTAX-04')).toBe(false);
  });

  // TEST 2: External image reference in COPY --from without local stage alias
  it('TEST 2: COPY --from=alpine is classified as external image reference without reporting undefined stage error', () => {
    const dockerfile = `FROM nginx:alpine
COPY --from=alpine /bin/sh /bin/sh`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    const resolution = resolveCopyFromReference('alpine', 0, analysis.stageAliases, analysis.stages);
    expect(resolution.isValid).toBe(true);
    expect(resolution.isExternalImage).toBe(true);
    expect(resolution.isLocalStage).toBe(false);

    // Linter audit should NOT flag SYNTAX-04 on alpine
    const audit = auditDockerfile(dockerfile);
    const stage4Issues = audit.issues.filter((i) => i.ruleCode === 'SYNTAX-04');
    expect(stage4Issues.length).toBe(0);
  });

  // TEST 3: Local stage reference resolution
  it('TEST 3: resolves local stage reference when FROM has AS builder', () => {
    const dockerfile = `FROM alpine AS builder
RUN echo test

FROM nginx:alpine
COPY --from=builder /x /x`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    const resolution = resolveCopyFromReference('builder', 1, analysis.stageAliases, analysis.stages);
    expect(resolution.isValid).toBe(true);
    expect(resolution.isLocalStage).toBe(true);
    expect(resolution.localStage?.baseImage).toBe('alpine');
  });

  // TEST 4: Numeric stage reference resolution (e.g., --from=0)
  it('TEST 4: resolves numeric stage index 0 to first stage', () => {
    const dockerfile = `FROM alpine
RUN echo base

FROM nginx:alpine
COPY --from=0 /bin/sh /bin/sh`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    const resolution = resolveCopyFromReference('0', 1, analysis.stageAliases, analysis.stages);
    expect(resolution.isValid).toBe(true);
    expect(resolution.isNumeric).toBe(true);
    expect(resolution.numericIndex).toBe(0);
    expect(resolution.localStage).toBe(analysis.stages[0]);

    // Out-of-bounds numeric reference in first stage
    const invalidRes = resolveCopyFromReference('0', 0, analysis.stageAliases, analysis.stages);
    expect(invalidRes.isValid).toBe(false);
    expect(invalidRes.errorMessage).toContain('out of bounds');
  });

  // TEST 5: Association of USER with final runtime stage
  it('TEST 5: stage model identifies final stage and associates USER instruction with that stage', () => {
    const dockerfile = `FROM node:22 AS builder
RUN echo build

FROM nginx:alpine
USER nginx`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    expect(analysis.finalStage?.baseImage).toBe('nginx:alpine');
    expect(analysis.finalStage?.hasUser).toBe(true);
    expect(analysis.finalStage?.finalUser).toBe('nginx');

    expect(analysis.stages[0].hasUser).toBe(false);
    expect(analysis.stages[0].finalUser).toBeUndefined();
  });

  // TEST 6: Independent USER instructions across distinct stages
  it('TEST 6: isolates USER instructions belonging to different stages', () => {
    const dockerfile = `FROM node:22 AS builder
USER node

FROM nginx:alpine
USER root`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    expect(analysis.stages[0].finalUser).toBe('node');
    expect(analysis.stages[1].finalUser).toBe('root');
    expect(analysis.finalStage?.finalUser).toBe('root');
  });

  // TEST 7: Multiple named stages with independent alias resolution
  it('TEST 7: resolves multiple named build stage aliases independently', () => {
    const dockerfile = `FROM alpine AS build-one
RUN echo one

FROM alpine AS build-two
RUN echo two

FROM nginx:alpine
COPY --from=build-one /one /one
COPY --from=build-two /two /two`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    expect(analysis.totalStages).toBe(3);

    const resOne = resolveCopyFromReference('build-one', 2, analysis.stageAliases, analysis.stages);
    expect(resOne.isValid).toBe(true);
    expect(resOne.localStage).toBe(analysis.stages[0]);

    const resTwo = resolveCopyFromReference('build-two', 2, analysis.stageAliases, analysis.stages);
    expect(resTwo.isValid).toBe(true);
    expect(resTwo.localStage).toBe(analysis.stages[1]);
  });

  // TEST 8: Multiple unnamed stages tracked in sequence
  it('TEST 8: tracks multiple stages in sequence even without AS aliases', () => {
    const dockerfile = `FROM alpine
RUN echo first

FROM alpine
RUN echo second`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    expect(analysis.totalStages).toBe(2);
    expect(analysis.stages[0].stageNumber).toBe(1);
    expect(analysis.stages[0].alias).toBeUndefined();
    expect(analysis.stages[1].stageNumber).toBe(2);
    expect(analysis.stages[1].alias).toBeUndefined();
    expect(analysis.finalStage).toBe(analysis.stages[1]);
  });

  // TEST 9: Instructions appearing before first FROM (e.g., global ARG)
  it('TEST 9: global instructions before first FROM are collected without corrupting stages', () => {
    const dockerfile = `# Global build configuration
ARG NODE_VERSION=22
ARG BASE_OS=alpine

FROM node:\${NODE_VERSION}-\${BASE_OS} AS builder
WORKDIR /app

FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    expect(analysis.globalInstructions.length).toBe(2);
    expect(analysis.globalInstructions[0].instruction).toBe('ARG');
    expect(analysis.globalInstructions[1].instruction).toBe('ARG');

    expect(analysis.totalStages).toBe(2);
    expect(analysis.stages[0].alias).toBe('builder');
    expect(analysis.stages[1].alias).toBe('runner');
  });

  // TEST 10: Comments and multiline instructions between stages preserve stage boundaries
  it('TEST 10: comments and multiline instructions between stages preserve stage boundaries', () => {
    const dockerfile = `# Stage 1: Build compilation
FROM golang:1.22-alpine AS builder

WORKDIR /src

RUN go build \\
    # optimize binary size
    -ldflags="-s -w" \\
    -o /bin/server .

# ==========================================
# Stage 2: Runtime Environment
# ==========================================
FROM alpine:3.19 AS runner

COPY --from=builder \\
    /bin/server \\
    /usr/local/bin/server

CMD ["/usr/local/bin/server"]`;

    const instructions = parseInstructions(dockerfile);
    const analysis = parseDockerStages(instructions);

    expect(analysis.totalStages).toBe(2);

    const stage1 = analysis.stages[0];
    expect(stage1.alias).toBe('builder');
    expect(stage1.instructions.map((i) => i.instruction)).toEqual(['FROM', 'WORKDIR', 'RUN']);

    const stage2 = analysis.stages[1];
    expect(stage2.alias).toBe('runner');
    expect(stage2.instructions.map((i) => i.instruction)).toEqual(['FROM', 'COPY', 'CMD']);
    expect(stage2.isFinal).toBe(true);
  });
});
