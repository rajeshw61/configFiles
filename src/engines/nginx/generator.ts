import { NginxConfigState } from '../../types/nginx';

export const DEFAULT_NGINX_STATE: NginxConfigState = {
  domainNames: 'api.productionapp.com',
  listenPort: 443,
  enableHttps: true,
  http2: true,
  http3Quic: false,
  serverTokensOff: true,
  workerProcesses: 'auto',
  workerConnections: 8192,

  sslProfile: 'modern',
  hstsEnabled: true,
  hstsSubdomains: true,
  hstsPreload: true,
  ocspStapling: true,
  dhParamBits: 2048,

  rateLimitEnabled: true,
  rateLimitZone: 'ip_limit',
  rateLimitRps: 20,
  rateLimitBurst: 10,
  rateLimitNoDelay: true,

  xFrameOptions: 'DENY',
  xContentTypeOptions: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: true,
  contentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",

  proxyPassUrl: 'http://127.0.0.1:3000',
  enableWebsockets: true,
  proxyConnectTimeout: 60,
  proxyReadTimeout: 60,
  proxySendTimeout: 60,

  gzipEnabled: true,
  brotliEnabled: false,
  clientMaxBodySize: 16,
  keepaliveTimeout: 65,
};

export function generateNginxConf(partialState: Partial<NginxConfigState> = {}): string {
  const state: NginxConfigState = { ...DEFAULT_NGINX_STATE, ...partialState };
  const domain = (state.domainNames || 'example.com').trim() || 'example.com';
  const rps = state.rateLimitRps ?? 20;
  const burst = state.rateLimitBurst ?? 10;
  const nodelayStr = state.rateLimitNoDelay ? ' nodelay' : '';

  return `# =========================================================================
# Hardened Nginx Production Configuration — OpsHardener.dev
# Target Domain: ${domain}
# SSL Security Profile: ${(state.sslProfile || 'modern').toUpperCase()} (Mozilla Standard)
# 100% Client-Side Generated — No server telemetry
# =========================================================================

user nginx;
pid /var/run/nginx.pid;
worker_processes ${state.workerProcesses};
worker_rlimit_nofile 65535;

events {
    multi_accept on;
    worker_connections ${state.workerConnections};
}

http {
    charset utf-8;
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    ${state.serverTokensOff ? 'server_tokens off;' : 'server_tokens on;'}
    client_max_body_size ${state.clientMaxBodySize}M;
    keepalive_timeout ${state.keepaliveTimeout};

    # MIME types
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main_ext '$remote_addr - $remote_user [$time_local] "$request" '
                        '$status $body_bytes_sent "$http_referer" '
                        '"$http_user_agent" "$http_x_forwarded_for" '
                        'rt=$request_time uct="$upstream_connect_time" uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main_ext buffer=32k flush=5s;
    error_log /var/log/nginx/error.log warn;
${state.rateLimitEnabled ? `
    # Rate Limiting Zone (DDoS & Brute-force protection)
    limit_req_zone $binary_remote_addr zone=${state.rateLimitZone}:10m rate=${rps}r/s;
    limit_req_status 429;` : ''}
${state.gzipEnabled ? `
    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        application/atom+xml
        application/javascript
        application/json
        application/ld+json
        application/manifest+json
        application/rss+xml
        application/vnd.geo+json
        application/vnd.ms-fontobject
        application/x-font-ttf
        application/x-web-app-manifest+json
        application/xhtml+xml
        application/xml
        font/opentype
        image/bmp
        image/svg+xml
        image/x-icon
        text/cache-manifest
        text/css
        text/plain
        text/vcard
        text/vnd.rim.location.xloc
        text/vtt
        text/x-component
        text/x-cross-domain-policy;` : ''}

    # HTTP -> HTTPS Redirect Block
    server {
        listen 80;
        listen [::]:80;
        server_name ${domain};

        # ACME-challenge for Let's Encrypt renewal
        location ^~ /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # Hardened HTTPS Server Block
    server {
        listen 443 ssl ${state.http2 ? 'http2' : ''};
        listen [::]:443 ssl ${state.http2 ? 'http2' : ''};
        server_name ${domain};

        # SSL Certificates
        ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:10m;
        ssl_session_tickets off;

        # Mozilla SSL Ciphers & Protocols (${state.sslProfile})
        ${state.sslProfile === 'modern' ? `ssl_protocols TLSv1.3;
        ssl_prefer_server_ciphers off;` : `ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;`}
${state.ocspStapling ? `
        # OCSP Stapling (Speeds TLS handshake & privacy)
        ssl_stapling on;
        ssl_stapling_verify on;
        resolver 1.1.1.1 1.0.0.1 8.8.8.8 valid=300s;
        resolver_timeout 5s;` : ''}

        # OWASP Security Headers
        include /etc/nginx/security-headers.conf;

        # Primary Proxy Upstream
        location / {
${state.rateLimitEnabled ? `            limit_req zone=${state.rateLimitZone} burst=${burst}${nodelayStr};\n` : ''}            proxy_pass ${state.proxyPassUrl};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
${state.enableWebsockets ? `            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";` : ''}
            proxy_connect_timeout ${state.proxyConnectTimeout}s;
            proxy_read_timeout ${state.proxyReadTimeout}s;
            proxy_send_timeout ${state.proxySendTimeout}s;
        }

        # Deny hidden files (.git, .env)
        location ~ /\\.(?!well-known).* {
            deny all;
            access_log off;
            log_not_found off;
        }
    }
}
`;
}

export function generateSecurityHeadersConf(partialState: Partial<NginxConfigState> = {}): string {
  const state: NginxConfigState = { ...DEFAULT_NGINX_STATE, ...partialState };
  const lines: string[] = [
    '# =========================================================================',
    '# /etc/nginx/security-headers.conf',
    '# Hardened OWASP Security Headers (A+ Rating on SecurityHeaders.com)',
    '# =========================================================================',
    '',
  ];

  if (state.hstsEnabled) {
    const subdomains = state.hstsSubdomains ? '; includeSubDomains' : '';
    const preload = state.hstsPreload ? '; preload' : '';
    lines.push(`add_header Strict-Transport-Security "max-age=63072000${subdomains}${preload}" always;`);
  }

  if (state.xFrameOptions !== 'DISABLED') {
    lines.push(`add_header X-Frame-Options "${state.xFrameOptions}" always;`);
  }

  if (state.xContentTypeOptions) {
    lines.push('add_header X-Content-Type-Options "nosniff" always;');
  }

  if (state.referrerPolicy) {
    lines.push(`add_header Referrer-Policy "${state.referrerPolicy}" always;`);
  }

  if (state.permissionsPolicy) {
    lines.push('add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;');
  }

  if (state.contentSecurityPolicy) {
    lines.push(`add_header Content-Security-Policy "${state.contentSecurityPolicy}" always;`);
  }

  lines.push('add_header X-XSS-Protection "0" always;');

  return lines.join('\n') + '\n';
}

export function generateDockerCompose(_state: NginxConfigState): string {
  return `# =========================================================================
# Production Hardened Nginx + Certbot Docker Compose Stack
# OpsHardener.dev — 100% Client-Side Generated
# =========================================================================
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: opshardener_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./security-headers.conf:/etc/nginx/security-headers.conf:ro
      - ./certs:/etc/letsencrypt:ro
      - ./certbot-www:/var/www/certbot:ro
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    networks:
      - web_net

  certbot:
    image: certbot/certbot
    container_name: opshardener_certbot
    volumes:
      - ./certs:/etc/letsencrypt
      - ./certbot-www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait '` + '$$' + `{!}; done;'"
    networks:
      - web_net

networks:
  web_net:
    driver: bridge
`;
}
