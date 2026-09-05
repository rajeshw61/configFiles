import React, { useState, useEffect, useMemo } from 'react';
import {
  Terminal,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  FileCode,
  Sparkles,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useSuiteStore } from '../../store/useSuiteStore';
import { auditDockerfile } from '../../engines/dockerfile/linter';
import { applyQuickFix } from '../../engines/dockerfile/quickFix';
import { optimizeDockerfile } from '../../engines/dockerfile/optimizer';
import { CodeViewport, FileTabItem } from '../common/CodeViewport';
import { ScoreDial } from '../common/ScoreDial';
import { AdSenseSlot } from '../common/AdSenseSlot';
import { LintIssue } from '../../types/dockerfile';

export const DockerfileLinter: React.FC = () => {
  const { dockerfileContent, setDockerfileContent, resetDockerfile } = useSuiteStore();
  const [baselineContent, setBaselineContent] = useState<string>(dockerfileContent);
  const [optimizationsApplied, setOptimizationsApplied] = useState<string[]>([]);
  const [estimatedSavings, setEstimatedSavings] = useState<string | null>(null);

  const isEmpty = !dockerfileContent.trim();

  // Performance Budget: Debounce AST parsing for large files (> 1,000 lines) by 150ms
  const isLargeFile = useMemo(() => {
    return dockerfileContent.length > 30000 || dockerfileContent.split('\n').length > 1000;
  }, [dockerfileContent]);

  const [debouncedContent, setDebouncedContent] = useState<string>(dockerfileContent);

  useEffect(() => {
    if (!isLargeFile) {
      setDebouncedContent(dockerfileContent);
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedContent(dockerfileContent);
    }, 150);
    return () => clearTimeout(timer);
  }, [dockerfileContent, isLargeFile]);

  const auditResult = useMemo(() => {
    return auditDockerfile(isLargeFile ? debouncedContent : dockerfileContent);
  }, [isLargeFile, debouncedContent, dockerfileContent]);

  const files: FileTabItem[] = [
    {
      id: 'dockerfile',
      name: 'Dockerfile',
      filename: 'Dockerfile',
      language: 'dockerfile',
      content: dockerfileContent,
      icon: '🐳',
      isEditable: true,
    },
  ];

  const handleFixIssue = (issue: LintIssue) => {
    setBaselineContent(dockerfileContent);
    const updated = applyQuickFix(dockerfileContent, issue);
    setDockerfileContent(updated);
  };

  const handleOptimizeDockerfile = () => {
    const result = optimizeDockerfile(dockerfileContent);
    setBaselineContent(dockerfileContent);
    setDockerfileContent(result.optimizedContent);
    setOptimizationsApplied(result.optimizationsApplied);
    setEstimatedSavings(result.estimatedSavings);
  };

  const handleRollback = () => {
    setDockerfileContent(baselineContent);
    setOptimizationsApplied([]);
    setEstimatedSavings(null);
  };

  const handleUpload = (content: string) => {
    setDockerfileContent(content);
    setBaselineContent(content);
    setOptimizationsApplied([]);
    setEstimatedSavings(null);
  };

  const handleClear = () => {
    setDockerfileContent('');
    setBaselineContent('');
    setOptimizationsApplied([]);
    setEstimatedSavings(null);
  };

  const handleResetSample = () => {
    resetDockerfile();
    setBaselineContent(useSuiteStore.getState().dockerfileContent);
    setOptimizationsApplied([]);
    setEstimatedSavings(null);
  };

  return (
    <div className="workbench-container">
      {/* Left Audit & Quick-Fix Pane */}
      <section className="controls-pane">
        {/* Top Control Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', padding: '0.75rem 0.85rem', background: '#0e1424', border: '1px solid #1e293b', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Terminal style={{ width: '16px', height: '16px', color: '#10b981' }} />
              <div>
                <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Dockerfile Security & Optimizer</h3>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>OWASP & CIS Hardening Engine</p>
              </div>
            </div>
          </div>

          {/* One-Click Auto-Optimize Button */}
          {!isEmpty && (
            auditResult.issues.length === 0 ? (
              <button
                disabled
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#34d399',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'default',
                  boxShadow: 'none',
                }}
                title="Dockerfile passes all security and optimization rules"
              >
                <CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981' }} />
                <span>Dockerfile Fully Optimized</span>
              </button>
            ) : !auditResult.syntaxValid ? (
              <button
                disabled
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  background: '#141d33',
                  border: '1px solid #1e293b',
                  color: '#64748b',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'not-allowed',
                }}
                title="Resolve syntax errors before running auto-optimizer"
              >
                <AlertTriangle style={{ width: '14px', height: '14px', color: '#f59e0b' }} />
                <span>Fix Syntax Errors to Optimize</span>
              </button>
            ) : (
              <button
                onClick={handleOptimizeDockerfile}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(6, 182, 212, 0.3)',
                  transition: 'all 0.2s ease',
                }}
              >
                <Sparkles style={{ width: '14px', height: '14px' }} />
                <span>Auto-Optimize & Shrink Dockerfile</span>
              </button>
            )
          )}

          {/* Reset / Rollback Bar */}
          <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid #1e293b', paddingTop: '0.5rem' }}>
            {optimizationsApplied.length > 0 && (
              <button
                onClick={handleRollback}
                style={{ flex: 1, padding: '4px 8px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#f59e0b', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              >
                <RotateCcw style={{ width: '11px', height: '11px' }} />
                <span>Rollback</span>
              </button>
            )}
            <button
              onClick={handleResetSample}
              style={{ flex: 1, padding: '4px 8px', background: '#141d33', border: '1px solid #1e293b', color: '#94a3b8', borderRadius: '5px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}
              title="Reset to default sample Dockerfile"
            >
              Reset Sample
            </button>
            <button
              onClick={handleClear}
              style={{ padding: '4px 8px', background: '#141d33', border: '1px solid #1e293b', color: '#f43f5e', borderRadius: '5px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}
              title="Clear editor"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Optimization Savings Telemetry Banner */}
        {optimizationsApplied.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(16, 185, 129, 0.15))', border: '1px solid rgba(6, 182, 212, 0.4)', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#22d3ee', textTransform: 'uppercase' }}>
                ✨ Dockerfile Optimized!
              </span>
              {estimatedSavings && (
                <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 800 }}>
                  Est. Savings: {estimatedSavings}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {optimizationsApplied.map((opt, oIdx) => (
                <div key={oIdx} style={{ fontSize: '11px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check style={{ width: '12px', height: '12px', color: '#10b981', flexShrink: 0 }} />
                  <span>{opt}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Severity Metrics Bar */}
        {!isEmpty && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', padding: '0.5rem', background: '#0e1424', border: '1px solid #1e293b', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b' }}>Critical</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#f43f5e' }}>{auditResult.criticalCount}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b' }}>Warning</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>{auditResult.warningCount}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b' }}>Optimization</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#06b6d4' }}>{auditResult.optimizationCount}</span>
            </div>
          </div>
        )}

        {/* Issues List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Security Lint Findings
            </div>
            <div style={{ fontSize: '11px', color: isEmpty ? '#64748b' : auditResult.issues.length === 0 ? '#10b981' : '#f43f5e', fontWeight: 700 }}>
              {isEmpty ? 'Idle' : `${auditResult.issues.length} ${auditResult.issues.length === 1 ? 'Issue' : 'Issues'}`}
            </div>
          </div>

          {/* Syntax Error Alert Banner */}
          {!isEmpty && !auditResult.syntaxValid && (
            <div style={{ padding: '0.65rem 0.75rem', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert style={{ width: '16px', height: '16px', color: '#f43f5e', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#f43f5e', textTransform: 'uppercase' }}>
                  Fatal Dockerfile Syntax Error
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '1px' }}>
                  The Dockerfile contains invalid instructions or missing arguments that will prevent Docker builds.
                </div>
              </div>
            </div>
          )}

          {isEmpty ? (
            <div style={{ padding: '1.5rem 1rem', background: '#0e1424', border: '1px dashed #1e293b', borderRadius: '8px', textAlign: 'center' }}>
              <FileCode style={{ width: '28px', height: '28px', color: '#64748b', margin: '0 auto 8px auto' }} />
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Dockerfile is Empty</h4>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', lineHeight: 1.4 }}>
                Upload an existing Dockerfile or click below to load a sample for automated security analysis.
              </p>
              <button
                onClick={handleResetSample}
                style={{ marginTop: '10px', padding: '5px 12px', background: '#141d33', border: '1px solid #1e293b', color: '#10b981', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
              >
                Load Sample Dockerfile
              </button>
            </div>
          ) : auditResult.issues.length === 0 ? (
            <div style={{ padding: '1.25rem', background: '#0e1424', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
              <CheckCircle2 style={{ width: '28px', height: '28px', color: '#10b981', margin: '0 auto 6px auto' }} />
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Zero Vulnerabilities Found!</h4>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                Your Dockerfile passes all non-root, cache hygiene, and CIS container benchmarks.
              </p>
            </div>
          ) : (
            auditResult.issues.map((issue) => {
              const isCritical = issue.severity === 'critical';
              const isWarning = issue.severity === 'warning';
              const isSyntaxError = issue.ruleCode.startsWith('SYNTAX-');
              const hasFix = !!issue.patch || !!issue.fixDescription;

              return (
                <div
                  key={issue.id}
                  style={{
                    padding: '0.65rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    background: isCritical ? 'rgba(244, 63, 94, 0.08)' : isWarning ? 'rgba(245, 158, 11, 0.08)' : '#0e1424',
                    borderColor: isCritical ? 'rgba(244, 63, 94, 0.3)' : isWarning ? 'rgba(245, 158, 11, 0.3)' : '#1e293b',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {isCritical ? (
                        <ShieldAlert style={{ width: '13px', height: '13px', color: '#f43f5e' }} />
                      ) : (
                        <AlertTriangle style={{ width: '13px', height: '13px', color: '#f59e0b' }} />
                      )}
                      <span style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        background: isCritical ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: isCritical ? '#fda4af' : '#fde68a',
                        border: `1px solid ${isCritical ? 'rgba(244, 63, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                        borderRadius: '3px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 700,
                      }}>
                        {issue.ruleCode}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>{issue.title}</span>
                      {isSyntaxError && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', background: 'rgba(244, 63, 94, 0.25)', color: '#fda4af', border: '1px solid rgba(244, 63, 94, 0.5)', borderRadius: '3px', fontWeight: 800 }}>
                          SYNTAX
                        </span>
                      )}
                      {issue.lineNumber && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '3px', fontWeight: 700 }}>
                          Line {issue.lineNumber}
                        </span>
                      )}
                    </div>

                    {hasFix && (
                      <button
                        onClick={() => handleFixIssue(issue)}
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
                          flexShrink: 0,
                        }}
                        title={issue.fixDescription || 'Apply automatic fix'}
                      >
                        <Wrench style={{ width: '10px', height: '10px' }} />
                        <span>Quick Fix</span>
                      </button>
                    )}
                  </div>

                  <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.35 }}>{issue.description}</p>
                </div>
              );
            })
          )}
        </div>

        {/* AdSense Slot 1 (Left Sidebar) */}
        <AdSenseSlot slot="sidebar" />
      </section>

      {/* Right Code Viewport & Security Score */}
      <section style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        <CodeViewport
          files={files}
          activeFileId="dockerfile"
          baselineContent={baselineContent}
          onSelectFile={() => {}}
          onContentChange={(newContent) => setDockerfileContent(newContent)}
          onUploadFile={handleUpload}
          onClearContent={handleClear}
          headerSlot={
            isEmpty ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0e1424', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                <span>No File Loaded</span>
              </div>
            ) : (
              <ScoreDial
                score={auditResult.score}
                grade={auditResult.grade}
                title={!auditResult.syntaxValid ? 'Syntax Error' : 'Image Health'}
                subtitle={`${auditResult.issues.length} ${auditResult.issues.length === 1 ? 'Issue' : 'Issues'} Detected`}
              />
            )
          }
        />

        {/* AdSense Slot 2 (Bottom Strip) */}
        <AdSenseSlot slot="editor-strip" />
      </section>
    </div>
  );
};
