import React from 'react';
import { useSuiteStore } from '../../store/useSuiteStore';
import { BookOpen, HelpCircle, ShieldCheck } from 'lucide-react';
import { AdSenseSlot } from '../common/AdSenseSlot';

export const SeoArticle: React.FC = () => {
  const { activeTool } = useSuiteStore();

  return (
    <article className="seo-section">
      <div className="seo-container">
        {/* AdSense Zone 3: Leaderboard */}
        <AdSenseSlot slot="leaderboard" />

        {activeTool === 'nginx' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#06b6d4' }}>
              <BookOpen style={{ width: '20px', height: '20px' }} />
              <h2 className="seo-heading-h2" style={{ margin: 0 }}>
                Complete Guide: Production Nginx Security Hardening & Performance
              </h2>
            </div>

            <p className="seo-p" style={{ color: '#cbd5e1' }}>
              By default, out-of-the-box Nginx installations leave critical security directives unconfigured. Server tokens leak exact version numbers (allowing attackers to cross-reference known CVEs), legacy TLS 1.0/1.1 protocols remain enabled, and missing browser security headers expose web applications to Clickjacking (CWE-1021), MIME-confusion (CWE-430), and Cross-Site Scripting (XSS).
            </p>

            <h3 className="seo-heading-h3">1. Why Enforce Modern TLS 1.3 & Mozilla SSL Profiles?</h3>
            <p className="seo-p">
              TLS 1.3 removes vulnerable legacy cryptographic algorithms (such as RSA key exchange, 3DES, and RC4) in favor of forward-secure AEAD ciphers (e.g. <code>TLS_AES_256_GCM_SHA384</code> and <code>CHACHA20-POLY1305</code>). Configuring Mozilla Modern profile guarantees an <strong>A+ rating on SSL Labs</strong> while drastically reducing TLS handshake latency down to 1-RTT.
            </p>

            <h3 className="seo-heading-h3">2. DDoS Mitigation with Binary IP Leaky Bucket Rate Limiting</h3>
            <p className="seo-p">
              Using the <code>limit_req_zone $binary_remote_addr</code> directive allocates a fast 10MB in-memory lookup table capable of tracking ~160,000 distinct IP addresses. Combined with <code>burst=10 nodelay</code>, legitimate bursts of client traffic are honored while brute-force credential stuffing and volumetric layer-7 denial of service attacks receive instant <code>429 Too Many Requests</code> status codes.
            </p>

            <h3 className="seo-heading-h3">3. Recommended OWASP Security Headers Matrix</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="seo-table">
                <thead>
                  <tr>
                    <th>Header Directive</th>
                    <th>Hardened Value</th>
                    <th>Security Impact</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
                  <tr>
                    <td style={{ color: '#06b6d4' }}>Strict-Transport-Security</td>
                    <td>max-age=63072000; includeSubDomains; preload</td>
                    <td style={{ fontFamily: 'Inter, sans-serif', color: '#cbd5e1' }}>Forces browser HTTPS encryption for 2 years</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#06b6d4' }}>X-Frame-Options</td>
                    <td>DENY</td>
                    <td style={{ fontFamily: 'Inter, sans-serif', color: '#cbd5e1' }}>Zero iframe embedding to prevent clickjacking</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#06b6d4' }}>X-Content-Type-Options</td>
                    <td>nosniff</td>
                    <td style={{ fontFamily: 'Inter, sans-serif', color: '#cbd5e1' }}>Blocks MIME-type spoofing and XSS execution</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#06b6d4' }}>Referrer-Policy</td>
                    <td>strict-origin-when-cross-origin</td>
                    <td style={{ fontFamily: 'Inter, sans-serif', color: '#cbd5e1' }}>Protects user privacy across external link navigations</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTool === 'dockerfile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
              <ShieldCheck style={{ width: '20px', height: '20px' }} />
              <h2 className="seo-heading-h2" style={{ margin: 0 }}>
                Dockerfile Security Best Practices & Container Hardening
              </h2>
            </div>

            <p className="seo-p" style={{ color: '#cbd5e1' }}>
              Container image security starts with the Dockerfile. Over 70% of Docker Hub images execute processes as the <code>root</code> user, allowing attackers who exploit remote code execution (RCE) vulnerabilities in your web framework to mount container breakout attacks and compromise the underlying host kernel.
            </p>

            <h3 className="seo-heading-h3">Key Container Security Rules (CIS Benchmark)</h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '13px', color: '#cbd5e1', paddingLeft: '1.25rem' }}>
              <li><strong>Always declare a non-root USER:</strong> Create a dedicated group and user (e.g. <code>USER node</code> or <code>USER 1001</code>) before the <code>CMD</code> or <code>ENTRYPOINT</code> instruction.</li>
              <li><strong>Never use :latest:</strong> Always pin base image versions to specific tags (e.g. <code>node:20.11-alpine</code>) to prevent unexpected upstream breaking changes.</li>
              <li><strong>Clean package manager caches:</strong> Run <code>apt-get clean && rm -rf /var/lib/apt/lists/*</code> in the same <code>RUN</code> layer to shrink image weight.</li>
              <li><strong>Define HEALTHCHECK instructions:</strong> Enable container runtimes to restart unhealthy or deadlocked process loops automatically.</li>
            </ul>
          </div>
        )}

        {/* Frequently Asked Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
            <HelpCircle style={{ width: '20px', height: '20px', color: '#a855f7' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Frequently Asked Questions</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <details className="faq-card">
              <summary>Does OpsHardener send my configuration code to any server?</summary>
              <p>
                <strong>No.</strong> OpsHardener is engineered with a strict 100% client-side zero-backend architecture. All configuration generation, AST parsing, and vulnerability audits run strictly inside your browser's local memory (RAM).
              </p>
            </details>

            <details className="faq-card">
              <summary>How do I test my generated Nginx configuration before restarting?</summary>
              <p>
                Always run <code>nginx -t</code> on your server or container before reloading. If the syntax test passes, execute <code>nginx -s reload</code> or <code>systemctl reload nginx</code> for zero-downtime reconfiguration.
              </p>
            </details>
          </div>
        </div>
      </div>
    </article>
  );
};
