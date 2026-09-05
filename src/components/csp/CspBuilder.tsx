import React, { useState } from 'react';
import { Lock, Plus, X } from 'lucide-react';
import { useSuiteStore } from '../../store/useSuiteStore';
import { generateCspString, formatCspOutput } from '../../engines/csp/generator';
import { CSP_PRESETS } from '../../engines/csp/presets';
import { CspExportFormat } from '../../types/csp';
import { CodeViewport, FileTabItem } from '../common/CodeViewport';
import { AdSenseSlot } from '../common/AdSenseSlot';

export const CspBuilder: React.FC = () => {
  const { cspDirectives, setCspDirectives, applyCspPreset, cspExportFormat, setCspExportFormat } = useSuiteStore();
  const [newSource, setNewSource] = useState<{ [key: string]: string }>({});

  const cspString = generateCspString(cspDirectives);

  const formats: { id: CspExportFormat; name: string; filename: string; language: string; icon: string }[] = [
    { id: 'nginx', name: 'nginx.conf', filename: 'csp-nginx.conf', language: 'nginx', icon: '⚙️' },
    { id: 'header', name: 'Raw HTTP Header', filename: 'csp-header.txt', language: 'http', icon: '🌐' },
    { id: 'meta', name: 'HTML <meta>', filename: 'csp-meta.html', language: 'html', icon: '📑' },
    { id: 'apache', name: '.htaccess (Apache)', filename: '.htaccess', language: 'apacheconf', icon: '🪶' },
    { id: 'cloudflare', name: 'Cloudflare Worker', filename: 'worker.js', language: 'javascript', icon: '⚡' },
  ];

  const files: FileTabItem[] = formats.map((f) => ({
    id: f.id,
    name: f.name,
    filename: f.filename,
    language: f.language,
    content: formatCspOutput(cspString, f.id),
    icon: f.icon,
  }));

  const handleAddSource = (directiveKey: keyof typeof cspDirectives) => {
    const val = (newSource[directiveKey as string] || '').trim();
    if (!val) return;

    const currentList = (cspDirectives[directiveKey] as string[]) || [];
    if (!currentList.includes(val)) {
      setCspDirectives({
        [directiveKey]: [...currentList, val],
      } as any);
    }
    setNewSource({ ...newSource, [directiveKey as string]: '' });
  };

  const handleRemoveSource = (directiveKey: keyof typeof cspDirectives, itemToRemove: string) => {
    const currentList = (cspDirectives[directiveKey] as string[]) || [];
    setCspDirectives({
      [directiveKey]: currentList.filter((item) => item !== itemToRemove),
    } as any);
  };

  const directiveList: { key: keyof typeof cspDirectives; label: string; desc: string }[] = [
    { key: 'defaultSrc', label: 'default-src', desc: 'Fallback policy for fetch directives' },
    { key: 'scriptSrc', label: 'script-src', desc: 'Valid sources for JavaScript execution' },
    { key: 'styleSrc', label: 'style-src', desc: 'Valid sources for CSS stylesheets' },
    { key: 'imgSrc', label: 'img-src', desc: 'Valid sources for images & favicons' },
    { key: 'connectSrc', label: 'connect-src', desc: 'Permitted fetch, XHR, and WebSocket origins' },
    { key: 'fontSrc', label: 'font-src', desc: 'Permitted web font sources (@font-face)' },
    { key: 'frameAncestors', label: 'frame-ancestors', desc: 'Permitted parents that may embed this page (Clickjacking)' },
    { key: 'objectSrc', label: 'object-src', desc: 'Valid sources for plugins (<object>, <embed>)' },
  ];

  return (
    <div className="workbench-container">
      {/* Left Directive Config Pane */}
      <section className="controls-pane">
        {/* Presets */}
        <div className="preset-bar">
          {CSP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyCspPreset(preset.id)}
              className="preset-btn"
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Boolean Flags */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Lock style={{ width: '16px', height: '16px', color: '#a855f7' }} />
              <span>General Enforcement Directives</span>
            </div>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div>
                <div className="form-label">upgrade-insecure-requests</div>
                <div className="form-desc">Instructs browsers to treat all HTTP URLs as HTTPS</div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={cspDirectives.upgradeInsecureRequests}
                  onChange={(e) => setCspDirectives({ upgradeInsecureRequests: e.target.checked })}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </div>

        {/* Directives List */}
        {directiveList.map((dir) => {
          const sources = (cspDirectives[dir.key] as string[]) || [];
          return (
            <div key={dir.key} className="card">
              <div className="card-header">
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#06b6d4', fontFamily: "'JetBrains Mono', monospace" }}>{dir.label}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{dir.desc}</div>
                </div>
              </div>
              <div className="card-body">
                {/* Active Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {sources.map((src) => (
                    <span
                      key={src}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: '#141d33', border: '1px solid #1e293b', color: '#f8fafc', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", borderRadius: '6px' }}
                    >
                      <span>{src}</span>
                      <button
                        onClick={() => handleRemoveSource(dir.key, src)}
                        style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <X style={{ width: '12px', height: '12px' }} />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '4px' }}>
                  <input
                    type="text"
                    className="cyber-input"
                    style={{ fontSize: '12px' }}
                    placeholder="e.g. https://api.stripe.com"
                    value={newSource[dir.key as string] || ''}
                    onChange={(e) => setNewSource({ ...newSource, [dir.key as string]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSource(dir.key);
                    }}
                  />
                  <button
                    onClick={() => handleAddSource(dir.key)}
                    style={{ padding: '8px', background: '#141d33', border: '1px solid #1e293b', color: '#06b6d4', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* AdSense Slot 1 (Left) */}
        <AdSenseSlot slot="sidebar" />
      </section>

      {/* Right Multi-Format Exporter */}
      <section style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        <CodeViewport
          files={files}
          activeFileId={cspExportFormat}
          onSelectFile={(id) => setCspExportFormat(id as CspExportFormat)}
        />

        {/* AdSense Slot 2 */}
        <AdSenseSlot slot="editor-strip" />
      </section>
    </div>
  );
};
