import type { Rule, RuleContext } from './types.js';
import type { Issue } from '../core/types.js';
import * as path from 'path';

export class NoDirectLLMCallsRule implements Rule {
  id = 'no-direct-llm-calls';
  description = 'Enforce usage of LLMTransportAdapter instead of direct SDK calls';

  check(context: RuleContext): Issue[] {
    const issues: Issue[] = [];
    const { filePath, content, projectRoot } = context;
    
    if (!filePath.match(/\.(ts|tsx)$/)) return issues;

    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Skip service files that implement the transport
    if (normalizedPath.includes('services/geminiService.ts') || 
        normalizedPath.includes('services/llmTransportAdapter.ts') ||
        normalizedPath.includes('.test.ts') || 
        normalizedPath.includes('.spec.ts')) {
      return issues;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Check for GoogleGenerativeAI usage
      if (/\bGoogleGenerativeAI\b/.test(line)) {
        issues.push({
          id: `no-direct-llm-${path.basename(filePath)}-${i + 1}`,
          type: 'error',
          severity: 'high',
          category: 'service-layer',
          file: path.relative(projectRoot, filePath),
          line: i + 1,
          message: 'Direct usage of GoogleGenerativeAI detected. Use geminiService or LLMTransportAdapter.',
          suggestedFix: 'Use geminiService functions',
          autoFixable: false,
          timestamp: new Date(),
        });
      }
    }

    return issues;
  }
}
