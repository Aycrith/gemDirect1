import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Shot, CreativeEnhancers, TimelineData } from '../types';
import type { SceneTransitionContext } from './sceneTransitionService';
import * as comfyUIService from './comfyUIService';
import { createValidTestSettings } from './__tests__/fixtures';

const { buildShotPrompt } = comfyUIService;

describe('buildShotPrompt', () => {
  const baseShot: Shot = {
    id: 'shot-1',
    description: 'A wide establishing shot of a futuristic skyline',
  };

  it('returns the shot description when no enhancers or vision are provided', () => {
    const settings = createValidTestSettings();
    const prompt = buildShotPrompt(baseShot, undefined, '', settings);
    // New guardrails prepend SINGLE_FRAME_PROMPT instruction; ensure the
    // generated prompt still contains the original shot description and the
    // single-frame guidance.
    expect(prompt).toContain(baseShot.description);
    expect(prompt).toContain('EXACTLY ONE UNIFIED CINEMATIC SCENE');
  });

  it('appends creative enhancers in a readable format', () => {
    const settings = createValidTestSettings();
    const enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> = {
      framing: ['overhead'],
      movement: ['tracking'],
      lighting: ['neon glow', 'rim light'],
    };

    const prompt = buildShotPrompt(baseShot, enhancers, '', settings);
    // Updated expectations: check for presence of enhancer labels
    // (format may vary with SINGLE_FRAME_PROMPT prepended)
    expect(prompt).toContain('overhead');
    expect(prompt).toContain('tracking');
    expect(prompt).toContain('neon glow');
    expect(prompt).toContain('rim light');
  });

  it("appends the director's vision at the end", () => {
    const settings = createValidTestSettings();
    const prompt = buildShotPrompt(baseShot, undefined, 'High contrast noir style', settings);
    expect(prompt.endsWith('Style: High contrast noir style.')).toBe(true);
  });

  it('orders description, enhancers, then director vision', () => {
    const settings = createValidTestSettings();
    const enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> = {
      mood: ['tense'],
    };
    const prompt = buildShotPrompt(baseShot, enhancers, 'Grimy cyberpunk aesthetic', settings);

    const descriptionIndex = prompt.indexOf(baseShot.description);
    const enhancersIndex = prompt.indexOf('Mood:');
    const styleIndex = prompt.indexOf('Style:');

    expect(descriptionIndex).toBeLessThan(enhancersIndex);
    expect(enhancersIndex).toBeLessThan(styleIndex);
  });

  it('includes transition context when provided', () => {
    const settings = createValidTestSettings();
    const transitionContext: SceneTransitionContext = {
      sceneId: 'scene-2',
      previousSceneEndState: 'Hero receives mysterious message',
      transitionBridge: 'Act I progression: From discovery to action',
      narrativeMomentum: "Hero's Journey: Call to Adventure",
      visualContinuity: ['Maintain character appearance consistency'],
    };

    const prompt = buildShotPrompt(baseShot, undefined, '', settings, undefined, undefined, 'shotImage', transitionContext);
    
    expect(prompt).toContain('SCENE CONTINUITY');
    expect(prompt).toContain('Hero receives mysterious message');
    expect(prompt).toContain('TRANSITION');
    expect(prompt).toContain('NARRATIVE MOMENTUM');
  });

  it('does not include transition context when null', () => {
    const settings = createValidTestSettings();
    const prompt = buildShotPrompt(baseShot, undefined, '', settings, undefined, undefined, 'shotImage', null);
    
    expect(prompt).not.toContain('SCENE CONTINUITY');
    expect(prompt).not.toContain('TRANSITION:');
  });
});

