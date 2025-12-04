/**
 * Browser-Safe Video Validation Utilities
 * 
 * Uses HTML5 Video API to validate basic video properties in the browser.
 * For comprehensive validation (codec, bitrate, frame count), use
 * services/videoValidationService.ts with FFprobe (Node.js only).
 * 
 * @module utils/browserVideoValidation
 */

export interface BrowserVideoMetadata {
    duration: number;        // Duration in seconds
    width: number;           // Video width in pixels
    height: number;          // Video height in pixels
    canPlay: boolean;        // Whether browser can play the video
    readyState: number;      // Video element ready state (0-4)
    error: string | null;    // Error message if video failed to load
}

export interface BrowserValidationResult {
    valid: boolean;
    metadata: BrowserVideoMetadata | null;
    errors: string[];
    warnings: string[];
    validatedAt: number;
}

export interface BrowserValidationThresholds {
    minDuration: number;     // Minimum duration in seconds
    maxDuration: number;     // Maximum duration in seconds
    minWidth: number;        // Minimum width in pixels
    minHeight: number;       // Minimum height in pixels
    loadTimeoutMs: number;   // Timeout for video metadata to load
}

/**
 * Default validation thresholds for browser-side validation
 */
export const BROWSER_DEFAULT_THRESHOLDS: BrowserValidationThresholds = {
    minDuration: 0.5,        // At least half a second
    maxDuration: 30,         // No more than 30 seconds (pipeline limit)
    minWidth: 320,           // Lower threshold for browser (may be transcoded)
    minHeight: 180,          // Lower threshold for browser
    loadTimeoutMs: 10000,    // 10 second timeout for metadata
};

/**
 * Extract video metadata using HTML5 Video API
 * 
 * @param videoUrl - URL to video (blob URL, data URL, or HTTP URL)
 * @param timeoutMs - Timeout for metadata loading (default: 10s)
 * @returns Video metadata or null if extraction failed
 */
export async function getBrowserVideoMetadata(
    videoUrl: string,
    timeoutMs: number = 10000
): Promise<BrowserVideoMetadata> {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        let timeoutId: number;
        let resolved = false;

        const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            video.removeEventListener('loadedmetadata', onLoaded);
            video.removeEventListener('error', onError);
            video.src = '';
            video.load();
        };

        const onLoaded = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve({
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
                canPlay: video.readyState >= 2, // HAVE_CURRENT_DATA
                readyState: video.readyState,
                error: null,
            });
        };

        const onError = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            const errorCode = video.error?.code || 0;
            const errorMessages: Record<number, string> = {
                1: 'Video loading aborted',
                2: 'Network error loading video',
                3: 'Video decoding failed',
                4: 'Video format not supported',
            };
            resolve({
                duration: 0,
                width: 0,
                height: 0,
                canPlay: false,
                readyState: video.readyState,
                error: errorMessages[errorCode] || `Unknown error (code ${errorCode})`,
            });
        };

        timeoutId = window.setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve({
                duration: 0,
                width: 0,
                height: 0,
                canPlay: false,
                readyState: video.readyState,
                error: `Timeout loading video metadata after ${timeoutMs}ms`,
            });
        }, timeoutMs);

        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('error', onError);
        video.preload = 'metadata';
        video.src = videoUrl;
    });
}

/**
 * Validate a video using browser APIs
 * 
 * @param videoUrl - URL to video (blob URL, data URL, or HTTP URL)
 * @param thresholds - Validation thresholds
 * @returns Validation result with metadata and any errors/warnings
 */
export async function validateBrowserVideo(
    videoUrl: string,
    thresholds: BrowserValidationThresholds = BROWSER_DEFAULT_THRESHOLDS
): Promise<BrowserValidationResult> {
    const result: BrowserValidationResult = {
        valid: true,
        metadata: null,
        errors: [],
        warnings: [],
        validatedAt: Date.now(),
    };

    // Check URL is provided
    if (!videoUrl) {
        result.valid = false;
        result.errors.push('No video URL provided');
        return result;
    }

    // Get metadata
    const metadata = await getBrowserVideoMetadata(videoUrl, thresholds.loadTimeoutMs);
    result.metadata = metadata;

    // Check for errors during loading
    if (metadata.error) {
        result.valid = false;
        result.errors.push(metadata.error);
        return result;
    }

    // Check playability
    if (!metadata.canPlay) {
        result.valid = false;
        result.errors.push('Video cannot be played by browser');
        return result;
    }

    // Validate duration
    if (!isFinite(metadata.duration) || metadata.duration <= 0) {
        result.valid = false;
        result.errors.push('Invalid video duration');
    } else if (metadata.duration < thresholds.minDuration) {
        result.valid = false;
        result.errors.push(
            `Video too short: ${metadata.duration.toFixed(2)}s (minimum: ${thresholds.minDuration}s)`
        );
    } else if (metadata.duration > thresholds.maxDuration) {
        result.warnings.push(
            `Video longer than expected: ${metadata.duration.toFixed(2)}s (maximum: ${thresholds.maxDuration}s)`
        );
    }

    // Validate resolution
    if (metadata.width <= 0 || metadata.height <= 0) {
        result.valid = false;
        result.errors.push('Invalid video resolution');
    } else if (metadata.width < thresholds.minWidth || metadata.height < thresholds.minHeight) {
        result.valid = false;
        result.errors.push(
            `Resolution too low: ${metadata.width}x${metadata.height} (minimum: ${thresholds.minWidth}x${thresholds.minHeight})`
        );
    }

    return result;
}

/**
 * Quick validation - returns true/false only
 * 
 * @param videoUrl - URL to video
 * @param thresholds - Optional custom thresholds
 * @returns true if video passes all validation checks
 */
export async function isBrowserVideoValid(
    videoUrl: string,
    thresholds?: BrowserValidationThresholds
): Promise<boolean> {
    const result = await validateBrowserVideo(videoUrl, thresholds);
    return result.valid;
}

/**
 * Validate multiple videos in parallel
 * 
 * @param videoUrls - Array of video URLs
 * @param thresholds - Validation thresholds
 * @returns Array of validation results
 */
export async function validateBrowserVideoBatch(
    videoUrls: string[],
    thresholds?: BrowserValidationThresholds
): Promise<BrowserValidationResult[]> {
    const validationPromises = videoUrls.map(url => validateBrowserVideo(url, thresholds));
    return Promise.all(validationPromises);
}

/**
 * Generate a summary of batch validation results
 * 
 * @param results - Array of validation results
 * @returns Summary object with counts and details
 */
export function generateBrowserValidationSummary(
    results: BrowserValidationResult[]
): {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgDuration: number;
    errors: string[];
    warnings: string[];
} {
    const passed = results.filter(r => r.valid).length;
    const durations = results
        .filter(r => r.metadata && r.metadata.duration > 0)
        .map(r => r.metadata!.duration);
    const avgDuration = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    return {
        total: results.length,
        passed,
        failed: results.length - passed,
        passRate: results.length > 0 ? (passed / results.length) * 100 : 0,
        avgDuration,
        errors: results.flatMap(r => r.errors),
        warnings: results.flatMap(r => r.warnings),
    };
}
