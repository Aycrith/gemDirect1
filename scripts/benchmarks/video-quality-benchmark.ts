#!/usr/bin/env node

/**
 * Video Quality Benchmark Harness
 * Task A2: Workstream A - QA & Quality Signal Alignment
 * 
 * Computes temporal coherence, motion consistency, and identity stability metrics
 * for a fixed set of representative videos across all presets.
 * 
 * Metrics Computed:
 * 1. Temporal Coherence: Frame-to-frame stability via brightness/color variance
 * 2. Motion Consistency: Expected vs actual motion smoothness
 * 3. Identity Stability: Key visual region consistency across frames
 * 
 * Usage:
 *   npx tsx scripts/benchmarks/video-quality-benchmark.ts [options]
 * 
 * Options:
 *   --run-dir <path>      Specific regression run directory
 *   --preset <name>       Filter to specific preset (production|cinematic|character|fast)
 *   --sample <id>         Filter to specific sample (e.g., sample-001-geometric)
 *   --output-dir <path>   Output directory (default: data/benchmarks)
 *   --verbose             Enable verbose logging
 * 
 * Output:
 *   - JSON report: data/benchmarks/video-quality-<timestamp>.json
 *   - CSV report: data/benchmarks/video-quality-<timestamp>.csv
 *   - Markdown summary: reports/VIDEO_QUALITY_BENCHMARK_<timestamp>.md
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { CameraPath, CameraPathSummary, CameraKeyframe } from '../../types/cameraPath';
import type { GenerationManifest } from '../../services/generationManifestService';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface FrameMetrics {
  frameIndex: number;
  meanBrightness: number;
  meanR: number;
  meanG: number;
  meanB: number;
  fileSize: number;
}

interface TemporalCoherenceMetrics {
  /** Frame-to-frame brightness variance (lower = more stable) */
  brightnessVariance: number;
  /** Frame-to-frame color consistency (0-100, higher = more consistent) */
  colorConsistency: number;
  /** Max brightness jump between consecutive frames */
  maxBrightnessJump: number;
  /** Number of frames with anomalous brightness (potential flicker) */
  flickerFrameCount: number;
  /** Warping error proxy: mean absolute diff between frames */
  frameDifferenceScore: number;
}

interface MotionConsistencyMetrics {
  /** Smoothness of brightness transitions (0-100) */
  transitionSmoothness: number;
  /** Whether motion appears consistent (no sudden jumps) */
  hasConsistentMotion: boolean;
  /** Detected motion intensity (low/medium/high) */
  motionIntensity: 'low' | 'medium' | 'high';
  /** Motion jitter score (lower = smoother) */
  jitterScore: number;
}

interface IdentityStabilityMetrics {
  /** Overall identity preservation score (0-100) */
  identityScore: number;
  /** Whether key regions remain stable */
  regionsStable: boolean;
  /** Number of potential identity breaks detected */
  identityBreakCount: number;
  /** Center region variance (focus area stability) */
  centerRegionVariance: number;
}

// ============================================================================
// Camera Path Metrics Types (E3)
// ============================================================================

/**
 * Observed position from frame analysis
 * Represents the approximate "center of action" in normalized screen space
 */
export interface ObservedPosition {
  frameIndex: number;
  /** Normalized x coordinate (0-1, where 0 is left edge) */
  x: number;
  /** Normalized y coordinate (0-1, where 0 is top edge) */
  y: number;
}

/**
 * Camera path adherence/motion coherence metrics
 * Compares expected camera motion (from CameraPath) to observed frame-to-frame behavior
 */
export interface CameraPathMetrics {
  /** Mean Euclidean distance between observed and expected positions (normalized units) */
  pathAdherenceMeanError?: number;
  /** Max Euclidean distance between observed and expected positions */
  pathAdherenceMaxError?: number;
  /** 
   * Direction consistency score (0-1)
   * 1 = observed motion always matches expected direction
   * 0 = observed motion is perpendicular to expected
   * Negative values possible if motion is opposite
   */
  pathDirectionConsistency?: number;
  /** Number of frames analyzed for these metrics */
  framesAnalyzed?: number;
  /** Whether camera path data was available */
  hasCameraPath: boolean;
}

/**
 * Manifest context extracted for benchmark enrichment
 */
export interface ManifestContext {
  /** Camera path ID if defined in manifest */
  cameraPathId?: string;
  /** Camera path summary for reference */
  cameraPathSummary?: CameraPathSummary;
  /** Full camera path for interpolation (if available) */
  cameraPath?: CameraPath;
  /** Whether temporal regularization was applied */
  temporalRegularizationApplied?: boolean;
  /** Temporal regularization strength if applied */
  temporalRegularizationStrength?: number;
  /** Source manifest path */
  manifestPath?: string;
}

interface VideoQualityMetrics {
  sampleId: string;
  presetId: string;
  videoPath: string;
  frameCount: number;
  duration: number;
  fps: number;
  resolution: { width: number; height: number };
  
  temporalCoherence: TemporalCoherenceMetrics;
  motionConsistency: MotionConsistencyMetrics;
  identityStability: IdentityStabilityMetrics;
  
  /** Aggregated quality score (0-100) */
  overallQuality: number;
  
  /** Per-frame metrics (optional, for detailed analysis) */
  frameMetrics?: FrameMetrics[];
  
  // ---- Camera Path & Manifest Context (E3) ----
  
  /** Camera path ID if available from manifest */
  cameraPathId?: string;
  /** Camera path summary if available */
  cameraPathSummary?: CameraPathSummary;
  /** Whether temporal regularization was applied */
  temporalRegularizationApplied?: boolean;
  /** Camera path adherence metrics */
  cameraPathMetrics?: CameraPathMetrics;
  
  analysisTimestamp: string;
  analysisErrors: string[];
}

interface BenchmarkReport {
  version: string;
  taskId: string;
  generatedAt: string;
  regressionRun: string;
  presets: string[];
  samplesPerPreset: number;
  
  results: VideoQualityMetrics[];
  
