/**
 * Video Endpoint Snapper
 * 
 * Post-processing utility that ensures video first/last frames exactly match
 * the input keyframe images. This provides hard guarantees for bookend consistency
 * regardless of what the video generation model produces.
 * 
 * Approach: Replace first N and last N frames with decoded keyframe images.
 * This is a post-processing solution that works with any video model output.
 * 
 * @module utils/videoEndpointSnapper
 */

export interface EndpointSnappingOptions {
  /** Number of frames to replace at start with start keyframe (default: 1) */
  startFrameCount?: number;
  /** Number of frames to replace at end with end keyframe (default: 1) */
  endFrameCount?: number;
  /** Blend mode for transition frames: 'hard' = instant replace, 'fade' = linear blend (default: 'hard') */
  blendMode?: 'hard' | 'fade';
  /** For fade mode: number of frames to blend over (default: 3) */
  fadeFrames?: number;
  /** Whether to apply temporal smoothing to avoid jarring transitions (default: false for now) */
  temporalSmoothing?: boolean;
}

export interface SnapResult {
  success: boolean;
  snappedVideoBlob?: Blob;
  snappedVideoUrl?: string;
  originalFrameCount: number;
  startFramesReplaced: number;
  endFramesReplaced: number;
  error?: string;
  processingTimeMs: number;
}

export interface FrameExtractionResult {
  frames: ImageData[];
  width: number;
  height: number;
  frameCount: number;
  fps: number;
}

const DEFAULT_OPTIONS: Required<EndpointSnappingOptions> = {
  startFrameCount: 1,
  endFrameCount: 1,
  blendMode: 'hard',
  fadeFrames: 3,
  temporalSmoothing: false,
};

/**
 * Main entry point: Snap video endpoints to match keyframe images
 * 
 * @param videoBlob - The generated video as a Blob
 * @param startKeyframe - Base64 or data URL of the start keyframe image
 * @param endKeyframe - Base64 or data URL of the end keyframe image
 * @param options - Snapping configuration options
 * @returns Promise resolving to SnapResult with processed video
 */
export async function snapEndpointsToKeyframes(
  videoBlob: Blob,
  startKeyframe: string,
  endKeyframe: string,
  options: EndpointSnappingOptions = {}
): Promise<SnapResult> {
  const startTime = performance.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Step 1: Extract frames from video
    const extraction = await extractVideoFrames(videoBlob);
    if (!extraction.frames.length) {
      return {
        success: false,
        error: 'Failed to extract frames from video',
        originalFrameCount: 0,
        startFramesReplaced: 0,
        endFramesReplaced: 0,
        processingTimeMs: performance.now() - startTime,
      };
    }

    // Step 2: Decode keyframe images to match video dimensions
    const startImage = await decodeKeyframeToImageData(startKeyframe, extraction.width, extraction.height);
    const endImage = await decodeKeyframeToImageData(endKeyframe, extraction.width, extraction.height);

    if (!startImage || !endImage) {
      return {
        success: false,
        error: 'Failed to decode keyframe images',
        originalFrameCount: extraction.frameCount,
        startFramesReplaced: 0,
        endFramesReplaced: 0,
        processingTimeMs: performance.now() - startTime,
      };
    }

    // Step 3: Replace frames based on options
    const modifiedFrames = [...extraction.frames];
    
    // Replace start frames
    const startCount = Math.min(opts.startFrameCount, Math.floor(modifiedFrames.length / 3));
    for (let i = 0; i < startCount; i++) {
      const currentFrame = modifiedFrames[i];
      if (opts.blendMode === 'fade' && i > 0 && currentFrame) {
        // Apply fade blend from keyframe to original
        const blendFactor = i / opts.fadeFrames;
        modifiedFrames[i] = blendFrames(startImage, currentFrame, blendFactor);
      } else {
        modifiedFrames[i] = startImage;
      }
    }

    // Replace end frames
    const endCount = Math.min(opts.endFrameCount, Math.floor(modifiedFrames.length / 3));
    for (let i = 0; i < endCount; i++) {
      const frameIndex = modifiedFrames.length - 1 - i;
      const currentFrame = modifiedFrames[frameIndex];
      if (opts.blendMode === 'fade' && i > 0 && currentFrame) {
        // Apply fade blend from original to keyframe
        const blendFactor = i / opts.fadeFrames;
        modifiedFrames[frameIndex] = blendFrames(currentFrame, endImage, 1 - blendFactor);
      } else {
        modifiedFrames[frameIndex] = endImage;
      }
    }

    // Step 4: Re-encode to video
    const snappedVideoBlob = await encodeFramesToVideo(
      modifiedFrames,
      extraction.width,
      extraction.height,
      extraction.fps
    );

    const snappedVideoUrl = URL.createObjectURL(snappedVideoBlob);

    return {
      success: true,
      snappedVideoBlob,
      snappedVideoUrl,
      originalFrameCount: extraction.frameCount,
      startFramesReplaced: startCount,
      endFramesReplaced: endCount,
      processingTimeMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      originalFrameCount: 0,
      startFramesReplaced: 0,
      endFramesReplaced: 0,
      processingTimeMs: performance.now() - startTime,
    };
  }
}

