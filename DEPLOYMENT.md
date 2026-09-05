# Manual Deployment Guide: S3 -> CloudFront -> Cloudflare

This guide outlines the step-by-step manual deployment process for hosting the 100% client-side DevOps & Cybersecurity Suite on **AWS S3**, accelerating with **AWS CloudFront**, and fronting with **Cloudflare** for DNS, edge caching, and DDoS protection.

```
[ User Browser ] 
       │ (HTTPS / HTTP/3)
       ▼
[ 🟠 Cloudflare Edge ] (DNS, Edge SSL 'Full Strict', DDoS mitigation, Brotli)
       │ (Origin fetch)
       ▼
[ ⚡ AWS CloudFront CDN ] (Global Edge Distribution, SPA 404-to-200 Fallback, OAC)
       │ (Signed Origin Access Control)
       ▼
[ 🪣 AWS S3 (Private Bucket) ] (Zero public access, hosts static /dist bundle)
```

---

## 1. Build the Production Bundle Locally

Run the build script in your project root:

```bash
npm run build
```

This generates the production-optimized static files inside the `./dist` folder.

---

## 2. Step 1: AWS S3 Bucket Setup (Private Storage)

1. **Create Bucket:**
   * Go to **AWS S3 Console** $\rightarrow$ **Create bucket**.
   * **Bucket name:** e.g., `opshardener-static-origin` (or your domain name).
   * **Region:** `us-east-1` (recommended for fastest CloudFront & ACM integration).
2. **Block Public Access:**
   * Keep **"Block all public access"** **CHECKED** (ON). The bucket will be completely private; only CloudFront will be granted read access.
3. **Bucket Policy (Origin Access Control):**
   * CloudFront will generate the exact policy for you in Step 2, or you can paste the OAC bucket policy granting `s3:GetObject` to your CloudFront distribution ARN.

---

## 3. Step 2: AWS CloudFront Setup (CDN & SPA Routing)

1. **Create Distribution:**
   * **Origin domain:** Select your S3 bucket from the dropdown.
   * **Origin access:** Choose **Origin Access Control (OAC)** $\rightarrow$ Create new OAC $\rightarrow$ Copy the generated S3 bucket policy and apply it to your S3 bucket permissions.
2. **Default Cache Behavior:**
   * **Viewer protocol policy:** `Redirect HTTP to HTTPS`.
   * **Allowed HTTP methods:** `GET, HEAD, OPTIONS`.
   * **Cache policy:** `CachingOptimized` (or custom cache policy).
3. **Custom Domain (Alternate Domain Names / CNAMEs):**
   * Add your custom domain (e.g., `opshardener.dev` or `tools.yourdomain.com`).
   * Attach an **AWS ACM SSL Certificate** for your domain (requested in `us-east-1`).
4. **Single-Page Application (SPA) Error Responses (Critical):**
   * Go to **Error Pages** tab $\rightarrow$ **Create custom error response**:
     * **HTTP error code:** `404: Not Found`
     * **Customize error response:** `Yes`
     * **Response page path:** `/index.html`
     * **HTTP response code:** `200: OK`
   * *(Optional)* Add a second custom error response for `403: Forbidden` pointing to `/index.html` with response code `200`.

---

## 4. Step 3: Cloudflare Setup (DNS, Edge SSL & Proxy)

1. **DNS Record:**
   * Go to your **Cloudflare Dashboard** $\rightarrow$ **DNS** $\rightarrow$ **Records**.
   * Add a `CNAME` record:
     * **Type:** `CNAME`
     * **Name:** `@` (or your subdomain, e.g., `tools`)
     * **Target:** `d1234abcd5678.cloudfront.net` (Your CloudFront Distribution Domain)
     * **Proxy status:** **Proxied (Orange Cloud ON)**
2. **SSL/TLS Encryption Mode (Critical):**
   * Go to **SSL/TLS** tab in Cloudflare.
   * Set encryption mode to **Full (Strict)**. *(Ensures end-to-end encryption between Cloudflare and CloudFront)*.
3. **Speed & Optimization Settings:**
   * Go to **Speed** $\rightarrow$ **Optimization**:
     * Enable **Brotli** compression.
     * Enable **Early Hints**.
     * Enable **HTTP/3 (with QUIC)**.

---

## 5. Step 4: Manual Upload / Sync & Invalidation Commands

Whenever you make updates and run `npm run build`, you can deploy in seconds using the AWS CLI or the S3 Web Console:

### Option A: Via AWS CLI (Fastest — 2 Commands)

