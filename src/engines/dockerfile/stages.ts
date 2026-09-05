import { ParsedInstruction } from './linter';

export const STANDARD_BASE_IMAGES = new Set([
  'alpine',
  'nginx',
  'node',
  'golang',
  'go',
  'busybox',
  'ubuntu',
  'debian',
  'python',
  'python2',
  'python3',
  'redis',
  'postgres',
  'postgresql',
  'mysql',
  'mariadb',
  'mongo',
  'rust',
  'httpd',
  'apache',
  'maven',
  'gradle',
  'composer',
  'caddy',
  'scratch',
  'centos',
  'fedora',
  'archlinux',
  'amazonlinux',
  'rockylinux',
  'almalinux',
  'openjdk',
  'eclipse-temurin',
  'ruby',
  'php',
  'elixir',
  'erlang',
  'dotnet',
  'traefik',
  'envoy',
  'haproxy',
  'memcached',
  'rabbitmq',
  'consul',
  'vault',
  'elasticsearch',
  'kibana',
  'logstash',
]);

export interface DockerStage {
  index: number;
  stageNumber: number;
  baseImage: string;
  platform?: string;
  alias?: string;
  isFinal: boolean;
  startLine: number;
  endLine: number;
  fromInstruction: ParsedInstruction;
  instructions: ParsedInstruction[];
  userInstructions: ParsedInstruction[];
  workdirInstructions: ParsedInstruction[];
  envInstructions: ParsedInstruction[];
  copyInstructions: ParsedInstruction[];
  runInstructions: ParsedInstruction[];
  hasHealthcheck: boolean;
  hasUser: boolean;
  finalUser?: string;
}

export interface DockerfileStageAnalysis {
  stages: DockerStage[];
  globalInstructions: ParsedInstruction[];
  finalStage: DockerStage | null;
  totalStages: number;
  isMultiStage: boolean;
  stageAliases: Map<string, DockerStage>;
}

export function isExternalImageReference(target: string): boolean {
  const trimmed = target.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed === 'scratch') return true;
  if (trimmed.includes('/') || trimmed.includes(':') || trimmed.includes('@')) return true;
  return STANDARD_BASE_IMAGES.has(trimmed);
}

