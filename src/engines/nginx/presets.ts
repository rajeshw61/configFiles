import { NginxConfigState } from '../../types/nginx';

export interface NginxPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  config: Partial<NginxConfigState>;
}

export const NGINX_PRESETS: NginxPreset[] = [
  {
    id: 'hardened-production',
    name: 'Hardened Production (A+)',
    badge: '⚡ A+ RATED',
    description: 'TLS 1.3 only, HSTS Preload, Rate Limiting, and full OWASP headers.',
    config: {
      enableHttps: true,
      http2: true,
      http3Quic: false,
      sslProfile: 'modern',
      hstsEnabled: true,
      hstsSubdomains: true,
      hstsPreload: true,
      ocspStapling: true,
      rateLimitEnabled: true,
      rateLimitRps: 20,
      rateLimitBurst: 10,
      rateLimitNoDelay: true,
      xFrameOptions: 'DENY',
      xContentTypeOptions: true,
      serverTokensOff: true,
      gzipEnabled: true,
      contentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
    },
  },
  {
    id: 'spa-api-proxy',
    name: 'SPA + REST/GraphQL API',
    badge: '🌐 REVERSE PROXY',
    description: 'Reverse proxy setup with intermediate SSL for broader device support.',
    config: {
      enableHttps: true,
      http2: true,
      sslProfile: 'intermediate',
      hstsEnabled: true,
      hstsSubdomains: true,
      hstsPreload: false,
      ocspStapling: true,
      rateLimitEnabled: true,
      rateLimitRps: 50,
      rateLimitBurst: 20,
      rateLimitNoDelay: true,
      xFrameOptions: 'SAMEORIGIN',
      xContentTypeOptions: true,
      serverTokensOff: true,
      gzipEnabled: true,
      proxyPassUrl: 'http://127.0.0.1:4000',
    },
  },
  {
    id: 'websocket-realtime',
    name: 'Real-time WebSocket Stack',
    badge: '🔌 WEBSOCKET',
    description: 'Optimized for high-concurrency real-time WebSocket streams & proxies.',
    config: {
      enableHttps: true,
      http2: true,
      sslProfile: 'intermediate',
      enableWebsockets: true,
      rateLimitEnabled: false,
      workerConnections: 16384,
      keepaliveTimeout: 65,
      proxyReadTimeout: 3600,
      proxySendTimeout: 3600,
      serverTokensOff: true,
      xFrameOptions: 'SAMEORIGIN',
      xContentTypeOptions: true,
    },
  },
];
