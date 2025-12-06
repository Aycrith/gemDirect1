/**
 * Narrative Run Service Tests
 * 
 * Tests for the narrative run management service.
 * 
 * @module services/__tests__/narrativeRunService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    startNarrativeRun,
    getNarrativeRunProgress,
    getNarrativeRunSummary,
    listNarrativeRuns,
    cancelNarrativeRun,
    clearAllRuns,
} from '../narrativeRunService';

// Mock the script service
vi.mock('../narrativeScriptService', () => ({
    getScriptInfo: vi.fn().mockResolvedValue({
        id: 'demo-three-shot',
        title: 'Demo Script',
        path: '/config/narrative/demo-three-shot.json',
        shotCount: 3,
    }),
}));

describe('NarrativeRunService', () => {
    beforeEach(() => {
        clearAllRuns();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('startNarrativeRun', () => {
        it('should return a run handle with unique ID', async () => {
            const handle = await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            expect(handle.runId).toBeDefined();
            expect(handle.runId).toMatch(/^run-\d+-[a-z0-9]+$/);
            expect(handle.startedAt).toBeDefined();
            expect(handle.scriptInfo).toBeDefined();
        });

        it('should create initial progress entry', async () => {
            const handle = await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            const progress = getNarrativeRunProgress(handle.runId);
            expect(progress).toBeDefined();
            expect(progress?.status).toBe('running');  // Starts in running state
            expect(progress?.totalShots).toBe(3);
            expect(progress?.completedShots).toBe(0);
        });

        it('should track scriptInfo correctly', async () => {
            const handle = await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            expect(handle.scriptInfo.id).toBe('demo-three-shot');
            expect(handle.scriptInfo.shotCount).toBe(3);
        });
    });

    describe('getNarrativeRunProgress', () => {
        it('should return null for unknown runId', () => {
            const progress = getNarrativeRunProgress('unknown-run-id');
            expect(progress).toBeNull();
        });

        it('should return progress for valid runId', async () => {
            const handle = await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            const progress = getNarrativeRunProgress(handle.runId);
            expect(progress).not.toBeNull();
            expect(progress?.runId).toBe(handle.runId);
        });
    });

    describe('getNarrativeRunSummary', () => {
        it('should return null for unknown runId', async () => {
            const summary = await getNarrativeRunSummary('unknown-run-id');
            expect(summary).toBeNull();
        });

        it('should return null while run is in progress', async () => {
            const handle = await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            // Summary shouldn't be available immediately
            const summary = await getNarrativeRunSummary(handle.runId);
            expect(summary).toBeNull();
        });
    });

    describe('listNarrativeRuns', () => {
        it('should return empty array when no runs', () => {
            const runs = listNarrativeRuns();
            expect(runs).toEqual([]);
        });

        it('should return all active runs', async () => {
            await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            const runs = listNarrativeRuns();
            expect(runs.length).toBe(2);
        });
    });

    describe('cancelNarrativeRun', () => {
        it('should return false for unknown runId', () => {
            const result = cancelNarrativeRun('unknown-run-id');
            expect(result).toBe(false);
        });

        it('should return false for already completed runs', async () => {
            const handle = await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            // Wait for simulated run to complete
            await new Promise(resolve => setTimeout(resolve, 7000));
            
            const result = cancelNarrativeRun(handle.runId);
            expect(result).toBe(false);
        }, 10000);
    });

    describe('NarrativeRunProgress type', () => {
        it('should have all required fields', async () => {
            const handle = await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            const progress = getNarrativeRunProgress(handle.runId);
            
            // Type check - these should all be defined
            expect(progress?.runId).toBeDefined();
            expect(progress?.status).toBeDefined();
            expect(typeof progress?.totalShots).toBe('number');
            expect(typeof progress?.completedShots).toBe('number');
            expect(typeof progress?.failedShots).toBe('number');
            expect(typeof progress?.progressPercent).toBe('number');
            expect(progress?.message).toBeDefined();
        });

        it('should have valid status values', async () => {
            const handle = await startNarrativeRun({
                scriptPath: '/config/narrative/demo-three-shot.json',
            });
            
            const progress = getNarrativeRunProgress(handle.runId);
            const validStatuses = ['pending', 'running', 'succeeded', 'failed'];
            
            expect(validStatuses).toContain(progress?.status);
        });
    });
});
