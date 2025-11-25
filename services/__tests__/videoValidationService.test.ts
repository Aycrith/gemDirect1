/**
 * Tests for Video Validation Service
 * 
 * Validates automated video output validation using FFprobe.
 * These tests mock FFprobe responses to test validation logic.
 * 
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create hoisted mocks BEFORE vi.mock calls
const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

// Mock fs and child_process with hoisted mocks
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: mocks.existsSync,
    statSync: mocks.statSync,
    default: { ...actual, existsSync: mocks.existsSync, statSync: mocks.statSync },
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: mocks.spawn,
    default: { ...actual, spawn: mocks.spawn },
  };
});

// Import service after vi.mock declarations
import {
  validateVideoOutput,
  validateVideoOutputBatch,
  generateValidationReport,
  isVideoValid,
  DEFAULT_THRESHOLDS,
  PRODUCTION_THRESHOLDS,
  type VideoMetadata,
  type ValidationThresholds,
} from '../videoValidationService';

describe('videoValidationService', () => {
  const mockValidMetadata: VideoMetadata = {
    duration: 2.04,
    width: 1280,
    height: 720,
    frameRate: 24,
    codec: 'h264',
    bitrate: 785,
    fileSize: 200000,
    format: 'mp4',
    hasAudio: false,
    frameCount: 49,
  };

  const mockFfprobeOutput = {
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1280,
        height: 720,
        r_frame_rate: '24/1',
        nb_frames: '49',
        bit_rate: '785000',
      },
    ],
    format: {
      duration: '2.04',
      bit_rate: '785000',
      format_name: 'mp4',
      size: '200000',
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    
    // Default: file exists with valid size
    mocks.existsSync.mockReturnValue(true);
    mocks.statSync.mockReturnValue({ size: 200000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to create mock spawn
  function mockSpawn(output: any, exitCode = 0) {
    const mockStdout = {
      on: vi.fn((event, callback) => {
        if (event === 'data') {
          callback(Buffer.from(JSON.stringify(output)));
        }
      }),
    };
    const mockStderr = { on: vi.fn() };
    const mockProcess = {
      stdout: mockStdout,
      stderr: mockStderr,
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(exitCode), 0);
        }
      }),
    };
    mocks.spawn.mockReturnValue(mockProcess);
  }

  describe('validateVideoOutput', () => {
    it('should pass validation for valid video', async () => {
      mockSpawn(mockFfprobeOutput);
      
      const result = await validateVideoOutput('/path/to/video.mp4');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata).not.toBeNull();
      expect(result.metadata?.duration).toBe(2.04);
    });

    it('should fail when file does not exist', async () => {
      mocks.existsSync.mockReturnValue(false);
      
      const result = await validateVideoOutput('/path/to/missing.mp4');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('not found'));
    });

    it('should fail when file is too small', async () => {
      mocks.statSync.mockReturnValue({ size: 100 }); // Below minimum
      
      const result = await validateVideoOutput('/path/to/tiny.mp4');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('too small'));
    });

    it('should fail when duration is too short', async () => {
      const shortVideo = {
        ...mockFfprobeOutput,
        format: { ...mockFfprobeOutput.format, duration: '0.1' },
      };
      mockSpawn(shortVideo);
      
      const result = await validateVideoOutput('/path/to/short.mp4');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('too short'));
    });

    it('should warn when duration exceeds maximum', async () => {
      const longVideo = {
        ...mockFfprobeOutput,
        format: { ...mockFfprobeOutput.format, duration: '60' },
      };
      mockSpawn(longVideo);
      
      const result = await validateVideoOutput('/path/to/long.mp4');
      
      expect(result.valid).toBe(true); // Still valid, just warning
      expect(result.warnings).toContainEqual(expect.stringContaining('longer than expected'));
    });

    it('should fail when resolution is too low', async () => {
      const lowResVideo = {
        ...mockFfprobeOutput,
        streams: [{ ...mockFfprobeOutput.streams[0], width: 320, height: 240 }],
      };
      mockSpawn(lowResVideo);
      
      const result = await validateVideoOutput('/path/to/lowres.mp4');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Resolution too low'));
    });

    it('should warn when frame rate is outside expected range', async () => {
      const oddFpsVideo = {
        ...mockFfprobeOutput,
        streams: [{ ...mockFfprobeOutput.streams[0], r_frame_rate: '30/1' }],
      };
      mockSpawn(oddFpsVideo);
      
      const result = await validateVideoOutput('/path/to/30fps.mp4');
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('Frame rate outside'));
    });

    it('should warn when codec is unexpected', async () => {
      const vp9Video = {
        ...mockFfprobeOutput,
        streams: [{ ...mockFfprobeOutput.streams[0], codec_name: 'vp9' }],
      };
      mockSpawn(vp9Video);
      
      // Use production thresholds which only accept h264/hevc
      const result = await validateVideoOutput('/path/to/vp9.mp4', PRODUCTION_THRESHOLDS);
      
      expect(result.warnings).toContainEqual(expect.stringContaining('Unexpected codec'));
    });

    it('should use custom thresholds when provided', async () => {
      const customThresholds: ValidationThresholds = {
        ...DEFAULT_THRESHOLDS,
        minDuration: 5, // Require at least 5 seconds
      };
      mockSpawn(mockFfprobeOutput);
      
      const result = await validateVideoOutput('/path/to/video.mp4', customThresholds);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('too short'));
    });
  });

  describe('validateVideoOutputBatch', () => {
    it('should validate multiple videos', async () => {
      mockSpawn(mockFfprobeOutput);
      
      const results = await validateVideoOutputBatch([
        '/path/to/video1.mp4',
        '/path/to/video2.mp4',
      ]);
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.valid)).toBe(true);
    });

    it('should handle mixed valid/invalid videos', async () => {
      // First video exists, second doesn't
      mocks.existsSync.mockImplementation((path: string) => {
        return path.includes('valid.mp4'); // Only valid.mp4 exists
      });
      mockSpawn(mockFfprobeOutput);
      
      const results = await validateVideoOutputBatch([
        '/path/to/valid.mp4',
        '/path/to/missing.mp4',
      ]);
      
      expect(results[0]?.valid).toBe(true);
      expect(results[1]?.valid).toBe(false);
    });
  });

  describe('generateValidationReport', () => {
    it('should generate readable report for valid videos', () => {
      const results = [
        {
          valid: true,
          filePath: '/path/to/video.mp4',
          errors: [],
          warnings: [],
          metadata: mockValidMetadata,
          validatedAt: Date.now(),
        },
      ];
      
      const report = generateValidationReport(results);
      
      expect(report).toContain('VIDEO VALIDATION REPORT');
      expect(report).toContain('1/1 videos passed');
      expect(report).toContain('✓ video.mp4');
      expect(report).toContain('Duration: 2.04s');
      expect(report).toContain('Resolution: 1280x720');
    });

    it('should include errors and warnings in report', () => {
      const results = [
        {
          valid: false,
          filePath: '/path/to/bad.mp4',
          errors: ['Video too short: 0.1s'],
          warnings: ['Low bitrate: 50 kbps'],
          metadata: null,
          validatedAt: Date.now(),
        },
      ];
      
      const report = generateValidationReport(results);
      
      expect(report).toContain('✗ bad.mp4');
      expect(report).toContain('Errors:');
      expect(report).toContain('Video too short');
      expect(report).toContain('Warnings:');
      expect(report).toContain('Low bitrate');
    });

    it('should show correct summary counts', () => {
      const results = [
        { valid: true, filePath: 'a.mp4', errors: [], warnings: [], metadata: mockValidMetadata, validatedAt: Date.now() },
        { valid: true, filePath: 'b.mp4', errors: [], warnings: ['warning'], metadata: mockValidMetadata, validatedAt: Date.now() },
        { valid: false, filePath: 'c.mp4', errors: ['error'], warnings: [], metadata: null, validatedAt: Date.now() },
      ];
      
      const report = generateValidationReport(results);
      
      expect(report).toContain('2/3 videos passed');
      expect(report).toContain('✓ Valid: 2');
      expect(report).toContain('✗ Invalid: 1');
      expect(report).toContain('⚠ With warnings: 1');
    });
  });

  describe('isVideoValid', () => {
    it('should return true for valid video', async () => {
      mockSpawn(mockFfprobeOutput);
      
      const valid = await isVideoValid('/path/to/video.mp4');
      
      expect(valid).toBe(true);
    });

    it('should return false for invalid video', async () => {
      mocks.existsSync.mockReturnValue(false);
      
      const valid = await isVideoValid('/path/to/missing.mp4');
      
      expect(valid).toBe(false);
    });
  });

  describe('threshold configurations', () => {
    it('should have reasonable default thresholds', () => {
      expect(DEFAULT_THRESHOLDS.minDuration).toBe(0.5);
      expect(DEFAULT_THRESHOLDS.maxDuration).toBe(30);
      expect(DEFAULT_THRESHOLDS.expectedFrameRate).toBe(24);
      expect(DEFAULT_THRESHOLDS.acceptedCodecs).toContain('h264');
    });

    it('should have stricter production thresholds', () => {
      expect(PRODUCTION_THRESHOLDS.minDuration).toBeGreaterThan(DEFAULT_THRESHOLDS.minDuration);
      expect(PRODUCTION_THRESHOLDS.minWidth).toBeGreaterThan(DEFAULT_THRESHOLDS.minWidth);
      expect(PRODUCTION_THRESHOLDS.minBitrate).toBeGreaterThan(DEFAULT_THRESHOLDS.minBitrate);
    });
  });
});
