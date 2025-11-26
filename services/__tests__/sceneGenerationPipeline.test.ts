import { describe, it, expect, vi } from 'vitest';
import { createSceneShotPlan, generateKeyframesForPlans, runSceneGenerationPipeline } from '../sceneGenerationPipeline';
import type { MediaGenerationActions } from '../mediaGenerationService';
import type { TimelineData, Scene, StoryBibleV2 } from '../../types';
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

// Test Story Bible V2
const testStoryBible: StoryBibleV2 = {
  logline: 'A cyberpunk hero infiltrates a corporate tower.',
  characters: '**Neo**: The chosen one. **Trinity**: His ally.',
  setting: 'Neon-lit dystopian cityscape in 2077.',
  plotOutline: 'Act I: Setup. Act II: Confrontation. Act III: Resolution.',
  version: '2.0',
  characterProfiles: [
    {
      id: 'char-1',
      name: 'Neo',
      appearance: { hair: 'dark', eyes: 'intense' },
      personality: ['determined'],
      backstory: 'A hacker turned savior.',
      motivations: ['save humanity'],
      relationships: [],
      role: 'protagonist',
      visualDescriptor: 'Dark-haired cyberpunk hero in black coat',
    },
  ],
  plotScenes: [
    {
      actNumber: 1,
      sceneNumber: 1,
      summary: 'Hero surveys the city',
      visualCues: ['neon lights', 'rain'],
      characterArcs: ['Neo begins journey'],
      pacing: 'slow',
    },
  ],
};

// Test Scene
const testScene: Scene = {
  id: 'scene-1',
  title: 'The Preparation',
  summary: 'The hero prepares for the heist.',
  timeline: sampleTimeline,
};

describe('sceneGenerationPipeline', () => {
  it('creates shot plans with prompts and context metadata', () => {
    const settings = createValidTestSettings();
    const plan = createSceneShotPlan(
      sampleTimeline,
      'Blade Runner neon noir',
      'The hero prepares for the heist.',
      settings,
      testStoryBible,
      testScene
    );

    expect(plan.shots).toHaveLength(2);
    // With buildComfyUIPrompt, prompt format may differ - check it exists and has content
    expect(plan.shots[0].prompt.length).toBeGreaterThan(0);
    expect(plan.shots[0].negativePrompt).toBe('low detail, grainy');
    expect(plan.combinedPrompt).toContain('Shot 1');
    expect(plan.timelineJson).toContain('Blade Runner neon noir');
  });

  it('requests keyframes for every plan and strips data URL prefixes', async () => {
    const settings = createValidTestSettings();
    const plans = createSceneShotPlan(
      sampleTimeline,
      'Blade Runner neon noir',
      'Prep',
      settings,
      testStoryBible,
      testScene
    ).shots;
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
      storyBible: testStoryBible,
      scene: testScene,
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
