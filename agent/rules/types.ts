import type { Issue } from '../core/types.js';

export interface RuleContext {
  projectRoot: string;
  filePath: string;
  content: string;
}

export interface Rule {
  id: string;
  description: string;
  check(context: RuleContext): Issue[];
}
