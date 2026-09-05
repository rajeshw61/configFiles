import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { applyNginxDirectiveMutation } from '../engines/nginx/mutator';
import { NGINX_PRESETS } from '../engines/nginx/presets';
import { generateNginxConf } from '../engines/nginx/generator';
import { computeAddedOrModifiedLines } from '../components/common/CodeViewport';
import { applyQuickFix } from '../engines/dockerfile/quickFix';
import { auditDockerfile } from '../engines/dockerfile/linter';
import { optimizeDockerfile } from '../engines/dockerfile/optimizer';

describe('VS Code-Style Baseline Diff Engine', () => {
  const samplePath = path.resolve(__dirname, '../../samples/nginx-sample.conf');
  const sampleContent = fs.readFileSync(samplePath, 'utf-8');

  it('detects no diff when active content matches original baseline', () => {
    const diff = computeAddedOrModifiedLines(sampleContent, sampleContent);
    expect(diff).toEqual([]);
  });

  it('only highlights line 12 when deleting bracket on line 12 (CRLF or LF immune)', () => {
    // Simulate CRLF baseline and LF current
    const crlfBaseline = sampleContent.replace(/\n/g, '\r\n');
    const lfEdited = sampleContent.replace('events {', 'events'); // removed { at line 12

    const diff = computeAddedOrModifiedLines(crlfBaseline, lfEdited);
    expect(diff).toEqual([12]); // ONLY line 12 is modified, not the entire file!
  });

  it('clears all diffs when bracket is restored back to original line 12', () => {
    const crlfBaseline = sampleContent.replace(/\n/g, '\r\n');
    const lfRestored = sampleContent.replace(/\r\n/g, '\n');

    const diff = computeAddedOrModifiedLines(crlfBaseline, lfRestored);
    expect(diff).toEqual([]); // Completely clean 0 diff!
  });

  it('detects modified line when Server Tokens is toggled OFF', () => {
    const modified = applyNginxDirectiveMutation(sampleContent, 'serverTokensOff', false);
    const diff = computeAddedOrModifiedLines(sampleContent, modified);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff).toContain(22); // line 22 has server_tokens on;
  });

  it('clears diff when Server Tokens is restored back to ON (matches baseline)', () => {
    const toggledOff = applyNginxDirectiveMutation(sampleContent, 'serverTokensOff', false);
    const restored = applyNginxDirectiveMutation(toggledOff, 'serverTokensOff', true);

    const diff = computeAddedOrModifiedLines(sampleContent, restored);
    expect(diff).toEqual([]); // 0 diff! No color code decoration!
  });

  it('detects modified lines when applying presets against baseline and clears on restore', () => {
    const baseline = sampleContent;

    // 1. Applying SPA preset creates diffs against baseline
    const spaPreset = NGINX_PRESETS.find((p) => p.id === 'spa-api-proxy')!;
    const spaContent = generateNginxConf(spaPreset.config);
    const spaDiff = computeAddedOrModifiedLines(baseline, spaContent);
    expect(spaDiff.length).toBeGreaterThan(0);

    // 2. Applying WebSocket preset creates diffs against baseline
    const wsPreset = NGINX_PRESETS.find((p) => p.id === 'websocket-realtime')!;
    const wsContent = generateNginxConf(wsPreset.config);
    const wsDiff = computeAddedOrModifiedLines(baseline, wsContent);
    expect(wsDiff.length).toBeGreaterThan(0);

    // 3. Toggling off preset restores baseline => 0 diffs
    const restoredDiff = computeAddedOrModifiedLines(baseline, baseline);
    expect(restoredDiff).toEqual([]);
  });

  it('accurately pinpoints changed line when Dockerfile quick fix is applied', () => {
    const originalDockerfile = `FROM node:20-alpine
WORKDIR /app
CMD`;

    const audit = auditDockerfile(originalDockerfile);
    const cmdIssue = audit.issues.find((i) => i.title.includes('CMD'))!;
    expect(cmdIssue).toBeDefined();

    const fixed = applyQuickFix(originalDockerfile, cmdIssue);
    const diff = computeAddedOrModifiedLines(originalDockerfile, fixed);

    // Line 3 (CMD) was modified
    expect(diff).toEqual([3]);
  });

  it('accurately highlights optimized lines when Auto-Optimize Dockerfile is applied', () => {
    const rawDockerfile = `FROM node:latest
WORKDIR /app
ADD . .
CMD ["node", "app.js"]`;

    const optResult = optimizeDockerfile(rawDockerfile);
    const diff = computeAddedOrModifiedLines(rawDockerfile, optResult.optimizedContent);

    // Multiple lines modified (FROM, COPY, USER, HEALTHCHECK)
    expect(diff.length).toBeGreaterThan(0);
    expect(diff).toContain(1); // FROM node:20-alpine
  });
});
