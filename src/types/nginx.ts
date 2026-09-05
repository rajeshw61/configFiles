export type SslProfile = 'modern' | 'intermediate';

export interface NginxConfigState {
  // Server & Network
  domainNames: string;
  listenPort: number;
  enableHttps: boolean;
  http2: boolean;
  http3Quic: boolean;
  serverTokensOff: boolean;
  workerProcesses: string;
  workerConnections: number;

  // SSL & TLS
  sslProfile: SslProfile;
  hstsEnabled: boolean;
  hstsSubdomains: boolean;
  hstsPreload: boolean;
  ocspStapling: boolean;
  dhParamBits: number;

  // Rate Limiting & DDoS Shield
  rateLimitEnabled: boolean;
  rateLimitZone: string;
  rateLimitRps: number;
  rateLimitBurst: number;
  rateLimitNoDelay: boolean;

  // Security Headers (OWASP)
  xFrameOptions: 'DENY' | 'SAMEORIGIN' | 'DISABLED';
  xContentTypeOptions: boolean;
  referrerPolicy: string;
  permissionsPolicy: boolean;
  contentSecurityPolicy: string;

  // Upstream & Reverse Proxy
  proxyPassUrl: string;
  enableWebsockets: boolean;
  proxyConnectTimeout: number;
  proxyReadTimeout: number;
  proxySendTimeout: number;

  // Optimization & Compression
  gzipEnabled: boolean;
  brotliEnabled: boolean;
  clientMaxBodySize: number;
  keepaliveTimeout: number;
}
