---
name: devops-utility-suite
description: >-
  Expert guide and implementation workflows for building, testing, and maintaining
  the 100% client-side DevOps & Cybersecurity Web Utilities Suite (Nginx Hardening Studio,
  Dockerfile Linter, CSP/CORS Builder, K8s YAML Validator, and Topology Visualizer).
---

# DevOps & Cybersecurity Web Utilities Suite Skill

This skill defines the technical development workflows, architectural constraints, AST parsing rules, visualization engines, and security validation algorithms for building high-intent, 100% client-side developer utilities.

---

## 1. Non-Negotiable Core Principles

1. **100% Client-Side Execution (Zero Backend):**
   * **Zero Server Telemetry:** Never introduce an external API call, backend endpoint, or server-side telemetry that transmits user-provided configuration code, Dockerfiles, YAML manifests, or domain names.
   * All AST parsing, schema checks, regex evaluations, and file generation must run locally in browser memory via Web Workers or synchronous client-side libraries.
   * Prominently display the client-side privacy shield: `"100% Client-Side: Your code never leaves your browser."`

2. **Zero-Latency Reactive Architecture:**
   * Form state changes must reflect in generated code outputs and topology diagrams instantaneously (< 16ms).
   * AST parsing for large Dockerfiles/YAMLs (> 1,000 lines) must be debounced by 150ms to prevent UI main-thread blocking.

3. **Zero Cumulative Layout Shift (CLS = 0):**
   * AdSense and partner banner slots must have pre-reserved container heights (`300x250`, `728x90`, `48px` sponsor strip) to guarantee zero layout jumping during page load.

---

## 2. Technical Stack & Key Libraries

