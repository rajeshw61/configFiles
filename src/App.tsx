import React, { useEffect } from 'react';
import { useSuiteStore } from './store/useSuiteStore';
import { Navbar } from './components/common/Navbar';
import { NginxStudio } from './components/nginx/NginxStudio';
import { DockerfileLinter } from './components/dockerfile/DockerfileLinter';
import { CspBuilder } from './components/csp/CspBuilder';
import { TopologyVisualizer } from './components/topology/TopologyVisualizer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { SeoArticle } from './components/seo/SeoArticle';
import { JsonLd } from './components/seo/JsonLd';

export const App: React.FC = () => {
  const { activeTool, loadFromUrlHash } = useSuiteStore();

  useEffect(() => {
    // Attempt loading state from URL hash on first mount
    loadFromUrlHash();

    // Listen for hash changes
    const onHashChange = () => {
      loadFromUrlHash();
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [loadFromUrlHash]);

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-[#f8fafc]">
      {/* Schema.org Structured Data Injector */}
      <JsonLd activeTool={activeTool} />

      {/* Top Sticky Navbar */}
      <Navbar />

      {/* Main Interactive Tool Workbench */}
      <main className="flex-1 flex flex-col">
        <ErrorBoundary>
          {activeTool === 'nginx' && <NginxStudio />}
          {activeTool === 'dockerfile' && <DockerfileLinter />}
          {activeTool === 'csp' && <CspBuilder />}
          {activeTool === 'topology' && <TopologyVisualizer />}
        </ErrorBoundary>
      </main>

      {/* Below-the-Fold SEO Guides & FAQs */}
      <SeoArticle />

      {/* Footer */}
      <footer className="border-t border-[#1e293b] bg-[#090d16] py-6 px-6 text-center text-xs text-[#64748b]">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1 font-mono">
            <span>OpsHardener.dev</span> &middot; <span>100% Client-Side: Your code never leaves your browser.</span>
          </div>
          <div className="flex items-center gap-4 text-[#94a3b8]">
            <a href="#nginx" onClick={() => useSuiteStore.getState().setActiveTool('nginx')} className="hover:text-cyan-400">Nginx Studio</a>
            <a href="#dockerfile" onClick={() => useSuiteStore.getState().setActiveTool('dockerfile')} className="hover:text-cyan-400">Dockerfile Linter</a>
            <a href="#csp" onClick={() => useSuiteStore.getState().setActiveTool('csp')} className="hover:text-cyan-400">CSP Builder</a>
            <a href="#topology" onClick={() => useSuiteStore.getState().setActiveTool('topology')} className="hover:text-cyan-400">Topology Map</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
