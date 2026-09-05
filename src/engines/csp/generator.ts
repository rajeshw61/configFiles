import { CspDirectives, CspExportFormat } from '../../types/csp';

export function generateCspString(directives: CspDirectives): string {
  const parts: string[] = [];

  const add = (name: string, values: string[]) => {
    if (values && values.length > 0) {
      parts.push(`${name} ${values.join(' ')}`);
    }
  };

  add('default-src', directives.defaultSrc);
  add('script-src', directives.scriptSrc);
  add('style-src', directives.styleSrc);
  add('img-src', directives.imgSrc);
  add('connect-src', directives.connectSrc);
  add('font-src', directives.fontSrc);
  add('object-src', directives.objectSrc);
  add('frame-ancestors', directives.frameAncestors);
  add('base-uri', directives.baseUri);
  add('form-action', directives.formAction);

  if (directives.upgradeInsecureRequests) {
    parts.push('upgrade-insecure-requests');
  }

  if (directives.blockAllMixedContent) {
    parts.push('block-all-mixed-content');
  }

  return parts.join('; ');
}

export function formatCspOutput(csp: string, format: CspExportFormat): string {
  switch (format) {
    case 'header':
      return `Content-Security-Policy: ${csp}`;
    case 'nginx':
      return `add_header Content-Security-Policy "${csp}" always;`;
    case 'apache':
      return `Header always set Content-Security-Policy "${csp}"`;
    case 'meta':
      return `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
    case 'cloudflare':
      return `// Cloudflare Workers Header Injection
response.headers.set("Content-Security-Policy", "${csp}");`;
    default:
      return csp;
  }
}
