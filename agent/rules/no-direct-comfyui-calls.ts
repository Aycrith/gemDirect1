import type { Rule, RuleContext } from './types.js';
import type { Issue } from '../core/types.js';
import * as path from 'path';

export class NoDirectComfyUICallsRule implements Rule {
  id = 'no-direct-comfyui-calls';
  description = 'Enforce queue-safe ComfyUI entrypoints (avoid direct queueComfyUIPrompt/queueVideoGeneration calls)';

  check(context: RuleContext): Issue[] {
    const issues: Issue[] = [];
    const { filePath, content, projectRoot } = context;
    
    // Only check TS/TSX files
    if (!filePath.match(/\.(ts|tsx)$/)) return issues;

    // Skip the service definition files themselves and tests
    // We normalize path separators to forward slashes for consistent checking
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    if (normalizedPath.includes('services/comfyUIService.ts') || 
        normalizedPath.includes('services/videoGenerationService.ts') ||
        normalizedPath.includes('.test.ts') || 
        normalizedPath.includes('.spec.ts')) {
      return issues;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      // Ignore comments (simple heuristic)
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line) || /^\s*\/\*/.test(line)) continue;

      // Prefer queue-safe entry points:
      // - queueComfyUIPromptWithQueue (services/comfyUIService)
      // - queueComfyUIPromptSafe (services/videoGenerationService)
      //
      // Check for direct queueComfyUIPrompt usage (word boundary avoids matching Safe/WithQueue variants).
      if (/\bqueueComfyUIPrompt\s*\(/.test(line)) {
        issues.push({
          id: `no-direct-comfyui-prompt-${path.basename(filePath)}-${i + 1}`,
          type: 'error',
          severity: 'high',
          category: 'service-layer',
          file: path.relative(projectRoot, filePath),
          line: i + 1,
          message:
            'Direct call to queueComfyUIPrompt detected. Use a queue-safe entrypoint (queueComfyUIPromptWithQueue or queueComfyUIPromptSafe).',
          suggestedFix: 'Replace with queueComfyUIPromptWithQueue (preferred) or queueComfyUIPromptSafe',
          autoFixable: false,
          timestamp: new Date(),
        });
      }

      // Check for direct queueVideoGeneration usage (avoid bypassing GenerationQueue).
      // Word boundary avoids matching queueVideoGenerationWithQueue.
      if (/\bqueueVideoGeneration\s*\(/.test(line)) {
        issues.push({
          id: `no-direct-comfyui-video-${path.basename(filePath)}-${i + 1}`,
          type: 'error',
          severity: 'high',
          category: 'service-layer',
          file: path.relative(projectRoot, filePath),
          line: i + 1,
          message:
            'Direct call to queueVideoGeneration detected. Use queueVideoGenerationWithQueue to respect GenerationQueue when enabled.',
          suggestedFix: 'Replace with queueVideoGenerationWithQueue',
          autoFixable: false,
          timestamp: new Date(),
        });
      }
    }

    return issues;
  }
}
