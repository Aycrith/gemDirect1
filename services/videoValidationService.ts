/**
 * Video Output Validation Service
 * 
 * Automated validation of generated video output using FFprobe.
 * Validates resolution, duration, frame rate, codec, and file integrity.
 * 
 * NO MANUAL REVIEW DEPENDENCY - all validation is automated.
 */

import { spawn } from 'child_process';
import { existsSync, statSync } from 'fs';
import path from 'path';

export interface VideoValidationResult {
  valid: boolean;
  filePath: string;
  errors: string[];
  warnings: string[];
  metadata: VideoMetadata | null;
  validatedAt: number;
}

export interface VideoMetadata {
  duration: number;           // Duration in seconds
  width: number;              // Video width in pixels
  height: number;             // Video height in pixels
  frameRate: number;          // Frames per second (e.g., 24.0)
  codec: string;              // Video codec (e.g., 'h264')
  bitrate: number;            // Video bitrate in kbps
  fileSize: number;           // File size in bytes
  format: string;             // Container format (e.g., 'mp4')
  hasAudio: boolean;          // Whether audio stream exists
  frameCount: number;         // Total frame count
}

export interface ValidationThresholds {
  minDuration: number;        // Minimum acceptable duration (seconds)
  maxDuration: number;        // Maximum acceptable duration (seconds)
  minWidth: number;           // Minimum width (pixels)
  minHeight: number;          // Minimum height (pixels)
  expectedFrameRate: number;  // Expected FPS (with tolerance)
  frameRateTolerance: number; // FPS tolerance (e.g., 0.5)
  minBitrate: number;         // Minimum bitrate (kbps)
  minFileSize: number;        // Minimum file size (bytes)
  acceptedCodecs: string[];   // List of acceptable codecs
}

// Default thresholds for WAN2 video output
export const DEFAULT_THRESHOLDS: ValidationThresholds = {
  minDuration: 0.5,           // At least 0.5 seconds
  maxDuration: 30,            // No more than 30 seconds
  minWidth: 640,              // At least 640px wide
  minHeight: 360,             // At least 360px tall
  expectedFrameRate: 24,      // Target 24 fps
  frameRateTolerance: 1,      // Allow 23-25 fps
  minBitrate: 100,            // At least 100 kbps
  minFileSize: 10000,         // At least 10KB (catches corrupt files)
  acceptedCodecs: ['h264', 'hevc', 'h265', 'vp9', 'av1'],
};

// Stricter thresholds for production quality
export const PRODUCTION_THRESHOLDS: ValidationThresholds = {
  minDuration: 1.5,           // At least 1.5 seconds
  maxDuration: 10,            // Scene clips should be 2-10 seconds
  minWidth: 1280,             // At least 720p
  minHeight: 720,
  expectedFrameRate: 24,
  frameRateTolerance: 0.5,    // Stricter: 23.5-24.5 fps
  minBitrate: 500,            // Higher quality requirement
  minFileSize: 50000,         // At least 50KB
  acceptedCodecs: ['h264', 'hevc'],  // Only H.264/265 for compatibility
};

/**
 * Validate a video file against quality thresholds
 * 
 * @param videoPath - Path to video file
 * @param thresholds - Validation thresholds (defaults to DEFAULT_THRESHOLDS)
 * @returns ValidationResult with detailed error/warning information
 */
