import { describe, it, expect, vi } from 'vitest';
import { createSceneShotPlan, generateKeyframesForPlans, runSceneGenerationPipeline } from '../sceneGenerationPipeline';
import type { MediaGenerationActions } from '../mediaGenerationService';
import type { TimelineData } from '../../types';
import { createValidTestSettings } from './fixtures';

const sampleTimeline: TimelineData = {
  shots: [
    { id: 'shot-1', description: 'Hero surveys the neon skyline.' },
    { id: 'shot-2', description: 'Close-up on the hero activating the gauntlet.' },
  ],
  shotEnhancers: {
    'shot-1': { mood: ['tense'] },
    'shot-2': { lighting: ['volumetric'] },
  },
  transitions: ['Cut'],
  negativePrompt: 'low detail, grainy',
};

describe('sceneGenerationPipeline', () => {
  it('creates shot plans with prompts and context metadata', () => {
    const plan = createSceneShotPlan(sampleTimeline, 'Blade Runner neon noir', 'The hero prepares for the heist.');

    expect(plan.shots).toHaveLength(2);
    expect(plan.shots[0].prompt).toContain(sampleTimeline.shots[0].description);
    expect(plan.shots[0].negativePrompt).toBe('low detail, grainy');
    expect(plan.combinedPrompt).toContain('Shot 1');
    expect(plan.timelineJson).toContain('Blade Runner neon noir');
  });

  it('requests keyframes for every plan and strips data URL prefixes', async () => {
    const plans = createSceneShotPlan(sampleTimeline, 'Blade Runner neon noir', 'Prep').shots;
    const mediaActions: MediaGenerationActions = {
      generateKeyframeForScene: vi.fn(),
      generateImageForShot: vi
        .fn()
        .mockResolvedValueOnce('data:image/png;base64,AAA111')
        .mockResolvedValueOnce('BBB222'),
    };

    const result = await generateKeyframesForPlans(plans, {
      mediaActions,
      directorsVision: 'Blade Runner neon noir',
      sceneSummary: 'Prep',
      logApiCall: vi.fn(),
    });

    expect(mediaActions.generateImageForShot).toHaveBeenCalledTimes(2);
    expect(result.keyframes['shot-1']).toBe('AAA111');
    expect(result.keyframes['shot-2']).toBe('BBB222');
    expect(result.errors).toHaveLength(0);
  });

  it('runs the full pipeline, merges keyframes, and calls timeline generation', async () => {
    const mediaActions: MediaGenerationActions = {
      generateKeyframeForScene: vi.fn(),
      generateImageForShot: vi.fn().mockResolvedValue('SHOT_IMAGE'),
    };
    const generateVideosMock = vi.fn().mockResolvedValue({
      'shot-1': { videoPath: 'path-1', duration: 1, filename: 'shot-1.mp4' },
      'shot-2': { videoPath: 'path-2', duration: 1, filename: 'shot-2.mp4' },
    });
    const settings = createValidTestSettings();

    const result = await runSceneGenerationPipeline({
      settings,
      timeline: sampleTimeline,
      directorsVision: 'Blade Runner neon noir',
      sceneSummary: 'Prep',
      mediaActions,
      logApiCall: vi.fn(),
      existingKeyframes: { 'shot-1': 'EXISTING' },
      dependencies: { generateVideos: generateVideosMock },
    });

    expect(generateVideosMock).toHaveBeenCalledWith(
      settings,
      sampleTimeline,
      'Blade Runner neon noir',
      'Prep',
      {
        'shot-1': 'EXISTING',
        'shot-2': 'SHOT_IMAGE',
      },
      undefined,
      { dependencies: undefined },
    );
    expect(result.keyframes).toEqual({
      'shot-1': 'EXISTING',
      'shot-2': 'SHOT_IMAGE',
    });
    expect(result.keyframeErrors).toHaveLength(0);
  });
});
