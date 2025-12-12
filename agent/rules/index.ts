import { NoDirectComfyUICallsRule } from './no-direct-comfyui-calls.js';
import { NoDirectLLMCallsRule } from './no-direct-llm-calls.js';
import { PipelineOrchestrationHardeningRule } from './pipeline-orchestration-hardening.js';
import { RequireHydrationGateRule } from './require-hydration-gate.js';
import type { Rule } from './types.js';

export const rules: Rule[] = [
  new NoDirectComfyUICallsRule(),
  new NoDirectLLMCallsRule(),
  new PipelineOrchestrationHardeningRule(),
  new RequireHydrationGateRule(),
];
