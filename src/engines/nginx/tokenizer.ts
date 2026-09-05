/**
 * Nginx Lexical Tokenizer
 *
 * Scans Nginx configuration syntax into discrete lexical tokens:
 * - Comments (# to end of line)
 * - Quoted Strings (both double "..." and single '...' with escape sequence support)
 * - Unquoted Words / Directives / Arguments
 * - Structural delimiters: '{', '}', ';'
 */

export type NginxTokenType =
  | 'comment'
  | 'string'
  | 'word'
  | 'block_open'
  | 'block_close'
  | 'semicolon';

export interface NginxToken {
  type: NginxTokenType;
  value: string;
  raw: string;
  line: number;
  column: number;
  start: number;
  end: number;
}

export interface TokenizeOptions {
  /** If false, comment tokens are filtered out from the output. Default: true */
  includeComments?: boolean;
}

/**
 * Tokenizes raw Nginx configuration text into an array of lexical tokens.
 */
export function tokenizeNginx(content: string, options: TokenizeOptions = {}): NginxToken[] {
  const { includeComments = true } = options;
  const tokens: NginxToken[] = [];

  if (!content) {
    return tokens;
  }

  const len = content.length;
  let pos = 0;
  let line = 1;
  let column = 1;

  while (pos < len) {
    const char = content[pos];

    // 1. Whitespace handling
    if (char === ' ' || char === '\t' || char === '\r') {
      pos++;
      column++;
      continue;
    }

    if (char === '\n') {
      pos++;
      line++;
      column = 1;
      continue;
    }

    // 2. Comments (# until end of line)
    if (char === '#') {
      const startPos = pos;
      const startLine = line;
      const startCol = column;

      while (pos < len && content[pos] !== '\n') {
        pos++;
        column++;
      }

      const raw = content.slice(startPos, pos);
      const value = raw.startsWith('#') ? raw.slice(1).trimStart() : raw;

      if (includeComments) {
        tokens.push({
          type: 'comment',
          value,
          raw,
          line: startLine,
          column: startCol,
          start: startPos,
          end: pos,
        });
      }
      continue;
    }

    // 3. Structural delimiters: '{', '}', ';'
    if (char === '{') {
      tokens.push({
        type: 'block_open',
        value: '{',
        raw: '{',
        line,
        column,
        start: pos,
        end: pos + 1,
      });
      pos++;
      column++;
      continue;
    }

    if (char === '}') {
      tokens.push({
        type: 'block_close',
        value: '}',
        raw: '}',
        line,
        column,
        start: pos,
        end: pos + 1,
      });
      pos++;
      column++;
      continue;
    }

    if (char === ';') {
      tokens.push({
        type: 'semicolon',
        value: ';',
        raw: ';',
        line,
        column,
        start: pos,
        end: pos + 1,
      });
      pos++;
      column++;
      continue;
    }

    // 4. Quoted Strings ("..." or '...')
    if (char === '"' || char === "'") {
      const quoteChar = char;
      const startPos = pos;
      const startLine = line;
      const startCol = column;

      pos++; // Consume opening quote
      column++;

      let strVal = '';

      while (pos < len) {
        const c = content[pos];

        if (c === '\\') {
          // Escape sequence
          if (pos + 1 < len) {
            const next = content[pos + 1];
            if (next === '\n') {
              // Line continuation
              pos += 2;
              line++;
              column = 1;
              continue;
            }
            strVal += '\\' + next;
            pos += 2;
            column += 2;
            continue;
          } else {
            strVal += '\\';
            pos++;
            column++;
            continue;
          }
        }

        if (c === quoteChar) {
          pos++; // Consume closing quote
          column++;
          break;
        }

        if (c === '\n') {
          strVal += '\n';
          pos++;
          line++;
          column = 1;
          continue;
        }

        strVal += c;
        pos++;
        column++;
      }

      const raw = content.slice(startPos, pos);

      tokens.push({
        type: 'string',
        value: strVal,
        raw,
        line: startLine,
        column: startCol,
        start: startPos,
        end: pos,
      });

      continue;
    }

    // 5. Unquoted Word / Directive / Value
    const startPos = pos;
    const startLine = line;
    const startCol = column;

    while (pos < len) {
      const c = content[pos];

      // Break on whitespace, comment start, structural delimiters, or quotes
      if (
        c === ' ' ||
        c === '\t' ||
        c === '\r' ||
        c === '\n' ||
        c === '#' ||
        c === '{' ||
        c === '}' ||
        c === ';' ||
        c === '"' ||
        c === "'"
      ) {
        break;
      }

      if (c === '\\') {
        // Escaped character in unquoted word
        pos++;
        column++;
        if (pos < len) {
          if (content[pos] === '\n') {
            line++;
            column = 1;
          } else {
            column++;
          }
          pos++;
        }
        continue;
      }

      pos++;
      column++;
    }

    const raw = content.slice(startPos, pos);
    tokens.push({
      type: 'word',
      value: raw,
      raw,
      line: startLine,
      column: startCol,
      start: startPos,
      end: pos,
    });
  }

  return tokens;
}
