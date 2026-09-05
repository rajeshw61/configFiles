import { describe, it, expect } from 'vitest';
import { useSuiteStore } from '../store/useSuiteStore';
import { auditCustomNginx } from '../engines/nginx/parser';
import { parseNginxToToggles } from '../engines/nginx/mutator';

describe('Suite Store Unified File-Centric State Machine', () => {
  it('operates directly on active uploaded configuration file', () => {
    const store = useSuiteStore.getState();

    // 1. Upload a custom configuration
    const sampleCustomConf = `
server {
    listen 80;
    server_name custom-upload.com;
    server_tokens on;
}
`;
    store.uploadNginxFile(sampleCustomConf);
    expect(useSuiteStore.getState().activeNginxContent).toBe(sampleCustomConf);

    // 2. Toggle serverTokensOff on
    store.toggleNginxDirective('serverTokensOff', true);
    const updated = useSuiteStore.getState().activeNginxContent;
    expect(updated).toContain('server_tokens off;');

    const toggles = parseNginxToToggles(updated);
    expect(toggles.serverTokensOff).toBe(true);

    // 3. Toggle HSTS on
    store.toggleNginxDirective('hstsEnabled', true);
    const withHsts = useSuiteStore.getState().activeNginxContent;
    expect(withHsts).toContain('Strict-Transport-Security');

    // 4. Audit score directly reflects active file
    const audit = auditCustomNginx(withHsts);
    expect(audit.passedChecks).toContain('Server version tokens hidden (server_tokens off)');
    expect(audit.passedChecks).toContain('HSTS (Strict-Transport-Security) header active');
  });

  it('switches between top suite tool tabs correctly', () => {
    const store = useSuiteStore.getState();

    store.setActiveTool('dockerfile');
    expect(useSuiteStore.getState().activeTool).toBe('dockerfile');

    store.setActiveTool('csp');
    expect(useSuiteStore.getState().activeTool).toBe('csp');

    store.setActiveTool('topology');
    expect(useSuiteStore.getState().activeTool).toBe('topology');

    store.setActiveTool('nginx');
    expect(useSuiteStore.getState().activeTool).toBe('nginx');
  });

  it('applies Nginx presets directly to active file state', () => {
    const store = useSuiteStore.getState();
    store.resetNginxToDefault();

    // Apply SPA preset in template mode
    store.applyNginxPreset('spa-api-proxy');
    let content = useSuiteStore.getState().activeNginxContent;
    expect(content).toContain('proxy_pass http://127.0.0.1:4000;');

    // Reset and apply WebSocket preset
    store.resetNginxToDefault();
    store.applyNginxPreset('websocket-realtime');
    content = useSuiteStore.getState().activeNginxContent;
    expect(content).toContain('worker_connections 16384;');
    expect(content).toContain('proxy_read_timeout 3600s;');

    // Reset and apply Hardened preset
    store.resetNginxToDefault();
    store.applyNginxPreset('hardened-production');
    content = useSuiteStore.getState().activeNginxContent;
    expect(content).toContain('ssl_protocols TLSv1.3;');
    expect(content).toContain('limit_req_zone');
  });

  it('correctly tracks cleared empty buffers without resetting to default', () => {
    const store = useSuiteStore.getState();
    store.setActiveNginxContent('');
    expect(useSuiteStore.getState().activeNginxContent).toBe('');

    store.setDockerfileContent('');
    expect(useSuiteStore.getState().dockerfileContent).toBe('');
  });

  it('serializes and restores dockerfileContent to and from URL hash', () => {
    const store = useSuiteStore.getState();
    const customDockerfile = 'FROM node:22-alpine\nWORKDIR /srv\nUSER node\n';

    store.setActiveTool('dockerfile');
    store.setDockerfileContent(customDockerfile);

    const hash = store.serializeToUrlHash();
    expect(hash).toBeTruthy();

    // Reset local state to default
    store.resetDockerfile();
    expect(useSuiteStore.getState().dockerfileContent).not.toBe(customDockerfile);

    // Load from URL hash string
    const loaded = store.loadFromUrlHash(hash);
    expect(loaded).toBe(true);
    expect(useSuiteStore.getState().activeTool).toBe('dockerfile');
    expect(useSuiteStore.getState().dockerfileContent).toBe(customDockerfile);
  });
});

