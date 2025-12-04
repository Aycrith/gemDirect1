/**
 * Video Splicing Utility
 * 
 * Splices two videos together with crossfade transition using ffmpeg.
 * Used for bookend workflow: combines start-keyframe video + end-keyframe video.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';

export interface SpliceOptions {
  /**
   * Number of frames to use for crossfade transition (default: 1)
   * At 24fps, 1 frame = ~0.042 seconds
   */
  transitionFrames?: number;
  
  /**
   * Transition type for ffmpeg xfade filter
   * Options: 'fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'slideleft', etc.
   * Default: 'fade'
   */
  transitionType?: 'fade' | 'wipeleft' | 'wiperight' | 'slideleft' | 'slideright';
  
  /**
   * Frames per second (default: 24)
   */
  fps?: number;
  
  /**
   * Output video codec (default: 'libx264')
   */
  codec?: string;
  
  /**
   * Video quality CRF value (default: 18, range 0-51, lower = better quality)
   */
  crf?: number;
}

export interface SpliceResult {
  success: boolean;
  outputPath: string;
  error?: string;
  duration?: number;
}

/**
 * Splice two videos together with crossfade transition
 * 
 * @param video1Path - Path to first video (start keyframe video)
 * @param video2Path - Path to second video (end keyframe video)
 * @param outputPath - Path for output spliced video
 * @param options - Splicing options (transition frames, type, fps, etc.)
 * @returns Promise<SpliceResult> - Result with success status and output path
 * 
 * @example
 * const result = await spliceVideos(
 *   'output/start-video.mp4',
 *   'output/end-video.mp4',
 *   'output/bookend-spliced.mp4',
 *   { transitionFrames: 1 }
 * );
 */
export async function spliceVideos(
  video1Path: string,
  video2Path: string,
  outputPath: string,
  options: SpliceOptions = {}
): Promise<SpliceResult> {
  const {
    transitionFrames = 1,
    fps = 24,
    codec = 'libx264',
    crf = 18
  } = options;

  // Validate input files
  if (!existsSync(video1Path)) {
    return {
      success: false,
      outputPath,
      error: `Video 1 not found: ${video1Path}`
    };
  }
  if (!existsSync(video2Path)) {
    return {
      success: false,
      outputPath,
      error: `Video 2 not found: ${video2Path}`
    };
  }

  // Calculate transition duration in seconds
  const transitionDuration = transitionFrames / fps;
  
  // Get video 1 duration
  let video1Duration = 2.0; // Default fallback
  try {
    video1Duration = await getVideoDuration(video1Path);
    console.log(`[Video Splicer] Video 1 duration: ${video1Duration}s`);
  } catch (e) {
    console.warn(`[Video Splicer] Could not get duration for ${video1Path}, using default 2.0s:`, e);
  }

  // Calculate offset (when to start crossfade)
  // Ensure offset is not negative
  const offset = Math.max(0, video1Duration - transitionDuration);

  return new Promise<SpliceResult>((resolve, _reject) => {
    const startTime = Date.now();
    
    // ffmpeg command:
    // Use overlay+fade for compatibility with older ffmpeg (<4.3) which lacks xfade
    // [1:v]format=yuva420p,fade=t=in:st=0:d=duration:alpha=1,setpts=PTS-STARTPTS+offset/TB[v2];[0:v][v2]overlay=0:0
    const filterComplex = `[1:v]format=yuva420p,fade=t=in:st=0:d=${transitionDuration.toFixed(4)}:alpha=1,setpts=PTS-STARTPTS+${offset.toFixed(4)}/TB[v2];[0:v][v2]overlay=0:0`;

    const args = [
      '-i', video1Path,
      '-i', video2Path,
      '-filter_complex', filterComplex,
      '-c:v', codec,
      '-crf', crf.toString(),
      '-preset', 'fast',
      '-movflags', '+faststart', // Optimize for web playback
      '-y', // Overwrite output file
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    
    ffmpeg.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('error', (error) => {
      resolve({
        success: false,
        outputPath,
        error: `ffmpeg spawn error: ${error.message}`
      });
    });

    ffmpeg.on('close', (code) => {
      const duration = Date.now() - startTime;
      
      if (code === 0 && existsSync(outputPath)) {
        resolve({
          success: true,
          outputPath,
          duration
        });
      } else {
        // Extract error message from stderr
        const errorMatch = stderr.match(/Error.*$/m);
        const errorMsg = errorMatch ? errorMatch[0] : stderr.slice(-200);
        
        resolve({
          success: false,
          outputPath,
          error: `ffmpeg exited with code ${code}: ${errorMsg}`
        });
      }
    });
  });
}

/**
 * Check if ffmpeg is available in system PATH
 * 
 * @returns Promise<boolean> - True if ffmpeg is available
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version'], {
      stdio: 'ignore'
    });
    
    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });
    
    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Get video duration using ffprobe
 * 
 * @param videoPath - Path to video file
 * @returns Promise<number> - Duration in seconds
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    
    ffprobe.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });

    ffprobe.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Get the total frame count of a video
 * 
 * @param videoPath - Path to video file
 * @returns Promise<number> - Total frame count
 */
export async function getVideoFrameCount(videoPath: string): Promise<number> {
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-count_packets',
      '-show_entries', 'stream=nb_read_packets',
      '-of', 'csv=p=0',
      videoPath
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    
    ffprobe.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const frameCount = parseInt(stdout.trim(), 10);
        resolve(isNaN(frameCount) ? 0 : frameCount);
      } else {
        reject(new Error(`ffprobe frame count failed with code ${code}`));
      }
    });

    ffprobe.on('error', (error) => {
      reject(error);
    });
  });
}