export async function validateVideoOutput(
  videoPath: string,
  thresholds: ValidationThresholds = DEFAULT_THRESHOLDS
): Promise<VideoValidationResult> {
  const result: VideoValidationResult = {
    valid: true,
    filePath: videoPath,
    errors: [],
    warnings: [],
    metadata: null,
    validatedAt: Date.now(),
  };

  // Check file exists
  if (!existsSync(videoPath)) {
    result.valid = false;
    result.errors.push(`Video file not found: ${videoPath}`);
    return result;
  }

  // Check file size before probing
  try {
    const stats = statSync(videoPath);
    if (stats.size < thresholds.minFileSize) {
      result.valid = false;
      result.errors.push(`File too small (${stats.size} bytes). Minimum: ${thresholds.minFileSize} bytes. File may be corrupt.`);
      return result;
    }
  } catch (e) {
    result.valid = false;
    result.errors.push(`Cannot read file stats: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  // Get video metadata via FFprobe
  let metadata: VideoMetadata;
  try {
    metadata = await getVideoMetadata(videoPath);
    result.metadata = metadata;
  } catch (e) {
    result.valid = false;
    result.errors.push(`FFprobe failed: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  // Validate duration
  if (metadata.duration < thresholds.minDuration) {
    result.valid = false;
    result.errors.push(`Video too short: ${metadata.duration.toFixed(2)}s (minimum: ${thresholds.minDuration}s)`);
  } else if (metadata.duration > thresholds.maxDuration) {
    result.warnings.push(`Video longer than expected: ${metadata.duration.toFixed(2)}s (maximum: ${thresholds.maxDuration}s)`);
  }

  // Validate resolution
  if (metadata.width < thresholds.minWidth || metadata.height < thresholds.minHeight) {
    result.valid = false;
    result.errors.push(`Resolution too low: ${metadata.width}x${metadata.height} (minimum: ${thresholds.minWidth}x${thresholds.minHeight})`);
  }

  // Validate frame rate
  const fpsLower = thresholds.expectedFrameRate - thresholds.frameRateTolerance;
  const fpsUpper = thresholds.expectedFrameRate + thresholds.frameRateTolerance;
  if (metadata.frameRate < fpsLower || metadata.frameRate > fpsUpper) {
    result.warnings.push(`Frame rate outside expected range: ${metadata.frameRate.toFixed(2)} fps (expected: ${fpsLower}-${fpsUpper} fps)`);
  }

  // Validate codec
  const codecLower = metadata.codec.toLowerCase();
  if (!thresholds.acceptedCodecs.some(c => codecLower.includes(c.toLowerCase()))) {
    result.warnings.push(`Unexpected codec: ${metadata.codec} (expected: ${thresholds.acceptedCodecs.join(', ')})`);
  }

  // Validate bitrate
  if (metadata.bitrate > 0 && metadata.bitrate < thresholds.minBitrate) {
    result.warnings.push(`Low bitrate: ${metadata.bitrate} kbps (minimum: ${thresholds.minBitrate} kbps). Quality may be degraded.`);
  }

  // Calculate expected frame count vs actual
  const expectedFrames = Math.floor(metadata.duration * metadata.frameRate);
  const frameDeviation = Math.abs(metadata.frameCount - expectedFrames);
  if (frameDeviation > 5) {
    result.warnings.push(`Frame count mismatch: ${metadata.frameCount} frames (expected ~${expectedFrames} at ${metadata.frameRate} fps)`);
  }

  return result;
}

/**
 * Batch validate multiple video files
 * 
 * @param videoPaths - Array of video file paths
 * @param thresholds - Validation thresholds
 * @returns Array of validation results
 */
export async function validateVideoOutputBatch(
  videoPaths: string[],
  thresholds: ValidationThresholds = DEFAULT_THRESHOLDS
): Promise<VideoValidationResult[]> {
  const results: VideoValidationResult[] = [];
  
  for (const videoPath of videoPaths) {
    const result = await validateVideoOutput(videoPath, thresholds);
    results.push(result);
  }

  return results;
}

/**
 * Generate a summary report of batch validation
 * 
 * @param results - Array of validation results
 * @returns Summary report string
 */
export function generateValidationReport(results: VideoValidationResult[]): string {
  const total = results.length;
  const valid = results.filter(r => r.valid).length;
  const invalid = total - valid;
  const withWarnings = results.filter(r => r.warnings.length > 0).length;

  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                    VIDEO VALIDATION REPORT                    ',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Summary: ${valid}/${total} videos passed validation`,
    `  ✓ Valid: ${valid}`,
    `  ✗ Invalid: ${invalid}`,
    `  ⚠ With warnings: ${withWarnings}`,
    '',
  ];

  // Detail each result
  for (const result of results) {
    const status = result.valid ? '✓' : '✗';
    const filename = path.basename(result.filePath);
    lines.push(`${status} ${filename}`);
    
    if (result.metadata) {
      const m = result.metadata;
      lines.push(`  Duration: ${m.duration.toFixed(2)}s | Resolution: ${m.width}x${m.height} | FPS: ${m.frameRate}`);
      lines.push(`  Codec: ${m.codec} | Bitrate: ${m.bitrate} kbps | Frames: ${m.frameCount}`);
    }

    if (result.errors.length > 0) {
      lines.push(`  Errors:`);
      result.errors.forEach(e => lines.push(`    • ${e}`));
    }

    if (result.warnings.length > 0) {
      lines.push(`  Warnings:`);
      result.warnings.forEach(w => lines.push(`    • ${w}`));
    }

    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Get video metadata using FFprobe
 * 
 * @param videoPath - Path to video file
 * @returns VideoMetadata object
 */
export async function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  return new Promise((resolve, reject) => {
    // FFprobe command to get JSON output with all streams and format info
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ];

    const ffprobe = spawn('ffprobe', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    ffprobe.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
        const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
        const format = data.format;

        if (!videoStream) {
          reject(new Error('No video stream found in file'));
          return;
        }

        // Parse frame rate (can be "24/1", "24000/1001", or "24.0")
        let frameRate = 24;
        if (videoStream.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/');
          if (parts.length === 2) {
            frameRate = parseInt(parts[0]) / parseInt(parts[1]);
          } else {
            frameRate = parseFloat(videoStream.r_frame_rate);
          }
        } else if (videoStream.avg_frame_rate) {
          const parts = videoStream.avg_frame_rate.split('/');
          if (parts.length === 2) {
            frameRate = parseInt(parts[0]) / parseInt(parts[1]);
          } else {
            frameRate = parseFloat(videoStream.avg_frame_rate);
          }
        }

        // Get file size
        let fileSize = 0;
        try {
          fileSize = statSync(videoPath).size;
        } catch {
          fileSize = parseInt(format?.size || '0');
        }

        // Calculate frame count
        const duration = parseFloat(format?.duration || videoStream.duration || '0');
        const frameCount = videoStream.nb_frames 
          ? parseInt(videoStream.nb_frames)
          : Math.floor(duration * frameRate);

        const metadata: VideoMetadata = {
          duration,
          width: parseInt(videoStream.width || '0'),
          height: parseInt(videoStream.height || '0'),
          frameRate: isNaN(frameRate) ? 24 : frameRate,
          codec: videoStream.codec_name || 'unknown',
          bitrate: Math.round(parseInt(format?.bit_rate || videoStream.bit_rate || '0') / 1000),
          fileSize,
          format: format?.format_name || 'unknown',
          hasAudio: !!audioStream,
          frameCount,
        };

        resolve(metadata);
      } catch (e) {
        reject(new Error(`Failed to parse FFprobe output: ${e instanceof Error ? e.message : String(e)}`));
      }
    });

    ffprobe.on('error', (error) => {
      reject(new Error(`FFprobe spawn error: ${error.message}. Is FFprobe installed?`));
    });
  });
}

