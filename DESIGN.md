# Design System & UI/UX Architecture Specification

**Project:** DevOps & Cybersecurity Web Utilities Suite  
**Target Audience:** SREs, DevOps Engineers, Cloud Architects, Security Analysts, Full-Stack Developers  
**Design Philosophy:** "Hyper-functional, Cyber-hardened, Zero-latency" — Engineered like high-performance developer tooling (e.g., Vercel, Linear, Cloudflare, Raycast, GitHub).

---

## 1. Visual Theme & Aesthetics

### 1.1 Aesthetic Pillars
* **Dark-Mode First:** Deep obsidian surfaces with subtle blue/slate tints, razor-sharp high-contrast code displays, and vivid neon accent indicators.
* **Glassmorphism & Micro-Depth:** Translucent backdrop blur (`backdrop-filter: blur(12px)`) on toolbars, floating toast notifications, and drawer panels over subtle grid background patterns.
* **Precision Typography:** Monospace for all configuration tokens, ports, IP directives, and code blocks; ultra-clean sans-serif for UI labels and configuration controls.
* **Zero Layout Shift:** Rigid split-pane workbench layouts with fluid resizing, sticky action docks, and zero cumulative layout shift (CLS = 0).

---

## 2. Color Palette & Design Tokens

### 2.1 Color Tokens (CSS Variables)

```css
:root {
  /* Surface & Background (Obsidian & Slate) */
  --bg-canvas: #090d16;          /* Deepest background */
  --bg-subtle: #0e1424;          /* Secondary card/panel background */
  --bg-surface: #141d33;         /* Interactive surfaces & containers */
  --bg-surface-hover: #1c2744;   /* Hover state for buttons/cards */
  --bg-glass: rgba(14, 20, 36, 0.75); /* Glassmorphic overlays */
  
  /* Borders & Dividers */
  --border-subtle: #1e293b;       /* Card & section dividers */
  --border-focus: #38bdf8;        /* Active focus ring */
  --border-glow: rgba(56, 189, 248, 0.25); /* Subtle cyber glow */

  /* Text & Foreground */
  --text-primary: #f8fafc;        /* High-contrast headings and active values */
  --text-secondary: #94a3b8;      /* Form labels, descriptions */
  --text-muted: #64748b;          /* Placeholders, disabled states */
  --text-inverse: #020617;        /* Text on bright badges */

  /* Brand Accents */
  --accent-cyan: #06b6d4;         /* Primary brand accent */
  --accent-cyan-glow: #22d3ee;
  --accent-indigo: #6366f1;       /* Secondary gradient tone */
  --accent-emerald: #10b981;      /* Success, valid syntax, production-grade */
  --accent-amber: #f59e0b;        /* Warnings, security recommendations */
  --accent-rose: #f43f5e;         /* Critical vulnerabilities, syntax errors */
  --accent-purple: #a855f7;       /* Pro features, custom directives */

  /* Code Syntax & Editor Theme */
  --editor-bg: #070a12;
  --editor-gutter: #111827;
  --editor-line-highlight: #172033;

  /* Elevation & Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 20px -2px rgba(6, 182, 212, 0.25);
  --shadow-glow-rose: 0 0 20px -2px rgba(244, 63, 94, 0.3);
}
```

---

## 3. Typography Hierarchy

| Role | Font Family | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Heading (H1)** | `Inter`, sans-serif | `1.875rem (30px)` | 700 / Bold | 1.2 | Main Tool Header & Hero |
| **Section Heading (H2)** | `Inter`, sans-serif | `1.25rem (20px)` | 600 / SemiBold | 1.3 | Config Group Titles, Results Pane |
| **Sub-header (H3)** | `Inter`, sans-serif | `1.0rem (16px)` | 600 / SemiBold | 1.4 | Card Titles, Preset Categories |
| **Body (UI)** | `Inter`, sans-serif | `0.875rem (14px)`| 400 / Normal | 1.5 | Form Inputs, Descriptions, Tooltips |
| **Monospace / Code** | `JetBrains Mono`, monospace | `0.8125rem (13px)`| 400 / 500 | 1.6 | Monaco Editor, Tokens, Directives |
| **Badges & Tags** | `JetBrains Mono`, monospace | `0.75rem (12px)` | 600 / SemiBold | 1.0 | Severity Badges, Port Tags, Protocols |

---

## 4. UI Architecture & Layout Grid

```
+-----------------------------------------------------------------------------------------+
| [LOGO] OpsHardener.dev   | [Tools Dropdown] | [Privacy Badge: 100% Client-Side] | [GitHub] |
+-----------------------------------------------------------------------------------------+
|  SIDEBAR NAV       |  WORKBENCH CONFIGURATION (Left)  |  LIVE MONACO PREVIEW & AUDIT (Right) |
|                    |                                  |                                     |
|  * Nginx Studio    |  [Preset Selector: Full-Stack]   |  +-------------------------------+  |
|  * Docker Linter   |                                  |  | [nginx.conf] [docker-compose] |  |
|  * CSP Builder     |  > SSL / TLS Hardening (TLS 1.3) |  |                               |  |
|  * K8s Validator   |  > Rate Limiting (DDoS Shield)   |  |  server {                     |  |
|  * Header Checker  |  > Security Headers (OWASP Top)  |  |    listen 443 ssl http2;      |  |
|                    |  > Reverse Proxy & WebSockets    |  |    ssl_protocols TLSv1.3;     |  |
|  ----------------- |  > Gzip / Brotli Compression     |  |    ...                        |  |
|  [Security Score]  |                                  |  +-------------------------------+  |
|  [Pro Templates]   |  [Generate Production Config]    |  | Copy | Download | Share (URL) |  |
+-----------------------------------------------------------------------------------------+
|  FOOTER: Zero-Telemetry Guarantee | Fast Edge CDN | SEO Structured Links | FAQ & Guides   |
+-----------------------------------------------------------------------------------------+
```

