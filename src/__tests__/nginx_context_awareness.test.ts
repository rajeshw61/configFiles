import { describe, it, expect } from 'vitest';
import { parseActiveNginxDirectives } from '../engines/nginx/parser';

describe('Nginx Directive Block & Context Awareness Hierarchy', () => {
  // TEST 1 — Separate server blocks must remain separate
  it('TEST 1: isolates directives in separate server blocks with distinct context block IDs', () => {
    const config = `
http {
    server {
        listen 80;
        add_header Strict-Transport-Security "max-age=63072000";
    }

    server {
        listen 443 ssl;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const servers = directives.filter((d) => d.name === 'server' && d.isBlock);
    expect(servers.length).toBe(2);
    expect(servers[0].contextPath).toEqual(['http']);
    expect(servers[1].contextPath).toEqual(['http']);

    // Server 1 directives
    const hstsDirective = directives.find(
      (d) => d.name === 'add_header' && d.args.includes('Strict-Transport-Security')
    );
    expect(hstsDirective).toBeDefined();
    expect(hstsDirective?.context).toBe('server');
    expect(hstsDirective?.contextPath).toEqual(['http', 'server']);

    const listen80 = directives.find((d) => d.name === 'listen' && d.args.includes('80'));
    expect(listen80?.blockId).toBe(hstsDirective?.blockId);

    // Server 2 directives
    const listen443 = directives.find((d) => d.name === 'listen' && d.args.includes('443'));
    expect(listen443).toBeDefined();
    expect(listen443?.context).toBe('server');
    expect(listen443?.blockId).not.toBe(hstsDirective?.blockId);
  });

  // TEST 2 — HTTPS server contains HSTS
  it('TEST 2: associates HSTS directly with the enclosing HTTPS server block context', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header Strict-Transport-Security "max-age=63072000";
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const listenDirective = directives.find((d) => d.name === 'listen' && d.args.includes('443'));
    const hstsDirective = directives.find((d) => d.name === 'add_header');

    expect(listenDirective).toBeDefined();
    expect(hstsDirective).toBeDefined();
    expect(listenDirective?.contextPath).toEqual(['http', 'server']);
    expect(hstsDirective?.contextPath).toEqual(['http', 'server']);
    expect(listenDirective?.blockId).toBe(hstsDirective?.blockId);
  });

  // TEST 3 — HTTP server must not satisfy HTTPS security checks
  it('TEST 3: ensures HTTP server HSTS does not cross-contaminate HTTPS server block', () => {
    const config = `
http {
    server {
        listen 80;
        add_header Strict-Transport-Security "max-age=63072000";
    }

    server {
        listen 443 ssl;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    // Get the blockId of the HTTPS server
    const httpsListen = directives.find((d) => d.name === 'listen' && d.args.includes('443'));
    expect(httpsListen).toBeDefined();
    const httpsBlockId = httpsListen?.blockId;

    // Check all directives belonging to the HTTPS server block
    const httpsDirectives = directives.filter((d) => d.blockId === httpsBlockId);
    const hasHttpsHsts = httpsDirectives.some(
      (d) => d.name === 'add_header' && d.args.includes('Strict-Transport-Security')
    );

    expect(hasHttpsHsts).toBe(false);
  });

  // TEST 4 — Location context
  it('TEST 4: associates directives inside location blocks with http -> server -> location context', () => {
    const config = `
http {
    server {
        listen 443 ssl;

        location / {
            add_header X-Frame-Options "DENY";
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const xFrame = directives.find((d) => d.name === 'add_header' && d.args.includes('X-Frame-Options'));
    expect(xFrame).toBeDefined();
    expect(xFrame?.context).toBe('location');
    expect(xFrame?.contextPath).toEqual(['http', 'server', 'location']);
  });

  // TEST 5 — Nested locations
  it('TEST 5: preserves nested location context path http -> server -> location -> location', () => {
    const config = `
http {
    server {
        location / {
            location /admin {
                add_header X-Frame-Options "DENY";
            }
        }
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const adminHeader = directives.find((d) => d.name === 'add_header');
    expect(adminHeader).toBeDefined();
    expect(adminHeader?.context).toBe('location');
    expect(adminHeader?.contextPath).toEqual(['http', 'server', 'location', 'location']);
  });

  // TEST 6 — Map block
  it('TEST 6: isolates map block directives and ensures subsequent server starts a new sibling context', () => {
    const config = `
http {
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

    server {
        listen 443 ssl;
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const mapBlock = directives.find((d) => d.name === 'map' && d.isBlock);
    expect(mapBlock).toBeDefined();
    expect(mapBlock?.context).toBe('http');
    expect(mapBlock?.contextPath).toEqual(['http']);

    const defaultDirective = directives.find((d) => d.name === 'default');
    expect(defaultDirective?.context).toBe('map');
    expect(defaultDirective?.contextPath).toEqual(['http', 'map']);

    const serverBlock = directives.find((d) => d.name === 'server' && d.isBlock);
    expect(serverBlock?.context).toBe('http');
    expect(serverBlock?.contextPath).toEqual(['http']);

    const listenDirective = directives.find((d) => d.name === 'listen');
    expect(listenDirective?.context).toBe('server');
    expect(listenDirective?.contextPath).toEqual(['http', 'server']);
  });

  // TEST 7 — If block
  it('TEST 7: tracks if block nesting without swallowing subsequent sibling directives', () => {
    const config = `
server {
    if ($request_method = POST) {
        return 405;
    }

    add_header X-Frame-Options "DENY";
}
`;
    const directives = parseActiveNginxDirectives(config);

    const returnDirective = directives.find((d) => d.name === 'return');
    expect(returnDirective?.context).toBe('if');
    expect(returnDirective?.contextPath).toEqual(['server', 'if']);

    const headerDirective = directives.find((d) => d.name === 'add_header');
    expect(headerDirective?.context).toBe('server');
    expect(headerDirective?.contextPath).toEqual(['server']);
  });

  // TEST 8 — Multiple server blocks with different security settings
  it('TEST 8: distinguishes multiple server blocks each retaining its own distinct security directives', () => {
    const config = `
http {
    server {
        listen 443 ssl;
        add_header X-Frame-Options "DENY";
    }

    server {
        listen 443 ssl;
        add_header X-Frame-Options "SAMEORIGIN";
    }
}
`;
    const directives = parseActiveNginxDirectives(config);

    const headers = directives.filter((d) => d.name === 'add_header' && d.args.includes('X-Frame-Options'));
    expect(headers.length).toBe(2);

    expect(headers[0].args).toContain('DENY');
    expect(headers[0].contextPath).toEqual(['http', 'server']);

    expect(headers[1].args).toContain('SAMEORIGIN');
    expect(headers[1].contextPath).toEqual(['http', 'server']);

    // Distinct block instances
    expect(headers[0].blockId).not.toBe(headers[1].blockId);
  });
});