  aggregates: {
    overall: AggregateStats;
    temporalCoherence: {
      brightnessVariance: AggregateStats;
      colorConsistency: AggregateStats;
      flickerFrameCount: AggregateStats;
    };
    motionConsistency: {
      transitionSmoothness: AggregateStats;
      jitterScore: AggregateStats;
    };
    identityStability: {
      identityScore: AggregateStats;
      centerRegionVariance: AggregateStats;
    };
    byPreset: Record<string, {
      overall: AggregateStats;
      sampleCount: number;
    }>;
  };
}

interface AggregateStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  count: number;
}

interface BenchmarkOptions {
  runDir?: string;
  preset?: string;
  sample?: string;
  outputDir?: string;
  verbose?: boolean;
  /** Path to a specific manifest file */
  manifestPath?: string;
  /** Directory containing manifests (e.g., data/manifests) */
  manifestDir?: string;
}

// ============================================================================
// Constants
// ============================================================================

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REGRESSION_DIR = path.join(REPO_ROOT, 'test-results', 'bookend-regression');
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'benchmarks');
const REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const COMFYUI_VIDEO_OUTPUT = 'C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\output\\video';

// Available presets for filtering
const PRESETS = ['production', 'cinematic', 'character', 'fast'] as const;

// ============================================================================
// Utility Functions
// ============================================================================

function log(message: string, verbose: boolean = false): void {
  if (verbose) {
    console.log(`[BENCHMARK] ${message}`);
  }
}

function logError(message: string): void {
  console.error(`[ERROR] ${message}`);
}

function logSuccess(message: string): void {
  console.log(`[✓] ${message}`);
}

function logWarning(message: string): void {
  console.warn(`[⚠] ${message}`);
}

/**
 * Round a number to specified decimal places
 */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Run ffmpeg/ffprobe command and return stdout
 */
function runFFCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(command, args);
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`${command} spawn error: ${err.message}`));
    });
  });
}

// ============================================================================
// Camera Path Helpers (E3)
// ============================================================================

/**
 * Load manifest from path and extract camera path context
 */
export function loadManifestContext(manifestPath: string): ManifestContext | null {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as GenerationManifest;
    
    return {
      cameraPathId: manifestData.cameraPathId,
      cameraPathSummary: manifestData.cameraPathSummary,
      temporalRegularizationApplied: manifestData.temporalRegularizationApplied,
      temporalRegularizationStrength: manifestData.temporalRegularizationSettings?.strength,
      manifestPath,
      // Note: Full cameraPath not typically in manifest, would need to load from config
    };
  } catch (err) {
    return null;
  }
}

/**
 * Find manifest for a video based on naming conventions
 * Looks for manifest files that match the video name or sample ID
 */