### 4.2 Code Viewport & Visualizer Tabs
* **Multi-Tab Workbench Viewport:**
  1. `⚙️ nginx.conf`: Formatted monolithic or modular Nginx server block.
  2. `🔒 security-headers.conf`: OWASP Top 10 recommended HTTP headers.
  3. `🐳 docker-compose.yml`: Containerized production deployment stack.
  4. `🗺️ Config Architecture Visualizer`: **Interactive Traffic Flow & Topology Diagram** visually mapping the request pipeline:
     * **Client Request** $\rightarrow$ **SSL/TLS 1.3 Termination** $\rightarrow$ **Rate Limiting (Leaky Bucket)** $\rightarrow$ **OWASP Header Injection** $\rightarrow$ **Reverse Proxy / Upstream Service**.
     * Visual status pills on each node indicating whether that security layer is active (green) or bypassed (amber).
     * Interactive clickable nodes that highlight the corresponding controls in the left configuration pane.


---

## 5. Component Design Standards

### 5.1 Interactive Toggles & Form Controls
* **Cyber Switches:** Custom toggle switches with subtle cyan glow on active state and smooth 150ms spring transitions.
* **Segmented Radio Buttons:** Sleek pill-shaped selectors for exclusive options (e.g., `TLS 1.3 Only` vs. `TLS 1.2 + 1.3 (Intermediate)`).
* **Number Inputs with Steppers:** For rate limits, burst sizes, timeouts, and buffer sizes with built-in unit badges (`req/s`, `MB`, `ms`).

### 5.2 Severity Badges & Audit Cards
```
[ CRITICAL ] - High-risk misconfiguration (e.g., Dockerfile running as root, missing HSTS)
  Color: #f43f5e (Rose) | Background: rgba(244, 63, 94, 0.12) | Border: rgba(244, 63, 94, 0.3)

[ WARNING ]  - Performance or sub-optimal security (e.g., missing gzip for SVGs, CSP missing frame-ancestors)
  Color: #f59e0b (Amber) | Background: rgba(245, 158, 11, 0.12) | Border: rgba(245, 158, 11, 0.3)

[ OPTIMAL ]  - Hardened & production-grade
  Color: #10b981 (Emerald) | Background: rgba(16, 185, 129, 0.12) | Border: rgba(16, 185, 129, 0.3)
```

### 5.3 Micro-Animations & Feedback
* **Copy Button:** On click, changes icon from `Copy` to `Check`, flashes a green border pulse, and displays a temporary tooltip: `"Copied to clipboard!"`.
* **Security Score Dial:** Animated circular SVG gauge that updates smoothly from 0 to 100 with dynamic color shift (Red -> Yellow -> Green).
* **Linter Code Gutter:** Red/Yellow squiggly underlines in Monaco editor with rich hover tooltips explaining the security risk and 1-click `"Quick Fix"`.

---

## 7. Monetization & Ad Placement Architecture (Google AdSense / Carbon Ads / Affiliates)

To maximize RPM ($15 – $40+ in DevOps) without sacrificing user experience or developer trust, three dedicated, non-intrusive ad zones are engineered directly into the layout:

### 7.1 Ad Zone 1: Left Workbench Native Display (High CTR)
* **Location:** Embedded in the left configuration stream (either pinned at the bottom of the controls pane or between Section Cards).
* **Ad Format:** `300x250` (Medium Rectangle) / `336x280` (Large Rectangle) or Responsive In-Feed Native AdSense Unit.
* **Styling:** Wrapped in a subtle bordered glass card with a clean `"SPONSORED / AD"` micro-tag so it blends naturally into the developer theme.

### 7.2 Ad Zone 2: Editor Bottom Sponsor Strip / Affiliate Bar
* **Location:** Directly below the Monaco code editor pane / above the terminal dock.
* **Ad Format:** Contextual text/pill banner (e.g. *"🚀 Deploy this Nginx config to DigitalOcean with $200 free credit"* or AdSense text link unit).
* **Dimensions:** Fluid width x `48px` - `60px` height.

### 7.3 Ad Zone 3: Below-the-Fold SEO & Documentation Leaderboard
* **Location:** Between the interactive workbench and the SEO FAQ / How-To documentation section below.
* **Ad Format:** `728x90` Leaderboard or Responsive Display Banner / AdSense Multiplex Grid.
* **Target Audience:** Organic search visitors scrolling through configuration guides and explanations.

---

## 8. Performance & SEO Guidelines

1. **Sub-50ms Interaction (Zero Lag):** AST parsing and code generation debounced at `<16ms` (single frame budget) to prevent any UI stutter.
2. **Ad Script Lazy-Loading:** Load AdSense / Carbon Ads asynchronously after main thread hydration to ensure 100/100 Google Lighthouse Core Web Vitals score.
3. **Accessible (WCAG AA):** Minimum 4.5:1 contrast ratio on all text elements and full keyboard navigation support (`Tab`, `Enter`, `Escape`).
4. **Core Web Vitals:**
   * **LCP (Largest Contentful Paint):** < 1.0s (all static assets pre-bundled).
   * **FID / INP (Interaction to Next Paint):** < 50ms.
   * **CLS (Cumulative Layout Shift):** 0 (Ad containers reserved with fixed min-heights to prevent layout jumps).

