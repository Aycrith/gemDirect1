import type { Rule, RuleContext } from './types.js';
import type { Issue } from '../core/types.js';
import * as path from 'path';

export class RequireHydrationGateRule implements Rule {
  id = 'require-hydration-gate';
  description = 'Enforce HydrationGate usage in providers';

  check(context: RuleContext): Issue[] {
    const issues: Issue[] = [];
    const { filePath, content, projectRoot } = context;
    
    if (!filePath.match(/\.(tsx)$/)) return issues;

    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Only check providers and contexts
    if (!normalizedPath.includes('contexts/') && !normalizedPath.includes('components/providers/')) {
      return issues;
    }

    // Check if it's a provider component (heuristic: exports a function named *Provider)
    if (!/export\s+(const|function)\s+\w+Provider/.test(content)) {
      return issues;
    }

    // Check if HydrationGate is used
    if (!content.includes('<HydrationGate>') && !content.includes('HydrationGate')) {
       issues.push({
          id: `require-hydration-gate-${path.basename(filePath)}`,
          type: 'warning',
          severity: 'medium',
          category: 'service-layer',
          file: path.relative(projectRoot, filePath),
          line: 1,
          message: 'Provider component detected without HydrationGate. Ensure state hydration is handled.',
          suggestedFix: 'Wrap children in <HydrationGate>',
          autoFixable: false,
          timestamp: new Date(),
        });
    }

    return issues;
  }
}