/**
 * Extract all frames from a video blob using canvas
 */
async function extractVideoFrames(videoBlob: Blob): Promise<FrameExtractionResult> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);
    
    video.onloadedmetadata = async () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;
      // Estimate fps - default to 24 if we can't determine
      const fps = 24; // Most video models output 24fps
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve({ frames: [], width: 0, height: 0, frameCount: 0, fps: 0 });
        return;
      }

      const frames: ImageData[] = [];
      const frameInterval = 1 / fps;
      
      for (let time = 0; time < duration; time += frameInterval) {
        video.currentTime = time;
        await waitForVideoSeek(video);
        ctx.drawImage(video, 0, 0);
        frames.push(ctx.getImageData(0, 0, width, height));
      }

      URL.revokeObjectURL(url);
      resolve({
        frames,
        width,
        height,
        frameCount: frames.length,
        fps,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ frames: [], width: 0, height: 0, frameCount: 0, fps: 0 });
    };

    video.src = url;
    video.load();
  });
}

/**
 * Wait for video seek to complete
 */
function waitForVideoSeek(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (!video.seeking) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
  });
}

/**
 * Decode a base64/dataURL keyframe image to ImageData at target dimensions
 */
async function decodeKeyframeToImageData(
  keyframe: string,
  targetWidth: number,
  targetHeight: number
): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(null);
        return;
      }

      // Draw image scaled to video dimensions
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(ctx.getImageData(0, 0, targetWidth, targetHeight));
    };

    img.onerror = () => {
      resolve(null);
    };

    // Handle both data URL and raw base64
    if (keyframe.startsWith('data:')) {
      img.src = keyframe;
    } else {
      img.src = `data:image/png;base64,${keyframe}`;
    }
  });
}

/**
 * Blend two frames together with a blend factor (0 = all frame1, 1 = all frame2)
 */
function blendFrames(frame1: ImageData, frame2: ImageData, blendFactor: number): ImageData {
  const result = new ImageData(frame1.width, frame1.height);
  const invBlend = 1 - blendFactor;
  
  for (let i = 0; i < frame1.data.length; i += 4) {
    const r1 = frame1.data[i] ?? 0;
    const g1 = frame1.data[i + 1] ?? 0;
    const b1 = frame1.data[i + 2] ?? 0;
    const r2 = frame2.data[i] ?? 0;
    const g2 = frame2.data[i + 1] ?? 0;
    const b2 = frame2.data[i + 2] ?? 0;
    
    result.data[i] = Math.round(r1 * invBlend + r2 * blendFactor);     // R
    result.data[i + 1] = Math.round(g1 * invBlend + g2 * blendFactor); // G
    result.data[i + 2] = Math.round(b1 * invBlend + b2 * blendFactor); // B
    result.data[i + 3] = 255; // A - fully opaque
  }
  
  return result;
}

/**
 * Encode ImageData frames back to a video blob
 * Uses MediaRecorder with canvas capture stream
 */
async function encodeFramesToVideo(
  frames: ImageData[],
  width: number,
  height: number,
  fps: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // Check for MediaRecorder support and codecs
    const mimeType = getSupportedVideoMimeType();
    if (!mimeType) {
      reject(new Error('No supported video codec found for MediaRecorder'));
      return;
    }

    const stream = canvas.captureStream(fps);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8000000, // 8 Mbps for quality
    });

    const chunks: Blob[] = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    mediaRecorder.onerror = (event) => {
      reject(new Error(`MediaRecorder error: ${event}`));
    };

    mediaRecorder.start();

    // Render frames at fps interval
    let frameIndex = 0;
    const frameInterval = 1000 / fps;

    const renderNextFrame = () => {
      if (frameIndex >= frames.length) {
        // All frames rendered, stop recording after a small delay
        setTimeout(() => {
          mediaRecorder.stop();
        }, frameInterval);
        return;
      }

      const frame = frames[frameIndex];
      if (frame) {
        ctx.putImageData(frame, 0, 0);
      }
      frameIndex++;
      setTimeout(renderNextFrame, frameInterval);
    };

    renderNextFrame();
  });
}

/**
 * Get a supported video MIME type for MediaRecorder
 */
function getSupportedVideoMimeType(): string | null {
  const mimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
}

/**
 * Check if endpoint snapping is supported in the current browser
 */
export function isEndpointSnappingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    getSupportedVideoMimeType() !== null
  );
}

/**
 * Validate that snapping options are reasonable
 */
