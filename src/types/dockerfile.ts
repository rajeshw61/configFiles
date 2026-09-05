export type Severity = 'critical' | 'warning' | 'optimization';

export interface LintIssue {
  id: string;
  ruleCode: string;
  severity: Severity;
  title: string;
  description: string;
  lineNumber: number;
  snippet?: string;
  fixDescription?: string;
  patch?: {
    from: string;
    to: string;
  };
}

export interface DockerfileAuditResult {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  issues: LintIssue[];
  criticalCount: number;
  warningCount: number;
  optimizationCount: number;
  syntaxValid: boolean;
}
