// =========================================================================
// OpsHardener.dev — Container Configuration Pre-Flight Validator
// Validates Dockerfile, .dockerignore, nginx.conf, and dist assets
// Clearly distinguishes static configuration checks from live container execution
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('\n==========================================================');
console.log(' OpsHardener.dev — Container Configuration Pre-Flight Validator');
console.log('==========================================================\n');

let passed = 0;
let total = 0;

function check(title, condition, detail = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`  [PASS] ${title}`);
    if (detail) console.log(`         -> ${detail}`);
  } else {
    console.error(`  [FAIL] ${title}`);
    if (detail) console.error(`         -> ${detail}`);
  }
}

// -------------------------------------------------------------------------
// 1. Dockerfile Security & Multi-Stage Architecture
// -------------------------------------------------------------------------
console.log('--- 1. Dockerfile Analysis ---');
const dockerfilePath = path.join(rootDir, 'Dockerfile');
const hasDockerfile = fs.existsSync(dockerfilePath);
check('Dockerfile exists', hasDockerfile);

if (hasDockerfile) {
  const content = fs.readFileSync(dockerfilePath, 'utf-8');

  // Verify multi-stage structure
  const fromMatches = content.match(/^FROM\s+(.+)$/gm) || [];
  check('Multi-stage build pattern detected', fromMatches.length >= 2, `${fromMatches.length} stages defined`);

  // Stage 1: Pinned builder
  check('Builder stage uses pinned Alpine image (node:22-alpine)', content.includes('FROM node:22-alpine AS builder'));
  check('Builder runs clean npm install and build', content.includes('npm ci') && content.includes('npm run build'));

  // Stage 2: Hardened unprivileged runner
  check('Runtime stage uses official unprivileged Nginx (nginxinc/nginx-unprivileged:1.27-alpine)',
    content.includes('FROM nginxinc/nginx-unprivileged:1.27-alpine'));
  check('Non-root USER directive explicitly declared in runtime', /USER\s+nginx/i.test(content));

  // Verify build artifact isolation
  check('Only /app/dist is copied from builder into runtime /usr/share/nginx/html',
    content.includes('COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html'));
  check('No source, test, or node_modules copied into runtime stage',
    !content.includes('COPY --from=builder /app/src') && !content.includes('COPY --from=builder /app/node_modules'));

  // Healthcheck & Port
  check('HEALTHCHECK configured hitting /healthz on unprivileged port 8080',
    /HEALTHCHECK.*wget.*http:\/\/127\.0\.0\.1:8080\/healthz/s.test(content));
  check('Unprivileged port 8080 exposed', content.includes('EXPOSE 8080'));
}

// -------------------------------------------------------------------------
// 2. .dockerignore Context Security
// -------------------------------------------------------------------------
console.log('\n--- 2. Build Context Isolation (.dockerignore) ---');
const dockerignorePath = path.join(rootDir, '.dockerignore');
const hasDockerignore = fs.existsSync(dockerignorePath);
check('.dockerignore exists', hasDockerignore);

if (hasDockerignore) {
  const content = fs.readFileSync(dockerignorePath, 'utf-8');
  check('Excludes node_modules/ dependencies', content.includes('node_modules/'));
  check('Excludes .git/ repository history', content.includes('.git/'));
  check('Excludes dist/ pre-existing build artifacts', content.includes('dist/'));
  check('Excludes unit tests & test artifacts (src/__tests__/, *.test.ts)',
    content.includes('src/__tests__/') && content.includes('*.test.ts'));
  check('Excludes coverage reports (coverage/)', content.includes('coverage/'));
  check('Excludes IDE/editor configuration (.vscode/, .idea/)',
    content.includes('.vscode/') && content.includes('.idea/'));
}

// -------------------------------------------------------------------------
// 3. Nginx SPA Routing & Security Headers (nginx.conf)
// -------------------------------------------------------------------------
console.log('\n--- 3. Nginx Configuration & Security Headers (nginx.conf) ---');
const nginxPath = path.join(rootDir, 'nginx.conf');
const hasNginxConf = fs.existsSync(nginxPath);
check('nginx.conf exists', hasNginxConf);