* **Framework:** React 19 + TypeScript + Vite
* **Styling:** Vanilla CSS / TailwindCSS with CSS custom properties (defined in [DESIGN.md](file:///c:/Users/rajes/Downloads/projects/configFiles/DESIGN.md))
* **Code Editor:** `@monaco-editor/react` (for full syntax highlighting, gutter markers, and code diffs) or lightweight PrismJS for preview modes
* **Icons:** `lucide-react`
* **State Management:** `zustand` with URL-hash state sync and `localStorage` persistence
* **Parsing Engines:**
  * Dockerfile parsing: `dockerfile-ast`
  * YAML parsing & validation: `yaml` / `js-yaml`
  * Nginx AST & Tokenizer: Custom client-side parser & formatter module
  * URL State Serializer: `lz-string` or `btoa(JSON.stringify(state))`

---

## 3. Tool Implementation Workflows

### 3.1 Tool 1: Nginx Security Hardening & Config Studio
* **Config State Model:**
  * Server parameters: `domainNames`, `listenPort`, `enableHttps`, `http2`, `http3_quic`, `rootDirectory`, `indexFiles`.
  * Security profiles: `sslProfile` (`modern`, `intermediate`), `hstsEnabled`, `hstsSubdomains`, `hstsPreload`, `ocspStapling`.
  * Rate Limiting: `rateLimitEnabled`, `zoneName`, `requestsPerSecond`, `burstLimit`, `nodelay`.
  * Security Headers: `csp`, `xFrameOptions`, `xContentTypeOptions`, `referrerPolicy`, `permissionsPolicy`.
  * Proxy & Upstream: `proxyPassUrl`, `enableWebsockets`, `proxyTimeouts`, `bufferSizes`.
  * Performance: `gzipEnabled`, `brotliEnabled`, `clientMaxBodySize`, `keepaliveTimeout`.
* **Output Generators:**
  * `generateNginxConf(state)`: Produces modular or monolithic formatted `nginx.conf`.
  * `generateSecurityHeadersConf(state)`: Separate `security-headers.conf` include snippet.
  * `generateDockerCompose(state)`: Production Nginx + Certbot/Let's Encrypt `docker-compose.yml`.
  * `generateTopologyGraph(state)`: Computes active pipeline nodes for the `🗺️ Visual Topology` tab.

### 3.2 Tool 2: Client-Side Dockerfile Linter & Security Auditor
* **Rule Engine Checks:**
  1. `CK-01 (Critical)`: Container running as root (`USER root` or missing `USER <non-root>`).
  2. `CK-02 (Critical)`: Hardcoded secrets detected (API keys, AWS keys, passwords matching regex patterns).
  3. `CK-03 (Warning)`: Unpinned image versions (using `:latest` or missing tags).
  4. `CK-04 (Warning)`: Missing `HEALTHCHECK` instruction.
  5. `CK-05 (Optimization)`: Multiple consecutive `RUN` statements that should be chained with `&&` to reduce image layers.
  6. `CK-06 (Optimization)`: Missing `apt-get clean` or cache deletion after package installation.
  7. `CK-07 (Warning)`: Use of `ADD` instead of `COPY` for simple file transfers.
* **Inline Remediation:**
  * Provide a `"Quick Fix"` diff action that updates the editor content automatically.

### 3.3 Tool 3: Visual CSP & Security Headers Builder
* **Directive Management:**
  * Multi-select and custom source inputs for all standard CSP directives (`default-src`, `script-src`, `style-src`, `img-src`, `connect-src`, `font-src`, `object-src`, `frame-ancestors`, `base-uri`, `form-action`).
* **Presets Engine:**
  * 1-Click inclusion of third-party domains for Google Analytics 4, Google Tag Manager, Stripe, Sentry, Cloudflare Turnstile, and Hotjar.
* **Multi-Format Export:**
  * Raw HTTP header format: `Content-Security-Policy: ...`
  * Nginx directive: `add_header Content-Security-Policy "..." always;`
  * Apache directive: `Header always set Content-Security-Policy "..."`
  * HTML Meta Tag: `<meta http-equiv="Content-Security-Policy" content="...">`

---

## 4. Visual Topology Pipeline Engine

The `🗺️ Visual Topology` tab renders a real-time reactive DAG (Directed Acyclic Graph) of the traffic request pipeline:

```
[🌐 Client Ingress] 
       │ (Port 443 + HTTP/2 Multiplexing)
       ▼
[🔒 SSL/TLS Termination] ──> (Status: TLS 1.3 / Intermediate)
       │
       ▼
[🛡️ Rate Limiter Shield] ──> (Status: Active Bucket or Bypassed)
       │
       ▼
[📑 Security Headers Filter] ──> (Status: HSTS, CSP, X-Frame)
       │
       ▼
[🚀 Upstream Proxy Pass] ──> (Target: http://127.0.0.1:3000)
```

* **Node Status Computation:**
  * Each node evaluates `state` properties and returns `status: 'active' | 'bypassed' | 'warning'`.
  * Node click event triggers auto-scrolling to the corresponding configuration card in the left workbench pane.

---

## 5. SEO & Structured Data (JSON-LD) Generator

To rank in the Top 3 for target search keywords (`nginx config generator`, `dockerfile linter`), every tool page must inject Schema.org JSON-LD structured data into the `<head>`:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Nginx Security Hardening Studio",
  "operatingSystem": "Web Browser",
  "applicationCategory": "DeveloperApplication",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "description": "Generate production-ready, security-hardened Nginx configurations with TLS 1.3, HSTS, Rate Limiting, and OWASP security headers 100% in your browser."
}
```

---

## 6. Google AdSense & Affiliate Integration Guidelines

1. **Async Script Injection:**
   * Load `adsbygoogle.js` asynchronously with `strategy="lazyOnload"` or after component mount to protect Core Web Vitals.
2. **Reserved Ad Containers:**
   * Container 1 (Left Sidebar): `min-height: 250px; min-width: 300px;`
   * Container 2 (Editor Bottom): `height: 48px;`
   * Container 3 (SEO Footer): `min-height: 90px;`
3. **Ad-Block Graceful Fallback:**
   * If AdSense fails to load (due to an ad-blocker), display a sleek native developer banner for open-source tools or Pro starter templates.

---

## 7. State Sharing & Deep-Linking Strategy

* **URL Hash Serialization:**
  * Compress tool configuration into a base64/URL-safe string stored in `window.location.hash` (using `lz-string` or native `btoa(JSON.stringify(state))`).
  * Enables zero-database configuration sharing between teammates via direct URL links.

---

## 8. Step-by-Step New Tool Addition Checklist

When implementing or adding a new utility to the suite:
1. [ ] Define the TypeScript state interface in `src/types/<tool-name>.ts`.
2. [ ] Create the AST parser or config generator in `src/engines/<tool-name>/`.
3. [ ] Implement the responsive two-pane UI with Monaco editor & topology graph in `src/components/<tool-name>/`.
4. [ ] Add Schema.org JSON-LD metadata for SEO indexing.
5. [ ] Integrate with Zustand URL hash sync.
6. [ ] Add unit tests verifying config output against standard reference configurations.

---

## 9. Manual Deployment Architecture (S3 -> CloudFront -> Cloudflare)

See [DEPLOYMENT.md](file:///c:/Users/rajes/Downloads/projects/configFiles/DEPLOYMENT.md) for full step-by-step setup:
1. **Local Build:** `npm run build` generates `/dist`.
2. **AWS S3 (Origin):** Private bucket with Origin Access Control (OAC) and Block All Public Access ON.
3. **AWS CloudFront (CDN):** Global edge caching with SPA custom error response (`404` $\rightarrow$ `/index.html` with HTTP `200`).
4. **Cloudflare (Edge Security & DNS):** CNAME proxied (Orange Cloud ON) pointing to CloudFront distribution domain with **SSL Full (Strict)** and Brotli/HTTP/3 enabled.
5. **Manual Sync Commands:**
   ```bash
   aws s3 sync dist/ s3://YOUR_BUCKET --delete --exclude "*.html" --exclude "*.json" --cache-control "public, max-age=31536000, immutable"
   aws s3 sync dist/ s3://YOUR_BUCKET --exclude "*" --include "*.html" --include "*.json" --cache-control "no-cache, no-store, must-revalidate"
   aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
   ```

