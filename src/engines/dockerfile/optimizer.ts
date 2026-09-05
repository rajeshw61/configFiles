export interface OptimizationResult {
  optimizedContent: string;
  optimizationsApplied: string[];
  estimatedSavings: string;
  originalLayers: number;
  optimizedLayers: number;
}

const INSTRUCTION_REGEX = /^[ \t]*(?:FROM|RUN|COPY|ADD|WORKDIR|USER|EXPOSE|HEALTHCHECK|CMD|ENTRYPOINT|ENV|ARG|VOLUME|STOPSIGNAL|ONBUILD)[ \t]+/im;

function countDockerInstructions(content: string): number {
  let count = 0;
  let inContinuation = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (inContinuation) {
      if (!line.endsWith('\\')) {
        inContinuation = false;
      }
      continue;
    }

    if (INSTRUCTION_REGEX.test(line)) {
      count++;
      if (line.endsWith('\\')) {
        inContinuation = true;
      }
    }
  }

  return count;
}

interface LogicalBlock {
  raw: string;
  type: string; // 'RUN', 'FROM', 'COPY', etc., or 'COMMENT', 'EMPTY', 'OTHER'
  isInstruction: boolean;
}

/**
 * Parses Dockerfile lines into logical multi-line blocks, preserving line continuations (\)
 */
function parseLogicalBlocks(content: string): LogicalBlock[] {
  const lines = content.split('\n');
  const blocks: LogicalBlock[] = [];

  let currentLines: string[] = [];
  let inContinuation = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inContinuation) {
      if (!trimmed) {
        blocks.push({ raw: line, type: 'EMPTY', isInstruction: false });
        continue;
      }
      if (trimmed.startsWith('#')) {
        blocks.push({ raw: line, type: 'COMMENT', isInstruction: false });
        continue;
      }

      currentLines = [line];
      if (trimmed.endsWith('\\')) {
        inContinuation = true;
      } else {
        const firstWord = trimmed.split(/\s+/)[0].toUpperCase();
        blocks.push({ raw: line, type: firstWord, isInstruction: true });
        currentLines = [];
      }
    } else {
      currentLines.push(line);
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      if (!trimmed.endsWith('\\')) {
        inContinuation = false;
        const fullRaw = currentLines.join('\n');
        const firstWord = currentLines[0].trim().split(/\s+/)[0].toUpperCase();
        blocks.push({ raw: fullRaw, type: firstWord, isInstruction: true });
        currentLines = [];
      }
    }
  }

  if (currentLines.length > 0) {
    const fullRaw = currentLines.join('\n');
    const firstWord = currentLines[0].trim().split(/\s+/)[0].toUpperCase();
    blocks.push({ raw: fullRaw, type: firstWord, isInstruction: true });
  }

  return blocks;
}

/**
 * Optimizes, hardens, and shrinks a Dockerfile in-place.
 */