/**
 * Check if FFprobe is available in system PATH
 * 
 * @returns Promise<boolean> - True if FFprobe is available
 */
export async function checkFfprobeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', ['-version'], {
      stdio: 'ignore'
    });

    ffprobe.on('close', (code) => {
      resolve(code === 0);
    });

    ffprobe.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Quick validation check - returns true/false without detailed report
 * 
 * @param videoPath - Path to video file
 * @param thresholds - Validation thresholds
 * @returns True if video passes all validation checks
 */
export async function isVideoValid(
  videoPath: string,
  thresholds: ValidationThresholds = DEFAULT_THRESHOLDS
): Promise<boolean> {
  const result = await validateVideoOutput(videoPath, thresholds);
  return result.valid;
}

// ============================================================================
// Async Background Validation Queue
// ============================================================================

interface QueuedValidation {
  videoPath: string;
  runId: string;
  shotId: string;
  thresholds?: ValidationThresholds;
  onComplete?: (result: VideoValidationResult) => void;
}

const validationQueue: QueuedValidation[] = [];
let isProcessing = false;

/**
 * Queue a video for background validation (non-blocking)
 * 
 * @param videoPath - Path to video file
 * @param runId - Pipeline run ID for metrics tracking
 * @param shotId - Shot ID for metrics tracking
 * @param thresholds - Optional custom thresholds
 * @param onComplete - Optional callback when validation completes
 */
export function queueBackgroundValidation(
  videoPath: string,
  runId: string,
  shotId: string,
  thresholds?: ValidationThresholds,
  onComplete?: (result: VideoValidationResult) => void
): void {
  validationQueue.push({ videoPath, runId, shotId, thresholds, onComplete });
  console.log(`[VideoValidation] Queued background validation for ${shotId} (${videoPath})`);
  
  // Start processing if not already running
  if (!isProcessing) {
    processValidationQueue();
  }
}

/**
 * Process the validation queue in the background
 */
async function processValidationQueue(): Promise<void> {
  if (isProcessing || validationQueue.length === 0) return;
  
  isProcessing = true;
  console.log(`[VideoValidation] Starting background validation queue (${validationQueue.length} items)`);
  
  while (validationQueue.length > 0) {
    const item = validationQueue.shift();
    if (!item) break;
    
    try {
      const result = await validateVideoOutput(item.videoPath, item.thresholds);
      
      console.log(`[VideoValidation] ${item.shotId}: ${result.valid ? 'PASSED' : 'FAILED'}`, {
        errors: result.errors,
        warnings: result.warnings,
        duration: result.metadata?.duration,
        resolution: result.metadata ? `${result.metadata.width}x${result.metadata.height}` : 'N/A',
      });
      
      // Import recordShotValidation dynamically to avoid circular deps
      try {
        const { recordShotValidation } = await import('./pipelineMetrics');
        recordShotValidation(item.runId, item.shotId, result.valid, result.errors, result.warnings);
      } catch (e) {
        // Metrics service may not be available in all contexts
        console.debug('[VideoValidation] Could not record validation metrics:', e);
      }
      
      item.onComplete?.(result);
    } catch (error) {
      console.error(`[VideoValidation] Error validating ${item.shotId}:`, error);
      const errorResult: VideoValidationResult = {
        valid: false,
        filePath: item.videoPath,
        errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        metadata: null,
        validatedAt: Date.now(),
      };
      item.onComplete?.(errorResult);
    }
    
    // Small delay between validations to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  isProcessing = false;
  console.log('[VideoValidation] Background validation queue complete');
}

/**
 * Get current queue size
 */
export function getValidationQueueSize(): number {
  return validationQueue.length;
}

/**
 * Check if validation is currently running
 */
export function isValidationRunning(): boolean {
  return isProcessing;
}
