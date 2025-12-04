#!/usr/bin/env node

/**
 * Bookend Frame Similarity Analyzer
 * 
 * Computes pixel-level RGB similarity between golden keyframes and extracted video frames.
 * Uses ffmpeg to extract first and last frames, then calculates normalized 0-100 similarity scores.
 * 
 * Usage:
 *   node --import tsx bookend-frame-similarity.ts --video <mp4> --start <png> --end <png>
 * 
 * Output (stdout):
 *   JSON with startSimilarity and endSimilarity (0-100 scale)
 * 
 * Exit codes:
 *   0 = success
 *   1 = error (missing ffmpeg, file not found, invalid args)
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';

interface Args {
  video?: string;
  start?: string;
  end?: string;
}

interface SimilarityResult {
  videoPath: string;
  startPath: string;
  endPath: string;
  startSimilarity: number;
  endSimilarity: number;
  timestamp: string;
}

/**
 * Parse command-line arguments
 */
function parseArgs(): Args {
  const args: Args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--video' && i + 1 < process.argv.length) {
      args.video = process.argv[++i];
    } else if (arg === '--start' && i + 1 < process.argv.length) {
      args.start = process.argv[++i];
    } else if (arg === '--end' && i + 1 < process.argv.length) {
      args.end = process.argv[++i];
    }
  }
  return args;
}

/**
 * Validate arguments and file existence
 */
function validateArgs(args: Args): void {
  if (!args.video || !args.start || !args.end) {
    console.error('Usage: bookend-frame-similarity.ts --video <mp4> --start <png> --end <png>');
    process.exit(1);
  }

  if (!fs.existsSync(args.video)) {
    console.error(`Video file not found: ${args.video}`);
    process.exit(1);
  }
  if (!fs.existsSync(args.start)) {
    console.error(`Start keyframe not found: ${args.start}`);
    process.exit(1);
  }
  if (!fs.existsSync(args.end)) {
    console.error(`End keyframe not found: ${args.end}`);
    process.exit(1);
  }
}

/**
 * Extract frame from video at given index using ffmpeg
 */
function extractFrame(videoPath: string, frameIndex: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `frame_${frameIndex}_${Date.now()}.png`);
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vf', `select=eq(n\\,${frameIndex})`,
      '-vframes', '1',
      '-f', 'image2',
      tempFile,
      '-loglevel', 'error'
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg failed to extract frame ${frameIndex}: ${stderr}`));
        return;
      }

      try {
        if (!fs.existsSync(tempFile)) {
          reject(new Error(`Failed to extract frame ${frameIndex}: file not created`));
          return;
        }
        const buffer = fs.readFileSync(tempFile);
        fs.unlinkSync(tempFile); // Clean up temp file
        resolve(buffer);
      } catch (err) {
        reject(err);
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Get total frame count of video using ffprobe
 */
function getFrameCount(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-count_frames',
      '-show_entries', 'stream=nb_read_frames',
      '-of', 'csv=p=0',
      videoPath
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed: ${stderr}`));
        return;
      }

      const count = parseInt(stdout.trim(), 10);
      if (isNaN(count)) {
        reject(new Error(`Could not parse frame count: ${stdout}`));
        return;
      }

      resolve(count);
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`FFprobe spawn error: ${err.message}`));
    });
  });
}

/**
 * Read PNG file as buffer
 */
