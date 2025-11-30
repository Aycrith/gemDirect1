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
