export interface CspDirectives {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  fontSrc: string[];
  objectSrc: string[];
  frameAncestors: string[];
  baseUri: string[];
  formAction: string[];
  upgradeInsecureRequests: boolean;
  blockAllMixedContent: boolean;
}

export type CspExportFormat = 'header' | 'nginx' | 'apache' | 'meta' | 'cloudflare';
