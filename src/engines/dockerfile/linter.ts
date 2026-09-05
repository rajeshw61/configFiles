import { DockerfileAuditResult, LintIssue } from '../../types/dockerfile';
import {
  parseDockerStages,
  resolveCopyFromReference,
  isExternalImageReference,
  evaluateStageUser,
  isRootIdentity,
  resolveVariable,
  SENSITIVE_FILE_PATTERNS,
  isObviousPlaceholder,
  DockerStage,
  DockerfileStageAnalysis,
  FromReferenceResolution,
  EffectiveUserAnalysis,
} from './stages';

export {
  parseDockerStages,
  resolveCopyFromReference,
  isExternalImageReference,
  evaluateStageUser,
  isRootIdentity,
  resolveVariable,
  SENSITIVE_FILE_PATTERNS,
  isObviousPlaceholder,
};
export type {
  DockerStage,
  DockerfileStageAnalysis,
  FromReferenceResolution,
  EffectiveUserAnalysis,
};

const VALID_INSTRUCTIONS = new Set([
  'FROM',
  'RUN',
  'CMD',
  'LABEL',
  'EXPOSE',
  'ENV',
  'ADD',
  'COPY',
  'ENTRYPOINT',
  'VOLUME',
  'USER',
  'WORKDIR',
  'ARG',
  'ONBUILD',
  'STOPSIGNAL',
  'HEALTHCHECK',
  'SHELL',
  'MAINTAINER',
]);

const COMMON_TYPOS: Record<string, string> = {
  FORM: 'FROM',
  COP: 'COPY',
  CPY: 'COPY',
  RUM: 'RUN',
  RN: 'RUN',
  RUNN: 'RUN',
  EXPOS: 'EXPOSE',
  EXPO: 'EXPOSE',
  WORK: 'WORKDIR',
  WORK_DIR: 'WORKDIR',
  DIR: 'WORKDIR',
  ENV_VAR: 'ENV',
  ENVIRONMENT: 'ENV',
  ENTRY: 'ENTRYPOINT',
  HEALTH: 'HEALTHCHECK',
  HEALTH_CHECK: 'HEALTHCHECK',
  VOL: 'VOLUME',
  LABAL: 'LABEL',
};

const COMMON_SHELL_COMMANDS = new Set([
  'apt',
  'apt-get',
  'yum',
  'apk',
  'npm',
  'yarn',
  'pnpm',
  'pip',
  'pip3',
  'python',
  'python3',
  'node',
  'git',
  'cd',
  'mkdir',
  'echo',
  'cat',
  'curl',
  'wget',
  'sed',
  'chmod',
  'chown',
  'export',
  'mv',
  'rm',
  'tar',
  'bash',
  'sh',
  'make',
  'go',
  'cargo',
  'bundle',
]);

export interface ParsedInstruction {
  raw: string;
  startLine: number;
  endLine: number;
  instruction: string;
  args: string;
}

/**
 * Splits Dockerfile content into logical instructions, correctly tracking
 * multi-line line continuations (trailing backslashes), comments inside continuations,
 * trailing whitespace after backslashes, and accurate line numbering.
 */
export function parseInstructions(content: string): ParsedInstruction[] {
  if (!content) return [];
  const lines = content.split('\n');
  const instructions: ParsedInstruction[] = [];

  let currentRawLines: string[] = [];
  let currentStartLine = 0;
  let inContinuation = false;
  let instructionParts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    const lineNum = i + 1;

    if (!inContinuation) {
      // Top-level / outside continuation: skip empty lines and full-line comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      currentStartLine = lineNum;
      currentRawLines = [rawLine];

      if (trimmed.endsWith('\\')) {
        inContinuation = true;
        instructionParts = [trimmed.slice(0, -1).trimEnd()];
      } else {
        inContinuation = false;
        instructionParts = [trimmed];

        const cleanInstruction = instructionParts.join(' ').trim();
        const firstSpaceIdx = cleanInstruction.search(/\s/);
        let keyword = '';
        let args = '';

        if (firstSpaceIdx === -1) {
          keyword = cleanInstruction.toUpperCase();
          args = '';
        } else {
          keyword = cleanInstruction.substring(0, firstSpaceIdx).toUpperCase();
          args = cleanInstruction.substring(firstSpaceIdx).trim();
        }

        instructions.push({
          raw: rawLine,
          startLine: lineNum,
          endLine: lineNum,
          instruction: keyword,
          args,
        });

        currentRawLines = [];
        instructionParts = [];
      }
    } else {
      // Inside continuation
      currentRawLines.push(rawLine);

      // Comments or empty lines inside multiline continuation do not end continuation and do not contribute to command text
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      if (trimmed.endsWith('\\')) {
        inContinuation = true;
        instructionParts.push(trimmed.slice(0, -1).trimEnd());
      } else {
        inContinuation = false;
        instructionParts.push(trimmed);

        const cleanInstruction = instructionParts.join(' ').trim();
        const firstSpaceIdx = cleanInstruction.search(/\s/);
        let keyword = '';
        let args = '';

        if (firstSpaceIdx === -1) {
          keyword = cleanInstruction.toUpperCase();
          args = '';
        } else {
          keyword = cleanInstruction.substring(0, firstSpaceIdx).toUpperCase();
          args = cleanInstruction.substring(firstSpaceIdx).trim();
        }

        instructions.push({
          raw: currentRawLines.join('\n'),
          startLine: currentStartLine,
          endLine: lineNum,
          instruction: keyword,
          args,
        });

        currentRawLines = [];
        instructionParts = [];
      }
    }
  }

  // Handle trailing unclosed continuation at EOF
  if (inContinuation && instructionParts.length > 0) {
    const cleanInstruction = instructionParts.join(' ').trim();
    const firstSpaceIdx = cleanInstruction.search(/\s/);
    let keyword = '';
    let args = '';

    if (firstSpaceIdx === -1) {
      keyword = cleanInstruction.toUpperCase();
      args = '';
    } else {
      keyword = cleanInstruction.substring(0, firstSpaceIdx).toUpperCase();
      args = cleanInstruction.substring(firstSpaceIdx).trim();
    }

    instructions.push({
      raw: currentRawLines.join('\n'),
      startLine: currentStartLine,
      endLine: lines.length,
      instruction: keyword,
      args,
    });
  }

  return instructions;
}

