import React from 'react';
import { Shield, Lock, Terminal, Network, Sparkles } from 'lucide-react';
import { useSuiteStore } from '../../store/useSuiteStore';
import { ToolTab } from '../../types/suite';

export const Navbar: React.FC = () => {
  const { activeTool, setActiveTool } = useSuiteStore();

  const tools: { id: ToolTab; label: string; icon: React.ReactNode }[] = [
    { id: 'nginx', label: 'Nginx Hardening', icon: <Shield className="w-4 h-4 text-cyan-400" /> },
    { id: 'dockerfile', label: 'Dockerfile Linter', icon: <Terminal className="w-4 h-4 text-emerald-400" /> },
    { id: 'csp', label: 'CSP & Headers', icon: <Lock className="w-4 h-4 text-purple-400" /> },
    { id: 'topology', label: 'Visual Topology', icon: <Network className="w-4 h-4 text-amber-400" /> },
  ];

  return (
    <header className="navbar">
      {/* Brand Logo */}
      <div className="brand-container" onClick={() => setActiveTool('nginx')}>
        <div className="brand-icon-box">
          &gt;_
        </div>
        <div className="brand-title">
          OpsHardener<span>.dev</span>
          <span className="brand-tag">Studio</span>
        </div>
      </div>

      {/* Navigation Tool Tabs */}
      <nav className="nav-tabs-wrapper">
        {tools.map((tool) => {
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`nav-tab-btn ${isActive ? 'active' : ''}`}
            >
              {tool.icon}
              <span>{tool.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Privacy Badge & Actions */}
      <div className="navbar-right-actions">
        <div className="privacy-badge" title="100% Client-Side: Your code never leaves your browser.">
          <div className="privacy-dot" />
          <span>100% Client-Side Private</span>
        </div>

        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="github-btn"
        >
          <Sparkles style={{ width: '14px', height: '14px', color: '#06b6d4' }} />
          <span>Star</span>
        </a>
      </div>
    </header>
  );
};
