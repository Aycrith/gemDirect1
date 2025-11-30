/**
 * Video Quality Validation Script
 * 
 * Uses FFprobe to validate generated video quality metrics.
 * Runs as part of E2E pipeline to ensure automated validation.
 * 
 * Usage: node --loader ts-node/esm scripts/validate-video-quality.ts --run-dir <path>
 */

import { spawn } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';

// Inline thresholds (matches videoValidationService.ts)
const DEFAULT_THRESHOLDS = {
  minDuration: 0.5,
  maxDuration: 30,
  minWidth: 640,
  minHeight: 360,
  expectedFrameRate: 24,
  frameRateTolerance: 1,
  minBitrate: 100,
  minFileSize: 10000,
  acceptedCodecs: ['h264', 'hevc', 'h265', 'vp9', 'av1'],
};

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  bitrate: number;
  fileSize: number;
  format: string;
  frameCount: number;
}

interface ValidationResult {
  valid: boolean;
  filePath: string;
  errors: string[];
  warnings: string[];
  metadata: VideoMetadata | null;
}

/**
 * Get video metadata using FFprobe
 */
async function getVideoMetadata(videoPath: string): Promise<VideoMetadata | null> {
  return new Promise((resolve) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ];

    const ffprobe = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => { stdout += data.toString(); });
    ffprobe.stderr.on('data', (data) => { stderr += data.toString(); });

    ffprobe.on('close', (code) => {
      if (code !== 0 || !stdout) {
        console.error(`FFprobe failed for ${videoPath}: ${stderr}`);
        resolve(null);
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
        const format = data.format;

        if (!videoStream || !format) {
          resolve(null);
          return;
        }

        // Parse frame rate (e.g., "24/1" -> 24)
        let frameRate = 24;
        if (videoStream.r_frame_rate) {
          const [num, denom] = videoStream.r_frame_rate.split('/').map(Number);
          frameRate = denom ? num / denom : num;
        }

        resolve({
          duration: parseFloat(format.duration) || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          frameRate,
          codec: videoStream.codec_name || 'unknown',
          bitrate: Math.round((parseInt(format.bit_rate) || 0) / 1000),
          fileSize: parseInt(format.size) || 0,
          format: format.format_name || 'unknown',
          frameCount: parseInt(videoStream.nb_frames) || 0,
        });
      } catch (e) {
        console.error(`Failed to parse FFprobe output for ${videoPath}:`, e);
        resolve(null);
      }
    });

    ffprobe.on('error', (err) => {
      console.error(`FFprobe spawn error: ${err.message}`);
      resolve(null);
    });
  });
}

/**
 * Validate a single video file
 */
async function validateVideo(videoPath: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    filePath: videoPath,
    errors: [],
    warnings: [],
    metadata: null,
  };

  // Check file exists
  if (!fs.existsSync(videoPath)) {
    result.valid = false;
    result.errors.push(`Video file not found: ${videoPath}`);
    return result;
  }

  // Check file size
  const stats = fs.statSync(videoPath);
  if (stats.size < DEFAULT_THRESHOLDS.minFileSize) {
    result.valid = false;
    result.errors.push(`File too small: ${stats.size} bytes (min: ${DEFAULT_THRESHOLDS.minFileSize})`);
    return result;
  }

  // Get metadata via FFprobe
  const metadata = await getVideoMetadata(videoPath);
  if (!metadata) {
    result.valid = false;
    result.errors.push('Failed to extract video metadata with FFprobe');
    return result;
  }

  result.metadata = metadata;

  // Validate duration
  if (metadata.duration < DEFAULT_THRESHOLDS.minDuration) {
    result.valid = false;
    result.errors.push(`Video too short: ${metadata.duration}s (min: ${DEFAULT_THRESHOLDS.minDuration}s)`);
  }

  if (metadata.duration > DEFAULT_THRESHOLDS.maxDuration) {
    result.warnings.push(`Video longer than expected: ${metadata.duration}s (max: ${DEFAULT_THRESHOLDS.maxDuration}s)`);
  }

  // Validate resolution
  if (metadata.width < DEFAULT_THRESHOLDS.minWidth || metadata.height < DEFAULT_THRESHOLDS.minHeight) {
    result.valid = false;
    result.errors.push(`Resolution too low: ${metadata.width}x${metadata.height} (min: ${DEFAULT_THRESHOLDS.minWidth}x${DEFAULT_THRESHOLDS.minHeight})`);
  }

  // Validate frame rate
  const fpsDiff = Math.abs(metadata.frameRate - DEFAULT_THRESHOLDS.expectedFrameRate);
  if (fpsDiff > DEFAULT_THRESHOLDS.frameRateTolerance) {
    result.warnings.push(`Frame rate outside expected range: ${metadata.frameRate} fps (expected: ${DEFAULT_THRESHOLDS.expectedFrameRate} ± ${DEFAULT_THRESHOLDS.frameRateTolerance})`);
  }

  // Validate codec
  if (!DEFAULT_THRESHOLDS.acceptedCodecs.includes(metadata.codec.toLowerCase())) {
    result.warnings.push(`Unexpected codec: ${metadata.codec} (expected: ${DEFAULT_THRESHOLDS.acceptedCodecs.join(', ')})`);
  }

  // Validate bitrate
  if (metadata.bitrate < DEFAULT_THRESHOLDS.minBitrate) {
    result.warnings.push(`Low bitrate: ${metadata.bitrate} kbps (min: ${DEFAULT_THRESHOLDS.minBitrate})`);
  }

  return result;
}

