export type ToolTab = 'nginx' | 'dockerfile' | 'csp' | 'topology';

export interface SuiteState {
  activeTool: ToolTab;
  setActiveTool: (tool: ToolTab) => void;
}
