import {
  DockerfileTopologyGraph,
  DockerPipelineStage,
  NodeStatus,
} from '../../types/topology';
import { auditDockerfile } from '../dockerfile/linter';

export function buildDockerfileTopologyGraph(content: string): DockerfileTopologyGraph {
  if (!content || !content.trim()) {
    return {
      isMultiStage: false,
      totalStages: 0,
      totalLayers: 0,
      securityScore: 0,
      criticalIssues: ['Dockerfile is empty. Load or paste a Dockerfile to inspect build layers.'],
      pipeline: [],
    };
  }

  const lines = content.split('\n');
  const fromMatches = Array.from(content.matchAll(/^FROM\s+([^\s]+)(?:\s+AS\s+([^\s]+))?/gim));
  const isMultiStage = fromMatches.length > 1;

  // Extract Base Images
  const baseImages = fromMatches.map((m) => m[1]);
  const primaryBase = baseImages[baseImages.length - 1] || 'scratch';
  const builderBase = isMultiStage ? baseImages[0] : null;

  const isUnpinned = baseImages.some((img) => img.endsWith(':latest') || !img.includes(':'));

  // Extract User
  const userMatches = Array.from(content.matchAll(/^USER\s+([^\s]+)/gim));
  const finalUser = userMatches.length > 0 ? userMatches[userMatches.length - 1][1] : 'root (default)';
  const isRootUser = finalUser.toLowerCase() === 'root' || finalUser === '0' || finalUser.includes('default');

  // Extract Ports
  const exposeMatches = Array.from(content.matchAll(/^EXPOSE\s+([^\n]+)/gim));
  const exposedPorts = exposeMatches.map((m) => m[1].trim()).join(', ') || 'No exposed ports';

  // Extract Entrypoint / CMD
  const cmdMatch = content.match(/^(?:CMD|ENTRYPOINT)\s+([^\n]+)/im);
  const entrypoint = cmdMatch ? cmdMatch[1].trim() : 'Default Image Entrypoint';

  // Check Caching Pattern (Manifest copied before full source copy)
  const copyMatches = Array.from(content.matchAll(/^COPY\s+([^\n]+)/gim));
  const hasEarlyManifestCopy = copyMatches.some((m) =>
    /package.*json|go\.mod|requirements.*txt|pom\.xml|Gemfile|Cargo\.toml/i.test(m[1])
  );

  // Check Multi-Stage Copy
  const hasCrossStageCopy = copyMatches.some((m) => m[1].includes('--from='));

  // Extract RUN commands
  const runMatches = Array.from(content.matchAll(/^RUN\s+([^\n]+)/gim)).map((m) => m[1].trim());

  const pipeline: DockerPipelineStage[] = [];

  // Stage 1: Base Image & OS Ingress
  const baseStatus: NodeStatus = isUnpinned ? 'warning' : 'active';
  pipeline.push({
    id: 'stage-base',
    stepNumber: 1,
    stageType: 'base',
    icon: '📦',
    title: '1. Base OS & Image Ingress',
    subtext: isMultiStage ? `Builder: ${builderBase} · Runner: ${primaryBase}` : primaryBase,
    badge: isUnpinned ? 'UNPINNED TAG' : 'PINNED OS',
    status: baseStatus,
    statusLabel: isUnpinned ? 'RISK: UNPINNED' : 'BASE SECURED',
    metrics: {
      primaryLabel: 'Base Image',
      primaryValue: primaryBase.split('/')[primaryBase.split('/').length - 1],
      secondaryLabel: 'Multi-Stage',
      secondaryValue: isMultiStage ? `${fromMatches.length} Stages` : 'Single Stage',
    },
    details: [
      `Primary Base: ${primaryBase}`,
      ...(builderBase ? [`Build Environment: ${builderBase}`] : []),
      `Version Tag: ${isUnpinned ? 'Unpinned (e.g. :latest - reproducibility risk)' : 'Explicit version tag pinned'}`,
      `OS Architecture: ${primaryBase.includes('alpine') ? 'Alpine Minimal (< 8MB)' : primaryBase.includes('distroless') ? 'Google Distroless (Ultra-Slim)' : 'Standard Linux'}`,
    ],
  });

  // Stage 2: Dependency Caching & Build
  const cacheStatus: NodeStatus = hasEarlyManifestCopy ? 'active' : 'warning';
  pipeline.push({
    id: 'stage-build',
    stepNumber: 2,
    stageType: 'build',
    icon: '⚡',
    title: '2. Caching & Compilation Layer',
    subtext: hasEarlyManifestCopy ? 'Optimized Docker Layer Caching' : 'Sub-optimal Caching Boundary',
    badge: hasEarlyManifestCopy ? 'LAYER CACHED' : 'UNCACHED MANIFEST',
    status: cacheStatus,
    statusLabel: hasEarlyManifestCopy ? 'CACHE OPTIMIZED' : 'CACHE WARNING',
    metrics: {
      primaryLabel: 'Cache Strategy',
      primaryValue: hasEarlyManifestCopy ? 'Manifest-First' : 'Full-Copy',
      secondaryLabel: 'Build Commands',
      secondaryValue: `${runMatches.length} RUN Layers`,
    },
    details: [
      `Manifest Pre-Copy: ${hasEarlyManifestCopy ? 'Active (Dependencies cached on disk)' : 'Missing (Rebuilds dependencies on every code change)'}`,
      `Build Instructions: ${runMatches.length > 0 ? runMatches.slice(0, 2).join(' && ') : 'None'}`,
      `Layer Chaining: ${runMatches.length > 3 ? 'Consider consolidating RUN commands to minimize layer size' : 'Clean layer count'}`,
    ],
  });

  // Stage 3: Multi-Stage Artifact Extraction
  const artifactStatus: NodeStatus = isMultiStage && hasCrossStageCopy ? 'active' : 'warning';
  pipeline.push({
    id: 'stage-artifact',
    stepNumber: 3,
    stageType: 'artifact',
    icon: '🔄',
    title: '3. Multi-Stage Artifact Transfer',
    subtext: isMultiStage && hasCrossStageCopy
      ? 'Compiled Binaries Transferred · Build Tools Stripped'
      : isMultiStage
      ? 'Multi-Stage Declared'
      : 'Single-Stage (Heavy Container Footprint)',
    badge: isMultiStage ? 'SLIM MULTI-STAGE' : 'FAT CONTAINER',
    status: artifactStatus,
    statusLabel: isMultiStage && hasCrossStageCopy ? 'SLIM RUNTIME' : 'SINGLE STAGE',
    metrics: {
      primaryLabel: 'Build Pipeline',
      primaryValue: isMultiStage ? 'Multi-Stage' : 'Single Stage',
      secondaryLabel: 'Toolchain Isolation',
      secondaryValue: hasCrossStageCopy ? 'Compilers Stripped' : 'Includes Compilers',
    },
    details: [
      `Multi-Stage Isolation: ${isMultiStage ? 'Enabled (Build tools excluded from runtime)' : 'Disabled (Container contains compilers & dev tools)'}`,
      `Cross-Stage Copy: ${hasCrossStageCopy ? 'Active (COPY --from=<stage>)' : 'None'}`,
      `Security Benefit: Minimizes container attack surface and decreases image size by up to 80%`,
    ],
  });

  // Stage 4: Production Container Runtime (Destination)
  const runtimeStatus: NodeStatus = isRootUser ? 'warning' : 'active';
  pipeline.push({
    id: 'stage-runtime',
    stepNumber: 4,
    stageType: 'runtime',
    icon: '🛡️',
    title: '4. Hardened Production Container',
    subtext: `User: ${finalUser} · Ports: ${exposedPorts}`,
    badge: isRootUser ? 'ROOT PRIVILEGE' : 'NON-ROOT SECURED',
    status: runtimeStatus,
    statusLabel: isRootUser ? 'CRITICAL: ROOT' : 'USER ISOLATED',
    metrics: {
      primaryLabel: 'Runtime User',
      primaryValue: finalUser,
      secondaryLabel: 'Exposed Ports',
      secondaryValue: exposedPorts.split(',')[0],
    },
    details: [
      `Execution Identity: ${isRootUser ? 'CRITICAL: Running as root (Vulnerable to container breakout)' : `Non-root user (${finalUser}) enforced`}`,
      `Network Exposure: ${exposedPorts}`,
      `Entrypoint Command: ${entrypoint}`,
      `Runtime Protection: ${!isRootUser ? 'Principle of Least Privilege Active' : 'Requires non-root USER directive'}`,
    ],
  });

  const audit = auditDockerfile(content);
  const criticalIssues = audit.issues
    .filter((i) => i.severity === 'critical')
    .map((i) => `${i.ruleCode}: ${i.title}`);

  const totalLayers = lines.filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('#');
  }).length;

  return {
    isMultiStage,
    totalStages: fromMatches.length || 1,
    totalLayers,
    securityScore: audit.score,
    criticalIssues,
    pipeline,
  };
}