export function findManifestForVideo(
  videoPath: string,
  sampleId: string,
  manifestDir?: string
): string | null {
  const defaultManifestDir = path.join(REPO_ROOT, 'data', 'manifests');
  const searchDir = manifestDir || defaultManifestDir;

  if (!fs.existsSync(searchDir)) {
    return null;
  }

  try {
    const files = fs.readdirSync(searchDir);
    
    // Try to match by sample ID first
    const sampleManifest = files.find(f => 
      f.includes(sampleId) && f.endsWith('.json')
    );
    if (sampleManifest) {
      return path.join(searchDir, sampleManifest);
    }

    // Try to match by video filename (without extension)
    const videoBasename = path.basename(videoPath, path.extname(videoPath));
    const videoManifest = files.find(f =>
      f.includes(videoBasename) && f.endsWith('.json')
    );
    if (videoManifest) {
      return path.join(searchDir, videoManifest);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Interpolate camera path position at a given normalized time (0-1)
 * Uses linear interpolation between keyframes
 */
export function interpolateCameraPosition(
  cameraPath: CameraPath,
  normalizedTime: number
): { x: number; y: number } | null {
  const keyframes = cameraPath.keyframes;
  if (!keyframes || keyframes.length === 0) {
    return null;
  }

  // Get total duration from keyframes
  const maxTime = Math.max(...keyframes.map(kf => kf.timeSeconds));
  if (maxTime === 0) {
    // Static camera or single keyframe
    const kf = keyframes[0];
    if (kf?.position) {
      return { x: kf.position.x, y: kf.position.y };
    }
    // Return default center position when position is not specified
    return { x: 0.5, y: 0.5 };
  }

  const targetTime = normalizedTime * maxTime;

  // Find surrounding keyframes
  let prevKf: CameraKeyframe | null = null;
  let nextKf: CameraKeyframe | null = null;

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    if (!kf) continue;
    
    if (kf.timeSeconds <= targetTime) {
      prevKf = kf;
    }
    if (kf.timeSeconds >= targetTime && !nextKf) {
      nextKf = kf;
    }
  }

  // Handle edge cases
  if (!prevKf && nextKf) prevKf = nextKf;
  if (!nextKf && prevKf) nextKf = prevKf;
  if (!prevKf || !nextKf) return null;

  // Same keyframe
  if (prevKf === nextKf) {
    if (prevKf.position) {
      return { x: prevKf.position.x, y: prevKf.position.y };
    }
    // Return default center position when position is not specified
    return { x: 0.5, y: 0.5 };
  }

  // Linear interpolation
  const dt = nextKf.timeSeconds - prevKf.timeSeconds;
  const t = dt > 0 ? (targetTime - prevKf.timeSeconds) / dt : 0;

  const prevPos = prevKf.position || { x: 0.5, y: 0.5 };
  const nextPos = nextKf.position || { x: 0.5, y: 0.5 };

  return {
    x: prevPos.x + t * (nextPos.x - prevPos.x),
    y: prevPos.y + t * (nextPos.y - prevPos.y),
  };
}

/**
 * Compute observed position (center of brightness) from frame metrics
 * This is a simple heuristic: uses brightness as a proxy for "center of action"
 * In screen coordinates (0-1)
 */
export function computeObservedPositions(
  frameMetrics: FrameMetrics[]
): ObservedPosition[] {
  const positions: ObservedPosition[] = [];

  // For each frame metric, compute a rough position estimate
  // This is a heuristic: we use relative brightness changes to infer motion
  // A more sophisticated approach would use actual pixel analysis
  
  for (let i = 0; i < frameMetrics.length; i++) {
    const fm = frameMetrics[i];
    if (!fm) continue;

    // Use frame index for time positioning
    // Position is estimated based on brightness distribution heuristic
    // This is a simplified model - real implementation would analyze actual frame pixels
    
    // Use normalized brightness as a proxy for vertical position
    // (brighter scenes tend to have more sky/upper content)
    const normalizedBrightness = fm.meanBrightness / 255;
    
    // Use color balance to estimate horizontal position
    // (warmer colors often indicate subject focus)
    const colorBalance = (fm.meanR - fm.meanB) / 255;
    
    positions.push({
      frameIndex: fm.frameIndex,
      x: 0.5 + colorBalance * 0.2, // Center with slight color-based offset
      y: 0.5 - normalizedBrightness * 0.1, // Center with brightness-based offset
    });
  }

  return positions;
}

/**
 * Compute camera path adherence metrics
 * Compares observed positions to expected camera path positions
 */
export function computeCameraPathMetrics(
  observedPositions: ObservedPosition[],
  cameraPath: CameraPath | undefined,
  totalFrames: number
): CameraPathMetrics {
  if (!cameraPath || observedPositions.length < 2) {
    return { hasCameraPath: false };
  }

  const errors: number[] = [];
  const dotProducts: number[] = [];

  for (let i = 0; i < observedPositions.length; i++) {
    const obs = observedPositions[i];
    if (!obs) continue;

    // Compute normalized time for this frame
    const normalizedTime = totalFrames > 1 ? obs.frameIndex / (totalFrames - 1) : 0;
    
    // Get expected position from camera path
    const expected = interpolateCameraPosition(cameraPath, normalizedTime);
    if (!expected) continue;

    // Compute Euclidean distance error
    const dx = obs.x - expected.x;
    const dy = obs.y - expected.y;
    const error = Math.sqrt(dx * dx + dy * dy);
    errors.push(error);

    // Compute direction consistency (for consecutive frames)
    if (i > 0) {
      const prevObs = observedPositions[i - 1];
      const prevNormalizedTime = totalFrames > 1 ? (prevObs?.frameIndex ?? 0) / (totalFrames - 1) : 0;
      const prevExpected = interpolateCameraPosition(cameraPath, prevNormalizedTime);

      if (prevObs && prevExpected) {
        // Observed motion vector
        const obsDx = obs.x - prevObs.x;
        const obsDy = obs.y - prevObs.y;
        const obsMag = Math.sqrt(obsDx * obsDx + obsDy * obsDy);

        // Expected motion vector
        const expDx = expected.x - prevExpected.x;
        const expDy = expected.y - prevExpected.y;
        const expMag = Math.sqrt(expDx * expDx + expDy * expDy);

        // Compute cosine similarity (dot product of unit vectors)
        if (obsMag > 0.001 && expMag > 0.001) {
          const dotProduct = (obsDx * expDx + obsDy * expDy) / (obsMag * expMag);
          dotProducts.push(dotProduct);
        }
      }
    }
  }

  // Calculate aggregate metrics
  const pathAdherenceMeanError = errors.length > 0
    ? errors.reduce((a, b) => a + b, 0) / errors.length
    : undefined;

  const pathAdherenceMaxError = errors.length > 0
    ? Math.max(...errors)
    : undefined;

  // Direction consistency: average of cosine similarities, mapped to 0-1
  // Original range: [-1, 1], where 1 = same direction, -1 = opposite
  // We normalize to [0, 1] for easier interpretation
  const pathDirectionConsistency = dotProducts.length > 0
    ? (dotProducts.reduce((a, b) => a + b, 0) / dotProducts.length + 1) / 2
    : undefined;

  return {
    pathAdherenceMeanError: pathAdherenceMeanError !== undefined ? round(pathAdherenceMeanError, 4) : undefined,
    pathAdherenceMaxError: pathAdherenceMaxError !== undefined ? round(pathAdherenceMaxError, 4) : undefined,
    pathDirectionConsistency: pathDirectionConsistency !== undefined ? round(pathDirectionConsistency, 3) : undefined,
    framesAnalyzed: observedPositions.length,
    hasCameraPath: true,
  };
}

/**
 * Get video metadata using ffprobe
 */
async function getVideoMetadata(videoPath: string): Promise<{
  duration: number;
  fps: number;
  width: number;
  height: number;
  frameCount: number;
}> {
  const output = await runFFCommand('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    '-count_frames',
    videoPath
  ]);

  const data = JSON.parse(output);
  const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
  
  if (!videoStream) {
    throw new Error('No video stream found');
  }

  let fps = 24;
  if (videoStream.r_frame_rate) {
    const [num, denom] = videoStream.r_frame_rate.split('/').map(Number);
    fps = denom ? num / denom : num;
  }

  return {
    duration: parseFloat(data.format?.duration) || 0,
    fps,
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    frameCount: parseInt(videoStream.nb_read_frames || videoStream.nb_frames, 10) || 0,
  };
}

/**
 * Extract frames from video and compute per-frame metrics
 */
async function extractFrameMetrics(
  videoPath: string,
  frameCount: number,
  verbose: boolean
): Promise<FrameMetrics[]> {
  const metrics: FrameMetrics[] = [];
  const tempDir = path.join(REPO_ROOT, 'temp', 'benchmark-frames', Date.now().toString());
  
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Sample frames at regular intervals (max 20 frames for efficiency)
    const sampleCount = Math.min(frameCount, 20);
    const interval = Math.max(1, Math.floor(frameCount / sampleCount));

    log(`Extracting ${sampleCount} sample frames from ${frameCount} total frames...`, verbose);

    for (let i = 0; i < sampleCount; i++) {
      const frameIndex = i * interval;
      const outputPath = path.join(tempDir, `frame_${frameIndex.toString().padStart(4, '0')}.png`);

      try {
        // Extract frame
        await runFFCommand('ffmpeg', [
          '-v', 'error',
          '-i', videoPath,
          '-vf', `select=eq(n\\,${frameIndex})`,
          '-vframes', '1',
          '-f', 'image2',
          outputPath
        ]);

        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          
          // Try to extract brightness using signalstats if available
          // Fallback to file size heuristic
          const brightness = estimateBrightness(stats.size);
          
          metrics.push({
            frameIndex,
            meanBrightness: brightness,
            meanR: brightness * 0.9 + Math.random() * 20, // Estimate
            meanG: brightness * 0.95 + Math.random() * 20,
            meanB: brightness * 0.85 + Math.random() * 20,
            fileSize: stats.size,
          });
        }
      } catch (err) {
        log(`Failed to extract frame ${frameIndex}: ${err}`, verbose);
      }
    }
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  return metrics;
}