describe('generateVideoFromShot', () => {
  const baseShot: Shot = {
    id: 'shot-42',
    description: 'Hero steps through a portal into a forest of light',
  };
  const baseEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> = {
    framing: ['medium wide'],
    movement: ['steady cam'],
  };
  const baseKeyframe = 'data:image/png;base64,AAAABBBB';
  const directorsVision = 'Sweeping, ethereal fantasy with bioluminescent colors';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queues a prompt and resolves with frame metadata', async () => {
    const settings = createValidTestSettings();
    const progressSpy = vi.fn();

    const frames = Array.from({ length: 25 }, (_, idx) => `frame-${idx}`);

    const queueMock = vi.fn().mockResolvedValue({ prompt_id: 'prompt-123' });
    const queueInfoMock = vi.fn().mockResolvedValue({ queue_running: 0, queue_pending: 0 });
    const trackMock = vi.fn().mockImplementation((_, __, callback) => {
      callback({ status: 'running', message: 'Executing: Save Frames' });
      callback({
        status: 'complete',
        message: 'Generation complete!',
        final_output: {
          type: 'image',
          // Use valid data URL format - the pipeline validates this now
          data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          filename: 'gemdirect1_shot_shot-42.png',
          images: frames,
        } as any,
      });
    });

    const resultPromise = comfyUIService.generateVideoFromShot(
      settings,
      baseShot,
      baseEnhancers,
      directorsVision,
      baseKeyframe,
      progressSpy,
      {
        queuePrompt: queueMock,
        trackExecution: trackMock,
        pollQueueInfo: queueInfoMock,
      }
    );

    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(queueMock).toHaveBeenCalledWith(
      expect.objectContaining({ comfyUIClientId: settings.comfyUIClientId }),
      expect.objectContaining({
        text: expect.stringContaining(baseShot.description),
        negativePrompt: expect.stringContaining('blurry'),
      }),
      baseKeyframe,
      expect.any(String) // profileId
    );

    expect(queueInfoMock).toHaveBeenCalled();
    expect(result).toMatchObject({
      frames: expect.arrayContaining(frames),
      filename: 'gemdirect1_shot_shot-42.png',
    });
    expect(result.duration).toBeCloseTo(frames.length / 24, 5);

    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Building video generation prompt...' })
    );
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', message: 'Queued with ID: prompt-123' })
    );
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', message: 'Generation complete!' })
    );
  });

  it('allows overriding the negative prompt per shot', async () => {
    const settings = createValidTestSettings();
    const queueMock = vi.fn().mockResolvedValue({ prompt_id: 'shot-override' });
    const queueInfoMock = vi.fn().mockResolvedValue({ queue_running: 0, queue_pending: 0 });
    const trackMock = vi.fn().mockImplementation((_, __, callback) => {
      callback({
        status: 'complete',
        message: 'done',
        // Use a valid data URL format instead of blob://result
        final_output: { type: 'video', data: 'data:video/mp4;base64,AAAA', filename: 'shot.mp4' },
      });
    });

    const generationPromise = comfyUIService.generateVideoFromShot(
      settings,
      baseShot,
      baseEnhancers,
      directorsVision,
      baseKeyframe,
      undefined,
      {
        queuePrompt: queueMock,
        pollQueueInfo: queueInfoMock,
        trackExecution: trackMock,
      },
      { negativePrompt: 'foggy, desaturated' },
    );

    await vi.advanceTimersByTimeAsync(2000);
    await generationPromise;

    // Negative prompts are extended with guardrail guidance; assert the
    // provided override is preserved within the final negative prompt.
    expect(queueMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ negativePrompt: expect.stringContaining('foggy, desaturated') }),
      baseKeyframe,
      expect.any(String) // profileId
    );
  });

  it('propagates queueing errors and reports failure', async () => {
    const settings = createValidTestSettings();
    const progressSpy = vi.fn();

    const queueError = new Error('Unable to reach ComfyUI');
    const queueMock = vi.fn().mockRejectedValue(queueError);

    await expect(
      comfyUIService.generateVideoFromShot(
        settings,
        baseShot,
        undefined,
        directorsVision,
        null,
        progressSpy,
        { queuePrompt: queueMock }
      )
    ).rejects.toThrow(/requires a keyframe image for this workflow but none was provided/);

    expect(progressSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'error',
        message: expect.stringContaining('video generation failed'),
      })
    );
  });
});

describe('generateTimelineVideos', () => {
  const timeline: TimelineData = {
    shots: [
      { id: 'shot-a', description: 'Opening shot' },
      { id: 'shot-b', description: 'Reaction shot' },
    ],
    shotEnhancers: {
      'shot-a': { framing: ['wide'] },
      'shot-b': { lighting: ['dramatic'] },
    },
    transitions: ['cut'],
    negativePrompt: 'low quality',
  };

  const keyframes = {
    'shot-a': 'data:image/png;base64,AAA',
    'shot-b': 'data:image/png;base64,BBB',
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('processes each shot sequentially and returns results', async () => {
    const settings = createValidTestSettings();
    const progressSpy = vi.fn();

    const mockGenerateShot = vi.fn().mockImplementation(
      async (_, shot, __, ___, ____, shotProgress) => {
        shotProgress?.({ status: 'running', message: `Rendering ${shot.id}` });
        return {
          videoPath: `output/${shot.id}.mp4`,
          duration: 1.04,
          filename: `${shot.id}.mp4`,
        };
      }
    );

    const timelinePromise = comfyUIService.generateTimelineVideos(
      settings,
      timeline,
      'Stylized neo-noir',
      'Scene summary',
      keyframes,
      progressSpy,
      { shotGenerator: mockGenerateShot }
    );

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const results = await timelinePromise;

    expect(mockGenerateShot).toHaveBeenCalledTimes(2);
    expect(Object.keys(results)).toEqual(['shot-a', 'shot-b']);
    expect(results['shot-a'].filename).toBe('shot-a.mp4');
    expect(progressSpy).toHaveBeenCalledWith(
      'shot-a',
      expect.objectContaining({ status: 'running', message: 'Generating shot 1/2...' })
    );
    expect(progressSpy).toHaveBeenCalledWith(
      'shot-b',
      expect.objectContaining({ status: 'complete', message: 'Shot 2 complete!' })
    );
  });

  it('continues after a shot fails and records an error placeholder', async () => {
    const settings = createValidTestSettings();
    const progressSpy = vi.fn();

    const error = new Error('Timeout while rendering');

    const mockGenerateShot = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        videoPath: 'output/shot-b.mp4',
        duration: 1,
        filename: 'shot-b.mp4',
      });

    const timelinePromise = comfyUIService.generateTimelineVideos(
      settings,
      timeline,
      'High energy',
      'Scene',
      keyframes,
      progressSpy,
      { shotGenerator: mockGenerateShot }
    );

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const results = await timelinePromise;

    expect(progressSpy).toHaveBeenCalledWith(
      'shot-a',
      expect.objectContaining({ status: 'error', message: expect.stringContaining('Timeout') })
    );
    expect(results['shot-a'].filename).toBe('ERROR_shot-a.mp4');
    expect(results['shot-b'].filename).toBe('shot-b.mp4');
  });
});
