/**
 * Tests for browser-safe video validation utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getBrowserVideoMetadata,
    validateBrowserVideo,
    isBrowserVideoValid,
    validateBrowserVideoBatch,
    generateBrowserValidationSummary,
    BROWSER_DEFAULT_THRESHOLDS,
    type BrowserValidationResult,
} from '../browserVideoValidation';

// Mock HTMLVideoElement
const createMockVideoElement = (overrides: Partial<HTMLVideoElement> = {}) => {
    const listeners: Record<string, Function[]> = {};
    
    return {
        duration: 5,
        videoWidth: 1280,
        videoHeight: 720,
        readyState: 4,
        error: null,
        preload: '',
        src: '',
        addEventListener: vi.fn((event: string, callback: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(callback);
        }),
        removeEventListener: vi.fn(),
        load: vi.fn(),
        // Helper to trigger events in tests
        _trigger: (event: string) => {
            listeners[event]?.forEach(cb => cb());
        },
        ...overrides,
    };
};

describe('browserVideoValidation', () => {
    let mockVideo: ReturnType<typeof createMockVideoElement>;
    let originalCreateElement: typeof document.createElement;
    
    beforeEach(() => {
        vi.useFakeTimers();
        mockVideo = createMockVideoElement();
        originalCreateElement = document.createElement;
        document.createElement = vi.fn((tag: string) => {
            if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
            return originalCreateElement.call(document, tag);
        });
    });
    
    afterEach(() => {
        vi.useRealTimers();
        document.createElement = originalCreateElement;
    });

    describe('getBrowserVideoMetadata', () => {
        it('should return metadata for valid video', async () => {
            const metadataPromise = getBrowserVideoMetadata('http://test.com/video.mp4');
            
            // Simulate loadedmetadata event
            mockVideo._trigger('loadedmetadata');
            
            const metadata = await metadataPromise;
            
            expect(metadata.duration).toBe(5);
            expect(metadata.width).toBe(1280);
            expect(metadata.height).toBe(720);
            expect(metadata.canPlay).toBe(true);
            expect(metadata.error).toBeNull();
        });

        it('should return error for failed video load', async () => {
            mockVideo = createMockVideoElement({
                error: { code: 4 } as MediaError,
                readyState: 0,
            });
            document.createElement = vi.fn(() => mockVideo as unknown as HTMLVideoElement);
            
            const metadataPromise = getBrowserVideoMetadata('http://test.com/invalid.mp4');
            
            // Simulate error event
            mockVideo._trigger('error');
            
            const metadata = await metadataPromise;
            
            expect(metadata.canPlay).toBe(false);
            expect(metadata.error).toBe('Video format not supported');
        });

        it('should handle timeout', async () => {
            const metadataPromise = getBrowserVideoMetadata('http://test.com/slow.mp4', 100);
            
            // Advance past timeout without triggering events
            await vi.advanceTimersByTimeAsync(150);
            
            const metadata = await metadataPromise;
            
            expect(metadata.canPlay).toBe(false);
            expect(metadata.error).toContain('Timeout');
        });
    });

    describe('validateBrowserVideo', () => {
        it('should pass validation for valid video', async () => {
            const validationPromise = validateBrowserVideo('http://test.com/video.mp4');
            mockVideo._trigger('loadedmetadata');
            
            const result = await validationPromise;
            
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.metadata?.duration).toBe(5);
        });

        it('should fail validation for empty URL', async () => {
            const result = await validateBrowserVideo('');
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('No video URL provided');
        });

        it('should fail validation for video that is too short', async () => {
            mockVideo = createMockVideoElement({ duration: 0.1 });
            document.createElement = vi.fn(() => mockVideo as unknown as HTMLVideoElement);
            
            const validationPromise = validateBrowserVideo('http://test.com/short.mp4', {
                ...BROWSER_DEFAULT_THRESHOLDS,
                minDuration: 0.5,
            });
            mockVideo._trigger('loadedmetadata');
            
            const result = await validationPromise;
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('too short'))).toBe(true);
        });

        it('should warn for video that is too long', async () => {
            mockVideo = createMockVideoElement({ duration: 60 });
            document.createElement = vi.fn(() => mockVideo as unknown as HTMLVideoElement);
            
            const validationPromise = validateBrowserVideo('http://test.com/long.mp4', {
                ...BROWSER_DEFAULT_THRESHOLDS,
                maxDuration: 30,
            });
            mockVideo._trigger('loadedmetadata');
            
            const result = await validationPromise;
            
            expect(result.valid).toBe(true); // Warnings don't fail validation
            expect(result.warnings.some(w => w.includes('longer than expected'))).toBe(true);
        });

        it('should fail validation for low resolution video', async () => {
            mockVideo = createMockVideoElement({ 
                videoWidth: 200, 
                videoHeight: 100 
            });
            document.createElement = vi.fn(() => mockVideo as unknown as HTMLVideoElement);
            
            const validationPromise = validateBrowserVideo('http://test.com/lowres.mp4', {
                ...BROWSER_DEFAULT_THRESHOLDS,
                minWidth: 320,
                minHeight: 180,
            });
            mockVideo._trigger('loadedmetadata');
            
            const result = await validationPromise;
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Resolution too low'))).toBe(true);
        });

        it('should fail validation for unplayable video', async () => {
            mockVideo = createMockVideoElement({
                readyState: 0,
                error: { code: 3 } as MediaError,
            });
            document.createElement = vi.fn(() => mockVideo as unknown as HTMLVideoElement);
            
            const validationPromise = validateBrowserVideo('http://test.com/corrupt.mp4');
            mockVideo._trigger('error');
            
            const result = await validationPromise;
            
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('decoding failed'))).toBe(true);
        });
    });

    describe('isBrowserVideoValid', () => {
        it('should return true for valid video', async () => {
            const validPromise = isBrowserVideoValid('http://test.com/video.mp4');
            mockVideo._trigger('loadedmetadata');
            
            const isValid = await validPromise;
            
            expect(isValid).toBe(true);
        });

        it('should return false for invalid video', async () => {
            const isValid = await isBrowserVideoValid('');
            
            expect(isValid).toBe(false);
        });
    });

    describe('validateBrowserVideoBatch', () => {
        it('should validate multiple videos in parallel', async () => {
            // Create fresh mocks for each call
            let callCount = 0;
            const mockVideos = [
                createMockVideoElement({ duration: 5 }),
                createMockVideoElement({ duration: 10 }),
            ];
            
            document.createElement = vi.fn(() => {
                const mock = mockVideos[callCount % mockVideos.length];
                callCount++;
                return mock as unknown as HTMLVideoElement;
            });
            
            const batchPromise = validateBrowserVideoBatch([
                'http://test.com/video1.mp4',
                'http://test.com/video2.mp4',
            ]);
            
            // Trigger all loadedmetadata events
            mockVideos.forEach(v => v._trigger('loadedmetadata'));
            
            const results = await batchPromise;
            
            expect(results).toHaveLength(2);
            expect(results.every(r => r.valid)).toBe(true);
        });
    });

    describe('generateBrowserValidationSummary', () => {
        it('should generate correct summary for mixed results', () => {
            const results: BrowserValidationResult[] = [
                {
                    valid: true,
                    metadata: { duration: 5, width: 1280, height: 720, canPlay: true, readyState: 4, error: null },
                    errors: [],
                    warnings: [],
                    validatedAt: Date.now(),
                },
                {
                    valid: false,
                    metadata: { duration: 0.1, width: 640, height: 360, canPlay: true, readyState: 4, error: null },
                    errors: ['Video too short'],
                    warnings: [],
                    validatedAt: Date.now(),
                },
                {
                    valid: true,
                    metadata: { duration: 10, width: 1920, height: 1080, canPlay: true, readyState: 4, error: null },
                    errors: [],
                    warnings: ['Video longer than expected'],
                    validatedAt: Date.now(),
                },
            ];
            
            const summary = generateBrowserValidationSummary(results);
            
            expect(summary.total).toBe(3);
            expect(summary.passed).toBe(2);
            expect(summary.failed).toBe(1);
            expect(summary.passRate).toBeCloseTo(66.67, 1);
            expect(summary.avgDuration).toBeCloseTo(5.03, 1); // (5 + 0.1 + 10) / 3
            expect(summary.errors).toContain('Video too short');
            expect(summary.warnings).toContain('Video longer than expected');
        });

        it('should handle empty results', () => {
            const summary = generateBrowserValidationSummary([]);
            
            expect(summary.total).toBe(0);
            expect(summary.passed).toBe(0);
            expect(summary.passRate).toBe(0);
            expect(summary.avgDuration).toBe(0);
        });
    });

    describe('BROWSER_DEFAULT_THRESHOLDS', () => {
        it('should have sensible defaults', () => {
            expect(BROWSER_DEFAULT_THRESHOLDS.minDuration).toBeGreaterThan(0);
            expect(BROWSER_DEFAULT_THRESHOLDS.maxDuration).toBeGreaterThan(BROWSER_DEFAULT_THRESHOLDS.minDuration);
            expect(BROWSER_DEFAULT_THRESHOLDS.minWidth).toBeGreaterThan(0);
            expect(BROWSER_DEFAULT_THRESHOLDS.minHeight).toBeGreaterThan(0);
            expect(BROWSER_DEFAULT_THRESHOLDS.loadTimeoutMs).toBeGreaterThan(1000);
        });
    });
});
