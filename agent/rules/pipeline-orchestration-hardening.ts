import type { Rule, RuleContext } from './types.js';
import type { Issue } from '../core/types.js';
import * as path from 'path';

const normalizePath = (p: string): string => p.replace(/\\/g, '/');

const createIssue = (
  projectRoot: string,
  filePath: string,
  line: number,
  suffix: string,
  message: string
): Issue => ({
  id: `pipeline-orchestration-${suffix}-${path.basename(filePath)}-${line}`,
  type: 'error',
  severity: 'high',
  category: 'service-layer',
  file: path.relative(projectRoot, filePath),
  line,
  message,
  suggestedFix: 'Restore the orchestration hardening contract from plan.md (retries/progress/export-all).',
  autoFixable: false,
  timestamp: new Date(),
});

const hasTaskMaxRetries = (content: string, taskType: string): boolean => {
  const needle = `type: '${taskType}'`;
  const idx = content.indexOf(needle);
  if (idx < 0) return false;

  // Look forward within a bounded window for maxRetries in the same object literal.
  // (Heuristic: we don't parse TS AST here.)
  const window = content.slice(idx, idx + 600);
  return /maxRetries\s*:/.test(window) || /\bmaxRetries\b\s*,/.test(window);
};

export class PipelineOrchestrationHardeningRule implements Rule {
  id = 'pipeline-orchestration-hardening';
  description = 'Require retry wiring + retry defaults for pipeline orchestration (P4.4)';

  check(context: RuleContext): Issue[] {
    const issues: Issue[] = [];
    const normalizedFilePath = normalizePath(context.filePath);

    const isPipelineFactory = normalizedFilePath.endsWith('services/pipelineFactory.ts');
    const isPipelineEngine = normalizedFilePath.endsWith('services/pipelineEngine.ts');
    if (!isPipelineFactory && !isPipelineEngine) return issues;

    if (isPipelineEngine) {
      if (!/store\.retryTask\s*\(/.test(context.content)) {
        issues.push(
          createIssue(
            context.projectRoot,
            context.filePath,
            1,
            'missing-retryTask',
            'pipelineEngine must call store.retryTask(...) when task.maxRetries permits retry.'
          )
        );
      }

      if (!/task\.maxRetries/.test(context.content)) {
        issues.push(
          createIssue(
            context.projectRoot,
            context.filePath,
            1,
            'missing-maxRetries-check',
            'pipelineEngine must consult task.maxRetries to decide whether to retry failed tasks.'
          )
        );
      }

      return issues;
    }

    // pipelineFactory.ts: ensure default maxRetries is present and applied to task objects.
    if (!/\bmaxRetries\s*=\s*1\b/.test(context.content)) {
      issues.push(
        createIssue(
          context.projectRoot,
          context.filePath,
          1,
          'missing-default',
          'pipelineFactory should default maxRetries=1 for generation tasks (P4.4 stage retries).'
        )
      );
    }

    const requiredTaskTypes = ['generate_keyframe', 'generate_video', 'upscale_video', 'interpolate_video'] as const;
    for (const taskType of requiredTaskTypes) {
      if (!hasTaskMaxRetries(context.content, taskType)) {
        issues.push(
          createIssue(
            context.projectRoot,
            context.filePath,
            1,
            `missing-maxRetries-${taskType}`,
            `pipelineFactory must set maxRetries on '${taskType}' tasks to enable orchestrated retries.`
          )
        );
      }
    }

    return issues;
  }
}

