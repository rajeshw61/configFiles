export type NodeStatus = 'active' | 'bypassed' | 'warning';

export type RouteActionType = 'proxy' | 'static' | 'redirect' | 'deny';

export interface LocationRouteNode {
  id: string;
  path: string;
  actionType: RouteActionType;
  target: string;
  directives: string[];
  rateLimit?: string;
  websocket?: boolean;
  timeout?: string;
}

export interface ServerBlockNode {
  id: string;
  serverName: string;
  listenPort: string;
  isSsl: boolean;
  http2: boolean;
  sslProfile?: string;
  locations: LocationRouteNode[];
}

export interface TopologyNode {
  id: string;
  stepNumber: number;
  icon: string;
  title: string;
  subtext: string;
  status: NodeStatus;
  statusLabel: string;
  port?: string;
  nodeType: 'source' | 'server' | 'location' | 'destination';
  metrics?: {
    primaryLabel: string;
    primaryValue: string;
    secondaryLabel?: string;
    secondaryValue?: string;
  };
  details: string[];
}

export type TopologyViewMode = 'nginx' | 'dockerfile';

export type DockerLayerType =
  | 'BASE_IMAGE'
  | 'ENV_SETUP'
  | 'DEP_CACHE'
  | 'BUILD_STEP'
  | 'COPY_ARTIFACT'
  | 'SECURITY_USER'
  | 'PORT_EXPOSE'
  | 'RUNTIME_ENTRY';

export interface DockerLayerNode {
  id: string;
  instruction: string;
  args: string;
  layerType: DockerLayerType;
  description: string;
  isSecurityCritical: boolean;
  status: NodeStatus;
  statusLabel: string;
  stageName: string;
  lineNumber: number;
}

export interface DockerBuildStageNode {
  id: string;
  stageName: string;
  baseImage: string;
  isBuilderStage: boolean;
  isFinalStage: boolean;
  user: string;
  exposedPorts: string[];
  entrypoint?: string;
  cmd?: string;
  layers: DockerLayerNode[];
}

export interface DockerPipelineStage {
  id: string;
  stepNumber: number;
  stageType: 'base' | 'build' | 'artifact' | 'runtime';
  title: string;
  subtext: string;
  icon: string;
  status: NodeStatus;
  statusLabel: string;
  badge: string;
  metrics: {
    primaryLabel: string;
    primaryValue: string;
    secondaryLabel?: string;
    secondaryValue?: string;
  };
  details: string[];
}

export interface DockerfileTopologyGraph {
  isMultiStage: boolean;
  totalStages: number;
  totalLayers: number;
  securityScore: number;
  criticalIssues: string[];
  pipeline: DockerPipelineStage[];
}

export interface TopologyGraph {
  targetDomain: string;
  ingress: {
    domain: string;
    ports: string[];
    protocol: string;
  };
  serverBlocks: ServerBlockNode[];
  nodes: TopologyNode[];
}
