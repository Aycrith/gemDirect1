import { describe, it, expect } from 'vitest';
import { buildShotPrompt, NEGATIVE_GUIDANCE, extendNegativePrompt } from '../comfyUIService';
import { createValidTestSettings } from './fixtures';

describe('WAN guardrails', () => {
  it('builds prompts with the single-frame instruction and guardrail guidance', () => {
    const settings = createValidTestSettings();
    const shot = { id: 's1', description: 'A moment' } as any;
    const prompt = buildShotPrompt(shot, undefined, '', settings);
    // Updated to match current SINGLE_FRAME_PROMPT format (2025-11-24)
    // Check for key phrases from SINGLE_FRAME_PROMPT constant
    expect(prompt).toContain('EXACTLY ONE UNIFIED CINEMATIC SCENE');
    const negative = extendNegativePrompt('blurry');
    expect(negative).toContain(NEGATIVE_GUIDANCE);
  });
});
