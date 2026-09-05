# =========================================================================
# Multi-Stage Production Dockerfile — OpsHardener.dev
# 100% Client-Side Single-Page Application (SPA)
# Zero Backend, Zero Telemetry, Non-Root Runtime
# =========================================================================

# -------------------------------------------------------------------------
# Stage 1: Build Static Assets
# -------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies using clean install with package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

# Copy project source and configuration files
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

# Compile TypeScript and bundle production assets to /app/dist
RUN npm run build

# -------------------------------------------------------------------------
# Stage 2: Minimal Unprivileged Nginx Runtime
# -------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner

# Explicitly ensure execution as unprivileged 'nginx' user (UID 101)
USER nginx

# Copy custom hardened Nginx SPA configuration
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

# Expose non-privileged HTTP port
EXPOSE 8080

# Healthcheck validating local HTTP response on /healthz
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1

# Launch Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
