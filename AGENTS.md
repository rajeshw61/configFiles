# Workspace Agent Rules: DevOps & Cybersecurity Suite

These rules govern all automated modifications, code generations, and architectural decisions within this repository.

---

## 1. Non-Negotiable Architectural Constraints

1. **Zero-Backend Guarantee (100% Client-Side):**
   * Never introduce an external API call, backend endpoint, or server-side telemetry that transmits user-provided configuration code, Dockerfiles, YAML manifests, or domain names.
   * All AST parsing, schema checks, regex evaluations, and file generation must run locally in browser memory via Web Workers or synchronous client-side libraries.
   * Prominently display the client-side privacy shield: `"100% Client-Side: Your code never leaves your browser."`

2. **Zero Cumulative Layout Shift (CLS = 0):**
   * AdSense and partner banner slots must have pre-reserved container heights (`300x250`, `728x90`, `48px` sponsor strip) to guarantee zero layout jumping during page load.

3. **Performance Budget:**
   * Reactive form state changes must update code outputs in `< 16ms`.
   * AST parsing on large files (> 1,000 lines) must be debounced by `150ms`.

---

## 2. Design System & Styling Rules

1. **Design Tokens Compliance:**
   * Always reference CSS variables defined in [DESIGN.md](file:///c:/Users/rajes/Downloads/projects/configFiles/DESIGN.md) (`--bg-canvas`, `--bg-surface`, `--accent-cyan`, `--accent-emerald`, `--accent-rose`).
   * Default theme is obsidian dark mode.
2. **Typography Standards:**
   * `Inter` for UI elements, labels, buttons, and headers.
   * `JetBrains Mono` for all configuration directives, code viewports, and severity tags.

---

## 3. Code Standards & Testing

1. **TypeScript Strictness:**
   * All state models and generator outputs must have explicit TypeScript types. No loose `any` types.
2. **Unit Tests for Generators:**
   * Every config generator (`generateNginxConf`, `generateSecurityHeadersConf`, `generateDockerCompose`) must have unit tests verifying valid syntax against reference fixtures.
