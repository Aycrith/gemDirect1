/**
 * Agent Type Definitions
 * Core types used throughout the Project Guardian agent
 */

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueType = 'error' | 'warning' | 'gap' | 'improvement';
export type IssueCategory = 'typescript' | 'test' | 'lint' | 'build' | 'doc' | 'perf' | 'security' | 'service-layer' | 'e2e-quality';

/** Pipeline stages for E2E quality auditing */
export type PipelineStage = 
  | 'story-idea' 
  | 'story-bible' 
  | 'directors-vision' 
  | 'scenes' 
  | 'shots'
  | 'keyframes' 
  | 'videos' 
  | 'artifacts';

/** Extended issue interface for E2E quality audits */
export interface E2EQualityIssue extends Issue {
  category: 'e2e-quality';
  /** Which pipeline stage the issue affects */
  pipelineStage?: PipelineStage;
  /** Quality score from 0-100 */
  coherenceScore?: number;
  /** Prompt quality assessment */
  promptQuality?: 'poor' | 'fair' | 'good' | 'excellent';
  /** Affected data flow components */
  affectedComponents?: string[];
}

export interface Issue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  category: IssueCategory;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  suggestedFix?: string;
  autoFixable: boolean;
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface AgentConfig {
  projectRoot: string;
  watchInterval: number;       // ms between file scans
  scanInterval: number;        // ms between full scans
  reportInterval: number;      // ms between report generation
  autoFix: boolean;            // attempt automatic fixes
  autoStage: boolean;          // git add fixed files (no commit)
  maxConcurrentFixes: number;
  priorityThreshold: IssueSeverity;
  lockFile: string;            // agent lock file path
  playwrightLockFile: string;  // respect playwright lock
  logDir: string;
  queueDir: string;
  reportsDir: string;
}

export interface AgentState {
  isRunning: boolean;
  startedAt?: Date;
  lastScan?: Date;
  lastReport?: Date;
  issueCount: number;
  fixedCount: number;
  pid?: number;
}

export interface ScanResult {
  scanner: string;
  timestamp: Date;
  duration: number;
  issuesFound: Issue[];
  error?: string;
}

export interface FixResult {
  issueId: string;
  success: boolean;
  action: 'auto-fixed' | 'staged' | 'queued' | 'skipped';
  message: string;
  timestamp: Date;
}

export interface Report {
  generatedAt: Date;
  agentVersion: string;
  summary: {
    total: number;
    bySeverity: Record<IssueSeverity, number>;
    byCategory: Record<IssueCategory, number>;
    autoFixable: number;
    fixed: number;
    queued: number;
  };
  issues: Issue[];
  recentFixes: FixResult[];
}

export interface CopilotQueueItem {
  issue: Issue;
  requestedAt: Date;
  prompt: string;
  processed?: boolean;
  processedAt?: Date;
  result?: string;
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: unknown;
}

// Event types for the Guardian EventEmitter
export interface GuardianEvents {
  'issue:found': Issue;
  'issue:resolved': Issue;
  'fix:attempted': FixResult;
  'scan:started': { scanner: string };
  'scan:completed': ScanResult;
  'report:generated': Report;
  'state:changed': AgentState;
  'error': Error;
}

export const DEFAULT_CONFIG: AgentConfig = {
  projectRoot: process.cwd(),
  watchInterval: 30000,        // 30 seconds
  scanInterval: 300000,        // 5 minutes
  reportInterval: 300000,      // 5 minutes
  autoFix: true,
  autoStage: true,             // git add only, no commit
  maxConcurrentFixes: 3,
  priorityThreshold: 'medium',
  lockFile: '.guardian-lock',
  playwrightLockFile: '.playwright-lock',
  logDir: 'agent/logs',
  queueDir: 'agent/queue',
  reportsDir: 'agent/reports',
};

export const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