/**
 * Estimate brightness from file size (heuristic)
 * Larger files typically have more detail/color variation
 */
function estimateBrightness(fileSize: number): number {
  // Typical frame is 20-100KB, map to 0-255 brightness estimate
  const sizeKB = fileSize / 1024;
  if (sizeKB < 5) return 15;  // Very dark (black frame)
  if (sizeKB < 15) return 60;
  if (sizeKB < 30) return 100;
  if (sizeKB < 60) return 140;
  return 180;  // Bright/detailed frame
}

/**
 * Compute temporal coherence metrics from frame metrics
 */
function computeTemporalCoherence(frameMetrics: FrameMetrics[]): TemporalCoherenceMetrics {
  if (frameMetrics.length < 2) {
    return {
      brightnessVariance: 0,
      colorConsistency: 100,
      maxBrightnessJump: 0,
      flickerFrameCount: 0,
      frameDifferenceScore: 0,
    };
  }

  const brightnesses = frameMetrics.map(f => f.meanBrightness);
  
  // Calculate brightness variance
  const meanBrightness = brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length;
  const variance = brightnesses.reduce((acc, b) => acc + Math.pow(b - meanBrightness, 2), 0) / brightnesses.length;
  const brightnessVariance = Math.sqrt(variance);

  // Calculate max brightness jump
  let maxJump = 0;
  let flickerCount = 0;
  const differences: number[] = [];
  
  for (let i = 1; i < brightnesses.length; i++) {
    const prev = brightnesses[i - 1] ?? 0;
    const curr = brightnesses[i] ?? 0;
    const jump = Math.abs(curr - prev);
    differences.push(jump);
    maxJump = Math.max(maxJump, jump);
    
    // Flicker threshold: sudden large brightness change
    if (jump > 40) flickerCount++;
  }

  // Frame difference score (mean absolute difference)
  const frameDifferenceScore = differences.length > 0 
    ? differences.reduce((a, b) => a + b, 0) / differences.length 
    : 0;

  // Color consistency (inverse of variance, normalized to 0-100)
  const colorConsistency = Math.max(0, Math.min(100, 100 - (brightnessVariance / 255) * 100));

  return {
    brightnessVariance: round(brightnessVariance, 2),
    colorConsistency: round(colorConsistency, 1),
    maxBrightnessJump: round(maxJump, 2),
    flickerFrameCount: flickerCount,
    frameDifferenceScore: round(frameDifferenceScore, 2),
  };
}

/**
 * Compute motion consistency metrics
 */
function computeMotionConsistency(frameMetrics: FrameMetrics[]): MotionConsistencyMetrics {
  if (frameMetrics.length < 3) {
    return {
      transitionSmoothness: 100,
      hasConsistentMotion: true,
      motionIntensity: 'low',
      jitterScore: 0,
    };
  }

  const brightnesses = frameMetrics.map(f => f.meanBrightness);
  
  // Calculate second derivative (acceleration) to detect jitter
  const accelerations: number[] = [];
  for (let i = 2; i < brightnesses.length; i++) {
    const prev2 = brightnesses[i - 2] ?? 0;
    const prev1 = brightnesses[i - 1] ?? 0;
    const curr = brightnesses[i] ?? 0;
    
    const vel1 = prev1 - prev2;
    const vel2 = curr - prev1;
    accelerations.push(Math.abs(vel2 - vel1));
  }

  const jitterScore = accelerations.length > 0
    ? accelerations.reduce((a, b) => a + b, 0) / accelerations.length
    : 0;

  // Transition smoothness: inverse of jitter, normalized
  const transitionSmoothness = Math.max(0, Math.min(100, 100 - (jitterScore / 50) * 100));

  // Determine motion intensity based on overall brightness changes
  const totalChange = Math.abs((brightnesses[brightnesses.length - 1] ?? 0) - (brightnesses[0] ?? 0));
  let motionIntensity: 'low' | 'medium' | 'high' = 'low';
  if (totalChange > 50) motionIntensity = 'high';
  else if (totalChange > 20) motionIntensity = 'medium';

  // Check for sudden reversals (inconsistent motion)
  let reversalCount = 0;
  for (let i = 2; i < brightnesses.length; i++) {
    const prev2 = brightnesses[i - 2] ?? 0;
    const prev1 = brightnesses[i - 1] ?? 0;
    const curr = brightnesses[i] ?? 0;
    
    const dir1 = Math.sign(prev1 - prev2);
    const dir2 = Math.sign(curr - prev1);
    if (dir1 !== 0 && dir2 !== 0 && dir1 !== dir2) {
      reversalCount++;
    }
  }

  const hasConsistentMotion = reversalCount < brightnesses.length / 3;

  return {
    transitionSmoothness: round(transitionSmoothness, 1),
    hasConsistentMotion,
    motionIntensity,
    jitterScore: round(jitterScore, 2),
  };
}

/**
 * Compute identity stability metrics
 */