export function parseFromArguments(args: string): {
  baseImage: string;
  platform?: string;
  alias?: string;
} {
  let clean = args.trim();
  let platform: string | undefined;

  // Parse optional --platform flag
  const platformMatch = clean.match(/^--platform=([^\s]+)\s*/i);
  if (platformMatch) {
    platform = platformMatch[1];
    clean = clean.substring(platformMatch[0].length).trim();
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  const baseImage = tokens[0] || '';

  let alias: string | undefined;
  const asIndex = tokens.findIndex((t) => t.toUpperCase() === 'AS');
  if (asIndex !== -1 && tokens[asIndex + 1]) {
    alias = tokens[asIndex + 1];
  }

  return { baseImage, platform, alias };
}

export function parseDockerStages(instructions: ParsedInstruction[]): DockerfileStageAnalysis {
  const stages: DockerStage[] = [];
  const globalInstructions: ParsedInstruction[] = [];
  const stageAliases = new Map<string, DockerStage>();

  let currentStage: DockerStage | null = null;

  for (const inst of instructions) {
    if (inst.instruction === 'FROM') {
      if (currentStage) {
        currentStage.endLine = inst.startLine - 1;
      }

      const { baseImage, platform, alias } = parseFromArguments(inst.args);
      const stageIndex = stages.length;

      currentStage = {
        index: stageIndex,
        stageNumber: stageIndex + 1,
        baseImage,
        platform,
        alias,
        isFinal: false,
        startLine: inst.startLine,
        endLine: inst.endLine,
        fromInstruction: inst,
        instructions: [inst],
        userInstructions: [],
        workdirInstructions: [],
        envInstructions: [],
        copyInstructions: [],
        runInstructions: [],
        hasHealthcheck: false,
        hasUser: false,
        finalUser: undefined,
      };

      stages.push(currentStage);

      if (alias) {
        stageAliases.set(alias.toLowerCase(), currentStage);
      }
    } else {
      if (!currentStage) {
        // Top-level pre-FROM instruction (e.g. ARG)
        globalInstructions.push(inst);
      } else {
        currentStage.instructions.push(inst);
        currentStage.endLine = Math.max(currentStage.endLine, inst.endLine);

        switch (inst.instruction) {
          case 'USER':
            currentStage.userInstructions.push(inst);
            currentStage.hasUser = true;
            currentStage.finalUser = inst.args.trim();
            break;
          case 'WORKDIR':
            currentStage.workdirInstructions.push(inst);
            break;
          case 'ENV':
            currentStage.envInstructions.push(inst);
            break;
          case 'COPY':
            currentStage.copyInstructions.push(inst);
            break;
          case 'RUN':
            currentStage.runInstructions.push(inst);
            break;
          case 'HEALTHCHECK':
            if (inst.args.trim().toUpperCase() !== 'NONE') {
              currentStage.hasHealthcheck = true;
            }
            break;
        }
      }
    }
  }

  // Mark final stage
  if (stages.length > 0) {
    const last = stages[stages.length - 1];
    last.isFinal = true;
    if (instructions.length > 0) {
      last.endLine = instructions[instructions.length - 1].endLine;
    }
  }

  return {
    stages,
    globalInstructions,
    finalStage: stages.length > 0 ? stages[stages.length - 1] : null,
    totalStages: stages.length,
    isMultiStage: stages.length > 1,
    stageAliases,
  };
}

export interface FromReferenceResolution {
  target: string;
  isNumeric: boolean;
  numericIndex?: number;
  isLocalStage: boolean;
  localStage?: DockerStage;
  isExternalImage: boolean;
  isValid: boolean;
  errorMessage?: string;
}

export function resolveCopyFromReference(
  target: string,
  currentStageIndex: number,
  declaredStages: Map<string, DockerStage>,
  allStages: DockerStage[]
): FromReferenceResolution {
  const cleanTarget = target.trim();
  if (!cleanTarget) {
    return {
      target: '',
      isNumeric: false,
      isLocalStage: false,
      isExternalImage: false,
      isValid: false,
      errorMessage: "The '--from=' flag must specify a valid build stage name or image (e.g., '--from=builder').",
    };
  }

  // 1. Numeric stage index
  if (/^\d+$/.test(cleanTarget)) {
    const stageIdx = parseInt(cleanTarget, 10);
    if (stageIdx < 0 || stageIdx >= currentStageIndex) {
      return {
        target: cleanTarget,
        isNumeric: true,
        numericIndex: stageIdx,
        isLocalStage: false,
        isExternalImage: false,
        isValid: false,
        errorMessage: `Stage index ${cleanTarget} is out of bounds. There are only ${currentStageIndex} stage(s) defined prior to this line.`,
      };
    }
    return {
      target: cleanTarget,
      isNumeric: true,
      numericIndex: stageIdx,
      isLocalStage: true,
      localStage: allStages[stageIdx],
      isExternalImage: false,
      isValid: true,
    };
  }

  // 2. Declared local stage alias
  const lowerTarget = cleanTarget.toLowerCase();
  if (declaredStages.has(lowerTarget)) {
    const matchedStage = declaredStages.get(lowerTarget)!;
    if (matchedStage.index < currentStageIndex) {
      return {
        target: cleanTarget,
        isNumeric: false,
        isLocalStage: true,
        localStage: matchedStage,
        isExternalImage: false,
        isValid: true,
      };
    }
  }

  // 3. External image reference (e.g., --from=alpine, --from=nginx:alpine, --from=ghcr.io/org/repo)
  if (isExternalImageReference(cleanTarget)) {
    return {
      target: cleanTarget,
      isNumeric: false,
      isLocalStage: false,
      isExternalImage: true,
      isValid: true,
    };
  }

  // 4. Undefined local stage reference
  return {
    target: cleanTarget,
    isNumeric: false,
    isLocalStage: false,
    isExternalImage: false,
    isValid: false,
    errorMessage: `The '--from=${cleanTarget}' flag references stage '${cleanTarget}', but no preceding stage defines 'FROM <image> AS ${cleanTarget}'.`,
  };
}

export function isRootIdentity(userSpec: string): boolean {
  if (!userSpec) return false;
  const trimmed = userSpec.trim().toLowerCase();
  const userPart = trimmed.split(':')[0].trim();
  return userPart === 'root' || userPart === '0';
}

export function resolveVariable(
  varName: string,
  stage: DockerStage,
  globalInstructions: ParsedInstruction[] = []
): string | undefined {
  const cleanVar = varName.replace(/^[${\s]+|[}\s]+$/g, '').trim();
  if (!cleanVar) return undefined;

  const candidateInstructions = [...stage.instructions, ...globalInstructions];

  for (let i = candidateInstructions.length - 1; i >= 0; i--) {
    const inst = candidateInstructions[i];
    if (inst.instruction === 'ARG' || inst.instruction === 'ENV') {
      const args = inst.args.trim();
      const eqMatch = args.match(new RegExp(`^(?:${cleanVar})\\s*=\\s*["']?([^"'\\s]+)["']?`, 'i'));
      if (eqMatch) {
        return eqMatch[1];
      }
      const spaceMatch = args.match(new RegExp(`^(?:${cleanVar})\\s+["']?([^"'\\s]+)["']?`, 'i'));
      if (spaceMatch) {
        return spaceMatch[1];
      }
    }
  }

  return undefined;
}

export interface EffectiveUserAnalysis {
  stageIndex: number;
  isFinal: boolean;
  hasUserDirective: boolean;
  rawUserValue?: string;
  resolvedUserValue?: string;
  isRoot: boolean;
  isExplicitRoot: boolean;
  isDefaultRoot: boolean;
  isNonRoot: boolean;
  isDynamic: boolean;
  userInstruction?: ParsedInstruction;
}

export function evaluateStageUser(
  stage: DockerStage,
  globalInstructions: ParsedInstruction[] = []
): EffectiveUserAnalysis {
  if (!stage.userInstructions || stage.userInstructions.length === 0) {
    return {
      stageIndex: stage.index,
      isFinal: stage.isFinal,
      hasUserDirective: false,
      rawUserValue: undefined,
      resolvedUserValue: 'root',
      isRoot: true,
      isExplicitRoot: false,
      isDefaultRoot: true,
      isNonRoot: false,
      isDynamic: false,
      userInstruction: undefined,
    };
  }

  const lastUserInst = stage.userInstructions[stage.userInstructions.length - 1];
  const rawUser = lastUserInst.args.trim();

  // Check if rawUser is variable reference like ${APP_USER} or $APP_USER
  const isVarRef = /^\$[A-Za-z0-9_{}]|\${[A-Za-z0-9_]+}/.test(rawUser);
  let resolvedUser = rawUser;
  let isDynamic = false;

  if (isVarRef) {
    const resolved = resolveVariable(rawUser, stage, globalInstructions);
    if (resolved) {
      resolvedUser = resolved;
    } else {
      isDynamic = true;
    }
  }

  if (isDynamic) {
    return {
      stageIndex: stage.index,
      isFinal: stage.isFinal,
      hasUserDirective: true,
      rawUserValue: rawUser,
      resolvedUserValue: undefined,
      isRoot: false,
      isExplicitRoot: false,
      isDefaultRoot: false,
      isNonRoot: false,
      isDynamic: true,
      userInstruction: lastUserInst,
    };
  }

  const rootCheck = isRootIdentity(resolvedUser);

  return {
    stageIndex: stage.index,
    isFinal: stage.isFinal,
    hasUserDirective: true,
    rawUserValue: rawUser,
    resolvedUserValue: resolvedUser,
    isRoot: rootCheck,
    isExplicitRoot: rootCheck,
    isDefaultRoot: false,
    isNonRoot: !rootCheck,
    isDynamic: false,
    userInstruction: lastUserInst,
  };
}

export const SENSITIVE_FILE_PATTERNS = [
  { regex: /(?:^|\/)\.env(?:\.[a-zA-Z0-9_-]+)?$/i, name: '.env environment file' },
  { regex: /(?:^|\/)id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?$/i, name: 'SSH private key' },
  { regex: /(?:^|\/)[a-zA-Z0-9_.-]+\.(?:pem|key|pkcs12|pfx|p12)$/i, name: 'Private key/certificate file' },
  { regex: /(?:^|\/)(?:credentials|service[-_]account|client[-_]secret|gcp[-_]key)\.json$/i, name: 'Cloud credential JSON file' },
  { regex: /(?:^|\/)\.(?:dockercfg|netrc|npmrc|htpasswd)$/i, name: 'Credential or token configuration file' },
  { regex: /(?:^|\/)\.aws\/(?:credentials|config)$/i, name: 'AWS credential configuration file' },
];

export function isObviousPlaceholder(value: string): boolean {
  const trimmed = value.trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (!trimmed || trimmed.length === 0) return true;
  const placeholderKeywords = new Set([
    'none',
    'null',
    'dummy',
    'test',
    'example',
    'sample',
    'change_me',
    'changeme',
    'replace_me',
    'replace_with_your_key',
    'replace_with_your_token',
    'your_password_here',
    'your_api_key_here',
    'your_token_here',
    'your_secret_here',
    'placeholder',
    'secret',
    'password',
    'pass',
    'default',
    'dev',
    'development',
    'local',
    'production',
    'staging',
    'xxxx',
    'xxxxxx',
    '****',
    '******',
    'to_be_configured',
    'insert_here',
    'undefined',
    'false',
    'true',
  ]);
  if (placeholderKeywords.has(trimmed)) return true;
  if (/^<[^>]+>$/.test(trimmed)) return true;
  if (/^\${?[A-Za-z0-9_]+}?$/.test(trimmed)) return true;
  return false;
}
