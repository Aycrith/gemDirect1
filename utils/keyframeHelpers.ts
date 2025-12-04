/**
 * Keyframe Data Helpers
 * 
 * Utilities for safely handling the KeyframeData union type:
 * `string | { start: string; end: string } | KeyframeVersionedData`
 * 
 * These helpers ensure consistent handling at service boundaries
 * where only one variant is expected.
 * 
 * @module utils/keyframeHelpers
 */

import { KeyframeData, isBookendKeyframe, isSingleKeyframe, isVersionedKeyframe } from '../types';
import { createLogger } from './logger';

const logger = createLogger('Keyframe');

/**
 * Re-export the type guards from types.ts for convenience.
 */
export { isBookendKeyframe, isSingleKeyframe, isVersionedKeyframe, getActiveKeyframeImage } from '../types';

/**
 * Ensure keyframe data is a single string.
 * If bookend format is provided, extracts the start frame with a warning.
 * If versioned format is provided, extracts the current frame.
 * 
 * @param data - KeyframeData (string, bookend object, or versioned object)
 * @param context - Optional context for logging (e.g., "Scene 1")
 * @returns Single keyframe string
 * 
 * @example
 * ```typescript
 * // Single keyframe passes through
 * ensureSingleKeyframe("base64data") // → "base64data"
 * 
 * // Bookend extracts start with warning
 * ensureSingleKeyframe({ start: "frame1", end: "frame2" }) // → "frame1"
 * 
 * // Versioned extracts current
 * ensureSingleKeyframe({ current: "base64", versions: [...] }) // → "base64"
 * ```
 */
export function ensureSingleKeyframe(data: KeyframeData, context?: string): string {
    if (isSingleKeyframe(data)) {
        return data;
    }

    if (isVersionedKeyframe(data)) {
        return data.current;
    }

    // Bookend format - extract start frame
    if (isBookendKeyframe(data)) {
        const prefix = context ? `[${context}] ` : '';
        logger.warn(`${prefix}Expected single keyframe, got bookend format. Using start frame.`);
        return data.start;
    }

    // Should never reach here, but TypeScript needs this
    return '';
}

/**
 * Ensure keyframe data is in bookend format.
 * If single string is provided, creates bookend with same image for start/end.
 * If versioned format is provided, uses current image for both.
 * 
 * @param data - KeyframeData (string, bookend object, or versioned object)
 * @param context - Optional context for logging
 * @returns Bookend keyframe object
 */
export function ensureBookendKeyframe(
    data: KeyframeData, 
    context?: string
): { start: string; end: string } {
    if (isBookendKeyframe(data)) {
        return data;
    }

    const prefix = context ? `[${context}] ` : '';
    
    if (isSingleKeyframe(data)) {
        logger.info(`${prefix}Converting single keyframe to bookend format (duplicating for start/end).`);
        return { start: data, end: data };
    }

    if (isVersionedKeyframe(data)) {
        logger.info(`${prefix}Converting versioned keyframe to bookend format (using current for start/end).`);
        return { start: data.current, end: data.current };
    }

    // Should never reach here
    return { start: '', end: '' };
}

/**
 * Safely extract the start keyframe from any format.
 * Never throws - returns empty string if data is invalid.
 * 
 * @param data - KeyframeData or undefined
 * @returns Start keyframe string or empty string
 */
export function getStartKeyframe(data: KeyframeData | undefined): string {
    if (!data) return '';
    if (isSingleKeyframe(data)) return data;
    if (isBookendKeyframe(data)) return data.start;
    if (isVersionedKeyframe(data)) return data.current;
    return '';
}

/**
 * Safely extract the end keyframe from any format.
 * For single format, returns the same frame (no end distinction).
 * For versioned format, returns the current frame.
 * 
 * @param data - KeyframeData or undefined
 * @returns End keyframe string or empty string
 */
export function getEndKeyframe(data: KeyframeData | undefined): string {
    if (!data) return '';
    if (isSingleKeyframe(data)) return data; // Single frame is both start and end
    if (isBookendKeyframe(data)) return data.end;
    if (isVersionedKeyframe(data)) return data.current; // Versioned doesn't have end distinction
    return '';
}

/**
 * Validate that a keyframe string is non-empty and looks like valid base64.
 * Does NOT fully decode - just checks format.
 * 
 * @param keyframe - String to validate
 * @returns True if appears to be valid base64 image data
 */
export function isValidKeyframeData(keyframe: string | undefined): boolean {
    if (!keyframe || keyframe.trim() === '') {
        return false;
    }

    // Check for data URL prefix
    if (keyframe.startsWith('data:image/')) {
        return true;
    }

    // Check for raw base64 (basic check - at least 100 chars, valid charset)
    if (keyframe.length >= 100) {
        // Base64 charset: A-Z, a-z, 0-9, +, /, =
        const base64Regex = /^[A-Za-z0-9+/=]+$/;
        return base64Regex.test(keyframe);
    }

    return false;
}

/**
 * Strip data URL prefix from base64 image data if present.
 * ComfyUI expects raw base64, not data URLs.
 * 
 * @param data - Base64 string, possibly with data URL prefix
 * @returns Raw base64 string without prefix
 */
export function stripDataUrlPrefix(data: string): string {
    if (data.startsWith('data:image/')) {
        const commaIndex = data.indexOf(',');
        if (commaIndex !== -1) {
            return data.substring(commaIndex + 1);
        }
    }
    return data;
}

/**
 * Add data URL prefix to raw base64 if not present.
 * Useful for displaying images in <img> tags.
 * 
 * @param data - Raw base64 string
 * @param mimeType - Image MIME type (default: 'image/png')
 * @returns Data URL string
 */
export function ensureDataUrlPrefix(data: string, mimeType = 'image/png'): string {
    if (data.startsWith('data:')) {
        return data;
    }
    return `data:${mimeType};base64,${data}`;
}

/**
 * Normalize keyframe for ComfyUI consumption.
 * - Ensures single format
 * - Strips data URL prefix
 * - Validates non-empty
 * 
 * @param data - KeyframeData or undefined
 * @param context - Optional context for logging
 * @returns Normalized base64 string or null if invalid
 */
export function normalizeForComfyUI(
    data: KeyframeData | undefined,
    context?: string
): string | null {
    if (!data) {
        const prefix = context ? `[${context}] ` : '';
        logger.warn(`${prefix}No keyframe data provided`);
        return null;
    }

    const single = ensureSingleKeyframe(data, context);
    const stripped = stripDataUrlPrefix(single);

    if (!isValidKeyframeData(stripped)) {
        const prefix = context ? `[${context}] ` : '';
        logger.warn(`${prefix}Invalid keyframe data after normalization`);
        return null;
    }

    return stripped;
}