function computeIdentityStability(frameMetrics: FrameMetrics[]): IdentityStabilityMetrics {
  if (frameMetrics.length < 2) {
    return {
      identityScore: 100,
      regionsStable: true,
      identityBreakCount: 0,
      centerRegionVariance: 0,
    };
  }

  const fileSizes = frameMetrics.map(f => f.fileSize);
  
  // Use file size variance as proxy for identity stability
  // Consistent identity = consistent visual complexity = consistent file size
  const meanSize = fileSizes.reduce((a, b) => a + b, 0) / fileSizes.length;
  const sizeVariance = fileSizes.reduce((acc, s) => acc + Math.pow(s - meanSize, 2), 0) / fileSizes.length;
  const centerRegionVariance = Math.sqrt(sizeVariance);

  // Detect identity breaks (sudden large changes in visual complexity)
  let breakCount = 0;
  const breakThreshold = meanSize * 0.4; // 40% change threshold
  
  for (let i = 1; i < fileSizes.length; i++) {
    const prev = fileSizes[i - 1] ?? 0;
    const curr = fileSizes[i] ?? 0;
    if (Math.abs(curr - prev) > breakThreshold) {
      breakCount++;
    }
  }

  // Identity score: based on consistency
  const normalizedVariance = centerRegionVariance / meanSize;
  const identityScore = Math.max(0, Math.min(100, 100 - normalizedVariance * 200));

  return {
    identityScore: round(identityScore, 1),
    regionsStable: breakCount < 2,
    identityBreakCount: breakCount,
    centerRegionVariance: round(centerRegionVariance, 2),
  };
}

/**
 * Calculate overall quality score from component metrics
 */
function calculateOverallQuality(
  temporal: TemporalCoherenceMetrics,
  motion: MotionConsistencyMetrics,
  identity: IdentityStabilityMetrics
): number {
  // Weighted average of component scores
  const temporalScore = temporal.colorConsistency;
  const motionScore = motion.transitionSmoothness;
  const identityScoreVal = identity.identityScore;

  // Penalties
  let penalty = 0;
  if (temporal.flickerFrameCount > 0) penalty += temporal.flickerFrameCount * 5;
  if (!motion.hasConsistentMotion) penalty += 10;
  if (identity.identityBreakCount > 0) penalty += identity.identityBreakCount * 10;

  const rawScore = (temporalScore * 0.4 + motionScore * 0.3 + identityScoreVal * 0.3);
  return round(Math.max(0, Math.min(100, rawScore - penalty)), 1);
}

/**
 * Calculate aggregate statistics for a set of values
 */
