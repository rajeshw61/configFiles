import { describe, it, expect } from 'vitest';
import { parseActiveNginxDirectives, validateNginxSyntax } from '../engines/nginx/parser';

describe('Nginx Active Directive Parser Robustness & Patterns', () => {
  // TEST 1 — Quoted variables and semicolons
  it('TEST 1: correctly parses log_format with quoted variables and internal quotes/semicolons', () => {
    const config = `
http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request"';
}
`;
    const directives = parseActiveNginxDirectives(config);

    const logFormat = directives.find((d) => d.name === 'log_format');
    expect(logFormat).toBeDefined();
    expect(logFormat?.isBlock).toBe(false);
    expect(logFormat?.args[0]).toBe('main');
    expect(logFormat?.args[1]).toBe('$remote_addr - $remote_user [$time_local] "$request"');
    expect(logFormat?.args.length).toBe(2);

    expect(validateNginxSyntax(config).length).toBe(0);
  });

  // TEST 2 — Complex quoted value
  it('TEST 2: parses complex quoted CSP strings containing semicolons as single directive', () => {
    const config = `
server {
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://example.com";
}
`;
    const directives = parseActiveNginxDirectives(config);
    const cspDirective = directives.find(
      (d) => d.name === 'add_header' && d.args.includes('Content-Security-Policy')
    );

    expect(cspDirective).toBeDefined();
    expect(cspDirective?.args.length).toBe(2);
    expect(cspDirective?.args[1]).toBe("default-src 'self'; script-src 'self' https://example.com");
    expect(cspDirective?.isBlock).toBe(false);
  });

  // TEST 3 — Multiline directive
  it('TEST 3: correctly combines multiline directive into one active directive', () => {
    const config = `
server {
    add_header Content-Security-Policy
        "default-src 'self'; script-src 'self'";
}
`;
    const directives = parseActiveNginxDirectives(config);
    const headerDirectives = directives.filter((d) => d.name === 'add_header');

    expect(headerDirectives.length).toBe(1);
    expect(headerDirectives[0].args[0]).toBe('Content-Security-Policy');
    expect(headerDirectives[0].args[1]).toBe("default-src 'self'; script-src 'self'");
    expect(headerDirectives[0].isBlock).toBe(false);
  });

  // TEST 4 — Block directive (map)
  it('TEST 4: recognizes map block construct and separates inner directives without corruption', () => {
    const config = `
http {
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const mapDirective = directives.find((d) => d.name === 'map');
    expect(mapDirective).toBeDefined();
    expect(mapDirective?.isBlock).toBe(true);
    expect(mapDirective?.args).toEqual(['$http_upgrade', '$connection_upgrade']);

    const defaultDirective = directives.find((d) => d.name === 'default');
    expect(defaultDirective).toBeDefined();
    expect(defaultDirective?.args).toEqual(['upgrade']);
    expect(defaultDirective?.isBlock).toBe(false);

    const emptyStrDirective = directives.find((d) => d.args.includes('close'));
    expect(emptyStrDirective).toBeDefined();
    expect(emptyStrDirective?.isBlock).toBe(false);
  });

  // TEST 5 — if block
  it('TEST 5: correctly parses if block structure and maintains inner directives', () => {
    const config = `
server {
    if ($request_method = POST) {
        return 405;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const ifDirective = directives.find((d) => d.name === 'if');
    expect(ifDirective).toBeDefined();
    expect(ifDirective?.isBlock).toBe(true);
    expect(ifDirective?.rawArgs).toContain('$request_method');

    const returnDirective = directives.find((d) => d.name === 'return');
    expect(returnDirective).toBeDefined();
    expect(returnDirective?.args).toEqual(['405']);
    expect(returnDirective?.isBlock).toBe(false);

    expect(validateNginxSyntax(config).length).toBe(0);
  });

  // TEST 6 — location block with modifiers
  it('TEST 6: correctly parses location block with regex modifiers without token corruption', () => {
    const config = `
server {
    location ~* \\.(jpg|jpeg|png)$ {
        expires 7d;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const locDirective = directives.find((d) => d.name === 'location');
    expect(locDirective).toBeDefined();
    expect(locDirective?.isBlock).toBe(true);
    expect(locDirective?.args).toContain('~*');
    expect(locDirective?.rawArgs).toContain('\\.(jpg|jpeg|png)$');

    const expiresDirective = directives.find((d) => d.name === 'expires');
    expect(expiresDirective).toBeDefined();
    expect(expiresDirective?.args).toEqual(['7d']);
    expect(expiresDirective?.isBlock).toBe(false);
  });

  // TEST 7 — Inline comment after directive
  it('TEST 7: ignores inline comment after directive without generating extra directives', () => {
    const config = `
server {
    add_header X-Test "hello world"; # this is a comment
    server_tokens off;
}
`;
    const directives = parseActiveNginxDirectives(config);

    const activeNames = directives.map((d) => d.name);
    expect(activeNames).toEqual(['server', 'add_header', 'server_tokens']);

    const addHeader = directives.find((d) => d.name === 'add_header');
    expect(addHeader?.args).toEqual(['X-Test', 'hello world']);
    expect(addHeader?.isBlock).toBe(false);

    const serverTokens = directives.find((d) => d.name === 'server_tokens');
    expect(serverTokens?.args).toEqual(['off']);
    expect(serverTokens?.isBlock).toBe(false);
  });

  // TEST 8 — Hash character inside quoted value
  it('TEST 8: does not treat hash character inside quoted value as comment start', () => {
    const config = `
server {
    add_header X-Test "foo#bar";
}
`;
    const directives = parseActiveNginxDirectives(config);

    const addHeader = directives.find((d) => d.name === 'add_header');
    expect(addHeader).toBeDefined();
    expect(addHeader?.args).toEqual(['X-Test', 'foo#bar']);
    expect(addHeader?.isBlock).toBe(false);
  });

  // TEST 9 — Include with wildcard
  it('TEST 9: preserves wildcard paths in include directives', () => {
    const config = `
http {
    include conf.d/*.conf;
}
`;
    const directives = parseActiveNginxDirectives(config);

    const includeDirective = directives.find((d) => d.name === 'include');
    expect(includeDirective).toBeDefined();
    expect(includeDirective?.args).toEqual(['conf.d/*.conf']);
    expect(includeDirective?.isBlock).toBe(false);
  });

  // TEST 10 — Multiple directives on one line
  it('TEST 10: separates multiple directives written on a single line', () => {
    const config = 'server { listen 80; server_tokens off; }';
    const directives = parseActiveNginxDirectives(config);

    expect(directives.length).toBe(3);

    expect(directives[0].name).toBe('server');
    expect(directives[0].isBlock).toBe(true);

    expect(directives[1].name).toBe('listen');
    expect(directives[1].args).toEqual(['80']);
    expect(directives[1].isBlock).toBe(false);

    expect(directives[2].name).toBe('server_tokens');
    expect(directives[2].args).toEqual(['off']);
    expect(directives[2].isBlock).toBe(false);
  });
});
