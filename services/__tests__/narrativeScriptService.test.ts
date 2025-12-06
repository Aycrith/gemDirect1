/**
 * Narrative Script Service Tests
 * 
 * Tests for the narrative script discovery and loading service.
 * 
 * @module services/__tests__/narrativeScriptService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NarrativeScriptInfo } from '../narrativeScriptService';

// Mock fetch for browser-compatible tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('NarrativeScriptService', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('NarrativeScriptInfo type', () => {
        it('should have required fields', () => {
            const info: NarrativeScriptInfo = {
                id: 'test-script',
                path: '/config/narrative/test.json',
                shotCount: 3,
            };
            
            expect(info.id).toBe('test-script');
            expect(info.shotCount).toBe(3);
        });

        it('should support optional fields', () => {
            const info: NarrativeScriptInfo = {
                id: 'test-script',
                path: '/config/narrative/test.json',
                shotCount: 3,
                title: 'Test Script',
                description: 'A test narrative',
                version: '1.0',
                createdAt: '2025-12-05T00:00:00Z',
                author: 'Test Author',
                tags: ['test', 'demo'],
            };
            
            expect(info.title).toBe('Test Script');
            expect(info.description).toBe('A test narrative');
            expect(info.tags).toContain('test');
        });
    });

    describe('listNarrativeScripts', () => {
        it('should return empty array when fetch fails', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            const { listNarrativeScripts } = await import('../narrativeScriptService');
            const scripts = await listNarrativeScripts();
            
            expect(scripts).toEqual([]);
        });

        it('should return script info for valid JSON', async () => {
            const mockScript = {
                id: 'demo-three-shot',
                title: 'Three-Shot Demo',
                description: 'A demo narrative',
                version: '1.0',
                shots: [
                    { id: 'shot-001', pipelineConfigId: 'fast-preview' },
                    { id: 'shot-002', pipelineConfigId: 'production-qa-preview' },
                    { id: 'shot-003', pipelineConfigId: 'cinematic-preview' },
                ],
                metadata: {
                    createdAt: '2025-12-05T00:00:00Z',
                    author: 'Test',
                    tags: ['demo'],
                },
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => mockScript,
            });

            const { listNarrativeScripts } = await import('../narrativeScriptService');
            const scripts = await listNarrativeScripts();
            
            expect(scripts.length).toBe(1);
            expect(scripts[0]?.id).toBe('demo-three-shot');
            expect(scripts[0]?.shotCount).toBe(3);
            expect(scripts[0]?.title).toBe('Three-Shot Demo');
        });

        it('should skip invalid scripts', async () => {
            const invalidScript = {
                // Missing required 'shots' array
                id: 'invalid',
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => invalidScript,
            });

            const { listNarrativeScripts } = await import('../narrativeScriptService');
            const scripts = await listNarrativeScripts();
            
            expect(scripts).toEqual([]);
        });
    });

    describe('loadNarrativeScript', () => {
        it('should return error for failed fetch', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            const { loadNarrativeScript } = await import('../narrativeScriptService');
            const result = await loadNarrativeScript('/config/narrative/nonexistent.json');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('404');
        });

        it('should return script for valid JSON', async () => {
            const mockScript = {
                id: 'test-script',
                shots: [
                    { id: 'shot-001', pipelineConfigId: 'fast-preview' },
                ],
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => mockScript,
            });

            const { loadNarrativeScript } = await import('../narrativeScriptService');
            const result = await loadNarrativeScript('/config/narrative/test.json');
            
            expect(result.success).toBe(true);
            expect(result.script?.id).toBe('test-script');
            expect(result.script?.shots.length).toBe(1);
        });

        it('should return error for invalid script format', async () => {
            const invalidScript = {
                id: 'invalid',
                // Missing shots array
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => invalidScript,
            });

            const { loadNarrativeScript } = await import('../narrativeScriptService');
            const result = await loadNarrativeScript('/config/narrative/invalid.json');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid');
        });
    });

    describe('getScriptInfo', () => {
        it('should return null for unknown script', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
            });

            const { getScriptInfo } = await import('../narrativeScriptService');
            const info = await getScriptInfo('nonexistent');
            
            expect(info).toBeNull();
        });
    });
});