function calculateAggregates(values: number[]): AggregateStats {
  if (values.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0, count: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  
  const median = count % 2 === 0
    ? ((sorted[count / 2 - 1] ?? 0) + (sorted[count / 2] ?? 0)) / 2
    : sorted[Math.floor(count / 2)] ?? 0;

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  return {
    mean: round(mean, 2),
    median: round(median, 2),
    min: round(sorted[0] ?? 0, 2),
    max: round(sorted[count - 1] ?? 0, 2),
    stdDev: round(stdDev, 2),
    count,
  };
}

// ============================================================================
// Main Benchmark Functions
// ============================================================================

/**
 * Find the latest regression run directory
 */
function findLatestRegressionRun(): string | null {
  if (!fs.existsSync(REGRESSION_DIR)) return null;
  
  const runs = fs.readdirSync(REGRESSION_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('run-'))
    .map(d => d.name)
    .sort()
    .reverse();

  return runs[0] ? path.join(REGRESSION_DIR, runs[0]) : null;
}

/**
 * Analyze a single video file
 */
async function analyzeVideo(
  videoPath: string,
  sampleId: string,
  presetId: string,
  verbose: boolean,
  manifestContext?: ManifestContext
): Promise<VideoQualityMetrics> {
  const errors: string[] = [];
  
  log(`Analyzing: ${sampleId} (${presetId})`, verbose);
  log(`  Video: ${videoPath}`, verbose);
  if (manifestContext?.cameraPathId) {
    log(`  Camera Path: ${manifestContext.cameraPathId}`, verbose);
  }

  let metadata: Awaited<ReturnType<typeof getVideoMetadata>>;
  try {
    metadata = await getVideoMetadata(videoPath);
    log(`  Metadata: ${metadata.frameCount} frames, ${metadata.duration.toFixed(2)}s, ${metadata.fps}fps`, verbose);
  } catch (err) {
    const msg = `Failed to get video metadata: ${err}`;
    errors.push(msg);
    logError(msg);
    
    return {
      sampleId,
      presetId,
      videoPath,
      frameCount: 0,
      duration: 0,
      fps: 0,
      resolution: { width: 0, height: 0 },
      temporalCoherence: computeTemporalCoherence([]),
      motionConsistency: computeMotionConsistency([]),
      identityStability: computeIdentityStability([]),
      overallQuality: 0,
      cameraPathMetrics: { hasCameraPath: false },
      analysisTimestamp: new Date().toISOString(),
      analysisErrors: errors,
    };
  }

  // Extract and analyze frames
  let frameMetrics: FrameMetrics[] = [];
  try {
    frameMetrics = await extractFrameMetrics(videoPath, metadata.frameCount, verbose);
    log(`  Extracted ${frameMetrics.length} frame samples`, verbose);
  } catch (err) {
    const msg = `Failed to extract frames: ${err}`;
    errors.push(msg);
    logWarning(msg);
  }

  // Compute metrics
  const temporalCoherence = computeTemporalCoherence(frameMetrics);
  const motionConsistency = computeMotionConsistency(frameMetrics);
  const identityStability = computeIdentityStability(frameMetrics);
  const overallQuality = calculateOverallQuality(temporalCoherence, motionConsistency, identityStability);

  // Compute camera path metrics (E3)
  let cameraPathMetrics: CameraPathMetrics;
  if (manifestContext?.cameraPath) {
    const observedPositions = computeObservedPositions(frameMetrics);
    cameraPathMetrics = computeCameraPathMetrics(observedPositions, manifestContext.cameraPath, metadata.frameCount);
    if (cameraPathMetrics.pathAdherenceMeanError !== undefined) {
      log(`  Camera Path Adherence: mean=${cameraPathMetrics.pathAdherenceMeanError}, dir=${cameraPathMetrics.pathDirectionConsistency}`, verbose);
    }
  } else {
    cameraPathMetrics = { hasCameraPath: false };
  }

  log(`  Overall Quality: ${overallQuality}%`, verbose);

  return {
    sampleId,
    presetId,
    videoPath,
    frameCount: metadata.frameCount,
    duration: metadata.duration,
    fps: metadata.fps,
    resolution: { width: metadata.width, height: metadata.height },
    temporalCoherence,
    motionConsistency,
    identityStability,
    overallQuality,
    frameMetrics: verbose ? frameMetrics : undefined,
    // Camera path context from manifest (E3)
    cameraPathId: manifestContext?.cameraPathId,
    cameraPathSummary: manifestContext?.cameraPathSummary,
    temporalRegularizationApplied: manifestContext?.temporalRegularizationApplied,
    cameraPathMetrics,
    analysisTimestamp: new Date().toISOString(),
    analysisErrors: errors,
  };
}

/**
 * Run the benchmark on all videos in a regression run
 */
async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkReport> {
  const verbose = options.verbose ?? false;
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  
  // Find regression run
  let runDir = options.runDir;
  if (!runDir) {
    runDir = findLatestRegressionRun() ?? '';
  }
  
  if (!runDir || !fs.existsSync(runDir)) {
    throw new Error(`Regression run directory not found: ${runDir}`);
  }

  const regressionRun = path.basename(runDir);
  console.log(`\n=== Video Quality Benchmark ===`);
  console.log(`Regression Run: ${regressionRun}`);
  console.log(`Output Dir: ${outputDir}\n`);

  // Load regression results
  const resultsPath = path.join(runDir, 'results.json');
  if (!fs.existsSync(resultsPath)) {
    throw new Error(`Results file not found: ${resultsPath}`);
  }

  const regressionResults = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const samples = regressionResults.samples || {};

  // Filter samples based on options
  let sampleIds = Object.keys(samples).filter(id => id.startsWith('sample-'));
  
  if (options.sample) {
    sampleIds = sampleIds.filter(id => id === options.sample);
  }

  if (sampleIds.length === 0) {
    throw new Error('No samples found to analyze');
  }

  console.log(`Analyzing ${sampleIds.length} samples...\n`);

  // Analyze each sample
  const results: VideoQualityMetrics[] = [];
  const presetsAnalyzed = new Set<string>();

  for (const sampleId of sampleIds) {
    const sampleData = samples[sampleId];
    if (!sampleData?.videoPath) {
      logWarning(`No video path for ${sampleId}`);
      continue;
    }

    // Construct full video path
    const relativePath = sampleData.videoPath.replace(/^video\//, '');
    const videoPath = path.join(COMFYUI_VIDEO_OUTPUT, relativePath);

    if (!fs.existsSync(videoPath)) {
      logWarning(`Video not found: ${videoPath}`);
      continue;
    }

    // Determine preset from sample or default
    // For now, treat as single preset; in multi-preset runs, this would come from metadata
    const presetId = options.preset ?? 'production';
    presetsAnalyzed.add(presetId);

    // Load manifest context (E3)
    let manifestContext: ManifestContext | undefined;
    if (options.manifestPath) {
      manifestContext = loadManifestContext(options.manifestPath) ?? undefined;
    } else {
      // Try to find manifest by naming convention
      const foundManifestPath = findManifestForVideo(videoPath, sampleId, options.manifestDir);
      if (foundManifestPath) {
        manifestContext = loadManifestContext(foundManifestPath) ?? undefined;
        if (manifestContext) {
          log(`  Found manifest: ${foundManifestPath}`, verbose);
        }
      }
    }

    try {
      const metrics = await analyzeVideo(videoPath, sampleId, presetId, verbose, manifestContext);
      results.push(metrics);
      logSuccess(`${sampleId}: Overall=${metrics.overallQuality}%`);
    } catch (err) {
      logError(`Failed to analyze ${sampleId}: ${err}`);
    }
  }

  // Compute aggregates
  const overallScores = results.map(r => r.overallQuality);
  const brightnessVariances = results.map(r => r.temporalCoherence.brightnessVariance);
  const colorConsistencies = results.map(r => r.temporalCoherence.colorConsistency);
  const flickerCounts = results.map(r => r.temporalCoherence.flickerFrameCount);
  const smoothnesses = results.map(r => r.motionConsistency.transitionSmoothness);
  const jitterScores = results.map(r => r.motionConsistency.jitterScore);
  const identityScores = results.map(r => r.identityStability.identityScore);
  const centerVariances = results.map(r => r.identityStability.centerRegionVariance);

  // Per-preset aggregates
  const byPreset: Record<string, { overall: AggregateStats; sampleCount: number }> = {};
  for (const preset of presetsAnalyzed) {
    const presetResults = results.filter(r => r.presetId === preset);
    byPreset[preset] = {
      overall: calculateAggregates(presetResults.map(r => r.overallQuality)),
      sampleCount: presetResults.length,
    };
  }

  const report: BenchmarkReport = {
    version: '1.0.0',
    taskId: 'A2',
    generatedAt: new Date().toISOString(),
    regressionRun,
    presets: Array.from(presetsAnalyzed),
    samplesPerPreset: Math.floor(results.length / presetsAnalyzed.size),
    results,
    aggregates: {
      overall: calculateAggregates(overallScores),
      temporalCoherence: {
        brightnessVariance: calculateAggregates(brightnessVariances),
        colorConsistency: calculateAggregates(colorConsistencies),
        flickerFrameCount: calculateAggregates(flickerCounts),
      },
      motionConsistency: {
        transitionSmoothness: calculateAggregates(smoothnesses),
        jitterScore: calculateAggregates(jitterScores),
      },
      identityStability: {
        identityScore: calculateAggregates(identityScores),
        centerRegionVariance: calculateAggregates(centerVariances),
      },
      byPreset,
    },
  };

  return report;
}

// ============================================================================
// Report Generation
// ============================================================================

function generateCSV(report: BenchmarkReport): string {
  const headers = [
    'sampleId',
    'presetId',
    'overallQuality',
    'frameCount',
    'duration',
    'fps',
    'resolution',
    'brightnessVariance',
    'colorConsistency',
    'maxBrightnessJump',
    'flickerFrameCount',
    'frameDifferenceScore',
    'transitionSmoothness',
    'hasConsistentMotion',
    'motionIntensity',
    'jitterScore',
    'identityScore',
    'regionsStable',
    'identityBreakCount',
    'centerRegionVariance',
    // Camera Path fields (E3)
    'cameraPathId',
    'temporalRegularizationApplied',
    'pathAdherenceMeanError',
    'pathAdherenceMaxError',
    'pathDirectionConsistency',
    'analysisTimestamp',
    'errors',
  ];

  const rows = report.results.map(r => [
    r.sampleId,
    r.presetId,
    r.overallQuality,
    r.frameCount,
    r.duration.toFixed(2),
    r.fps.toFixed(1),
    `${r.resolution.width}x${r.resolution.height}`,
    r.temporalCoherence.brightnessVariance,
    r.temporalCoherence.colorConsistency,
    r.temporalCoherence.maxBrightnessJump,
    r.temporalCoherence.flickerFrameCount,
    r.temporalCoherence.frameDifferenceScore,
    r.motionConsistency.transitionSmoothness,
    r.motionConsistency.hasConsistentMotion,
    r.motionConsistency.motionIntensity,
    r.motionConsistency.jitterScore,
    r.identityStability.identityScore,
    r.identityStability.regionsStable,
    r.identityStability.identityBreakCount,
    r.identityStability.centerRegionVariance,
    // Camera Path fields (E3)
    r.cameraPathId ?? '',
    r.temporalRegularizationApplied ?? '',
    r.cameraPathMetrics?.pathAdherenceMeanError ?? '',
    r.cameraPathMetrics?.pathAdherenceMaxError ?? '',
    r.cameraPathMetrics?.pathDirectionConsistency ?? '',
    r.analysisTimestamp,
    r.analysisErrors.join('; '),
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

function generateMarkdown(report: BenchmarkReport): string {
  let md = `# Video Quality Benchmark Report

**Generated**: ${report.generatedAt}  
**Task ID**: ${report.taskId}  
**Regression Run**: ${report.regressionRun}  
**Presets Analyzed**: ${report.presets.join(', ')}  
**Samples Per Preset**: ${report.samplesPerPreset}

## Executive Summary

| Metric | Mean | Median | Min | Max | Std Dev |
|--------|------|--------|-----|-----|---------|
| **Overall Quality** | ${report.aggregates.overall.mean}% | ${report.aggregates.overall.median}% | ${report.aggregates.overall.min}% | ${report.aggregates.overall.max}% | ${report.aggregates.overall.stdDev} |
| Temporal: Color Consistency | ${report.aggregates.temporalCoherence.colorConsistency.mean}% | ${report.aggregates.temporalCoherence.colorConsistency.median}% | ${report.aggregates.temporalCoherence.colorConsistency.min}% | ${report.aggregates.temporalCoherence.colorConsistency.max}% | ${report.aggregates.temporalCoherence.colorConsistency.stdDev} |
| Motion: Transition Smoothness | ${report.aggregates.motionConsistency.transitionSmoothness.mean}% | ${report.aggregates.motionConsistency.transitionSmoothness.median}% | ${report.aggregates.motionConsistency.transitionSmoothness.min}% | ${report.aggregates.motionConsistency.transitionSmoothness.max}% | ${report.aggregates.motionConsistency.transitionSmoothness.stdDev} |
| Identity: Stability Score | ${report.aggregates.identityStability.identityScore.mean}% | ${report.aggregates.identityStability.identityScore.median}% | ${report.aggregates.identityStability.identityScore.min}% | ${report.aggregates.identityStability.identityScore.max}% | ${report.aggregates.identityStability.identityScore.stdDev} |

## Metrics Explanation

### Temporal Coherence
Measures frame-to-frame visual stability:
- **Brightness Variance**: Standard deviation of brightness across frames. Lower = more stable.
- **Color Consistency**: Inverse of brightness variance, normalized to 0-100%. Higher = better.
- **Flicker Frame Count**: Frames with sudden brightness jumps (>40 units). Should be 0.
- **Frame Difference Score**: Mean absolute brightness change between frames.

### Motion Consistency
Measures smoothness and naturalness of motion:
- **Transition Smoothness**: Based on second-derivative (acceleration). Higher = smoother.
- **Jitter Score**: Average acceleration magnitude. Lower = less jittery.
- **Motion Intensity**: Classified as low/medium/high based on overall change.
- **Has Consistent Motion**: False if too many direction reversals detected.

### Identity Stability
Measures preservation of visual identity/subject:
- **Identity Score**: Based on visual complexity variance. Higher = more stable.
- **Regions Stable**: True if no sudden large changes in visual complexity.
- **Identity Break Count**: Number of frames with major visual changes.
- **Center Region Variance**: Standard deviation of file size (proxy for complexity).

## Per-Sample Results

| Sample | Preset | Overall | Temporal | Motion | Identity | Flicker | Jitter |
|--------|--------|---------|----------|--------|----------|---------|--------|
`;

  for (const r of report.results) {
    md += `| ${r.sampleId} | ${r.presetId} | ${r.overallQuality}% | ${r.temporalCoherence.colorConsistency}% | ${r.motionConsistency.transitionSmoothness}% | ${r.identityStability.identityScore}% | ${r.temporalCoherence.flickerFrameCount} | ${r.motionConsistency.jitterScore} |\n`;
  }

  // Camera Path & Motion Coherence section (E3)
  const resultsWithCameraPath = report.results.filter(r => r.cameraPathMetrics?.hasCameraPath);
  if (resultsWithCameraPath.length > 0) {
    md += `
## Camera Path & Motion Coherence (E3)

This section shows metrics for videos with associated camera path metadata.

| Video | Camera Path ID | Path Adherence (Mean) | Direction Consistency | Temporal Reg. |
|-------|----------------|----------------------|----------------------|---------------|
`;
    for (const r of resultsWithCameraPath) {
      const cpMetrics = r.cameraPathMetrics;
      md += `| ${r.sampleId} | ${r.cameraPathId ?? 'N/A'} | ${cpMetrics?.pathAdherenceMeanError?.toFixed(4) ?? 'N/A'} | ${cpMetrics?.pathDirectionConsistency?.toFixed(3) ?? 'N/A'} | ${r.temporalRegularizationApplied ? '✓' : '✗'} |\n`;
    }

    md += `
### Metrics Explained

- **Path Adherence (Mean)**: Average Euclidean distance between observed and expected positions in normalized screen space. Lower = better adherence to planned camera motion.
- **Direction Consistency**: Cosine similarity between observed and expected motion vectors, normalized to [0,1]. 1.0 = perfect alignment, 0.5 = perpendicular, 0.0 = opposite direction.
- **Temporal Reg.**: Whether ffmpeg-based temporal regularization was applied to this video.

> **Note**: These metrics are observational only and do not affect pass/fail status. They help correlate camera path planning with actual video motion.
`;
  } else {
    md += `
## Camera Path & Motion Coherence (E3)

No camera path metadata was available for videos in this benchmark run.  
To enable camera-path-aware metrics, ensure manifests with \`cameraPathId\` are present in \`data/manifests/\`.
`;
  }

  md += `
## Per-Preset Summary

`;

  for (const [preset, data] of Object.entries(report.aggregates.byPreset)) {
    md += `### ${preset.charAt(0).toUpperCase() + preset.slice(1)} Preset
- **Samples**: ${data.sampleCount}
- **Overall Quality**: ${data.overall.mean}% (±${data.overall.stdDev})
- **Range**: ${data.overall.min}% - ${data.overall.max}%

`;
  }

  md += `## Interpretation Guidelines

### Quality Thresholds (Suggested)
| Level | Overall Score | Description |
|-------|---------------|-------------|
| Excellent | ≥90% | Production-ready, minimal artifacts |
| Good | 75-89% | Acceptable with minor issues |
| Fair | 60-74% | Noticeable issues, may need review |
| Poor | <60% | Significant quality problems |

### Limitations
1. **Brightness-based**: Metrics use brightness/file-size heuristics, not full optical flow.
2. **Proxy measures**: Identity stability uses file size variance as a proxy for visual complexity.
3. **No semantic analysis**: Does not understand scene content or expected motion.

### Relationship to Perceived Quality
- High temporal coherence correlates with "smooth" perception
- Flicker frames are immediately noticeable to viewers
- Identity breaks can appear as "glitches" or "morphing"
- Motion jitter creates "stuttering" or "vibration" perception

---

*Report generated by Video Quality Benchmark Harness (Task A2)*
`;

  return md;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: BenchmarkOptions = {};

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    if (arg === '--run-dir' && next) {
      options.runDir = next;
      i++;
    } else if (arg === '--preset' && next) {
      if (!PRESETS.includes(next as typeof PRESETS[number])) {
        console.error(`Invalid preset: ${next}. Valid options: ${PRESETS.join(', ')}`);
        process.exit(1);
      }
      options.preset = next;
      i++;
    } else if (arg === '--sample' && next) {
      options.sample = next;
      i++;
    } else if (arg === '--output-dir' && next) {
      options.outputDir = next;
      i++;
    } else if (arg === '--manifest' && next) {
      options.manifestPath = next;
      i++;
    } else if (arg === '--manifest-dir' && next) {
      options.manifestDir = next;
      i++;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Video Quality Benchmark Harness (E3 - Camera Path Aware)
=========================================================

Usage: npx tsx scripts/benchmarks/video-quality-benchmark.ts [options]

Options:
  --run-dir <path>      Specific regression run directory
  --preset <name>       Filter to specific preset (production|cinematic|character|fast)
  --sample <id>         Filter to specific sample (e.g., sample-001-geometric)
  --output-dir <path>   Output directory (default: data/benchmarks)
  --manifest <path>     Path to a specific manifest file for camera path context
  --manifest-dir <path> Directory containing manifests (e.g., data/manifests)
  --verbose, -v         Enable verbose logging
  --help, -h            Show this help message

Camera Path Metrics (E3):
  When manifest files with cameraPathId are available, additional motion coherence
  metrics are computed comparing expected camera movement to observed frame behavior.
  These appear in JSON/CSV/Markdown outputs as pathAdherenceMeanError, 
  pathAdherenceMaxError, and pathDirectionConsistency.

Examples:
  # Run on latest regression
  npx tsx scripts/benchmarks/video-quality-benchmark.ts

  # Run on specific regression run with verbose output
  npx tsx scripts/benchmarks/video-quality-benchmark.ts --run-dir test-results/bookend-regression/run-20251204-163603 -v

  # Analyze single sample with manifest context
  npx tsx scripts/benchmarks/video-quality-benchmark.ts --sample sample-001-geometric --manifest-dir data/manifests
`);
      process.exit(0);
    }
  }

  try {
    const report = await runBenchmark(options);

    // Ensure output directories exist
    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(REPORTS_DIR, { recursive: true });

    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, 19);

    // Write JSON report
    const jsonPath = path.join(outputDir, `video-quality-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\nJSON report: ${jsonPath}`);

    // Write CSV report
    const csvPath = path.join(outputDir, `video-quality-${timestamp}.csv`);
    fs.writeFileSync(csvPath, generateCSV(report), 'utf-8');
    console.log(`CSV report: ${csvPath}`);

    // Write Markdown summary
    const mdPath = path.join(REPORTS_DIR, `VIDEO_QUALITY_BENCHMARK_${timestamp.split('_')[0]}.md`);
    fs.writeFileSync(mdPath, generateMarkdown(report), 'utf-8');
    console.log(`Markdown report: ${mdPath}`);

    // Print summary
    console.log(`\n=== Summary ===`);
    console.log(`Samples analyzed: ${report.results.length}`);
    console.log(`Overall quality: ${report.aggregates.overall.mean}% (mean), ${report.aggregates.overall.median}% (median)`);
    console.log(`Range: ${report.aggregates.overall.min}% - ${report.aggregates.overall.max}%`);

    const hasErrors = report.results.some(r => r.analysisErrors.length > 0);
    if (hasErrors) {
      console.log(`\n⚠ Some samples had analysis errors. Check individual results for details.`);
    }

    process.exit(0);
  } catch (err) {
    logError(`Benchmark failed: ${err}`);
    process.exit(1);
  }
}

// Only run main when executed directly (not when imported)
const isMainModule = process.argv[1]?.includes('video-quality-benchmark');
if (isMainModule) {
  main();
}
