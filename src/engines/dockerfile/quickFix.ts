import { LintIssue } from '../../types/dockerfile';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applyQuickFix(content: string, issue: LintIssue): string {
  const isCrlf = content.includes('\r\n');
  const normalized = isCrlf ? content.replace(/\r\n/g, '\n') : content;

  let fixed = normalized;

  if (issue.patch) {
    const lines = normalized.split('\n');
    const targetIdx = (issue.lineNumber || 1) - 1;

    if (targetIdx >= 0 && targetIdx < lines.length) {
      const line = lines[targetIdx];
      const trimmedLine = line.trim();
      const trimmedFrom = issue.patch.from.trim();

      // 1. Exact match on target line
      if (trimmedLine === trimmedFrom) {
        lines[targetIdx] = issue.patch.to;
        fixed = lines.join('\n');
      } else if (line.includes(issue.patch.from)) {
        // 2. Substring match on target line
        lines[targetIdx] = line.replace(issue.patch.from, issue.patch.to);
        fixed = lines.join('\n');
      } else {
        // 3. Search in small window around target line (for multi-line blocks or small line shifts)
        let matchedWindow = false;
        for (let offset = 1; offset <= 3; offset++) {
          const checkIndices = [targetIdx - offset, targetIdx + offset];
          for (const idx of checkIndices) {
            if (idx >= 0 && idx < lines.length) {
              if (lines[idx].trim() === trimmedFrom) {
                lines[idx] = issue.patch.to;
                fixed = lines.join('\n');
                matchedWindow = true;
                break;
              } else if (lines[idx].includes(issue.patch.from)) {
                lines[idx] = lines[idx].replace(issue.patch.from, issue.patch.to);
                fixed = lines.join('\n');
                matchedWindow = true;
                break;
              }
            }
          }
          if (matchedWindow) break;
        }

        if (!matchedWindow) {
          // Fallback: replace exact standalone line match first to avoid matching inside other instructions
          const standaloneRegex = new RegExp(`(^|\\n)[ \\t]*${escapeRegExp(issue.patch.from)}[ \\t]*(?=\\n|$)`, 'm');
          if (standaloneRegex.test(normalized)) {
            fixed = normalized.replace(standaloneRegex, `$1${issue.patch.to}`);
          } else {
            fixed = normalized.replace(issue.patch.from, issue.patch.to);
          }
        }
      }
    } else {
      const standaloneRegex = new RegExp(`(^|\\n)[ \\t]*${escapeRegExp(issue.patch.from)}[ \\t]*(?=\\n|$)`, 'm');
      if (standaloneRegex.test(normalized)) {
        fixed = normalized.replace(standaloneRegex, `$1${issue.patch.to}`);
      } else {
        fixed = normalized.replace(issue.patch.from, issue.patch.to);
      }
    }
  } else if (issue.ruleCode === 'CK-01') {
    // Missing USER directive -> Append dedicated appuser creation & switch
    fixed = `${normalized.trimEnd()}

# Security: Run container as non-root user
USER 1001
`;
  } else if (issue.ruleCode === 'CK-04') {
    // Missing HEALTHCHECK
    fixed = `${normalized.trimEnd()}

# Healthcheck for automated orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
`;
  } else if (issue.ruleCode === 'CK-03' && issue.snippet) {
    const lines = normalized.split('\n');
    const targetIdx = (issue.lineNumber || 1) - 1;

    if (targetIdx >= 0 && targetIdx < lines.length) {
      let line = lines[targetIdx];
      if (line.includes(':latest')) {
        lines[targetIdx] = line.replace(':latest', ':20-alpine');
        fixed = lines.join('\n');
      } else {
        const match = line.match(/^([ \t]*FROM[ \t]+[^\s:]+)([ \t]+AS[ \t]+.*)?$/i);
        if (match) {
          lines[targetIdx] = `${match[1]}:20-alpine${match[2] || ''}`;
          fixed = lines.join('\n');
        }
      }
    }

    // Fallback if not fixed via lines
    if (fixed === normalized) {
      if (issue.snippet.includes(':latest')) {
        const patchedSnippet = issue.snippet.replace(':latest', ':20-alpine');
        fixed = normalized.replace(issue.snippet, patchedSnippet);
      } else {
        const match = issue.snippet.match(/^(FROM\s+[^\s:]+)(\s+AS\s+.*)?$/i);
        if (match) {
          const patched = `${match[1]}:20-alpine${match[2] || ''}`;
          fixed = normalized.replace(issue.snippet, patched);
        }
      }
    }
  }

  return isCrlf ? fixed.replace(/\n/g, '\r\n') : fixed;
}
