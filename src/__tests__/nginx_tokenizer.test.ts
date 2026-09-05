import { describe, it, expect } from 'vitest';
import { tokenizeNginx } from '../engines/nginx/tokenizer';

describe('Nginx Lexical Scanner & Tokenizer', () => {
  // TEST 1 — braces inside quoted string
  it('TEST 1: correctly preserves braces inside quoted string without emitting block tokens', () => {
    const input = 'add_header X-Test "hello { world }";';
    const tokens = tokenizeNginx(input);

    expect(tokens.map((t) => t.type)).toEqual(['word', 'word', 'string', 'semicolon']);
    expect(tokens[0].value).toBe('add_header');
    expect(tokens[1].value).toBe('X-Test');
    expect(tokens[2].value).toBe('hello { world }');
    expect(tokens[2].raw).toBe('"hello { world }"');
    expect(tokens[3].type).toBe('semicolon');

    // Verify no block_open or block_close tokens were emitted
    const blockTokens = tokens.filter((t) => t.type === 'block_open' || t.type === 'block_close');
    expect(blockTokens.length).toBe(0);
  });

  // TEST 2 — semicolon inside quoted string
  it('TEST 2: does not treat semicolon inside quoted string as directive terminator', () => {
    const input = 'add_header X-Test "hello;world";';
    const tokens = tokenizeNginx(input);

    expect(tokens.map((t) => t.type)).toEqual(['word', 'word', 'string', 'semicolon']);
    expect(tokens[2].value).toBe('hello;world');
    expect(tokens[2].raw).toBe('"hello;world"');

    // Only one terminating semicolon token should exist
    const semicolonTokens = tokens.filter((t) => t.type === 'semicolon');
    expect(semicolonTokens.length).toBe(1);
    expect(semicolonTokens[0].column).toBe(32);
  });

  // TEST 3 — braces inside comment
  it('TEST 3: does not treat braces or semicolons inside comments as syntax tokens', () => {
    const input = '# this comment contains { and } and ;';
    const tokens = tokenizeNginx(input);

    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe('comment');
    expect(tokens[0].value).toBe('this comment contains { and } and ;');
    expect(tokens[0].raw).toBe('# this comment contains { and } and ;');

    // Verify zero syntax tokens are emitted
    const syntaxTokens = tokens.filter(
      (t) => t.type === 'block_open' || t.type === 'block_close' || t.type === 'semicolon'
    );
    expect(syntaxTokens.length).toBe(0);
  });

  // TEST 4 — commented-out security directive
  it('TEST 4: identifies commented-out directives as comments, not active directives', () => {
    const input = '# add_header Strict-Transport-Security "max-age=63072000";';
    const tokens = tokenizeNginx(input);

    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe('comment');
    expect(tokens[0].raw).toBe('# add_header Strict-Transport-Security "max-age=63072000";');

    // Active tokens (words, semicolons) should NOT be parsed from comment line
    const activeWords = tokens.filter((t) => t.type === 'word');
    expect(activeWords.length).toBe(0);
  });

  // TEST 5 — escaped quote
  it('TEST 5: handles escaped double quotes inside quoted string without early termination', () => {
    const input = 'add_header X-Test "hello \\"quoted\\" world";';
    const tokens = tokenizeNginx(input);

    expect(tokens.map((t) => t.type)).toEqual(['word', 'word', 'string', 'semicolon']);
    expect(tokens[2].value).toBe('hello \\"quoted\\" world');
    expect(tokens[2].raw).toBe('"hello \\"quoted\\" world"');
    expect(tokens[3].type).toBe('semicolon');
  });

  // TEST 6 — normal block
  it('TEST 6: correctly recognizes block open, block close, words, and semicolons in structured configs', () => {
    const input = `http {
    server {
        listen 443 ssl;
    }
}`;
    const tokens = tokenizeNginx(input);

    const tokenTypes = tokens.map((t) => t.type);
    expect(tokenTypes).toEqual([
      'word',        // http
      'block_open',  // {
      'word',        // server
      'block_open',  // {
      'word',        // listen
      'word',        // 443
      'word',        // ssl
      'semicolon',   // ;
      'block_close', // }
      'block_close', // }
    ]);

    expect(tokens[0].value).toBe('http');
    expect(tokens[0].line).toBe(1);

    expect(tokens[1].type).toBe('block_open');
    expect(tokens[1].line).toBe(1);

    expect(tokens[2].value).toBe('server');
    expect(tokens[2].line).toBe(2);

    expect(tokens[7].type).toBe('semicolon');
    expect(tokens[7].line).toBe(3);

    expect(tokens[8].type).toBe('block_close');
    expect(tokens[8].line).toBe(4);

    expect(tokens[9].type).toBe('block_close');
    expect(tokens[9].line).toBe(5);
  });

  it('handles single-quoted strings with escaped characters', () => {
    const input = "add_header X-Single 'single \\'quoted\\' string';";
    const tokens = tokenizeNginx(input);

    expect(tokens.map((t) => t.type)).toEqual(['word', 'word', 'string', 'semicolon']);
    expect(tokens[2].value).toBe("single \\'quoted\\' string");
    expect(tokens[2].raw).toBe("'single \\'quoted\\' string'");
  });

  it('handles inline comments after directive semicolons', () => {
    const input = 'listen 80; # default HTTP port';
    const tokens = tokenizeNginx(input);

    expect(tokens.map((t) => t.type)).toEqual(['word', 'word', 'semicolon', 'comment']);
    expect(tokens[2].type).toBe('semicolon');
    expect(tokens[3].type).toBe('comment');
    expect(tokens[3].value).toBe('default HTTP port');
  });

  it('supports filtering out comments when includeComments is false', () => {
    const input = `
    # Initial comment
    server_tokens off; # Inline comment
    `;
    const tokens = tokenizeNginx(input, { includeComments: false });

    expect(tokens.map((t) => t.type)).toEqual(['word', 'word', 'semicolon']);
    expect(tokens[0].value).toBe('server_tokens');
    expect(tokens[1].value).toBe('off');
    expect(tokens[2].type).toBe('semicolon');
  });

  it('handles empty and whitespace-only inputs cleanly', () => {
    expect(tokenizeNginx('')).toEqual([]);
    expect(tokenizeNginx('   \n\t  \r\n  ')).toEqual([]);
  });
});