export interface ExtractFrameResult {
  success: boolean;
  base64Image?: string;
  error?: string;
  frameNumber?: number;
}

/**
 * Extract the last frame from a video as a base64-encoded PNG image.
 * This is the foundation for chain-of-frames video generation, where
 * the last frame of Shot N becomes the first frame input for Shot N+1.
 * 
 * @param videoPath - Path to video file
 * @param outputFormat - Image format ('png' or 'jpg', default: 'png')
 * @returns Promise<ExtractFrameResult> - Result with base64 image data
 * 
 * @example
 * const result = await extractLastFrame('output/shot1.mp4');
 * if (result.success) {
 *   // Use result.base64Image as input for next shot's generation
 *   await generateNextShot(result.base64Image, nextShotPrompt);
 * }
 */
export async function extractLastFrame(
  videoPath: string,
  outputFormat: 'png' | 'jpg' = 'png'
): Promise<ExtractFrameResult> {
  if (!existsSync(videoPath)) {
    return {
      success: false,
      error: `Video not found: ${videoPath}`
    };
  }

  try {
    // First, get the frame count to determine last frame
    const frameCount = await getVideoFrameCount(videoPath);
    if (frameCount <= 0) {
      return {
        success: false,
        error: `Could not determine frame count for: ${videoPath}`
      };
    }

    const lastFrameNumber = frameCount - 1;

    return new Promise<ExtractFrameResult>((resolve) => {
      // Use ffmpeg to extract the last frame directly to stdout as base64
      // -sseof -0.1 seeks to 0.1 seconds before end (more reliable than frame number)
      // -frames:v 1 extracts exactly one frame
      // -f image2pipe outputs to pipe instead of file
      const args = [
        '-sseof', '-0.1',  // Seek to near end of file
        '-i', videoPath,
        '-frames:v', '1',
        '-f', 'image2pipe',
        '-vcodec', outputFormat === 'png' ? 'png' : 'mjpeg',
        '-'  // Output to stdout
      ];

      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const chunks: Buffer[] = [];
      let stderr = '';

      ffmpeg.stdout?.on('data', (data) => {
        chunks.push(data);
      });

      ffmpeg.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('error', (error) => {
        resolve({
          success: false,
          error: `ffmpeg spawn error: ${error.message}`
        });
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          const imageBuffer = Buffer.concat(chunks);
          const mimeType = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
          const base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
          
          resolve({
            success: true,
            base64Image,
            frameNumber: lastFrameNumber
          });
        } else {
          const errorMatch = stderr.match(/Error.*$/m);
          const errorMsg = errorMatch ? errorMatch[0] : stderr.slice(-200);
          
          resolve({
            success: false,
            error: `ffmpeg frame extraction failed with code ${code}: ${errorMsg}`,
            frameNumber: lastFrameNumber
          });
        }
      });
    });
  } catch (error) {
    return {
      success: false,
      error: `Frame extraction error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Extract a specific frame from a video as a base64-encoded image.
 * 
 * @param videoPath - Path to video file
 * @param frameNumber - Frame number to extract (0-indexed)
 * @param outputFormat - Image format ('png' or 'jpg', default: 'png')
 * @returns Promise<ExtractFrameResult> - Result with base64 image data
 */
export async function extractFrame(
  videoPath: string,
  frameNumber: number,
  outputFormat: 'png' | 'jpg' = 'png'
): Promise<ExtractFrameResult> {
  if (!existsSync(videoPath)) {
    return {
      success: false,
      error: `Video not found: ${videoPath}`
    };
  }

  return new Promise<ExtractFrameResult>((resolve) => {
    // Calculate timestamp for frame (assuming 24fps, can be adjusted)
    const fps = 24;
    const timestamp = frameNumber / fps;

    const args = [
      '-ss', timestamp.toFixed(4),
      '-i', videoPath,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', outputFormat === 'png' ? 'png' : 'mjpeg',
      '-'
    ];

    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const chunks: Buffer[] = [];
    let stderr = '';

    ffmpeg.stdout?.on('data', (data) => {
      chunks.push(data);
    });

    ffmpeg.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('error', (error) => {
      resolve({
        success: false,
        error: `ffmpeg spawn error: ${error.message}`,
        frameNumber
      });
    });

    ffmpeg.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        const imageBuffer = Buffer.concat(chunks);
        const mimeType = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
        const base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
        
        resolve({
          success: true,
          base64Image,
          frameNumber
        });
      } else {
        const errorMatch = stderr.match(/Error.*$/m);
        const errorMsg = errorMatch ? errorMatch[0] : stderr.slice(-200);
        
        resolve({
          success: false,
          error: `ffmpeg frame extraction failed with code ${code}: ${errorMsg}`,
          frameNumber
        });
      }
    });
  });
}

/**
 * Extract first frame from a video (useful for validation or preview)
 * 
 * @param videoPath - Path to video file
 * @param outputFormat - Image format ('png' or 'jpg', default: 'png')
 * @returns Promise<ExtractFrameResult> - Result with base64 image data
 */
export async function extractFirstFrame(
  videoPath: string,
  outputFormat: 'png' | 'jpg' = 'png'
): Promise<ExtractFrameResult> {
  return extractFrame(videoPath, 0, outputFormat);
}