function readPNG(filePath: string): Buffer {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

/**
 * Parse PNG file and extract raw pixel data (simple PNG parser for RGB data)
 * 
 * Note: This is a minimal parser that handles PNG files with 8-bit RGB/RGBA color.
 * For more robust parsing, consider using a library like 'png' or 'sharp'.
 */
function extractPixelData(pngBuffer: Buffer): { width: number; height: number; pixels: Uint8Array } {
  // PNG signature check
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!pngBuffer.slice(0, 8).equals(signature)) {
    throw new Error('Invalid PNG file signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks: Buffer[] = [];  // Collect all IDAT chunks

  while (offset < pngBuffer.length) {
    // Read chunk length (big-endian 32-bit)
    const chunkLen = pngBuffer.readUInt32BE(offset);
    offset += 4;

    // Read chunk type (4 bytes)
    const chunkType = pngBuffer.toString('ascii', offset, offset + 4);
    offset += 4;

    if (chunkType === 'IHDR') {
      // Image header chunk
      width = pngBuffer.readUInt32BE(offset);
      height = pngBuffer.readUInt32BE(offset + 4);
    } else if (chunkType === 'IDAT') {
      // Image data chunk - collect all IDAT chunks
      idatChunks.push(pngBuffer.slice(offset, offset + chunkLen));
    }

    // Skip to next chunk (add 4 for CRC)
    offset += chunkLen + 4;

    if (chunkType === 'IEND') {
      break; // End of PNG
    }
  }

  if (idatChunks.length === 0 || width === 0 || height === 0) {
    throw new Error('Could not parse PNG dimensions or data');
  }

  // Concatenate all IDAT chunks and decompress
  const compressedData = Buffer.concat(idatChunks);
  const pixelData = zlib.inflateSync(compressedData);

  return { width, height, pixels: pixelData };
}

/**
 * Calculate RGB similarity between two pixel buffers
 * Returns 0-100 scale where 100 = identical
 * 
 * Uses mean absolute difference normalized to max possible difference (255 per channel)
 */
function calculateSimilarity(pixels1: Uint8Array, pixels2: Uint8Array): number {
  const minLen = Math.min(pixels1.length, pixels2.length);
  if (minLen === 0) {
    return 0;
  }

  let totalDiff = 0;
  for (let i = 0; i < minLen; i++) {
    // Nullish coalescing satisfies TypeScript strict mode (TS2532) while being runtime-safe
    const p1 = pixels1[i] ?? 0;
    const p2 = pixels2[i] ?? 0;
    const diff = Math.abs(p1 - p2);
    totalDiff += diff;
  }

  // Calculate average difference per byte (0-255 range)
  const avgDiff = totalDiff / minLen;
  
  // Convert to 0-100 similarity score
  // avgDiff=0 → 100, avgDiff=255 → 0
  const similarity = Math.max(0, Math.min(100, 100 - (avgDiff / 255) * 100));
  
  return Math.round(similarity * 10) / 10; // Round to 1 decimal place
}

/**
 * Main execution
 */
async function main() {
  try {
    const args = parseArgs();
    validateArgs(args);

    if (!args.video || !args.start || !args.end) {
      throw new Error('Missing required arguments');
    }

    // Read golden keyframes
    const startKeyframeBuffer = readPNG(args.start);
    const endKeyframeBuffer = readPNG(args.end);

    // Extract pixel data from golden keyframes
    const startKeyframeData = extractPixelData(startKeyframeBuffer);
    const endKeyframeData = extractPixelData(endKeyframeBuffer);

    // Get video frame count
    const frameCount = await getFrameCount(args.video);

    if (frameCount < 2) {
      throw new Error(`Video must have at least 2 frames, got ${frameCount}`);
    }

    // Extract first frame (index 0)
    const firstFrameBuffer = await extractFrame(args.video, 0);
    const firstFrameData = extractPixelData(firstFrameBuffer);

    // Extract last frame (index frameCount - 1)
    const lastFrameBuffer = await extractFrame(args.video, frameCount - 1);
    const lastFrameData = extractPixelData(lastFrameBuffer);

    // Calculate similarity scores
    const startSimilarity = calculateSimilarity(startKeyframeData.pixels, firstFrameData.pixels);
    const endSimilarity = calculateSimilarity(endKeyframeData.pixels, lastFrameData.pixels);

    // Output result
    const result: SimilarityResult = {
      videoPath: args.video,
      startPath: args.start,
      endPath: args.end,
      startSimilarity,
      endSimilarity,
      timestamp: new Date().toISOString()
    };

    // Print JSON to stdout (single line for easy parsing)
    console.log(JSON.stringify(result));

    // Print human summary
    const summary = `Bookend Frame Similarity: start=${startSimilarity.toFixed(1)} end=${endSimilarity.toFixed(1)} avg=${(((startSimilarity + endSimilarity) / 2).toFixed(1))}`;
    console.error(summary);

    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