/**
 * Find all video files in a directory
 */
function findVideoFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const videos: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      videos.push(...findVideoFiles(fullPath));
    } else if (entry.isFile() && /\.(mp4|webm|avi|mov|mkv)$/i.test(entry.name)) {
      videos.push(fullPath);
    }
  }

  return videos;
}

/**
 * Generate validation report
 */
function generateReport(results: ValidationResult[]): string {
  const lines: string[] = [];
  const passed = results.filter(r => r.valid).length;
  const failed = results.filter(r => !r.valid).length;
  const withWarnings = results.filter(r => r.warnings.length > 0).length;

  lines.push('╔════════════════════════════════════════════════════════════╗');
  lines.push('║           VIDEO QUALITY VALIDATION REPORT                  ║');
  lines.push('╠════════════════════════════════════════════════════════════╣');
  lines.push(`║  ${passed}/${results.length} videos passed validation`.padEnd(60) + '║');
  lines.push(`║  ✓ Valid: ${passed}  ✗ Invalid: ${failed}  ⚠ With warnings: ${withWarnings}`.padEnd(60) + '║');
  lines.push('╚════════════════════════════════════════════════════════════╝');
  lines.push('');

  for (const result of results) {
    const filename = path.basename(result.filePath);
    const status = result.valid ? '✓' : '✗';
    lines.push(`${status} ${filename}`);

    if (result.metadata) {
      lines.push(`    Duration: ${result.metadata.duration.toFixed(2)}s | Resolution: ${result.metadata.width}x${result.metadata.height}`);
      lines.push(`    FPS: ${result.metadata.frameRate} | Codec: ${result.metadata.codec} | Bitrate: ${result.metadata.bitrate} kbps`);
    }

    if (result.errors.length > 0) {
      lines.push('    Errors:');
      result.errors.forEach(e => lines.push(`      - ${e}`));
    }

    if (result.warnings.length > 0) {
      lines.push('    Warnings:');
      result.warnings.forEach(w => lines.push(`      - ${w}`));
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  let runDir = '';

  // Parse --run-dir argument
  const runDirIndex = args.indexOf('--run-dir');
  if (runDirIndex !== -1 && args[runDirIndex + 1]) {
    runDir = args[runDirIndex + 1] ?? '';
  }

  // Find latest run dir if not specified
  if (!runDir) {
    const logsRoot = path.resolve(process.cwd(), 'logs');
    if (fs.existsSync(logsRoot)) {
      const entries = fs.readdirSync(logsRoot, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d{8}-\d{6}$/.test(d.name))
        .map(d => d.name)
        .sort()
        .reverse();
      if (entries[0]) {
        runDir = path.join(logsRoot, entries[0]);
      }
    }
  }

  if (!runDir || !fs.existsSync(runDir)) {
    console.error('Error: No run directory found. Use --run-dir <path> or run E2E pipeline first.');
    process.exit(1);
  }

  console.log(`Validating videos in: ${runDir}`);

  // Find video files
  const videoDir = path.join(runDir, 'video');
  const videos = findVideoFiles(videoDir);

  if (videos.length === 0) {
    console.log('No video files found in run directory.');
    process.exit(0);
  }

  console.log(`Found ${videos.length} video file(s)`);

  // Validate each video
  const results: ValidationResult[] = [];
  for (const video of videos) {
    console.log(`  Validating: ${path.basename(video)}...`);
    const result = await validateVideo(video);
    results.push(result);
  }

  // Generate and save report
  const report = generateReport(results);
  console.log('\n' + report);

  // Save results
  const outputDir = path.join(runDir, 'test-results', 'video-validation');
  fs.mkdirSync(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'validation-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');

  const reportPath = path.join(outputDir, 'validation-report.txt');
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`Results saved to: ${outputDir}`);

  // Exit with appropriate code
  const failed = results.filter(r => !r.valid).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
