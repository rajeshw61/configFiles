import { CspDirectives } from '../../types/csp';

export interface CspPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  directives: Partial<CspDirectives>;
}

export const CSP_PRESETS: CspPreset[] = [
  {
    id: 'strict-zero-trust',
    name: 'Strict Zero-Trust (Default)',
    badge: '🔒 MAXIMUM SECURITY',
    description: 'Restricts script, styles, and assets exclusively to origin (self).',
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: true,
    },
  },
  {
    id: 'saas-analytics',
    name: 'Full SaaS (GA4, Stripe & Sentry)',
    badge: '🚀 SAAS PRESET',
    description: 'Includes origins for Google Analytics, Stripe Payments, Sentry, and Google Fonts.',
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://www.googletagmanager.com', 'https://js.stripe.com', 'https://browser.sentry-cdn.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'https://www.google-analytics.com'],
      connectSrc: ["'self'", 'https://api.stripe.com', 'https://*.sentry.io', 'https://www.google-analytics.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: true,
    },
  },
  {
    id: 'spa-dynamic',
    name: 'Modern Single-Page App (React / Vite)',
    badge: '⚡ SPA PRESET',
    description: 'Permits inline styles and WebSocket connections for client-side single-page apps.',
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: true,
    },
  },
];
