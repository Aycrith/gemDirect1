import { describe, it, expect } from 'vitest';
import { buildShotPrompt, NEGATIVE_GUIDANCE, extendNegativePrompt } from '../comfyUIService';
import { createValidTestSettings } from './fixtures';

describe('WAN guardrails', () => {
  it('builds prompts with the single-frame instruction and guardrail guidance', () => {
    const settings = createValidTestSettings();
    const shot = { id: 's1', description: 'A moment' } as any;
    const prompt = buildShotPrompt(shot, undefined, '', settings);
    expect(prompt).toContain('Single cinematic frame');
    const negative = extendNegativePrompt('blurry');
    expect(negative).toContain(NEGATIVE_GUIDANCE);
  });
});
