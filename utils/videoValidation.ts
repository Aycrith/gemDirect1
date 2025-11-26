/**
 * Video Validation Utilities
 * 
 * Shared utilities for validating and extracting video data across React components.
 * Ensures consistent handling of video data URLs from local generation and artifact metadata.
 */

import type { LocalGenerationStatus, LocalGenerationOutput } from '../types';

/**
 * Validates that a string is a valid media data URL (video or image).
 * @param data - The string to validate
 * @returns true if the string is a valid data URL for video or image content
 */
export const isValidMediaDataUrl = (data: string | undefined | null): boolean => {
    if (!data || typeof data !== 'string') return false;
    return data.startsWith('data:video/') || data.startsWith('data:image/');
};

/**
 * Validates that a string is specifically a valid video data URL.
 * @param data - The string to validate
 * @returns true if the string is a valid data URL for video content
 */
export const isValidVideoDataUrl = (data: string | undefined | null): boolean => {
    if (!data || typeof data !== 'string') return false;
    return data.startsWith('data:video/');
};

/**
 * Validates that a string is specifically a valid image data URL.
 * @param data - The string to validate
 * @returns true if the string is a valid data URL for image content
 */
export const isValidImageDataUrl = (data: string | undefined | null): boolean => {
    if (!data || typeof data !== 'string') return false;
    return data.startsWith('data:image/');
};

/**
 * Extracts video output from LocalGenerationStatus if available and valid.
 * @param status - The local generation status object
 * @returns The LocalGenerationOutput if it contains valid video data, otherwise undefined
 */
export const extractVideoFromLocalStatus = (
    status: LocalGenerationStatus | undefined | null
): LocalGenerationOutput | undefined => {
    if (!status) return undefined;
    if (status.status !== 'complete') return undefined;
    if (!status.final_output) return undefined;
    if (status.final_output.type !== 'video') return undefined;
    if (!isValidVideoDataUrl(status.final_output.data)) return undefined;
    
    return status.final_output;
};

/**
 * Extracts image output from LocalGenerationStatus if available and valid.
 * @param status - The local generation status object
 * @returns The LocalGenerationOutput if it contains valid image data, otherwise undefined
 */
export const extractImageFromLocalStatus = (
    status: LocalGenerationStatus | undefined | null
): LocalGenerationOutput | undefined => {
    if (!status) return undefined;
    if (status.status !== 'complete') return undefined;
    if (!status.final_output) return undefined;
    if (status.final_output.type !== 'image') return undefined;
    if (!isValidImageDataUrl(status.final_output.data)) return undefined;
    
    return status.final_output;
};

/**
 * Result of getVideoSourceWithFallback
 */
export interface VideoSourceResult {
    /** The video source URL (data URL or file path) */
    source: string;
    /** The source type: 'local' for browser-generated, 'artifact' for E2E pipeline */
    sourceType: 'local' | 'artifact';
    /** Optional filename */
    filename?: string;
    /** Whether the source is a data URL (can be used directly in video src) */
    isDataUrl: boolean;
}

/**
 * Artifact video metadata structure (from E2E pipeline)
 */
export interface ArtifactVideoMetadata {
    Path?: string;
    Status?: string;
    DurationSeconds?: number;
    UpdatedAt?: string;
    Error?: string;
}

/**
 * Gets video source with fallback priority: local generation first, then artifact metadata.
 * @param localStatus - The local generation status for a scene
 * @param artifactVideo - The artifact video metadata (from E2E pipeline)
 * @returns VideoSourceResult if video is available, otherwise undefined
 */
export const getVideoSourceWithFallback = (
    localStatus: LocalGenerationStatus | undefined | null,
    artifactVideo: ArtifactVideoMetadata | undefined | null
): VideoSourceResult | undefined => {
    // Priority 1: Local generation (most recent, browser-generated)
    const localVideo = extractVideoFromLocalStatus(localStatus);
    if (localVideo) {
        return {
            source: localVideo.data,
            sourceType: 'local',
            filename: localVideo.filename,
            isDataUrl: true
        };
    }
    
    // Priority 2: Artifact metadata (E2E pipeline)
    if (artifactVideo?.Path && artifactVideo.Status !== 'error') {
        return {
            source: artifactVideo.Path,
            sourceType: 'artifact',
            filename: artifactVideo.Path.split('/').pop() || artifactVideo.Path.split('\\').pop(),
            isDataUrl: false
        };
    }
    
    return undefined;
};

/**
 * Checks if a scene has any video available (local or artifact).
 * @param localStatus - The local generation status for a scene
 * @param artifactVideo - The artifact video metadata
 * @returns true if any video source is available
 */
export const hasVideoAvailable = (
    localStatus: LocalGenerationStatus | undefined | null,
    artifactVideo: ArtifactVideoMetadata | undefined | null
): boolean => {
    return getVideoSourceWithFallback(localStatus, artifactVideo) !== undefined;
};
