import React from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';

interface AdSlotProps {
  slot: 'sidebar' | 'editor-strip' | 'leaderboard';
}

export const AdSenseSlot: React.FC<AdSlotProps> = ({ slot }) => {
  if (slot === 'sidebar') {
    return (
      <div className="adsense-card-slot">
        <div className="adsense-header-row">
          <span>SPONSORED / ADSENSE</span>
          <span>300x250 Native</span>
        </div>

        <div className="adsense-mock-box">
          <div className="adsense-icon-badge">
            ⚡
          </div>
          <div className="adsense-details">
            <h4 className="adsense-title-text">
              Deploy Hardened Nginx on DigitalOcean
            </h4>
            <p className="adsense-desc-text">
              Spin up high-speed NVMe droplets with $200 free cloud credits.
            </p>
          </div>
          <a
            href="https://www.digitalocean.com"
            target="_blank"
            rel="noopener noreferrer"
            className="adsense-action-link"
          >
            Claim $200
          </a>
        </div>
      </div>
    );
  }

  if (slot === 'editor-strip') {
    return (
      <div className="editor-sponsor-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="sponsor-badge-tag">
            PARTNER
          </span>
          <ShieldCheck style={{ width: '16px', height: '16px', color: '#10b981' }} />
          <span>
            Scan your containers for known CVE vulnerabilities automatically with{' '}
            <strong style={{ color: '#fff' }}>Snyk Security</strong>
          </span>
        </div>

        <a
          href="https://snyk.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#06b6d4', fontWeight: 600, textDecoration: 'none' }}
        >
          <span>Run Free Scan</span>
          <ExternalLink style={{ width: '12px', height: '12px' }} />
        </a>
      </div>
    );
  }

  if (slot === 'leaderboard') {
    return (
      <div style={{ padding: '1rem', background: '#0e1424', border: '1px dashed #1e293b', borderRadius: '12px', textAlign: 'center', margin: '1.5rem auto', maxWidth: '850px', width: '100%' }}>
        <div style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
          Advertisement / Google AdSense (728x90 Leaderboard or Responsive Grid)
        </div>
        <div style={{ minHeight: '90px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: '#64748b' }}>
          <span>[ Responsive Google AdSense Display Slot — Zero Cumulative Layout Shift (CLS = 0) ]</span>
        </div>
      </div>
    );
  }

  return null;
};
