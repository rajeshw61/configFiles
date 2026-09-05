import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Lock,
  Activity,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Wand2,
  FileCode,
} from 'lucide-react';
import { useSuiteStore, DEFAULT_NGINX_CONFIG } from '../../store/useSuiteStore';
import { auditCustomNginx } from '../../engines/nginx/parser';
import { parseNginxToToggles, resolveAutoFixDirective } from '../../engines/nginx/mutator';
import { NGINX_PRESETS } from '../../engines/nginx/presets';
import { CodeViewport, FileTabItem } from '../common/CodeViewport';
import { ScoreDial } from '../common/ScoreDial';
import { AdSenseSlot } from '../common/AdSenseSlot';

export const NginxStudio: React.FC = () => {
  const {
    activeNginxContent,
    setActiveNginxContent,
    uploadNginxFile,
    toggleNginxDirective,
    applyNginxPreset,
    resetNginxToDefault,
  } = useSuiteStore();

  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScannedTime, setLastScannedTime] = useState<string | null>(null);
  const [baselineNginxContent, setBaselineNginxContent] = useState<string>(activeNginxContent);

  // Performance Budget: Debounce AST parsing for large files (> 1,000 lines) by 150ms
  const isLargeFile = useMemo(() => {
    return activeNginxContent.length > 30000 || activeNginxContent.split('\n').length > 1000;
  }, [activeNginxContent]);

  const [debouncedContent, setDebouncedContent] = useState<string>(activeNginxContent);

  useEffect(() => {
    if (!isLargeFile) {
      setDebouncedContent(activeNginxContent);
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedContent(activeNginxContent);
    }, 150);
    return () => clearTimeout(timer);
  }, [activeNginxContent, isLargeFile]);

  const effectiveContent = isLargeFile ? debouncedContent : activeNginxContent;
  const parsedToggles = useMemo(() => parseNginxToToggles(effectiveContent), [effectiveContent]);
  const auditResult = useMemo(() => auditCustomNginx(effectiveContent), [effectiveContent]);

  const files: FileTabItem[] = [
    {
      id: 'nginx-conf',
      name: 'nginx.conf',
      filename: 'nginx.conf',
      language: 'nginx',
      content: activeNginxContent,
      icon: '⚙️',
      isEditable: true,
    },
  ];

  const handleSelectPreset = (id: string) => {
    if (activePresetId === id) {
      // Toggle off / restore to baseline
      setActivePresetId(null);
      setActiveNginxContent(baselineNginxContent);
      setLastScannedTime(new Date().toLocaleTimeString());
      return;
    }

    setActivePresetId(id);
    applyNginxPreset(id);
    setLastScannedTime(new Date().toLocaleTimeString());
  };

  const handleUpload = (content: string) => {
    setActivePresetId(null);
    uploadNginxFile(content);
    setBaselineNginxContent(content);
    setLastScannedTime(new Date().toLocaleTimeString());
  };

  const handleContentChange = (newContent: string) => {
    setActiveNginxContent(newContent);
  };

  const handleClearContent = () => {
    setActivePresetId(null);
    setActiveNginxContent('');
    setBaselineNginxContent('');
    setLastScannedTime(new Date().toLocaleTimeString());
  };

  const handleResetToDefault = () => {
    setActivePresetId(null);
    resetNginxToDefault();
    setBaselineNginxContent(DEFAULT_NGINX_CONFIG);
    setLastScannedTime(new Date().toLocaleTimeString());
  };

  const handleManualRescan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setLastScannedTime(new Date().toLocaleTimeString());
    }, 250);
  };

  // One-click Auto-Fix handler mapped strictly to matching security directives
  const handleAutoFix = (issueTitle: string) => {
    const directiveKey = resolveAutoFixDirective(issueTitle);
    if (directiveKey) {
      toggleNginxDirective(directiveKey, true);
    }
    setLastScannedTime(new Date().toLocaleTimeString());
  };

  return (
    <div className="workbench-container">
      {/* Left Configuration & Live Audit Pane */}
      <section className="controls-pane">
        {/* Studio Top Control Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', padding: '0.75rem 0.85rem', background: '#0e1424', border: '1px solid #1e293b', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileCode style={{ width: '15px', height: '15px', color: '#06b6d4' }} />
              <div>
                <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Active Nginx Configuration</h3>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                  {lastScannedTime ? `Audited at ${lastScannedTime}` : 'Live client-side AST inspection'}
                </p>
              </div>
            </div>
            <button
              onClick={handleManualRescan}
              disabled={isScanning}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 9px',
                background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(16,185,129,0.2))',
                border: '1px solid rgba(6,182,212,0.4)',
                color: '#22d3ee',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Re-scan code and recalculate security score"
            >
              <RefreshCw style={{ width: '12px', height: '12px', animation: isScanning ? 'spin 1s linear infinite' : 'none' }} />
              <span>{isScanning ? 'Scanning...' : 'Re-Scan'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid #1e293b', paddingTop: '0.5rem' }}>
            <button
              onClick={handleResetToDefault}
              style={{ flex: 1, padding: '4px 8px', background: '#141d33', border: '1px solid #1e293b', color: '#94a3b8', borderRadius: '5px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}
              title="Reset code to hardened production template"
            >
              Load sample Hardened Template
            </button>
            <button
              onClick={handleClearContent}
              disabled={auditResult.isEmpty}
              style={{
                padding: '4px 8px',
                background: '#141d33',
                border: '1px solid #1e293b',
                color: '#f43f5e',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: auditResult.isEmpty ? 'not-allowed' : 'pointer',
                opacity: auditResult.isEmpty ? 0.35 : 1,
              }}
              title={auditResult.isEmpty ? 'Editor is already empty' : 'Clear editor'}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Quick Presets Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Hardening Presets
          </div>
          <div className="preset-bar">
            {NGINX_PRESETS.map((preset) => {
              const isSelected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`preset-btn ${isSelected ? 'active' : ''}`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Security Audit Findings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Security Audit Findings
            </div>
            <div style={{ fontSize: '11px', color: auditResult.isEmpty ? '#64748b' : auditResult.issues.length === 0 ? '#10b981' : '#f43f5e', fontWeight: 700 }}>
              {auditResult.isEmpty ? 'Idle' : `${auditResult.issues.length} ${auditResult.issues.length === 1 ? 'Issue' : 'Issues'}`}
            </div>
          </div>

          {auditResult.isEmpty ? (
            <div style={{ padding: '1.5rem 1rem', background: '#0e1424', border: '1px dashed #1e293b', borderRadius: '8px', textAlign: 'center' }}>
              <FileCode style={{ width: '28px', height: '28px', color: '#64748b', margin: '0 auto 8px auto' }} />
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Editor is Empty</h4>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', lineHeight: 1.4 }}>
                Upload an Nginx file or choose a preset to begin live security analysis.
              </p>
              <button
                onClick={handleResetToDefault}
                style={{ marginTop: '10px', padding: '5px 12px', background: '#141d33', border: '1px solid #1e293b', color: '#06b6d4', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
              >
                Load sample Hardened Template
              </button>
            </div>
          ) : auditResult.issues.length === 0 ? (
            <div style={{ padding: '1.25rem', background: '#0e1424', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
              <CheckCircle2 style={{ width: '28px', height: '28px', color: '#10b981', margin: '0 auto 6px auto' }} />
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>100% Hardened & Secure!</h4>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                Your active configuration includes TLS 1.3, HSTS, Rate Limiting, and OWASP security headers.
              </p>
            </div>
          ) : (
            auditResult.issues.map((iss, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: '8px',
                  background: iss.severity === 'critical' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                  border: `1px solid ${iss.severity === 'critical' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {iss.severity === 'critical' ? (
                        <ShieldAlert style={{ width: '13px', height: '13px', color: '#f43f5e' }} />
                      ) : (
                        <AlertTriangle style={{ width: '13px', height: '13px', color: '#f59e0b' }} />
                      )}
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>{iss.title}</span>
                      {iss.lineNumber && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '3px', fontWeight: 700 }}>
                          Line {iss.lineNumber}
                        </span>
                      )}
                    </div>
                    {!iss.title.includes('Syntax') && resolveAutoFixDirective(iss.title) !== null && (
                      <button
                        onClick={() => handleAutoFix(iss.title)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '2px 7px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#34d399',
                          cursor: 'pointer',
                        }}
                        title="Automatically inject hardening directive into your code"
                      >
                        <Wand2 style={{ width: '10px', height: '10px' }} />
                        <span>Auto-Fix</span>
                      </button>
                    )}
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.35 }}>{iss.description}</p>
              </div>
            ))
          )}
        </div>

        {/* Passed Security Checks Section */}
        {auditResult.passedChecks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Passed Security Directives ({auditResult.passedChecks.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {auditResult.passedChecks.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 8px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#d1fae5',
                  }}
                >
                  <CheckCircle2 style={{ width: '12px', height: '12px', color: '#10b981', flexShrink: 0 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Direct AST Hardening Switches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Interactive Hardening Controls
          </div>

          {/* 1. Server & Protocol Card */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Globe style={{ width: '15px', height: '15px', color: '#06b6d4' }} />
                <span>Protocol & Server Headers</span>
              </div>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div>
                  <div className="form-label">Hide Server Tokens</div>
                  <div className="form-desc">Suppresses Nginx version in headers (server_tokens off)</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.serverTokensOff}
                    onChange={(e) => toggleNginxDirective('serverTokensOff', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="form-row">
                <div>
                  <div className="form-label">HTTP/2 Binary Protocol</div>
                  <div className="form-desc">Multiplexed request streams on port 443</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.http2}
                    onChange={(e) => toggleNginxDirective('http2', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>
          </div>

          {/* 2. SSL & TLS Security Profile */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Lock style={{ width: '15px', height: '15px', color: '#10b981' }} />
                <span>SSL / TLS Security</span>
              </div>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div>
                  <div className="form-label">Modern TLS 1.3 Profile</div>
                  <div className="form-desc">Disable legacy SSLv3/TLS 1.0/1.1 and enforce TLS 1.3</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.sslModern}
                    onChange={(e) => toggleNginxDirective('sslModern', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="form-row">
                <div>
                  <div className="form-label">HSTS (Strict-Transport-Security)</div>
                  <div className="form-desc">Force HTTPS with 2-year max-age and preload readiness</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.hstsEnabled}
                    onChange={(e) => toggleNginxDirective('hstsEnabled', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="form-row">
                <div>
                  <div className="form-label">OCSP Stapling</div>
                  <div className="form-desc">Accelerates TLS handshakes and preserves CA privacy</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.ocspStapling}
                    onChange={(e) => toggleNginxDirective('ocspStapling', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>
          </div>

          {/* 3. DDoS & Rate Limiting */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Activity style={{ width: '15px', height: '15px', color: '#f43f5e' }} />
                <span>DDoS & Rate Limiting Shield</span>
              </div>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div>
                  <div className="form-label">Per-IP Rate Limiting (limit_req)</div>
                  <div className="form-desc">Throttles abusive crawlers and brute-force spikes</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.rateLimitEnabled}
                    onChange={(e) => toggleNginxDirective('rateLimitEnabled', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>
          </div>

          {/* 4. OWASP Headers */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Shield style={{ width: '15px', height: '15px', color: '#f59e0b' }} />
                <span>OWASP Security Headers</span>
              </div>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div>
                  <div className="form-label">Clickjacking Protection</div>
                  <div className="form-desc">X-Frame-Options: DENY</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.xFrameOptions}
                    onChange={(e) => toggleNginxDirective('xFrameOptions', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="form-row">
                <div>
                  <div className="form-label">MIME Sniffing Protection</div>
                  <div className="form-desc">X-Content-Type-Options: nosniff</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.xContentTypeOptions}
                    onChange={(e) => toggleNginxDirective('xContentTypeOptions', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="form-row">
                <div>
                  <div className="form-label">Gzip Compression</div>
                  <div className="form-desc">gzip on for high throughput asset delivery</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={parsedToggles.gzipEnabled}
                    onChange={(e) => toggleNginxDirective('gzipEnabled', e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Google AdSense Slot 1 (Left Sidebar) */}
        <AdSenseSlot slot="sidebar" />
      </section>

      {/* Right Code Viewport & Security Score */}
      <section style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        <CodeViewport
          files={files}
          activeFileId="nginx-conf"
          baselineContent={baselineNginxContent}
          onSelectFile={() => {}}
          onContentChange={handleContentChange}
          onUploadFile={handleUpload}
          onClearContent={handleClearContent}
          headerSlot={
            auditResult.isEmpty ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0e1424', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                <span>No File Loaded</span>
              </div>
            ) : (
              <ScoreDial
                score={auditResult.score}
                grade={auditResult.grade}
                title="OWASP Score"
                subtitle={`${auditResult.passedChecks.length} Passed (${auditResult.issues.length} Issues)`}
              />
            )
          }
        />

        {/* AdSense Slot 2 (Editor Bottom Strip) */}
        <AdSenseSlot slot="editor-strip" />
      </section>
    </div>
  );
};
