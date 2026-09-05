import React, { useEffect } from 'react';
import { ToolTab } from '../../types/suite';

interface JsonLdProps {
  activeTool: ToolTab;
}

export const JsonLd: React.FC<JsonLdProps> = ({ activeTool }) => {
  useEffect(() => {
    let schemaData = {};

    if (activeTool === 'nginx') {
      schemaData = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Nginx Security Hardening Studio',
        operatingSystem: 'Web Browser',
        applicationCategory: 'DeveloperApplication',
        description:
          'Generate production-ready, hardened Nginx configurations with modern TLS 1.3, HSTS Preload, Rate Limiting, and OWASP security headers 100% in your browser.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      };
    } else if (activeTool === 'dockerfile') {
      schemaData = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Client-Side Dockerfile Security Linter',
        operatingSystem: 'Web Browser',
        applicationCategory: 'DeveloperApplication',
        description:
          'In-browser AST-based Dockerfile security auditor checking for root user execution, hardcoded API secrets, unpinned versions, and bloated layers.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      };
    } else if (activeTool === 'csp') {
      schemaData = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Content Security Policy (CSP) Header Builder',
        operatingSystem: 'Web Browser',
        applicationCategory: 'DeveloperApplication',
        description:
          'Interactive visual Content Security Policy creator with 1-click presets for Google Analytics 4, Stripe, and Sentry.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      };
    }

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schemaData);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [activeTool]);

  return null;
};