export function optimizeDockerfile(content: string): OptimizationResult {
  if (!content || !content.trim()) {
    return {
      optimizedContent: '',
      optimizationsApplied: [],
      estimatedSavings: '0 MB',
      originalLayers: 0,
      optimizedLayers: 0,
    };
  }

  const isCrlf = content.includes('\r\n');
  const normalized = isCrlf ? content.replace(/\r\n/g, '\n') : content;

  const optimizationsApplied: string[] = [];
  const originalLayers = countDockerInstructions(normalized);
  const blocks = parseLogicalBlocks(normalized);

  const processedBlocks: string[] = [];
  let pendingRunBlocks: string[] = [];

  const flushRuns = () => {
    if (pendingRunBlocks.length === 0) return;

    if (pendingRunBlocks.length === 1) {
      let singleRun = pendingRunBlocks[0];
      // Check if apt-get install is present without cache cleanup
      if (singleRun.includes('apt-get install') && !singleRun.includes('rm -rf /var/lib/apt/lists')) {
        if (!singleRun.includes('--no-install-recommends')) {
          singleRun = singleRun.replace(/apt-get\s+install(\s+-y)?/i, 'apt-get install -y --no-install-recommends');
        }
        singleRun = `${singleRun.trimEnd()} && rm -rf /var/lib/apt/lists/*`;
        optimizationsApplied.push('Appended --no-install-recommends & cleaned /var/lib/apt/lists/*');
      }
      processedBlocks.push(singleRun);
    } else {
      // Merge multiple distinct RUN instructions into a single chained RUN layer
      const cleanedCmds = pendingRunBlocks.map((r, idx) => {
        // Strip leading "RUN" keyword
        let cmd = r.replace(/^[ \t]*RUN[ \t]+/i, '').trim();

        // Add non-interactive flag if needed
        if (cmd.includes('apt-get install') && !cmd.includes('--no-install-recommends')) {
          cmd = cmd.replace(/apt-get\s+install(\s+-y)?/i, 'apt-get install -y --no-install-recommends');
        }
        if (idx === pendingRunBlocks.length - 1 && cmd.includes('apt-get') && !cmd.includes('rm -rf /var/lib/apt/lists')) {
          cmd = `${cmd} && rm -rf /var/lib/apt/lists/*`;
        }
        return cmd;
      });

      processedBlocks.push(`RUN ${cleanedCmds.join(' && \\\n    ')}`);
      optimizationsApplied.push(`Consolidated ${pendingRunBlocks.length} consecutive RUN commands into single layer`);
    }

    pendingRunBlocks = [];
  };

  const declaredStageAliases = new Set<string>();

  for (const block of blocks) {
    if (block.type === 'RUN') {
      pendingRunBlocks.push(block.raw);
      continue;
    }

    // Flush any pending consecutive RUNs before non-RUN instructions
    flushRuns();

    let blockText = block.raw;

    // 1. Optimize FROM: pin unpinned or :latest images (excluding local stage aliases)
    if (block.type === 'FROM') {
      const fromMatch = blockText.match(/^[ \t]*FROM[ \t]+(?:--platform=[^\s]+\s+)?([^\s\r\n]+)([ \t]+AS[ \t]+[^\s\r\n]+)?/im);
      if (fromMatch) {
        const fullImageRef = fromMatch[1];
        const asPart = fromMatch[2] || '';

        // Register stage alias if present
        const aliasMatch = asPart.match(/^[ \t]+AS[ \t]+([^\s\r\n]+)/i);
        if (aliasMatch) {
          declaredStageAliases.add(aliasMatch[1].toLowerCase());
        }

        // Check if image is already pinned or is a local stage alias
        const isLocalAlias = declaredStageAliases.has(fullImageRef.toLowerCase());
        const isDigest = fullImageRef.includes('@sha256:');
        const hasTag = fullImageRef.includes(':');
        const isLatest = fullImageRef.endsWith(':latest');
        const isScratch = fullImageRef.toLowerCase() === 'scratch';

        if (!isLocalAlias && !isDigest && !isScratch && (!hasTag || isLatest)) {
          const baseRaw = isLatest ? fullImageRef.replace(':latest', '') : fullImageRef;
          const baseLower = baseRaw.toLowerCase();

          let pinnedTag = '20-alpine';
          if (baseLower.includes('python')) pinnedTag = '3.11-slim';
          else if (baseLower.includes('golang') || baseLower === 'go') pinnedTag = '1.22-alpine';
          else if (baseLower.includes('node')) pinnedTag = '20-alpine';
          else if (baseLower.includes('nginx')) pinnedTag = '1.25-alpine';
          else if (baseLower.includes('ubuntu')) pinnedTag = '22.04';
          else if (baseLower.includes('ruby')) pinnedTag = '3.2-alpine';
          else if (baseLower.includes('alpine')) pinnedTag = '3.19';
          else pinnedTag = 'alpine';

          const newImage = `${baseRaw}:${pinnedTag}`;
          blockText = `FROM ${newImage}${asPart}`;
          optimizationsApplied.push(`Pinned base image to minimal footprint [${newImage}]`);
        }
      }
    }

    // 2. Convert ADD to COPY where not fetching remote URL or tar archive
    if (block.type === 'ADD') {
      const addMatch = blockText.match(/^[ \t]*ADD[ \t]+(?!http)(?!.*\.tar\.)([^\r\n]+)/im);
      if (addMatch) {
        blockText = blockText.replace(/^[ \t]*ADD[ \t]+/i, 'COPY ');
        optimizationsApplied.push('Replaced insecure ADD directive with predictable COPY');
      }
    }

    processedBlocks.push(blockText);
  }

  // Flush any trailing RUNs at EOF
  flushRuns();

  let updated = processedBlocks.join('\n');

  // Determine final stage boundary in multi-stage builds
  const fromMatches = [...updated.matchAll(/^[ \t]*FROM[ \t]+/gim)];
  const finalStageOffset = fromMatches.length > 0 ? fromMatches[fromMatches.length - 1].index! : 0;
  const finalStageContent = updated.slice(finalStageOffset);

  // 3. Enforce non-root USER in final runtime stage before CMD/ENTRYPOINT or at EOF
  const hasUser = /^[ \t]*USER[ \t]+(?!root\b)[^\r\n]+/im.test(finalStageContent);
  if (!hasUser) {
    const finalCmdMatch = finalStageContent.search(/^[ \t]*(?:CMD|ENTRYPOINT)[ \t]+/im);
    const userBlock = `\n# Security: Enforce non-root execution identity (UID 10001)\nUSER 10001\n`;

    if (finalCmdMatch !== -1) {
      const insertionPoint = finalStageOffset + finalCmdMatch;
      updated = updated.slice(0, insertionPoint) + userBlock + '\n' + updated.slice(insertionPoint);
    } else {
      updated = `${updated.trimEnd()}\n${userBlock}`;
    }
    optimizationsApplied.push('Enforced non-root user (UID 10001) for least-privilege security');
  }

  // Recalculate final stage boundary after USER insertion
  const updatedFromMatches = [...updated.matchAll(/^[ \t]*FROM[ \t]+/gim)];
  const updatedFinalOffset = updatedFromMatches.length > 0 ? updatedFromMatches[updatedFromMatches.length - 1].index! : 0;
  const updatedFinalContent = updated.slice(updatedFinalOffset);

  // 4. Inject automated HEALTHCHECK in final runtime stage if missing
  const hasHealthcheck = /^[ \t]*HEALTHCHECK[ \t]+/im.test(updatedFinalContent);
  if (!hasHealthcheck) {
    const finalCmdMatch = updatedFinalContent.search(/^[ \t]*(?:CMD|ENTRYPOINT)[ \t]+/im);
    const healthcheckBlock = `\n# Container healthcheck for automated orchestration\nHEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\\n  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1\n`;

    if (finalCmdMatch !== -1) {
      const insertionPoint = updatedFinalOffset + finalCmdMatch;
      updated = updated.slice(0, insertionPoint) + healthcheckBlock + '\n' + updated.slice(insertionPoint);
    } else {
      updated = `${updated.trimEnd()}\n${healthcheckBlock}`;
    }
    optimizationsApplied.push('Injected automated HEALTHCHECK for container reliability');
  }

  const optimizedLayers = countDockerInstructions(updated);
  const estimatedSavings = optimizationsApplied.length > 0 ? `~${Math.max(1, optimizationsApplied.length) * 45} MB` : '0 MB';

  return {
    optimizedContent: isCrlf ? updated.replace(/\n/g, '\r\n') : updated,
    optimizationsApplied,
    estimatedSavings,
    originalLayers,
    optimizedLayers,
  };
}