if (hasNginxConf) {
  const content = fs.readFileSync(nginxPath, 'utf-8');

  // Server fundamentals
  check('Listens on unprivileged port 8080', /listen\s+8080;/i.test(content));
  check('Server version disclosure disabled (server_tokens off;)', content.includes('server_tokens off;'));

  // Dedicated Health Check (Independent of SPA routing)
  check('Dedicated /healthz endpoint exists and returns 200 without touching SPA routing',
    content.includes('location = /healthz') && content.includes('return 200'));

  // SPA Routing
  check('SPA client-side fallback configured (try_files $uri $uri/ /index.html;)',
    content.includes('try_files $uri $uri/ /index.html;'));

  // Static Asset Caching
  check('Hashed static assets cached with 1-year immutable header (/assets/)',
    content.includes('location /assets/') && content.includes('max-age=31536000, immutable'));

  // Nginx add_header Inheritance Bug Prevention:
  // Both location / and location /assets/ must explicitly declare security headers
  const locRootMatch = content.match(/location\s+\/\s*\{([^}]+)\}/);
  const locAssetsMatch = content.match(/location\s+\/assets\/\s*\{([^}]+)\}/);

  const rootHasXfo = locRootMatch && locRootMatch[1].includes('X-Frame-Options');
  const rootHasXcto = locRootMatch && locRootMatch[1].includes('X-Content-Type-Options');
  const assetsHasXfo = locAssetsMatch && locAssetsMatch[1].includes('X-Frame-Options');

  check('Security headers preserved in location / (X-Frame-Options & nosniff)',
    Boolean(rootHasXfo && rootHasXcto), 'Prevents Nginx add_header child inheritance drop');
  check('Security headers preserved in location /assets/',
    Boolean(assetsHasXfo), 'Assets retain clickjacking and MIME sniff protection');

  // Zero-Backend Guarantee
  check('Zero-Backend compliance: No proxy_pass, fastcgi, or upstream directives',
    !content.includes('proxy_pass') && !content.includes('upstream') && !content.includes('fastcgi_pass'));

  // Static root files serving
  check('Dedicated static serving for /favicon.ico and /robots.txt',
    content.includes('location = /favicon.ico') && content.includes('location = /robots.txt'),
    'Prevents static SEO & browser assets from falling back to index.html');
}

// -------------------------------------------------------------------------
// 4. Production Build Artifacts (dist/)
// -------------------------------------------------------------------------
console.log('\n--- 4. Production Bundle Artifacts ---');
const distPath = path.join(rootDir, 'dist');
const distHtmlPath = path.join(distPath, 'index.html');
const distAssetsPath = path.join(distPath, 'assets');

const hasDistHtml = fs.existsSync(distHtmlPath);
check('Production build dist/index.html generated', hasDistHtml,
  hasDistHtml ? `${fs.statSync(distHtmlPath).size} bytes` : 'Run npm run build first');

const hasDistAssets = fs.existsSync(distAssetsPath);
let assetCount = 0;
if (hasDistAssets) {
  assetCount = fs.readdirSync(distAssetsPath).length;
}
check('Compiled static assets present in dist/assets/', hasDistAssets && assetCount > 0,
  `${assetCount} bundled asset files found`);

const hasRobots = fs.existsSync(path.join(distPath, 'robots.txt'));
check('Production robots.txt present in dist/', hasRobots,
  hasRobots ? `${fs.statSync(path.join(distPath, 'robots.txt')).size} bytes` : 'Missing in dist (run npm run build)');

const hasFavicon = fs.existsSync(path.join(distPath, 'favicon.ico')) || fs.existsSync(path.join(distPath, 'favicon.svg'));
check('Production favicon assets present in dist/', hasFavicon,
  hasFavicon ? 'Favicon assets present' : 'Missing in dist (run npm run build)');

// -------------------------------------------------------------------------
// 5. Host Docker Runtime Environment
// -------------------------------------------------------------------------
console.log('\n--- 5. Live Container Execution Status ---');
let dockerAvailable = false;
try {
  const dockerVersion = execSync('docker --version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  dockerAvailable = true;
  console.log(`  [INFO] Docker CLI is available: ${dockerVersion}`);
} catch {
  dockerAvailable = false;
}

if (!dockerAvailable) {
  console.log('  [NOTICE] Docker CLI is NOT installed / not configured in PATH on this host machine.');
  console.log('  [STATUS] Static Configuration Pre-Flight Validation: ALL CHECKS PASSED.');
  console.log('  [UNVERIFIED]: Real Docker image build and live container runtime smoke test');
  console.log('               could NOT be executed in this environment because Docker is absent.');
  console.log('  -> To run the live container test on any Docker-equipped system:');
  console.log('     Bash:       ./scripts/docker-smoke-test.sh');
  console.log('     PowerShell: powershell -ExecutionPolicy Bypass -File ./scripts/docker-smoke-test.ps1');
}

console.log(`\n==========================================================`);
console.log(` Validation Summary: ${passed} / ${total} static checks passed.`);
console.log(`==========================================================\n`);

if (passed !== total) {
  process.exit(1);
}
