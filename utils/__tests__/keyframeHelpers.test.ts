/**
 * Tests for utils/keyframeHelpers.ts
 * 
 * Validates KeyframeData type handling including:
 * - Single vs Bookend format detection
 * - Format conversions
 * - Data URL handling for ComfyUI
 * - Validation of base64 image data
 */

import { describe, it, expect, vi } from 'vitest';
import {
    isSingleKeyframe,
    isBookendKeyframe,
    ensureSingleKeyframe,
    ensureBookendKeyframe,
    getStartKeyframe,
    getEndKeyframe,
    isValidKeyframeData,
    stripDataUrlPrefix,
    ensureDataUrlPrefix,
    normalizeForComfyUI
} from '../keyframeHelpers';

// Mock logger to avoid console spam in tests
vi.mock('../logger', () => ({
    createLogger: () => ({
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

describe('keyframeHelpers', () => {
    // Test fixtures
    // Valid 1x1 PNG base64 (92 chars) - too short for raw base64 validation, needs data URL prefix
    const VALID_BASE64_SHORT = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    // Valid base64 over 100 chars (for raw base64 validation without data URL prefix)
    const VALID_BASE64_LONG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==AAAAAAAAAA';
    const SINGLE_KEYFRAME = `data:image/png;base64,${VALID_BASE64_SHORT}`;
    const BOOKEND_KEYFRAME = {
        start: `data:image/png;base64,${VALID_BASE64_SHORT}`,
        end: `data:image/jpeg;base64,${VALID_BASE64_SHORT}`
    };

    describe('Type Guards', () => {
        describe('isSingleKeyframe', () => {
            it('returns true for string keyframe', () => {
                expect(isSingleKeyframe(SINGLE_KEYFRAME)).toBe(true);
            });

            it('returns false for bookend keyframe', () => {
                expect(isSingleKeyframe(BOOKEND_KEYFRAME)).toBe(false);
            });

            it('returns true for raw base64 string', () => {
                expect(isSingleKeyframe(VALID_BASE64_SHORT)).toBe(true);
            });
        });

        describe('isBookendKeyframe', () => {
            it('returns true for bookend keyframe object', () => {
                expect(isBookendKeyframe(BOOKEND_KEYFRAME)).toBe(true);
            });

            it('returns false for string keyframe', () => {
                expect(isBookendKeyframe(SINGLE_KEYFRAME)).toBe(false);
            });

            it('returns false for object missing start', () => {
                expect(isBookendKeyframe({ end: SINGLE_KEYFRAME } as any)).toBe(false);
            });

            it('returns false for object missing end', () => {
                expect(isBookendKeyframe({ start: SINGLE_KEYFRAME } as any)).toBe(false);
            });
        });
    });

    describe('Format Conversions', () => {
        describe('ensureSingleKeyframe', () => {
            it('passes through single keyframe unchanged', () => {
                expect(ensureSingleKeyframe(SINGLE_KEYFRAME)).toBe(SINGLE_KEYFRAME);
            });

            it('extracts start from bookend keyframe', () => {
                expect(ensureSingleKeyframe(BOOKEND_KEYFRAME)).toBe(BOOKEND_KEYFRAME.start);
            });

            it('handles context parameter for logging', () => {
                // Should not throw, just log warning
                const result = ensureSingleKeyframe(BOOKEND_KEYFRAME, 'Scene 1');
                expect(result).toBe(BOOKEND_KEYFRAME.start);
            });
        });

        describe('ensureBookendKeyframe', () => {
            it('passes through bookend keyframe unchanged', () => {
                const result = ensureBookendKeyframe(BOOKEND_KEYFRAME);
                expect(result).toEqual(BOOKEND_KEYFRAME);
            });

            it('converts single keyframe to bookend format (duplicates for start/end)', () => {
                const result = ensureBookendKeyframe(SINGLE_KEYFRAME);
                expect(result.start).toBe(SINGLE_KEYFRAME);
                expect(result.end).toBe(SINGLE_KEYFRAME);
            });

            it('handles context parameter for logging', () => {
                const result = ensureBookendKeyframe(SINGLE_KEYFRAME, 'Scene 1');
                expect(result.start).toBe(SINGLE_KEYFRAME);
            });
        });
    });

    describe('Keyframe Extraction', () => {
        describe('getStartKeyframe', () => {
            it('returns single keyframe as-is', () => {
                expect(getStartKeyframe(SINGLE_KEYFRAME)).toBe(SINGLE_KEYFRAME);
            });

            it('returns start from bookend', () => {
                expect(getStartKeyframe(BOOKEND_KEYFRAME)).toBe(BOOKEND_KEYFRAME.start);
            });

            it('returns empty string for undefined', () => {
                expect(getStartKeyframe(undefined)).toBe('');
            });
        });

        describe('getEndKeyframe', () => {
            it('returns single keyframe (same as start/end for single mode)', () => {
                expect(getEndKeyframe(SINGLE_KEYFRAME)).toBe(SINGLE_KEYFRAME);
            });

            it('returns end from bookend', () => {
                expect(getEndKeyframe(BOOKEND_KEYFRAME)).toBe(BOOKEND_KEYFRAME.end);
            });

            it('returns empty string for undefined', () => {
                expect(getEndKeyframe(undefined)).toBe('');
            });
        });
    });

    describe('Data URL Handling', () => {
        describe('isValidKeyframeData', () => {
            it('validates data URL with image prefix', () => {
                expect(isValidKeyframeData(SINGLE_KEYFRAME)).toBe(true);
            });

            it('validates raw base64 (>=100 chars)', () => {
                expect(isValidKeyframeData(VALID_BASE64_LONG)).toBe(true);
            });

            it('rejects empty string', () => {
                expect(isValidKeyframeData('')).toBe(false);
            });

            it('rejects undefined', () => {
                expect(isValidKeyframeData(undefined)).toBe(false);
            });

            it('rejects whitespace-only string', () => {
                expect(isValidKeyframeData('   ')).toBe(false);
            });

            it('rejects too-short string without data URL prefix', () => {
                expect(isValidKeyframeData('short')).toBe(false);
            });

            it('rejects invalid base64 characters', () => {
                expect(isValidKeyframeData('!@#$%^&*()'.repeat(20))).toBe(false);
            });
        });

        describe('stripDataUrlPrefix', () => {
            it('removes data:image prefix', () => {
                expect(stripDataUrlPrefix(SINGLE_KEYFRAME)).toBe(VALID_BASE64_SHORT);
            });

            it('handles jpeg MIME type', () => {
                const jpeg = `data:image/jpeg;base64,${VALID_BASE64_SHORT}`;
                expect(stripDataUrlPrefix(jpeg)).toBe(VALID_BASE64_SHORT);
            });

            it('passes through raw base64 unchanged', () => {
                expect(stripDataUrlPrefix(VALID_BASE64_SHORT)).toBe(VALID_BASE64_SHORT);
            });
        });

        describe('ensureDataUrlPrefix', () => {
            it('adds png prefix by default', () => {
                expect(ensureDataUrlPrefix(VALID_BASE64_SHORT)).toBe(`data:image/png;base64,${VALID_BASE64_SHORT}`);
            });

            it('adds custom MIME type prefix', () => {
                expect(ensureDataUrlPrefix(VALID_BASE64_SHORT, 'image/jpeg')).toBe(`data:image/jpeg;base64,${VALID_BASE64_SHORT}`);
            });

            it('passes through existing data URL unchanged', () => {
                expect(ensureDataUrlPrefix(SINGLE_KEYFRAME)).toBe(SINGLE_KEYFRAME);
            });
        });
    });

    describe('ComfyUI Integration', () => {
        describe('normalizeForComfyUI', () => {
            // normalizeForComfyUI strips prefix then validates - needs valid raw base64
            const LONG_KEYFRAME = `data:image/png;base64,${VALID_BASE64_LONG}`;
            
            it('extracts and strips single keyframe (long enough to validate)', () => {
                const result = normalizeForComfyUI(LONG_KEYFRAME);
                expect(result).toBe(VALID_BASE64_LONG);
            });

            it('extracts start from bookend and strips prefix', () => {
                const longBookend = {
                    start: LONG_KEYFRAME,
                    end: LONG_KEYFRAME
                };
                const result = normalizeForComfyUI(longBookend);
                expect(result).toBe(VALID_BASE64_LONG);
            });

            it('returns null for undefined', () => {
                expect(normalizeForComfyUI(undefined)).toBeNull();
            });

            it('returns null for empty string', () => {
                expect(normalizeForComfyUI('')).toBeNull();
            });

            it('returns null for short base64 without data URL prefix', () => {
                // After stripping prefix, 92-char base64 fails >=100 char validation
                const result = normalizeForComfyUI(SINGLE_KEYFRAME);
                expect(result).toBeNull(); // Too short after prefix strip
            });
        });
    });

    describe('Edge Cases', () => {
        it('handles bookend with identical start/end', () => {
            const sameImage = {
                start: SINGLE_KEYFRAME,
                end: SINGLE_KEYFRAME
            };
            expect(isBookendKeyframe(sameImage)).toBe(true);
            expect(getStartKeyframe(sameImage)).toBe(getEndKeyframe(sameImage));
        });

        it('handles very long base64 strings', () => {
            const longBase64 = VALID_BASE64_SHORT.repeat(1000);
            expect(isValidKeyframeData(longBase64)).toBe(true);
        });

        it('handles base64 with padding characters', () => {
            const withPadding = 'SGVsbG8gV29ybGQh=='; // Short but valid base64
            const asDataUrl = `data:image/png;base64,${withPadding}`;
            expect(isValidKeyframeData(asDataUrl)).toBe(true);
        });
    });
});
