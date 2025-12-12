
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTimelineVideos } from '../../services/comfyUIService';
import * as videoUtils from '../../utils/videoUtils';
import { TimelineData, LocalGenerationSettings } from '../../types';

// Mock videoUtils
vi.mock('../../utils/videoUtils', () => ({
  extractFramesFromVideo: vi.fn(),
  base64ToBlob: vi.fn(),
}));

describe('generateTimelineVideos FLF2V Chaining', () => {
  const mockSettings: LocalGenerationSettings = {
    comfyUIUrl: 'http://localhost:8188',
    featureFlags: {
      enableFLF2V: true,
    } as any,
    workflowProfiles: {},
  } as any;

  const mockTimeline: TimelineData = {
    shots: [
      { id: 'shot-1', description: 'Shot 1', duration: 2000, cameraMovement: 'static' } as any,
      { id: 'shot-2', description: 'Shot 2', duration: 2000, cameraMovement: 'pan' } as any,
      { id: 'shot-3', description: 'Shot 3', duration: 2000, cameraMovement: 'zoom' } as any,
    ],
    shotEnhancers: {},
    negativePrompt: 'bad quality',
    transitions: [],
  };

  const mockKeyframes = {
    'shot-1': 'data:image/png;base64,initial-keyframe-1',
    'shot-2': 'data:image/png;base64,initial-keyframe-2',
    'shot-3': 'data:image/png;base64,initial-keyframe-3',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (videoUtils.base64ToBlob as any).mockReturnValue(new Blob(['fake-blob'], { type: 'video/mp4' }));
  });

  it('should chain last frame of previous shot to next shot when FLF2V is enabled', async () => {
    // Mock shot generator
    const mockShotGenerator = vi.fn();
    
    // Setup mock returns for shot generator
    mockShotGenerator.mockImplementation(async (_settings, shot, _enhancers, _vision, _keyframe) => {
      return {
        videoPath: `data:video/mp4;base64,video-for-${shot.id}`,
        duration: 2,
        filename: `${shot.id}.mp4`
      };
    });

    // Setup mock returns for frame extraction
    // When extracting from shot-1 video, return frame-from-shot-1
    (videoUtils.extractFramesFromVideo as any).mockImplementation(async (_file: any) => {
        // We can't easily check the file content here, but we can return different frames based on call count
        // or just return a unique frame each time
        return ['frame-extracted-from-previous-video'];
    });

    // We need to customize the frame extraction to verify chaining
    let callCount = 0;
    (videoUtils.extractFramesFromVideo as any).mockImplementation(async () => {
        callCount++;
        return [`frame-from-shot-${callCount}`];
    });

    await generateTimelineVideos(
      mockSettings,
      mockTimeline,
      'vision',
      'summary',
      mockKeyframes,
      undefined, // onProgress
      {
        shotGenerator: mockShotGenerator
      }
    );

    // Verify calls
    expect(mockShotGenerator).toHaveBeenCalledTimes(3);

    // Call 1: Should use initial keyframe for shot-1
    expect(mockShotGenerator).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ id: 'shot-1' }),
      undefined, // enhancers
      expect.anything(),
      mockKeyframes['shot-1'], // keyframe arg
      expect.anything(),
      undefined, // dependencies
      expect.anything()
    );

    // Call 2: Should use extracted frame from shot-1 (frame-from-shot-1)
    // Note: extractFramesFromVideo returns base64 without prefix. 
    // generateTimelineVideos adds prefix: `data:image/jpeg;base64,${lastFrame}`
    expect(mockShotGenerator).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ id: 'shot-2' }),
      undefined,
      expect.anything(),
      'data:image/jpeg;base64,frame-from-shot-1', // keyframe arg should be the extracted frame
      expect.anything(),
      undefined,
      expect.anything()
    );

    // Call 3: Should use extracted frame from shot-2 (frame-from-shot-2)
    expect(mockShotGenerator).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({ id: 'shot-3' }),
      undefined,
      expect.anything(),
      'data:image/jpeg;base64,frame-from-shot-2', // keyframe arg
      expect.anything(),
      undefined,
      expect.anything()
    );
  });

  it('should NOT chain frames when FLF2V is disabled', async () => {
    const settingsDisabled = { ...mockSettings, featureFlags: { enableFLF2V: false } } as any;
    
    const mockShotGenerator = vi.fn().mockResolvedValue({
        videoPath: 'data:video/mp4;base64,video',
        duration: 2,
        filename: 'video.mp4'
    });

    await generateTimelineVideos(
      settingsDisabled,
      mockTimeline,
      'vision',
      'summary',
      mockKeyframes,
      undefined,
      { shotGenerator: mockShotGenerator }
    );

    // Call 2 should use its own initial keyframe
    expect(mockShotGenerator).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ id: 'shot-2' }),
      undefined,
      expect.anything(),
      mockKeyframes['shot-2'], // Should use original keyframe
      expect.anything(),
      undefined,
      expect.anything()
    );
  });

  it('should fallback to original keyframe if frame extraction fails', async () => {
    const mockShotGenerator = vi.fn().mockResolvedValue({
        videoPath: 'data:video/mp4;base64,video',
        duration: 2,
        filename: 'video.mp4'
    });

    // Mock extraction failure
    (videoUtils.extractFramesFromVideo as any).mockRejectedValue(new Error('Extraction failed'));

    await generateTimelineVideos(
      mockSettings,
      mockTimeline,
      'vision',
      'summary',
      mockKeyframes,
      undefined,
      { shotGenerator: mockShotGenerator }
    );

    // Call 2 should use its own initial keyframe because extraction failed
    expect(mockShotGenerator).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ id: 'shot-2' }),
      undefined,
      expect.anything(),
      mockKeyframes['shot-2'],
      expect.anything(),
      undefined,
      expect.anything()
    );
  });
});
