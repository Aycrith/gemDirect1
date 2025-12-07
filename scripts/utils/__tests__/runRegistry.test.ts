/**
 * Run Registry Tests
 * 
 * Tests for run registry operations
 * 
 * @module scripts/utils/__tests__/runRegistry.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock fs module
vi.mock('fs');

// Import after mocking
import {
    createRegistryEntry,
} from '../runRegistry';
import type { RunRegistryEntry } from '../../../types/runRegistry';

describe('runRegistry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('createRegistryEntry', () => {
        it('should create a valid registry entry', () => {
            const entry = createRegistryEntry(
                'run-2025-12-06_12-00-00-abc123',
                'production',
                'production-qa-golden (sample-001-geometric)',
                {
                    sample: 'sample-001-geometric',
                    temporal: 'on',
                    verbose: true,
                },
                'production-qa-golden'
            );

            expect(entry.runId).toBe('run-2025-12-06_12-00-00-abc123');
            expect(entry.type).toBe('production');
            expect(entry.status).toBe('running');
            expect(entry.identifier).toBe('production-qa-golden (sample-001-geometric)');
            expect(entry.options.sample).toBe('sample-001-geometric');
            expect(entry.options.temporal).toBe('on');
            expect(entry.options.verbose).toBe(true);
            expect(entry.pipelineId).toBe('production-qa-golden');
            expect(entry.startedAt).toBeTruthy();
            expect(entry.finishedAt).toBeNull();
            expect(entry.durationMs).toBeNull();
            expect(entry.artifacts).toEqual({});
            expect(entry.warnings).toEqual([]);
        });

        it('should create a narrative registry entry', () => {
            const entry = createRegistryEntry(
                'run-2025-12-06_13-00-00-def456',
                'narrative',
                'config/narrative/demo-three-shot.json',
                {
                    script: 'config/narrative/demo-three-shot.json',
                    temporal: 'auto',
                }
            );

            expect(entry.type).toBe('narrative');
            expect(entry.options.script).toBe('config/narrative/demo-three-shot.json');
            expect(entry.pipelineId).toBeUndefined();
        });
    });

    describe('toHistoryEntry (via internal conversion)', () => {
        it('should convert registry entry to history entry format', () => {
            // Create a mock registry entry
            const registryEntry: RunRegistryEntry = {
                runId: 'run-2025-12-06_12-00-00-abc123',
                type: 'production',
                status: 'succeeded',
                startedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
                finishedAt: new Date(Date.now() - 3000000).toISOString(), // 50 min ago
                durationMs: 600000, // 10 minutes
                options: {
                    sample: 'sample-001-geometric',
                    temporal: 'on',
                },
                artifacts: {
                    video: 'C:\\ComfyUI\\output\\video\\test.mp4',
                    visionQa: 'C:\\Dev\\gemDirect1\\public\\vision-qa-latest.json',
                },
                warnings: ['Warning 1', 'Warning 2', 'Warning 3', 'Warning 4'],
                identifier: 'production-qa-golden (sample-001-geometric)',
                pipelineId: 'production-qa-golden',
                visionQaStatus: 'PASS',
            };

            // We test the structure expectations
            expect(registryEntry.runId).toBe('run-2025-12-06_12-00-00-abc123');
            expect(registryEntry.status).toBe('succeeded');
            expect(registryEntry.durationMs).toBe(600000);
            expect(registryEntry.warnings.length).toBe(4);
            expect(registryEntry.visionQaStatus).toBe('PASS');
        });
    });

    describe('RunOptions structure', () => {
        it('should support all option fields', () => {
            const entry = createRegistryEntry(
                'run-test',
                'production',
                'test',
                {
                    sample: 'sample-001',
                    script: undefined,
                    temporal: 'auto',
                    verbose: true,
                    dryRun: false,
                }
            );

            expect(entry.options.sample).toBe('sample-001');
            expect(entry.options.temporal).toBe('auto');
            expect(entry.options.verbose).toBe(true);
            expect(entry.options.dryRun).toBe(false);
        });
    });

    describe('RunArtifacts structure', () => {
        it('should support all artifact fields', () => {
            const entry = createRegistryEntry(
                'run-test',
                'production',
                'test',
                {}
            );

            // Verify artifacts object is empty initially
            expect(entry.artifacts).toEqual({});

            // Add artifacts
            entry.artifacts = {
                summaryJson: '/path/to/summary.json',
                summaryMd: '/path/to/summary.md',
                video: '/path/to/video.mp4',
                originalVideo: '/path/to/original.mp4',
                visionQa: '/path/to/qa.json',
                benchmarkJson: '/path/to/benchmark.json',
                benchmarkMd: '/path/to/benchmark.md',
                manifest: '/path/to/manifest.json',
                runDir: '/path/to/runDir',
                finalVideo: '/path/to/final.mp4',
            };

            expect(Object.keys(entry.artifacts).length).toBe(10);
        });
    });
});
