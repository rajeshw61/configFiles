import { NginxConfigState } from '../../types/nginx';

export interface ScoreBreakdown {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  passedChecks: string[];
  recommendations: string[];
}

export function calculateNginxSecurityScore(state: NginxConfigState): ScoreBreakdown {
  let score = 40;
  const passed: string[] = [];
  const recs: string[] = [];

  // SSL Profile Check
  if (state.sslProfile === 'modern') {
    score += 15;
    passed.push('Modern TLS 1.3 only profile active');
  } else {
    score += 10;
    passed.push('Intermediate TLS 1.2/1.3 profile active');
    recs.push('Switch to Modern (TLS 1.3 only) for maximum forward secrecy');
  }

  // HSTS Check
  if (state.hstsEnabled) {
    score += 15;
    if (state.hstsPreload && state.hstsSubdomains) {
      score += 5;
      passed.push('HSTS enabled with 2-year max-age & Preload list readiness');
    } else {
      passed.push('HSTS enabled');
      recs.push('Enable HSTS includeSubDomains and Preload for browser-level enforcement');
    }
  } else {
    recs.push('Enable Strict-Transport-Security (HSTS) to prevent SSL stripping');
  }

  // OCSP Stapling
  if (state.ocspStapling) {
    score += 10;
    passed.push('OCSP Stapling enabled with DNS resolver');
  } else {
    recs.push('Enable OCSP Stapling to speed up SSL handshakes and protect CA privacy');
  }

  // Rate Limiting
  if (state.rateLimitEnabled) {
    score += 10;
    passed.push(`Rate limiting active (${state.rateLimitRps} req/s)`);
  } else {
    recs.push('Enable per-IP Rate Limiting to prevent brute-force & denial of service');
  }

  // OWASP Headers
  if (state.xFrameOptions !== 'DISABLED') {
    score += 5;
    passed.push(`Clickjacking protection active (X-Frame-Options: ${state.xFrameOptions})`);
  } else {
    recs.push('Enable X-Frame-Options: DENY to prevent clickjacking');
  }

  if (state.xContentTypeOptions) {
    score += 5;
    passed.push('MIME sniffing protection active (X-Content-Type-Options: nosniff)');
  }

  if (state.serverTokensOff) {
    score += 5;
    passed.push('Server version tokens hidden (server_tokens off)');
  } else {
    recs.push('Turn off server_tokens to avoid leaking Nginx version in HTTP headers');
  }

  if (state.contentSecurityPolicy) {
    score += 5;
    passed.push('Content-Security-Policy (CSP) header active');
  }

  // Clamp score
  const finalScore = Math.min(100, Math.max(0, score));
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (finalScore >= 95) grade = 'A+';
  else if (finalScore >= 85) grade = 'A';
  else if (finalScore >= 75) grade = 'B';
  else if (finalScore >= 60) grade = 'C';
  else if (finalScore >= 50) grade = 'D';

  return {
    score: finalScore,
    grade,
    passedChecks: passed,
    recommendations: recs,
  };
}