export function auditDockerfile(content: string): DockerfileAuditResult {
  if (!content || !content.trim()) {
    return {
      score: 0,
      grade: 'F',
      issues: [],
      criticalCount: 0,
      warningCount: 0,
      optimizationCount: 0,
      syntaxValid: true,
    };
  }

  const issues: LintIssue[] = [];
  const lines = content.split('\n');
  const instructions = parseInstructions(content);
  const stageAnalysis = parseDockerStages(instructions);

  let fromCount = 0;
  let consecutiveRunCount = 0;
  let lastRunLine = -1;
  let firstInstructionChecked = false;
  let hasCriticalSyntaxError = false;

  const declaredStages = new Set<string>();

  // Pass 1: Parse instructions and validate syntax / structure
  for (const item of instructions) {
    const { raw, startLine, instruction, args } = item;
    const upper = instruction.toUpperCase();

    // Check for Unknown / Typo Instruction FIRST
    if (!VALID_INSTRUCTIONS.has(upper)) {
      hasCriticalSyntaxError = true;
      const lowerInstr = instruction.toLowerCase();

      if (COMMON_SHELL_COMMANDS.has(lowerInstr)) {
        issues.push({
          id: `shell-without-run-${startLine}`,
          ruleCode: 'SYNTAX-02',
          severity: 'critical',
          title: `Direct Shell Command Without RUN: '${instruction}'`,
          description: `Command '${instruction}' was written without the 'RUN' instruction prefix. Container builds require 'RUN ${raw}'.`,
          lineNumber: startLine,
          snippet: raw,
          fixDescription: `Prefix line with RUN`,
          patch: { from: raw, to: `RUN ${raw}` },
        });
      } else if (COMMON_TYPOS[upper]) {
        const typoCorrected = COMMON_TYPOS[upper];
        issues.push({
          id: `typo-instruction-${startLine}`,
          ruleCode: 'SYNTAX-02',
          severity: 'critical',
          title: `Unknown Instruction: '${instruction}'`,
          description: `Instruction '${instruction}' is not recognized. Did you mean '${typoCorrected}'?`,
          lineNumber: startLine,
          snippet: raw,
          fixDescription: `Change '${instruction}' to '${typoCorrected}'`,
          patch: { from: raw, to: raw.replace(new RegExp(`^${instruction}`, 'i'), typoCorrected) },
        });
      } else {
        issues.push({
          id: `unknown-instruction-${startLine}`,
          ruleCode: 'SYNTAX-02',
          severity: 'critical',
          title: `Unknown Dockerfile Instruction: '${instruction}'`,
          description: `Instruction '${instruction}' is not a valid Dockerfile instruction. Valid instructions include: FROM, RUN, CMD, COPY, ADD, WORKDIR, USER, EXPOSE, ENV, ARG, ENTRYPOINT, VOLUME, HEALTHCHECK.`,
          lineNumber: startLine,
          snippet: raw,
        });
      }
      firstInstructionChecked = true;
      continue;
    }

    // The very first non-ARG instruction in a Dockerfile MUST be FROM
    if (!firstInstructionChecked) {
      if (upper !== 'FROM' && upper !== 'ARG') {
        hasCriticalSyntaxError = true;
        issues.push({
          id: `no-from-first-${startLine}`,
          ruleCode: 'SYNTAX-03',
          severity: 'critical',
          title: 'Missing Initial FROM Instruction',
          description: `Dockerfile must begin with a 'FROM' instruction (or 'ARG' before 'FROM'). Found '${upper}' on line ${startLine}.`,
          lineNumber: startLine,
          snippet: raw,
          fixDescription: 'Add FROM <base-image> at the top of the Dockerfile.',
          patch: { from: raw, to: `FROM node:20-alpine\n${raw}` },
        });
        firstInstructionChecked = true;
      } else if (upper === 'FROM') {
        firstInstructionChecked = true;
      }
    }

    // Specific Instruction Syntaxes
    switch (upper) {
      case 'FROM': {
        fromCount++;
        // Reset consecutive RUN tracking across stage boundaries (CK-05)
        lastRunLine = -1;
        consecutiveRunCount = 0;

        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-from-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid FROM Instruction: Missing Base Image',
            description: `The 'FROM' instruction requires a base image name (e.g., 'FROM node:20-alpine').`,
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Specify base image.',
            patch: { from: raw, to: 'FROM alpine:3.19' },
          });
        } else {
          // Parse FROM arguments: FROM [--platform=...] <image> [AS <stage>]
          const cleanArgs = args.replace(/--platform=[^\s]+\s*/i, '').trim();
          const tokens = cleanArgs.split(/\s+/);
          const baseImage = tokens[0];

          // Check for AS stage declaration
          const asIndex = tokens.findIndex((t) => t.toUpperCase() === 'AS');
          if (asIndex !== -1) {
            const stageName = tokens[asIndex + 1];
            if (!stageName) {
              hasCriticalSyntaxError = true;
              issues.push({
                id: `incomplete-from-as-${startLine}`,
                ruleCode: 'SYNTAX-01',
                severity: 'critical',
                title: 'Incomplete FROM Instruction: Missing Stage Name',
                description: `The 'AS' keyword in FROM must be followed by a valid build stage name identifier (e.g., 'FROM node:20-alpine AS builder').`,
                lineNumber: startLine,
                snippet: raw,
                fixDescription: 'Add a stage name after AS.',
                patch: { from: raw, to: `${raw.trimEnd()} builder` },
              });
            } else {
              declaredStages.add(stageName.toLowerCase());
            }
          }

          // Check for unpinned tag (CK-03) - exclude local stage aliases and scratch
          const isLocalStageAlias = baseImage && declaredStages.has(baseImage.toLowerCase());
          if (
            baseImage &&
            !isLocalStageAlias &&
            (baseImage.endsWith(':latest') ||
              (!baseImage.includes(':') && !baseImage.includes('@sha256:') && baseImage.toLowerCase() !== 'scratch'))
          ) {
            issues.push({
              id: `unpinned-tag-${startLine}`,
              ruleCode: 'CK-03',
              severity: 'warning',
              title: 'Unpinned Base Image Tag',
              description: `Image "${baseImage}" uses ":latest" or has no explicit version tag specified. Builds may break unpredictably when upstream updates.`,
              lineNumber: startLine,
              snippet: raw,
              fixDescription: 'Pin image to a specific version or digest (e.g., node:20-alpine).',
            });
          }
        }
        break;
      }

      case 'CMD': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-cmd-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid CMD Instruction: Missing Command Arguments',
            description: `The 'CMD' instruction requires default execution arguments (e.g., 'CMD ["node", "dist/index.js"]' or 'CMD ["nginx", "-g", "daemon off;"]').`,
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Add default execution command array.',
            patch: { from: raw, to: 'CMD ["node", "dist/index.js"]' },
          });
        } else if (args.trim().startsWith('[')) {
          const trimmedArgs = args.trim();
          try {
            const parsed = JSON.parse(trimmedArgs);
            if (!Array.isArray(parsed)) {
              hasCriticalSyntaxError = true;
              issues.push({
                id: `cmd-malformed-json-${startLine}`,
                ruleCode: 'SYNTAX-05',
                severity: 'critical',
                title: 'Malformed JSON Array in CMD Instruction',
                description: `The exec form array in CMD must be a valid JSON array.`,
                lineNumber: startLine,
                snippet: raw,
              });
            }
          } catch {
            hasCriticalSyntaxError = true;
            const hasSingleQuoteDelimiters =
              /^\[\s*'/.test(trimmedArgs) || /'\s*\]$/.test(trimmedArgs) || /'\s*,\s*'/.test(trimmedArgs);
            if (hasSingleQuoteDelimiters) {
              issues.push({
                id: `cmd-single-quotes-${startLine}`,
                ruleCode: 'SYNTAX-05',
                severity: 'critical',
                title: 'Invalid JSON in Exec Form: Single Quotes Used',
                description: `Docker exec form requires valid JSON with double quotes ("..."), not single quotes (e.g., CMD ["node", "app.js"]). Single quotes will cause runtime container failure.`,
                lineNumber: startLine,
                snippet: raw,
                fixDescription: 'Replace single quotes with double quotes.',
                patch: { from: raw, to: raw.replace(/'/g, '"') },
              });
            } else {
              issues.push({
                id: `cmd-malformed-json-${startLine}`,
                ruleCode: 'SYNTAX-05',
                severity: 'critical',
                title: 'Malformed JSON Array in CMD Instruction',
                description: `The exec form array in CMD is not valid JSON. Ensure brackets and quotes are balanced and comma-separated.`,
                lineNumber: startLine,
                snippet: raw,
              });
            }
          }
        }
        break;
      }

      case 'ENTRYPOINT': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-entrypoint-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid ENTRYPOINT Instruction: Missing Arguments',
            description: `The 'ENTRYPOINT' instruction requires an executable or command (e.g., 'ENTRYPOINT ["node", "server.js"]').`,
            lineNumber: startLine,
            snippet: raw,
          });
        } else if (args.trim().startsWith('[')) {
          const trimmedArgs = args.trim();
          try {
            const parsed = JSON.parse(trimmedArgs);
            if (!Array.isArray(parsed)) {
              hasCriticalSyntaxError = true;
              issues.push({
                id: `entrypoint-malformed-json-${startLine}`,
                ruleCode: 'SYNTAX-05',
                severity: 'critical',
                title: 'Malformed JSON Array in ENTRYPOINT Instruction',
                description: `The exec form array in ENTRYPOINT must be a valid JSON array.`,
                lineNumber: startLine,
                snippet: raw,
              });
            }
          } catch {
            hasCriticalSyntaxError = true;
            const hasSingleQuoteDelimiters =
              /^\[\s*'/.test(trimmedArgs) || /'\s*\]$/.test(trimmedArgs) || /'\s*,\s*'/.test(trimmedArgs);
            if (hasSingleQuoteDelimiters) {
              issues.push({
                id: `entrypoint-single-quotes-${startLine}`,
                ruleCode: 'SYNTAX-05',
                severity: 'critical',
                title: 'Invalid JSON in ENTRYPOINT: Single Quotes Used',
                description: `Docker exec form requires valid JSON with double quotes ("..."), not single quotes.`,
                lineNumber: startLine,
                snippet: raw,
                fixDescription: 'Replace single quotes with double quotes.',
                patch: { from: raw, to: raw.replace(/'/g, '"') },
              });
            } else {
              issues.push({
                id: `entrypoint-malformed-json-${startLine}`,
                ruleCode: 'SYNTAX-05',
                severity: 'critical',
                title: 'Malformed JSON Array in ENTRYPOINT Instruction',
                description: `The exec form array in ENTRYPOINT is not valid JSON. Ensure brackets and quotes are balanced and comma-separated.`,
                lineNumber: startLine,
                snippet: raw,
              });
            }
          }
        }
        break;
      }

      case 'RUN': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-run-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid RUN Instruction: Missing Command',
            description: `The 'RUN' instruction requires a shell command or exec array to execute during build.`,
            lineNumber: startLine,
            snippet: raw,
          });
          break;
        }

        // Check sudo usage & sudoers privilege escalation (CK-08)
        if (/\bsudo\b/i.test(args)) {
          issues.push({
            id: `sudo-in-run-${startLine}`,
            ruleCode: 'CK-08',
            severity: 'critical',
            title: "Insecure 'sudo' Usage in RUN Directive",
            description: `Avoid using 'sudo' inside Docker builds. Container instructions already run as the active USER identity. 'sudo' introduces unnecessary privilege escalation vectors.`,
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Remove sudo prefix from command.',
            patch: { from: raw, to: raw.replace(/\bsudo\s+/g, '') },
          });
        }
        if (/(?:NOPASSWD:\s*ALL|\/etc\/sudoers)/i.test(args)) {
          issues.push({
            id: `sudoers-privilege-escalation-${startLine}`,
            ruleCode: 'CK-08',
            severity: 'critical',
            title: 'Insecure Sudoers Privilege Escalation in RUN',
            description: 'Modifying /etc/sudoers or granting NOPASSWD: ALL allows unprivileged users to execute commands as root without authentication, defeating non-root isolation.',
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Avoid configuring passwordless sudoers rules in container layers.',
          });
        }

        // Check dangerous privileged capabilities (CK-13)
        if (/(?:--privileged|--cap-add\s*=\s*(?:ALL|SYS_ADMIN|CAP_SYS_ADMIN)|setcap\s+.*cap_sys_admin)/i.test(args)) {
          issues.push({
            id: `privileged-capability-${startLine}`,
            ruleCode: 'CK-13',
            severity: 'critical',
            title: 'Dangerous Privileged Capability Configured in RUN',
            description: 'Granting CAP_SYS_ADMIN, ALL capabilities, or executing with --privileged disables core kernel security boundaries and can allow container breakout to the host.',
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Remove dangerous capabilities and use granular least-privilege permissions.',
          });
        }

        // Package Manager: apt-get / apt (CK-10, CK-06)
        if (/(?:apt-get|apt)\s+install/i.test(args)) {
          if (!/(?:-y\b|--yes\b)/i.test(args)) {
            issues.push({
              id: `apt-missing-y-${startLine}`,
              ruleCode: 'CK-10',
              severity: 'warning',
              title: 'Missing Non-Interactive Flag (-y) in apt-get',
              description: `'apt-get install' will prompt for confirmation and hang indefinitely during automated container builds. Add '-y' flag.`,
              lineNumber: startLine,
              snippet: raw,
              fixDescription: 'Add -y to apt-get install.',
              patch: { from: raw, to: raw.replace(/apt-get\s+install/i, 'apt-get install -y') },
            });
          }
          if (!args.includes('/var/lib/apt/lists') && !args.includes('apt-get clean')) {
            issues.push({
              id: `apt-cache-${startLine}`,
              ruleCode: 'CK-06',
              severity: 'optimization',
              title: 'Uncleaned Package Manager Cache',
              description: 'apt-get install leaves package lists in /var/lib/apt/lists/ which increases image layer size.',
              lineNumber: startLine,
              snippet: raw,
              fixDescription: 'Append "&& rm -rf /var/lib/apt/lists/*" to remove cached package metadata.',
            });
          }
        }

        // Package Manager: Alpine apk (CK-06)
        if (/apk\s+add\b/i.test(args)) {
          if (!args.includes('--no-cache') && !args.includes('/var/cache/apk')) {
            issues.push({
              id: `apk-cache-${startLine}`,
              ruleCode: 'CK-06',
              severity: 'optimization',
              title: 'Uncleaned Alpine Package Cache',
              description: "Alpine 'apk add' stores package tarballs and index files in /var/cache/apk/. Use 'apk add --no-cache' to avoid increasing image layer size.",
              lineNumber: startLine,
              snippet: raw,
              fixDescription: 'Add --no-cache flag to apk add.',
            });
          }
        }

        // Package Manager: Python pip (CK-06)
        if (/pip[3]?\s+install\b/i.test(args)) {
          if (!args.includes('--no-cache-dir') && !args.includes('cache/pip')) {
            issues.push({
              id: `pip-cache-${startLine}`,
              ruleCode: 'CK-06',
              severity: 'optimization',
              title: 'Uncleaned Python Pip Cache',
              description: "Python pip caches downloaded wheel and source tarballs. Add '--no-cache-dir' to keep image layers minimal.",
              lineNumber: startLine,
              snippet: raw,
              fixDescription: 'Add --no-cache-dir to pip install.',
            });
          }
        }

        // Package Manager: Yum / DNF (CK-10, CK-06)
        if (/(?:yum|dnf)\s+install\b/i.test(args)) {
          if (!/(?:-y\b|--assumeyes\b)/i.test(args)) {
            issues.push({
              id: `yum-missing-y-${startLine}`,
              ruleCode: 'CK-10',
              severity: 'warning',
              title: 'Missing Non-Interactive Flag (-y) in yum/dnf',
              description: `'yum install' or 'dnf install' will prompt for confirmation and hang during container builds. Add '-y' flag.`,
              lineNumber: startLine,
              snippet: raw,
            });
          }
          if (!args.includes('clean all') && !args.includes('/var/cache/yum') && !args.includes('/var/cache/dnf')) {
            issues.push({
              id: `yum-cache-${startLine}`,
              ruleCode: 'CK-06',
              severity: 'optimization',
              title: 'Uncleaned Yum/DNF Package Cache',
              description: 'yum/dnf install leaves package cache in /var/cache/. Append "&& yum clean all" or "&& rm -rf /var/cache/yum" to minimize layer size.',
              lineNumber: startLine,
              snippet: raw,
            });
          }
        }

        // Insecure remote script piping (CK-15)
        const pipeToShellRegex = /(?:curl|wget)\b[^|;&\n]*\|\s*(?:(?:sudo|busybox)\s+)?(?:\/bin\/|\/usr\/bin\/)?(?:sh|bash|zsh|dash|ash)\b/i;
        if (pipeToShellRegex.test(args)) {
          issues.push({
            id: `pipe-to-shell-${startLine}`,
            ruleCode: 'CK-15',
            severity: 'warning',
            title: 'Insecure Remote Script Execution via Shell Pipe',
            description: 'Piping remote scripts directly from curl or wget into a shell interpreter (e.g. "curl ... | sh") bypasses integrity verification and exposes builds to supply-chain tampering. Download the file, verify its checksum (SHA256), and execute it locally.',
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Download script to file, verify checksum with sha256sum, and execute explicitly.',
          });
        }

        // Check consecutive RUN statements
        if (lastRunLine === startLine - 1) {
          consecutiveRunCount++;
          if (consecutiveRunCount === 1) {
            issues.push({
              id: `consecutive-run-${startLine}`,
              ruleCode: 'CK-05',
              severity: 'optimization',
              title: 'Multiple Consecutive RUN Instructions',
              description: 'Consecutive RUN instructions create additional bloated image layers. Chain commands using && and \\.',
              lineNumber: startLine,
              snippet: raw,
              fixDescription: 'Combine consecutive RUN statements with && to reduce image size.',
            });
          }
        } else {
          consecutiveRunCount = 0;
        }
        lastRunLine = item.endLine;
        break;
      }

      case 'COPY': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-copy-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid COPY Instruction: Missing Arguments',
            description: `The 'COPY' instruction requires at least source and destination paths (e.g., 'COPY package.json ./').`,
            lineNumber: startLine,
            snippet: raw,
          });
          break;
        }

        // Parse flags like --from=..., --chown=..., --chmod=...
        const flags = args.match(/--[a-zA-Z0-9_-]+(?:=[^\s]+)?/g) || [];
        const nonFlagTokens = args
          .replace(/--[a-zA-Z0-9_-]+(?:=[^\s]+)?/g, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);

        // Check --from flag reference
        const fromFlag = flags.find((f) => f.startsWith('--from='));
        if (fromFlag) {
          const fromStage = fromFlag.substring(7).trim();
          const resolution = resolveCopyFromReference(
            fromStage,
            fromCount - 1,
            stageAnalysis.stageAliases,
            stageAnalysis.stages
          );

          if (!resolution.isValid) {
            hasCriticalSyntaxError = true;
            const earlierFromWithoutAs = instructions.find(
              (inst) => inst.instruction === 'FROM' && inst.startLine < startLine && !inst.args.toUpperCase().includes(' AS ') && inst.args.trim().length > 0
            );

            issues.push({
              id: resolution.isNumeric
                ? `invalid-stage-index-${startLine}`
                : fromStage === ''
                ? `empty-from-flag-${startLine}`
                : `undefined-stage-${startLine}`,
              ruleCode: 'SYNTAX-04',
              severity: 'critical',
              title: resolution.isNumeric
                ? `Invalid Build Stage Index: '--from=${fromStage}'`
                : fromStage === ''
                ? 'Empty --from Flag in COPY'
                : `Undefined Build Stage Reference: '${fromStage}'`,
              description: resolution.errorMessage || `The '--from=${fromStage}' flag references undefined stage '${fromStage}'.`,
              lineNumber: startLine,
              snippet: raw,
              fixDescription: earlierFromWithoutAs
                ? `Add 'AS ${fromStage}' to FROM on Line ${earlierFromWithoutAs.startLine}`
                : `Declare 'FROM <image> AS ${fromStage}' in an earlier build stage.`,
              ...(earlierFromWithoutAs
                ? {
                    patch: {
                      from: earlierFromWithoutAs.raw,
                      to: `${earlierFromWithoutAs.raw.trimEnd()} AS ${fromStage}`,
                    },
                  }
                : {}),
            });
          }
        }

        // Check for sensitive files copied into image (CK-14)
        if (nonFlagTokens.length >= 2) {
          const srcPaths = nonFlagTokens.slice(0, nonFlagTokens.length - 1);
          for (const srcPath of srcPaths) {
            for (const pattern of SENSITIVE_FILE_PATTERNS) {
              if (pattern.regex.test(srcPath)) {
                issues.push({
                  id: `sensitive-file-${startLine}-${srcPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
                  ruleCode: 'CK-14',
                  severity: 'critical',
                  title: `Sensitive File Copied into Image: '${srcPath}'`,
                  description: `Copying sensitive files (${pattern.name}) directly into the container bakes secrets permanently into image layer history. Use BuildKit secret mounts (--mount=type=secret) or runtime environment variables instead.`,
                  lineNumber: startLine,
                  snippet: raw,
                  fixDescription: `Exclude '${srcPath}' from image build and add to .dockerignore.`,
                });
                break;
              }
            }
          }
        }

        // Check source & destination count
        if (nonFlagTokens.length < 2) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `copy-missing-dest-${startLine}`,
            ruleCode: 'SYNTAX-06',
            severity: 'critical',
            title: 'Invalid COPY Instruction: Missing Destination',
            description: `COPY requires at least two paths: source and destination (e.g., 'COPY package.json ./').`,
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Add destination path (e.g. ./)',
            patch: { from: raw, to: `${raw.trimEnd()} ./` },
          });
        }
        break;
      }

      case 'ADD': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-add-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid ADD Instruction: Missing Arguments',
            description: `The 'ADD' instruction requires source and destination paths.`,
            lineNumber: startLine,
            snippet: raw,
          });
          break;
        }

        const nonFlagTokens = args
          .replace(/--[a-zA-Z0-9_-]+(?:=[^\s]+)?/g, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);

        // Check for sensitive files added into image (CK-14)
        if (nonFlagTokens.length >= 2) {
          const srcPaths = nonFlagTokens.slice(0, nonFlagTokens.length - 1);
          for (const srcPath of srcPaths) {
            for (const pattern of SENSITIVE_FILE_PATTERNS) {
              if (pattern.regex.test(srcPath)) {
                issues.push({
                  id: `sensitive-file-add-${startLine}-${srcPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
                  ruleCode: 'CK-14',
                  severity: 'critical',
                  title: `Sensitive File Added into Image: '${srcPath}'`,
                  description: `Adding sensitive files (${pattern.name}) directly into the container bakes secrets permanently into image layer history. Use BuildKit secret mounts (--mount=type=secret) or runtime environment variables instead.`,
                  lineNumber: startLine,
                  snippet: raw,
                  fixDescription: `Exclude '${srcPath}' from image build and add to .dockerignore.`,
                });
                break;
              }
            }
          }
        }

        if (nonFlagTokens.length < 2) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `add-missing-dest-${startLine}`,
            ruleCode: 'SYNTAX-06',
            severity: 'critical',
            title: 'Invalid ADD Instruction: Missing Destination',
            description: `ADD requires at least source and destination paths (e.g., 'ADD archive.tar.gz /app/').`,
            lineNumber: startLine,
            snippet: raw,
          });
        }

        // Warning: Prefer COPY over ADD unless archive or URL
        if (!args.includes('.tar') && !args.includes('.gz') && !args.startsWith('http')) {
          issues.push({
            id: `use-copy-${startLine}`,
            ruleCode: 'CK-07',
            severity: 'warning',
            title: 'Use COPY Instead of ADD',
            description: 'ADD has implicit tar extraction and remote URL behaviors. Use COPY for transparent local file copying.',
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Replace ADD with COPY.',
            patch: { from: raw, to: raw.replace(/^ADD /i, 'COPY ') },
          });
        }
        break;
      }

      case 'WORKDIR': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-workdir-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid WORKDIR Instruction: Missing Path',
            description: `The 'WORKDIR' instruction requires a directory path (e.g., 'WORKDIR /usr/src/app').`,
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Add working directory path.',
            patch: { from: raw, to: 'WORKDIR /app' },
          });
        } else if (
          !args.trim().startsWith('/') &&
          !args.trim().startsWith('$') &&
          !args.trim().startsWith('~') &&
          !args.trim().startsWith('"')
        ) {
          issues.push({
            id: `relative-workdir-${startLine}`,
            ruleCode: 'CK-11',
            severity: 'optimization',
            title: 'Relative WORKDIR Path',
            description: `Relative path '${args.trim()}' in WORKDIR is relative to the previous WORKDIR. Use an absolute path (e.g., '/${args.trim()}') for consistency.`,
            lineNumber: startLine,
            snippet: raw,
          });
        }
        break;
      }

      case 'USER': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-user-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid USER Instruction: Missing User Argument',
            description: `The 'USER' instruction requires a username or UID (e.g., 'USER node' or 'USER 1001').`,
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Specify a non-root user.',
            patch: { from: raw, to: 'USER appuser' },
          });
        }
        break;
      }

      case 'EXPOSE': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-expose-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid EXPOSE Instruction: Missing Port Number',
            description: `The 'EXPOSE' instruction requires at least one port number (e.g., 'EXPOSE 80 443' or 'EXPOSE 3000/tcp').`,
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Specify port number.',
            patch: { from: raw, to: 'EXPOSE 3000' },
          });
        } else {
          // Check for dangerous port exposure (CK-16)
          const ports = args.trim().split(/\s+/).filter(Boolean);
          for (const portSpec of ports) {
            const cleanPort = portSpec.toLowerCase().replace(/\/(?:tcp|udp)$/, '');
            if (cleanPort === '22' || cleanPort === '2375') {
              const serviceName = cleanPort === '22' ? 'SSH Daemon' : 'Unauthenticated Docker Daemon Socket';
              issues.push({
                id: `dangerous-port-${startLine}-${cleanPort}`,
                ruleCode: 'CK-16',
                severity: 'warning',
                title: `Dangerous Port Exposed in Container: ${portSpec} (${serviceName})`,
                description: `Exposing port ${portSpec} inside container images introduces high attack surface and violates microservice isolation best practices. Containers should not run SSH daemons or expose unencrypted Docker daemon sockets.`,
                lineNumber: startLine,
                snippet: raw,
                fixDescription: `Remove port ${portSpec} from EXPOSE.`,
              });
            }
          }
        }
        break;
      }

      case 'ENV': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-env-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid ENV Instruction: Missing Key/Value',
            description: `The 'ENV' instruction requires environment variable definitions (e.g., 'ENV NODE_ENV=production').`,
            lineNumber: startLine,
            snippet: raw,
          });
        }
        break;
      }

      case 'ARG': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-arg-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid ARG Instruction: Missing Parameter Name',
            description: `The 'ARG' instruction requires a parameter name (e.g., 'ARG NODE_VERSION=20').`,
            lineNumber: startLine,
            snippet: raw,
          });
        }
        break;
      }

      case 'VOLUME': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-volume-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid VOLUME Instruction: Missing Mount Path',
            description: `The 'VOLUME' instruction requires one or more mount paths (e.g., 'VOLUME ["/data"]').`,
            lineNumber: startLine,
            snippet: raw,
          });
        }
        break;
      }

      case 'HEALTHCHECK': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-healthcheck-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid HEALTHCHECK Instruction: Missing Parameters',
            description: `HEALTHCHECK must specify 'NONE' or options followed by 'CMD' (e.g., 'HEALTHCHECK --interval=30s CMD curl -f http://localhost/ || exit 1').`,
            lineNumber: startLine,
            snippet: raw,
          });
        } else if (args.trim().toUpperCase() === 'NONE' || args.toUpperCase().includes('CMD')) {
          // Valid HEALTHCHECK syntax
        } else {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `malformed-healthcheck-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Malformed HEALTHCHECK Instruction',
            description: `HEALTHCHECK must specify either 'NONE' or 'HEALTHCHECK [OPTIONS] CMD <command>'. Missing 'CMD' keyword.`,
            lineNumber: startLine,
            snippet: raw,
          });
        }
        break;
      }

      case 'SHELL': {
        if (!args.trim() || !args.trim().startsWith('[')) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `invalid-shell-${startLine}`,
            ruleCode: 'SYNTAX-05',
            severity: 'critical',
            title: 'Invalid SHELL Instruction: Must Be JSON Array',
            description: `The 'SHELL' instruction must be formatted as a JSON array (e.g., 'SHELL ["/bin/bash", "-c"]').`,
            lineNumber: startLine,
            snippet: raw,
          });
        } else {
          const trimmedArgs = args.trim();
          try {
            const parsed = JSON.parse(trimmedArgs);
            if (!Array.isArray(parsed)) {
              hasCriticalSyntaxError = true;
              issues.push({
                id: `shell-not-array-${startLine}`,
                ruleCode: 'SYNTAX-05',
                severity: 'critical',
                title: 'Invalid SHELL Instruction: Must Be JSON Array',
                description: `The 'SHELL' instruction must be formatted as a JSON array (e.g., 'SHELL ["/bin/bash", "-c"]').`,
                lineNumber: startLine,
                snippet: raw,
              });
            }
          } catch {
            hasCriticalSyntaxError = true;
            issues.push({
              id: `shell-malformed-json-${startLine}`,
              ruleCode: 'SYNTAX-05',
              severity: 'critical',
              title: 'Malformed JSON Array in SHELL Instruction',
              description: `The exec form array in SHELL is not valid JSON. Ensure double quotes are used and brackets are balanced.`,
              lineNumber: startLine,
              snippet: raw,
            });
          }
        }
        break;
      }

      case 'STOPSIGNAL': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-stopsignal-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid STOPSIGNAL Instruction: Missing Signal',
            description: `The 'STOPSIGNAL' instruction requires a signal name or number (e.g., 'STOPSIGNAL SIGQUIT').`,
            lineNumber: startLine,
            snippet: raw,
          });
        }
        break;
      }

      case 'LABEL': {
        if (!args.trim()) {
          hasCriticalSyntaxError = true;
          issues.push({
            id: `empty-label-${startLine}`,
            ruleCode: 'SYNTAX-01',
            severity: 'critical',
            title: 'Invalid LABEL Instruction: Missing Key-Value Pairs',
            description: `The 'LABEL' instruction requires at least one key=value pair (e.g., 'LABEL maintainer="devops"').`,
            lineNumber: startLine,
            snippet: raw,
          });
        }
        break;
      }

      case 'MAINTAINER': {
        issues.push({
          id: `deprecated-maintainer-${startLine}`,
          ruleCode: 'CK-12',
          severity: 'optimization',
          title: 'Deprecated MAINTAINER Instruction',
          description: `The 'MAINTAINER' instruction is deprecated in Docker. Use 'LABEL maintainer="..."' instead.`,
          lineNumber: startLine,
          snippet: raw,
          fixDescription: 'Replace MAINTAINER with LABEL maintainer=...',
          patch: { from: raw, to: raw.replace(/^MAINTAINER\s+/i, 'LABEL maintainer=') },
        });
        break;
      }
    }
  }

  // AST-Aware Security Check: Hardcoded Secrets & Credentials (CK-02)
  const tokenSecretPatterns = [
    { regex: /\bAKIA[0-9A-Z]{16}\b/, name: 'AWS Access Key ID' },
    { regex: /\b(?:ghp_[a-zA-Z0-9]{30,40}|github_pat_[a-zA-Z0-9_]{50,100}|gho_[a-zA-Z0-9]{30,40}|ghu_[a-zA-Z0-9]{30,40}|ghs_[a-zA-Z0-9]{30,40})\b/, name: 'GitHub Personal Access Token' },
    { regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/, name: 'Slack Token' },
    { regex: /BEGIN (?:RSA|OPENSSH|EC|DSA|PGP|ENCRYPTED) PRIVATE KEY/, name: 'Embedded Private Key' },
  ];

  const genericSecretRegex = /(?:password|passwd|secret|apikey|api_key|auth_token|access_token|private_key)\s*[:=]\s*["']?([^\s"']+)["']?/i;

  instructions.forEach((inst) => {
    const { raw, startLine, instruction, args } = inst;

    // Check specific known token signatures
    for (const pat of tokenSecretPatterns) {
      if (pat.regex.test(args) || pat.regex.test(raw)) {
        issues.push({
          id: `secret-leak-${startLine}`,
          ruleCode: 'CK-02',
          severity: 'critical',
          title: `Potential ${pat.name} Detected`,
          description: `Instruction appears to contain a baked-in credential (${pat.name}). Secrets in Dockerfiles persist permanently in image layer history.`,
          lineNumber: startLine,
          snippet: raw,
          fixDescription: 'Use Docker BuildKit secrets (--secret) or runtime environment variables instead.',
        });
        return;
      }
    }

    // Check generic assignments in ENV, ARG, RUN, LABEL
    if (['ENV', 'ARG', 'RUN', 'LABEL'].includes(instruction)) {
      const match = args.match(genericSecretRegex);
      if (match) {
        const secretVal = match[1];
        if (!isObviousPlaceholder(secretVal) && secretVal.length >= 8) {
          issues.push({
            id: `secret-leak-${startLine}`,
            ruleCode: 'CK-02',
            severity: 'critical',
            title: 'Potential Hardcoded Password/Secret Detected',
            description: 'Instruction appears to contain a baked-in secret. Secrets in Dockerfiles persist permanently in image layer history.',
            lineNumber: startLine,
            snippet: raw,
            fixDescription: 'Use Docker BuildKit secrets (--mount=type=secret) or runtime environment variables instead.',
          });
        }
      }
    }
  });

  // Runtime Stage Security Check: USER / Root Execution Analysis (CK-01)
  if (stageAnalysis.finalStage && fromCount > 0) {
    const userAnalysis = evaluateStageUser(stageAnalysis.finalStage, stageAnalysis.globalInstructions);

    if (!userAnalysis.hasUserDirective) {
      issues.push({
        id: 'missing-user-directive',
        ruleCode: 'CK-01',
        severity: 'critical',
        title: 'Missing Non-Root USER Directive',
        description: 'The Dockerfile does not specify a non-root USER in the final runtime stage. By default, processes inside the container will execute with root privileges.',
        lineNumber: lines.length,
        snippet: 'USER appuser',
        fixDescription: 'Add "USER node" or create and switch to a dedicated user at the bottom of the Dockerfile.',
      });
    } else if (userAnalysis.isExplicitRoot && userAnalysis.userInstruction) {
      issues.push({
        id: `root-user-${userAnalysis.userInstruction.startLine}`,
        ruleCode: 'CK-01',
        severity: 'critical',
        title: 'Container Explicitly Configured as Root',
        description: 'Running containers as root poses severe container-breakout security risks if the application is compromised.',
        lineNumber: userAnalysis.userInstruction.startLine,
        snippet: userAnalysis.userInstruction.raw,
        fixDescription: 'Change USER to a non-privileged user (e.g., "USER node" or "USER appuser").',
        patch: { from: userAnalysis.userInstruction.raw, to: 'USER appuser' },
      });
    }
  }

  // Stage Check: Duplicate CMD / ENTRYPOINT in Same Stage (CK-17)
  stageAnalysis.stages.forEach((stg) => {
    const cmds = stg.instructions.filter((i) => i.instruction === 'CMD');
    if (cmds.length > 1) {
      for (let i = 0; i < cmds.length - 1; i++) {
        const overridden = cmds[i];
        issues.push({
          id: `duplicate-cmd-${overridden.startLine}`,
          ruleCode: 'CK-17',
          severity: 'warning',
          title: 'Overridden Duplicate CMD Instruction in Same Stage',
          description: `Only the last CMD instruction in a build stage takes effect. The CMD on line ${overridden.startLine} is silently overridden by line ${cmds[cmds.length - 1].startLine}.`,
          lineNumber: overridden.startLine,
          snippet: overridden.raw,
          fixDescription: 'Remove overridden CMD instruction.',
        });
      }
    }

    const entrypoints = stg.instructions.filter((i) => i.instruction === 'ENTRYPOINT');
    if (entrypoints.length > 1) {
      for (let i = 0; i < entrypoints.length - 1; i++) {
        const overridden = entrypoints[i];
        issues.push({
          id: `duplicate-entrypoint-${overridden.startLine}`,
          ruleCode: 'CK-17',
          severity: 'warning',
          title: 'Overridden Duplicate ENTRYPOINT Instruction in Same Stage',
          description: `Only the last ENTRYPOINT instruction in a build stage takes effect. The ENTRYPOINT on line ${overridden.startLine} is silently overridden by line ${entrypoints[entrypoints.length - 1].startLine}.`,
          lineNumber: overridden.startLine,
          snippet: overridden.raw,
          fixDescription: 'Remove overridden ENTRYPOINT instruction.',
        });
      }
    }
  });

  // Runtime Stage Check: Missing HEALTHCHECK (CK-04)
  if (stageAnalysis.finalStage && fromCount > 0 && !stageAnalysis.finalStage.hasHealthcheck) {
    issues.push({
      id: 'missing-healthcheck',
      ruleCode: 'CK-04',
      severity: 'warning',
      title: 'Missing HEALTHCHECK Instruction',
      description: 'Without a HEALTHCHECK instruction in the runtime stage, orchestrators like Kubernetes or Docker Swarm cannot determine if the container process has frozen or deadlocked.',
      lineNumber: lines.length,
      snippet: 'HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost/ || exit 1',
      fixDescription: 'Add a HEALTHCHECK instruction to enable automated self-healing.',
    });
  }

  // Sort issues by line number ascending
  issues.sort((a, b) => a.lineNumber - b.lineNumber);

  // Calculate scores and counts
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const optCount = issues.filter((i) => i.severity === 'optimization').length;

  const syntaxValid = !hasCriticalSyntaxError;

  let score = 0;
  let grade: 'A+' | 'A' | 'B' | 'C' | 'F' = 'F';

  if (!syntaxValid) {
    // Fatal syntax errors invalidate the build
    score = 0;
    grade = 'F';
  } else {
    score = 100 - (criticalCount * 30 + warningCount * 12 + optCount * 5);
    score = Math.max(0, Math.min(100, score));

    if (score >= 95) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 65) grade = 'B';
    else if (score >= 50) grade = 'C';
    else grade = 'F';
  }

  return {
    score,
    grade,
    issues,
    criticalCount,
    warningCount,
    optimizationCount: optCount,
    syntaxValid,
  };
}
