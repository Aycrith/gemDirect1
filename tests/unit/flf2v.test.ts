import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as comfyUIService from '../../services/comfyUIService';
import { createValidTestSettings } from '../../services/__tests__/fixtures';
import { TimelineData, Shot } from '../../types';

// Mock dependencies
vi.mock('../../utils/videoUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/videoUtils')>();
  return {
    ...actual,
    extractFramesFromVideo: vi.fn().mockResolvedValue(['frame1_base64', 'frame2_base64', 'last_frame_base64']),
    base64ToBlob: vi.fn().mockReturnValue(new Blob(['fake-video-content'], { type: 'video/mp4' })),
  };
});

describe('FLF2V Scaffolding', () => {
  const timeline: TimelineData = {
    shots: [
      { id: 'shot-1', description: 'Shot 1' },
      { id: 'shot-2', description: 'Shot 2' },
    ] as Shot[],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: 'blurry',
  };

  const keyframes = {
    'shot-1': 'keyframe-1',
    // Shot 2 has no keyframe initially, should get it from Shot 1
  };

  beforeEach(() => {
    // vi.useFakeTimers();
  });

  afterEach(() => {
    // vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('chains shots when FLF2V is enabled', async () => {
    const settings = createValidTestSettings();
    // Enable FLF2V (assuming we add this flag later)
    (settings as any).featureFlags = { ...settings.featureFlags, enableFLF2V: true };
    
    const progressSpy = vi.fn();

    // Mock shot generator
    const mockGenerateShot = vi.fn().mockImplementation(
      async (_, shot) => {
        return {
          videoPath: `data:video/mp4;base64,fakevideo_${shot.id}`,
          duration: 1,
          filename: `${shot.id}.mp4`,
        };
      }
    );

    // We need to spy on generateTimelineVideos internals or mock generateVideoFromShot
    // Since generateTimelineVideos calls generateVideoFromShot directly (or via dependency injection if we refactor),
    // we can use the dependency injection pattern if available, or mock the module.
    
    // For this test, we assume we can pass the shot generator as an option (which we can in the current implementation)
    
    await comfyUIService.generateTimelineVideos(
      settings,
      timeline,
      'Vision',
      'Summary',
      keyframes,
      progressSpy,
      { shotGenerator: mockGenerateShot }
    );

    // Verify Shot 1 was generated with initial keyframe
    expect(mockGenerateShot).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ id: 'shot-1' }),
      undefined, // enhancers
      expect.anything(), // directorsVision
      'keyframe-1', // Initial keyframe
      expect.anything(), // progressCallback
      undefined, // dependencies
      expect.anything()  // options
    );

    // Verify Shot 2 was generated with the LAST FRAME of Shot 1
    // In the real implementation, we expect 'data:image/jpeg;base64,last_frame_base64' (from the mock extractFramesFromVideo)
    // to be passed as the keyframe for Shot 2.
    
    expect(mockGenerateShot).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ id: 'shot-2' }),
      undefined, // enhancers
      expect.anything(), // directorsVision
      'data:image/jpeg;base64,last_frame_base64', // Chained keyframe
      expect.anything(), // progressCallback
      undefined, // dependencies
      expect.objectContaining({ endKeyframe: undefined })
    );
  });
    //   'last_frame_base64', // The extracted frame
    //   expect.anything(),
    //   expect.anything(),
    //   expect.anything()
    // );

  it('uses shot keyframe as endKeyframe when FLF2V is enabled and previous shot exists', async () => {
    const settings = createValidTestSettings();
    (settings as any).featureFlags = { ...settings.featureFlags, enableFLF2V: true };
    
    const progressSpy = vi.fn();

    // Mock shot generator
    const mockGenerateShot = vi.fn().mockImplementation(
      async (_, shot) => {
        return {
          videoPath: `data:video/mp4;base64,fakevideo_${shot.id}`,
          duration: 1,
          filename: `${shot.id}.mp4`,
        };
      }
    );

    // Define keyframes for BOTH shots
    const keyframesWithEnd = {
      'shot-1': 'keyframe-1',
      'shot-2': 'keyframe-2', // This should become the END keyframe for shot-2
    };

    await comfyUIService.generateTimelineVideos(
      settings,
      timeline,
      'Vision',
      'Summary',
      keyframesWithEnd,
      progressSpy,
      { shotGenerator: mockGenerateShot }
    );

    // Verify Shot 2 was generated with:
    // - Start Keyframe: Last frame of Shot 1 (from mock)
    // - End Keyframe: 'keyframe-2' (from input)
    
    expect(mockGenerateShot).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ id: 'shot-2' }),
      undefined,
      expect.anything(),
      'data:image/jpeg;base64,last_frame_base64', // Start keyframe (chained)
      expect.anything(),
      undefined,
      expect.objectContaining({ endKeyframe: 'keyframe-2' }) // End keyframe
    );
  });
});