```bash
# 1. Sync static assets with 1-year immutable cache (excluding HTML/JSON)
aws s3 sync dist/ s3://YOUR_BUCKET_NAME \
  --delete \
  --exclude "*.html" \
  --exclude "*.json" \
  --cache-control "public, max-age=31536000, immutable"

# 2. Sync HTML and JSON with no-cache revalidation
aws s3 sync dist/ s3://YOUR_BUCKET_NAME \
  --exclude "*" \
  --include "*.html" \
  --include "*.json" \
  --cache-control "no-cache, no-store, must-revalidate"

# 3. Invalidate CloudFront edge cache so changes go live instantly
aws cloudfront create-invalidation \
  --distribution-id YOUR_CLOUDFRONT_DISTRIBUTION_ID \
  --paths "/*"
```

### Option B: Via AWS S3 Web Console (GUI)
1. Go to **AWS S3 Console** $\rightarrow$ Open your bucket $\rightarrow$ Click **Upload**.
2. Drag and drop all files and the `assets/` folder from your local `dist/` folder.
3. Under **Properties** $\rightarrow$ **Metadata**:
   * Set `Cache-Control` for `index.html` to `no-cache, no-store, must-revalidate`.
4. Click **Upload**.
5. Go to **CloudFront Console** $\rightarrow$ Select your distribution $\rightarrow$ **Invalidations** tab $\rightarrow$ **Create invalidation** $\rightarrow$ Enter `/*` $\rightarrow$ Submit.
6. *(Optional)* In Cloudflare, click **Caching** $\rightarrow$ **Configuration** $\rightarrow$ **Purge Everything** if testing immediate changes.

---

## 6. Docker Container Deployment (Production Self-Hosted)

OpsHardener.dev provides a production-hardened, unprivileged, multi-stage Docker configuration for deploying as a standalone container, on Kubernetes, or on container platforms like AWS ECS, GCP Cloud Run, or Render.

### Architecture
* **Builder Stage:** `node:22-alpine` performs `npm ci` and `npm run build`.
* **Runtime Stage:** `nginxinc/nginx-unprivileged:1.27-alpine` running as non-root user `nginx` (UID `101`) on port `8080`.
* **Zero Backend:** Only static files are served; no server-side APIs, database connections, or background telemetry.
* **SPA Routing:** Unmatched routes fallback to `index.html` with `no-cache` headers.
* **Security Headers:** Preconfigured with `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and dotfile blocking.
* **Health Check:** Lightweight `/healthz` endpoint returning HTTP 200.

### Build and Run Commands

```bash
# 1. Build the production Docker image
docker build -t opshardener-dev:latest .

# 2. Run the container on port 8080 (non-root unprivileged)
docker run -d \
  --name opshardener-app \
  --restart unless-stopped \
  -p 8080:8080 \
  --read-only \
  --tmpfs /tmp \
  opshardener-dev:latest

# 3. Test application health and SPA routing
curl -I http://localhost:8080/healthz
curl -I http://localhost:8080/audit/nginx
```

### Automated Smoke Tests

To run the automated container smoke test suite:
* **Linux / macOS / CI:** `./scripts/docker-smoke-test.sh`
* **Windows (PowerShell):** `powershell -ExecutionPolicy Bypass -File ./scripts/docker-smoke-test.ps1`

---

## 7. Production Readiness & Verification Matrix

| Scope | Validation Method | Current Status | Notes / Prerequisites |
|---|---|---|---|
| **Local Code & Logic** | `npm test` (Vitest) | **VERIFIED LOCALLY** (24 files / 242+ tests passing) | Fast client-side unit test suite |
| **Production Build Bundle** | `npm run build` (`tsc -b && vite build`) | **VERIFIED LOCALLY** (0 errors, 4 asset chunks in `dist/`) | Produces static SPA artifacts |
| **Privacy & Zero-Backend** | Network call audit (0 fetch / 0 telemetry) | **VERIFIED LOCALLY** | 100% in-browser AST parsing |
| **Container Static Config** | `node scripts/validate-container-config.mjs` | **STATICALLY VALIDATED** (31/31 checks passing) | Validates Dockerfile, .dockerignore, nginx.conf, dist/ |
| **Nginx Hardening & SPA Routing** | Static AST / Regex validation in `nginx.conf` | **STATICALLY VALIDATED** | Non-root 8080, /healthz, asset caching, security headers |
| **Live Docker Build & Run** | `docker build` & `docker run` | **REQUIRES DOCKER ENVIRONMENT** | Docker daemon is not installed on this Windows development host |
| **Live HTTP Container Smoke Test** | `docker-smoke-test.sh` / `.ps1` | **REQUIRES DOCKER ENVIRONMENT** | Verifies live container startup, curl /healthz and SPA fallback |