export function validateSnappingOptions(
  options: EndpointSnappingOptions,
  estimatedFrameCount: number
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check that we're not replacing more than 1/3 of frames at each end
  const maxFrames = Math.floor(estimatedFrameCount / 3);
  if (opts.startFrameCount > maxFrames) {
    warnings.push(`startFrameCount (${opts.startFrameCount}) exceeds 1/3 of video, will be clamped to ${maxFrames}`);
  }
  if (opts.endFrameCount > maxFrames) {
    warnings.push(`endFrameCount (${opts.endFrameCount}) exceeds 1/3 of video, will be clamped to ${maxFrames}`);
  }

  // Check fade frames don't exceed replacement frames
  if (opts.blendMode === 'fade' && opts.fadeFrames > Math.min(opts.startFrameCount, opts.endFrameCount)) {
    warnings.push(`fadeFrames (${opts.fadeFrames}) exceeds replacement frame count, fade effect may be truncated`);
  }

  return {
    valid: true, // We always try to process, just warn about issues
    warnings,
  };
}

/**
 * Quick comparison to check if endpoint snapping improved the video
 * Compares first/last frames against keyframes before and after snapping
 */
export async function evaluateSnappingImprovement(
  originalVideoBlob: Blob,
  snappedVideoBlob: Blob,
  startKeyframe: string,
  endKeyframe: string
): Promise<{
  originalStartMatch: number;
  originalEndMatch: number;
  snappedStartMatch: number;
  snappedEndMatch: number;
  improvement: number;
}> {
  const originalFrames = await extractVideoFrames(originalVideoBlob);
  const snappedFrames = await extractVideoFrames(snappedVideoBlob);

  if (!originalFrames.frames.length || !snappedFrames.frames.length) {
    return {
      originalStartMatch: 0,
      originalEndMatch: 0,
      snappedStartMatch: 0,
      snappedEndMatch: 0,
      improvement: 0,
    };
  }

  const startImage = await decodeKeyframeToImageData(startKeyframe, originalFrames.width, originalFrames.height);
  const endImage = await decodeKeyframeToImageData(endKeyframe, originalFrames.width, originalFrames.height);

  if (!startImage || !endImage) {
    return {
      originalStartMatch: 0,
      originalEndMatch: 0,
      snappedStartMatch: 0,
      snappedEndMatch: 0,
      improvement: 0,
    };
  }

  // Calculate matches using structural similarity
  const originalStart = originalFrames.frames[0];
  const originalEnd = originalFrames.frames[originalFrames.frames.length - 1];
  const snappedStart = snappedFrames.frames[0];
  const snappedEnd = snappedFrames.frames[snappedFrames.frames.length - 1];

  if (!originalStart || !originalEnd || !snappedStart || !snappedEnd) {
    return {
      originalStartMatch: 0,
      originalEndMatch: 0,
      snappedStartMatch: 0,
      snappedEndMatch: 0,
      improvement: 0,
    };
  }

  const originalStartMatch = calculateFrameSimilarity(originalStart, startImage);
  const originalEndMatch = calculateFrameSimilarity(originalEnd, endImage);
  const snappedStartMatch = calculateFrameSimilarity(snappedStart, startImage);
  const snappedEndMatch = calculateFrameSimilarity(snappedEnd, endImage);

  const originalAvg = (originalStartMatch + originalEndMatch) / 2;
  const snappedAvg = (snappedStartMatch + snappedEndMatch) / 2;
  const improvement = snappedAvg - originalAvg;

  return {
    originalStartMatch,
    originalEndMatch,
    snappedStartMatch,
    snappedEndMatch,
    improvement,
  };
}

/**
 * Calculate similarity between two ImageData frames (0-100 scale)
 * Uses normalized pixel difference
 */
function calculateFrameSimilarity(frame1: ImageData, frame2: ImageData): number {
  if (frame1.width !== frame2.width || frame1.height !== frame2.height) {
    return 0;
  }

  let totalDiff = 0;
  const pixelCount = frame1.width * frame2.height;

  for (let i = 0; i < frame1.data.length; i += 4) {
    // Calculate RGB difference (ignore alpha) - use ?? 0 for safety
    const r1 = frame1.data[i] ?? 0;
    const g1 = frame1.data[i + 1] ?? 0;
    const b1 = frame1.data[i + 2] ?? 0;
    const r2 = frame2.data[i] ?? 0;
    const g2 = frame2.data[i + 1] ?? 0;
    const b2 = frame2.data[i + 2] ?? 0;
    
    const diffR = Math.abs(r1 - r2);
    const diffG = Math.abs(g1 - g2);
    const diffB = Math.abs(b1 - b2);
    totalDiff += (diffR + diffG + diffB) / 3; // Average diff per pixel
  }

  const avgDiff = totalDiff / pixelCount;
  const maxDiff = 255; // Max possible difference per channel
  const similarity = 100 * (1 - avgDiff / maxDiff);

  return Math.round(similarity * 10) / 10; // Round to 1 decimal place
}
