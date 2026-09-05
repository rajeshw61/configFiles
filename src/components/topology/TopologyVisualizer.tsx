import React, { useState } from 'react';
import {
  Lock,
  Activity,
  CheckCircle2,
  Route,
  Folder,
  CornerDownRight,
  Globe,
  Ban,
  Repeat,
  Zap,
  Terminal,
  FileCode,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useSuiteStore } from '../../store/useSuiteStore';
import { buildTopologyGraphFromNginx } from '../../engines/topology/graph';
import { buildDockerfileTopologyGraph } from '../../engines/topology/dockerfileGraph';
import { parseNginxToToggles } from '../../engines/nginx/mutator';
import { AdSenseSlot } from '../common/AdSenseSlot';
import { TopologyViewMode } from '../../types/topology';

export const TopologyVisualizer: React.FC = () => {
  const {
    activeNginxContent,
    toggleNginxDirective,
    resetNginxToDefault,
    dockerfileContent,
    resetDockerfile,
    setActiveTool,
  } = useSuiteStore();

  const [viewMode, setViewMode] = useState<TopologyViewMode>('nginx');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedDockerStageId, setSelectedDockerStageId] = useState<string | null>(null);

  // Nginx State
  const isNginxEmpty = !activeNginxContent.trim();
  const toggles = parseNginxToToggles(activeNginxContent);
  const nginxGraph = buildTopologyGraphFromNginx(activeNginxContent);
  const hasServerBlocks = nginxGraph.serverBlocks.length > 0;

  const activeServer =
    nginxGraph.serverBlocks.find((s) => s.id === selectedServerId) || nginxGraph.serverBlocks[0];

  const activeLocation =
    nginxGraph.serverBlocks
      .flatMap((s) => s.locations)
      .find((l) => l.id === selectedLocationId) || activeServer?.locations[0];

  const totalNginxLocations = nginxGraph.serverBlocks.reduce((acc, sb) => acc + sb.locations.length, 0);

  // Dockerfile State
  const isDockerEmpty = !dockerfileContent.trim();
  const dockerGraph = buildDockerfileTopologyGraph(dockerfileContent);
  const hasDockerStages = dockerGraph.pipeline.length > 0;
  const activeDockerStage =
    dockerGraph.pipeline.find((s) => s.id === selectedDockerStageId) || dockerGraph.pipeline[0];

  return (
    <div className="workbench-container">
      {/* Left Quick Configuration Controls */}
      <section className="controls-pane">
        {/* View Mode Segmented Control */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
            Topology Mode
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: '#070a13', padding: '4px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <button
              onClick={() => setViewMode('nginx')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px 8px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'nginx' ? 'linear-gradient(135deg, #06b6d4, #0284c7)' : 'transparent',
                color: viewMode === 'nginx' ? '#fff' : '#94a3b8',
                fontWeight: 700,
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Route style={{ width: '13px', height: '13px' }} />
              <span>Nginx Routing</span>
            </button>

            <button
              onClick={() => setViewMode('dockerfile')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px 8px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'dockerfile' ? 'linear-gradient(135deg, #10b981, #059669)' : 'transparent',
                color: viewMode === 'dockerfile' ? '#fff' : '#94a3b8',
                fontWeight: 700,
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Terminal style={{ width: '13px', height: '13px' }} />
              <span>Docker Layers</span>
            </button>
          </div>
        </div>

        {viewMode === 'nginx' ? (
          <>
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Route style={{ width: '16px', height: '16px', color: '#06b6d4' }} />
                <span>Nginx Routing Architecture</span>
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Live structural inspection of server blocks, location directives, and upstream proxies.
              </p>
            </div>

            {/* Architecture Summary Card */}
            <div style={{ background: '#0e1424', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Active Config Overview
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div style={{ background: '#0b1120', padding: '6px 8px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Virtual Hosts</div>
                  <div style={{ fontSize: '13px', color: isNginxEmpty ? '#64748b' : '#38bdf8', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isNginxEmpty ? '0 Servers' : `${nginxGraph.serverBlocks.length} ${nginxGraph.serverBlocks.length === 1 ? 'Server' : 'Servers'}`}
                  </div>
                </div>
                <div style={{ background: '#0b1120', padding: '6px 8px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Routing Paths</div>
                  <div style={{ fontSize: '13px', color: isNginxEmpty ? '#64748b' : '#10b981', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isNginxEmpty ? '0 Locations' : `${totalNginxLocations} Locations`}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#cbd5e1', fontFamily: "'JetBrains Mono', monospace", borderTop: '1px solid #1e293b', paddingTop: '6px' }}>
                Listening:{' '}
                <span style={{ color: isNginxEmpty ? '#64748b' : '#22d3ee' }}>
                  {isNginxEmpty || nginxGraph.ingress.ports.length === 0 ? 'None' : nginxGraph.ingress.ports.join(', ')}
                </span>{' '}
                {!isNginxEmpty && `(${nginxGraph.ingress.protocol})`}
              </div>
            </div>

            {/* Server & Protocol Controls */}
            <div className="card" style={{ opacity: isNginxEmpty ? 0.6 : 1 }}>
              <div className="card-header">
                <div className="card-title">
                  <Lock style={{ width: '15px', height: '15px', color: '#06b6d4' }} />
                  <span>SSL & Protocol Tuning</span>
                </div>
              </div>
              <div className="card-body">
                <div className="form-row">
                  <div>
                    <div className="form-label">HTTP/2 Protocol</div>
                    <div className="form-desc">Binary multiplexing on Port 443</div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      disabled={isNginxEmpty}
                      checked={toggles.http2}
                      onChange={(e) => toggleNginxDirective('http2', e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="form-row">
                  <div>
                    <div className="form-label">Modern TLS 1.3 Profile</div>
                    <div className="form-desc">Disable legacy TLS 1.0/1.1 across servers</div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      disabled={isNginxEmpty}
                      checked={toggles.sslModern}
                      onChange={(e) => toggleNginxDirective('sslModern', e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            </div>

            {/* Rate Limiting & Defense */}
            <div className="card" style={{ opacity: isNginxEmpty ? 0.6 : 1 }}>
              <div className="card-header">
                <div className="card-title">
                  <Activity style={{ width: '15px', height: '15px', color: '#10b981' }} />
                  <span>Location Rate Limiting</span>
                </div>
              </div>
              <div className="card-body">
                <div className="form-row">
                  <div>
                    <div className="form-label">Rate Limiting ($binary_remote_addr)</div>
                    <div className="form-desc">Throttle burst requests in location blocks</div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      disabled={isNginxEmpty}
                      checked={toggles.rateLimitEnabled}
                      onChange={(e) => toggleNginxDirective('rateLimitEnabled', e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal style={{ width: '16px', height: '16px', color: '#10b981' }} />
                <span>Docker Build Pipeline Topology</span>
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Visual dependency graph of base images, cache boundaries, multi-stage artifacts, and runtime user isolation.
              </p>
            </div>

            {/* Docker Architecture Summary Card */}
            <div style={{ background: '#0e1424', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Build Graph Overview
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div style={{ background: '#0b1120', padding: '6px 8px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Build Stages</div>
                  <div style={{ fontSize: '13px', color: isDockerEmpty ? '#64748b' : '#34d399', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isDockerEmpty ? '0 Stages' : `${dockerGraph.totalStages} Stages`}
                  </div>
                </div>
                <div style={{ background: '#0b1120', padding: '6px 8px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Active Layers</div>
                  <div style={{ fontSize: '13px', color: isDockerEmpty ? '#64748b' : '#38bdf8', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isDockerEmpty ? '0 Layers' : `${dockerGraph.totalLayers} Layers`}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#cbd5e1', fontFamily: "'JetBrains Mono', monospace", borderTop: '1px solid #1e293b', paddingTop: '6px' }}>
                Multi-Stage:{' '}
                <span style={{ color: dockerGraph.isMultiStage ? '#10b981' : '#94a3b8', fontWeight: 700 }}>
                  {isDockerEmpty ? 'None' : dockerGraph.isMultiStage ? 'Enabled (Optimized)' : 'Single Stage'}
                </span>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div style={{ background: '#0e1424', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Container Actions
              </div>
              <button
                onClick={() => setActiveTool('dockerfile')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  background: '#141d33',
                  border: '1px solid #1e293b',
                  color: '#34d399',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Terminal style={{ width: '13px', height: '13px' }} />
                <span>Open Dockerfile Linter</span>
              </button>
            </div>
          </>
        )}

        {/* Google AdSense Slot 1 (Left Sidebar) */}
        <AdSenseSlot slot="sidebar" />
      </section>

      {/* Right Pipeline Architecture View */}
      <section className="topology-canvas-container">
        {viewMode === 'nginx' ? (
          <>
            {/* Top Header & Routing Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>Visual Nginx Routing & Server Blocks Topology</h1>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: isNginxEmpty ? 'rgba(100, 116, 139, 0.2)' : 'rgba(6, 182, 212, 0.2)', color: isNginxEmpty ? '#94a3b8' : '#22d3ee', fontWeight: 700, border: `1px solid ${isNginxEmpty ? '#334155' : 'rgba(6, 182, 212, 0.4)'}` }}>
                    {isNginxEmpty ? 'EMPTY CONFIG' : `${totalNginxLocations} ACTIVE ROUTES`}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                  Real-time routing map showing how traffic moves from Ingress → Server Blocks → Location Paths → Upstream Backends.
                </p>
              </div>

              {!isNginxEmpty && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Stream Legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#94a3b8', background: '#0b1120', padding: '6px 12px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#06b6d4', boxShadow: '0 0 6px #06b6d4' }} />
                      <span>Active Routing</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                      <span>SSL / HTTP/2</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                      <span>Redirect</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e' }} />
                      <span>Deny / Error</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', color: '#22d3ee', fontWeight: 600 }}>
                    <Zap style={{ width: '14px', height: '14px', color: '#22d3ee' }} />
                    <span>Real-Time AST Sync</span>
                  </div>
                </div>
              )}
            </div>

            {/* Empty State when Nginx Config is empty */}
            {isNginxEmpty || !hasServerBlocks ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '3.5rem 1.5rem',
                  background: 'rgba(11, 17, 32, 0.6)',
                  border: '1.5px dashed #1e293b',
                  borderRadius: '12px',
                  margin: '1.5rem 0',
                  textAlign: 'center',
                  gap: '1rem',
                }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileCode style={{ width: '28px', height: '28px', color: '#06b6d4' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>No Active Nginx Configuration</h3>
                  <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '480px', marginTop: '6px', lineHeight: 1.5 }}>
                    Your Nginx configuration is currently empty. Upload an existing <code style={{ color: '#22d3ee' }}>nginx.conf</code>, paste server blocks, or load a sample production template to visualize virtual hosts and routing conduits.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
                  <button
                    onClick={resetNginxToDefault}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #06b6d4, #0284c7)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(6, 182, 212, 0.25)',
                    }}
                  >
                    <Sparkles style={{ width: '14px', height: '14px' }} />
                    <span>Load Sample Nginx Config</span>
                  </button>
                  <button
                    onClick={() => setActiveTool('nginx')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      background: '#141d33',
                      color: '#cbd5e1',
                      border: '1px solid #1e293b',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Open Nginx Studio</span>
                    <ArrowRight style={{ width: '13px', height: '13px' }} />
                  </button>
                </div>
              </div>
            ) : (
              /* Global Virtual Hosts & Ingress Pipeline */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 0' }}>
                {nginxGraph.serverBlocks.map((server, sIdx) => {
                  const isServerSelected = selectedServerId === server.id || (!selectedServerId && sIdx === 0);

                  return (
                    <div
                      key={server.id}
                      style={{
                        background: 'rgba(11, 17, 32, 0.9)',
                        backdropFilter: 'blur(12px)',
                        border: isServerSelected ? '1.5px solid #06b6d4' : '1px solid #1e293b',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        boxShadow: isServerSelected ? '0 0 25px rgba(6, 182, 212, 0.2)' : '0 4px 20px rgba(0,0,0,0.3)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {/* Virtual Host Server Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ padding: '6px', background: 'rgba(6, 182, 212, 0.15)', borderRadius: '8px', border: '1px solid rgba(6, 182, 212, 0.4)' }}>
                            <Globe style={{ width: '16px', height: '16px', color: '#22d3ee' }} />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
                                server {`{`} server_name {server.serverName}; {`}`}
                              </span>
                              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(30, 41, 59, 0.8)', color: '#94a3b8', fontWeight: 600 }}>
                                Host #{sIdx + 1}
                              </span>
                            </div>
                            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
                              listen {server.listenPort} {server.isSsl ? 'ssl' : ''} {server.http2 ? 'http2' : ''};
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {server.isSsl && (
                            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <Lock style={{ width: '10px', height: '10px' }} /> SSL Active
                            </span>
                          )}
                          {server.http2 && (
                            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                              HTTP/2
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: '#06b6d4', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                            {server.locations.length} {server.locations.length === 1 ? 'Route' : 'Routes'}
                          </span>
                        </div>
                      </div>

                      {/* Routing Locations Flow Pipeline */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        {server.locations.map((loc) => {
                          const isLocSelected = selectedLocationId === loc.id;
                          const isProxy = loc.actionType === 'proxy';
                          const isRedirect = loc.actionType === 'redirect';
                          const isDeny = loc.actionType === 'deny';

                          const actionColor = isProxy
                            ? '#06b6d4'
                            : isRedirect
                            ? '#f59e0b'
                            : isDeny
                            ? '#f43f5e'
                            : '#10b981';

                          return (
                            <div
                              key={loc.id}
                              onClick={() => {
                                setSelectedServerId(server.id);
                                setSelectedLocationId(loc.id);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                background: isLocSelected
                                  ? 'linear-gradient(135deg, rgba(16, 23, 42, 0.9), rgba(15, 23, 42, 0.95))'
                                  : '#070a12',
                                border: isLocSelected ? `1.5px solid ${actionColor}` : '1px solid #1e293b',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                gap: '1rem',
                                flexWrap: 'wrap',
                              }}
                            >
                              {/* Location Matcher */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '180px' }}>
                                <span style={{ padding: '5px', background: 'rgba(15, 23, 42, 0.9)', borderRadius: '6px', border: '1px solid #334155' }}>
                                  {isProxy ? (
                                    <Repeat style={{ width: '14px', height: '14px', color: '#06b6d4' }} />
                                  ) : isRedirect ? (
                                    <CornerDownRight style={{ width: '14px', height: '14px', color: '#f59e0b' }} />
                                  ) : isDeny ? (
                                    <Ban style={{ width: '14px', height: '14px', color: '#f43f5e' }} />
                                  ) : (
                                    <Folder style={{ width: '14px', height: '14px', color: '#10b981' }} />
                                  )}
                                </span>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
                                    location <span style={{ color: '#22d3ee' }}>{loc.path}</span>
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                                    {loc.directives.length} Directives Active
                                  </div>
                                </div>
                              </div>

                              {/* Animated SVG Stream Link Conduit */}
                              <div className="topology-conduit-container" style={{ width: '60px', minWidth: '60px' }}>
                                <svg className="topology-stream-svg" viewBox="0 0 60 24">
                                  <path d="M 0 12 L 60 12" className="stream-line-bg" />
                                  <path
                                    d="M 0 12 L 60 12"
                                    className={`stream-line-flow ${isDeny ? 'warning' : 'active'}`}
                                    style={{ stroke: actionColor }}
                                  />
                                  <polygon points="56,8 60,12 56,16" fill={actionColor} />
                                </svg>
                              </div>

                              {/* Target Destination & Badges */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '12px', color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                                  {loc.target}
                                </div>
                                {loc.timeout && (
                                  <span style={{ fontSize: '10px', padding: '1px 5px', background: 'rgba(51, 65, 85, 0.5)', color: '#cbd5e1', borderRadius: '4px' }}>
                                    {loc.timeout}s timeout
                                  </span>
                                )}
                                {loc.rateLimit && (
                                  <span style={{ fontSize: '10px', padding: '1px 5px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                    Rate-Limited
                                  </span>
                                )}
                                <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(15, 23, 42, 0.8)', color: actionColor, borderRadius: '4px', border: `1px solid ${actionColor}66`, fontWeight: 800 }}>
                                  {loc.actionType.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected Location / Server Inspector */}
            {!isNginxEmpty && activeLocation && (
              <div style={{ background: '#0b1120', border: '1.5px solid #06b6d4', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 0 25px rgba(6, 182, 212, 0.15)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '0.65rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Route style={{ width: '18px', height: '18px', color: '#22d3ee' }} />
                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>
                        Routing Inspector: location {activeLocation.path}
                      </h3>
                      <p style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Active directives, proxy forwarding, and access rules configured for this route.
                      </p>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: 'rgba(6, 182, 212, 0.2)',
                      color: '#22d3ee',
                      border: '1px solid rgba(6, 182, 212, 0.4)',
                    }}
                  >
                    TARGET: {activeLocation.target}
                  </span>
                </div>

                {/* Directives Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                  {activeLocation.directives.map((dir, dIdx) => (
                    <div
                      key={dIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        borderRadius: '8px',
                        border: '1px solid #1e293b',
                        fontSize: '12px',
                        color: '#cbd5e1',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      <CheckCircle2 style={{ width: '14px', height: '14px', color: '#10b981', flexShrink: 0 }} />
                      <span>{dir}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Dockerfile Topology Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>Visual Dockerfile Build & Layer Pipeline</h1>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: isDockerEmpty ? 'rgba(100, 116, 139, 0.2)' : 'rgba(16, 185, 129, 0.2)', color: isDockerEmpty ? '#94a3b8' : '#34d399', fontWeight: 700, border: `1px solid ${isDockerEmpty ? '#334155' : 'rgba(16, 185, 129, 0.4)'}` }}>
                    {isDockerEmpty ? 'EMPTY DOCKERFILE' : `${dockerGraph.totalLayers} LAYERS · ${dockerGraph.totalStages} STAGES`}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                  Visualizes build progression from Base Image OS → Cache Layers → Artifact Compilation → Non-Root Production Runtime.
                </p>
              </div>

              {!isDockerEmpty && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', color: '#34d399', fontWeight: 600 }}>
                    <ShieldCheck style={{ width: '14px', height: '14px', color: '#10b981' }} />
                    <span>Security Score: {dockerGraph.securityScore}/100</span>
                  </div>
                </div>
              )}
            </div>

            {/* Empty State when Dockerfile is empty */}
            {isDockerEmpty || !hasDockerStages ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '3.5rem 1.5rem',
                  background: 'rgba(11, 17, 32, 0.6)',
                  border: '1.5px dashed #1e293b',
                  borderRadius: '12px',
                  margin: '1.5rem 0',
                  textAlign: 'center',
                  gap: '1rem',
                }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Terminal style={{ width: '28px', height: '28px', color: '#10b981' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>No Active Dockerfile Loaded</h3>
                  <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '480px', marginTop: '6px', lineHeight: 1.5 }}>
                    Your Dockerfile is currently empty. Load an existing <code style={{ color: '#34d399' }}>Dockerfile</code> or load our optimized Node.js multi-stage sample to inspect container layering and security boundaries.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
                  <button
                    onClick={resetDockerfile}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    <Sparkles style={{ width: '14px', height: '14px' }} />
                    <span>Load Sample Dockerfile</span>
                  </button>
                  <button
                    onClick={() => setActiveTool('dockerfile')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      background: '#141d33',
                      color: '#cbd5e1',
                      border: '1px solid #1e293b',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Open Dockerfile Linter</span>
                    <ArrowRight style={{ width: '13px', height: '13px' }} />
                  </button>
                </div>
              </div>
            ) : (
              /* Docker Multi-Stage Pipeline Graph */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {dockerGraph.pipeline.map((stage) => {
                    const isSelected = (selectedDockerStageId || dockerGraph.pipeline[0]?.id) === stage.id;
                    const isWarning = stage.status === 'warning';
                    const stageColor = isWarning ? '#f59e0b' : '#10b981';

                    return (
                      <div
                        key={stage.id}
                        onClick={() => setSelectedDockerStageId(stage.id)}
                        style={{
                          background: isSelected
                            ? 'linear-gradient(135deg, rgba(16, 23, 42, 0.95), rgba(15, 23, 42, 0.98))'
                            : 'rgba(11, 17, 32, 0.8)',
                          backdropFilter: 'blur(12px)',
                          border: isSelected ? `1.5px solid ${stageColor}` : '1px solid #1e293b',
                          borderRadius: '12px',
                          padding: '1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem',
                          boxShadow: isSelected ? `0 0 20px ${stageColor}33` : '0 4px 15px rgba(0,0,0,0.3)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '18px' }}>{stage.icon}</span>
                            <div>
                              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{stage.title}</h3>
                              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{stage.subtext}</p>
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isWarning ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: stageColor,
                              border: `1px solid ${stageColor}44`,
                            }}
                          >
                            {stage.badge}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: '#070a13', padding: '6px 8px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                          <div>
                            <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>{stage.metrics.primaryLabel}</div>
                            <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{stage.metrics.primaryValue}</div>
                          </div>
                          {stage.metrics.secondaryLabel && (
                            <div>
                              <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>{stage.metrics.secondaryLabel}</div>
                              <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{stage.metrics.secondaryValue}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Stage Detail Inspector */}
                {activeDockerStage && (
                  <div style={{ background: '#0b1120', border: '1.5px solid #10b981', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 0 25px rgba(16, 185, 129, 0.15)', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>{activeDockerStage.icon}</span>
                        <div>
                          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                            Stage Inspector: {activeDockerStage.title}
                          </h3>
                          <p style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {activeDockerStage.subtext}
                          </p>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: activeDockerStage.status === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          color: activeDockerStage.status === 'warning' ? '#f59e0b' : '#34d399',
                          border: `1px solid ${activeDockerStage.status === 'warning' ? '#f59e0b66' : '#10b98166'}`,
                        }}
                      >
                        {activeDockerStage.statusLabel}
                      </span>
                    </div>

                    {/* Details List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {activeDockerStage.details.map((detail, dIdx) => (
                        <div
                          key={dIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            background: 'rgba(15, 23, 42, 0.6)',
                            borderRadius: '8px',
                            border: '1px solid #1e293b',
                            fontSize: '12px',
                            color: '#cbd5e1',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          <CheckCircle2 style={{ width: '14px', height: '14px', color: activeDockerStage.status === 'warning' ? '#f59e0b' : '#10b981', flexShrink: 0 }} />
                          <span>{detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* AdSense Slot 2 (Bottom Strip) */}
        <AdSenseSlot slot="editor-strip" />
      </section>
    </div>
  );
};
