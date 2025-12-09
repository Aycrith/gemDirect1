/**
 * Tests for Store Consistency Validator
 * 
 * Phase 1B: Validates that the consistency validation logic correctly
 * detects differences between old and new store states.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    validateStoreConsistency,
    compareScenes,
    compareRecords,
    logConsistencyResult,
    trackConsistencyMetrics,
    createOldStoreSnapshot,
    createNewStoreSnapshot,
    shouldRunParallelValidation,
    type OldStoreSnapshot,
    type NewStoreSnapshot,
    type ConsistencyResult,
} from '../storeConsistencyValidator';
import type { Scene, TimelineData } from '../../types';

// Helper to create a minimal scene
function createTestScene(overrides: Partial<Scene> = {}): Scene {
    return {
        id: `scene-${Date.now()}`,
        title: 'Test Scene',
        summary: 'A test scene summary',
        timeline: {
            shots: [],
            transitions: [],
            shotEnhancers: {},
            negativePrompt: ''
        } as TimelineData,
        ...overrides,
    };
}

// Helper to create matching snapshots
function createMatchingSnapshots(): { old: OldStoreSnapshot; new: NewStoreSnapshot } {
    const scene = createTestScene({ id: 'scene-1', title: 'Scene One' });
    
    return {
        old: {
            scenes: [scene],
            activeSceneId: 'scene-1',
            generatedImages: {},
            generatedShotImages: {},
            sceneImageStatuses: {},
        },
        new: {
            scenes: [scene],
            selectedSceneId: 'scene-1',
            generatedImages: {},
            generatedShotImages: {},
            sceneImageStatuses: {},
        },
    };
}

describe('storeConsistencyValidator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('validateStoreConsistency', () => {
        it('should return consistent=true when stores match exactly', () => {
            const { old, new: newState } = createMatchingSnapshots();
            
            const result = validateStoreConsistency(old, newState);
            
            expect(result.consistent).toBe(true);
            expect(result.differences).toHaveLength(0);
            expect(result.consistencyPercentage).toBe(100);
        });

        it('should detect missing scene in new store', () => {
            const scene = createTestScene({ id: 'scene-1', title: 'Missing Scene' });
            const old: OldStoreSnapshot = {
                scenes: [scene],
                activeSceneId: 'scene-1',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            const newState: NewStoreSnapshot = {
                scenes: [],
                selectedSceneId: null,
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            
            const result = validateStoreConsistency(old, newState);
            
            expect(result.consistent).toBe(false);
            expect(result.criticalCount).toBeGreaterThan(0);
            const missingDiff = result.differences.find(d => d.type === 'missing_in_new');
            expect(missingDiff).toBeDefined();
            expect(missingDiff?.path).toContain('scenes');
        });

        it('should detect missing scene in old store', () => {
            const scene = createTestScene({ id: 'scene-new', title: 'New Scene' });
            const old: OldStoreSnapshot = {
                scenes: [],
                activeSceneId: null,
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            const newState: NewStoreSnapshot = {
                scenes: [scene],
                selectedSceneId: 'scene-new',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            
            const result = validateStoreConsistency(old, newState);
            
            expect(result.consistent).toBe(false);
            const missingDiff = result.differences.find(d => d.type === 'missing_in_old');
            expect(missingDiff).toBeDefined();
        });

        it('should detect selected scene ID mismatch', () => {
            const scene = createTestScene({ id: 'scene-1' });
            const old: OldStoreSnapshot = {
                scenes: [scene],
                activeSceneId: 'scene-1',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            const newState: NewStoreSnapshot = {
                scenes: [scene],
                selectedSceneId: 'scene-different',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            
            const result = validateStoreConsistency(old, newState);
            
            expect(result.consistent).toBe(false);
            const idDiff = result.differences.find(d => d.path === 'selectedSceneId');
            expect(idDiff).toBeDefined();
            expect(idDiff?.severity).toBe('warning');
        });

        it('should detect generated image differences', () => {
            const old: OldStoreSnapshot = {
                scenes: [],
                activeSceneId: null,
                generatedImages: {
                    'scene-1': 'data:image/png;base64,abc',
                },
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            const newState: NewStoreSnapshot = {
                scenes: [],
                selectedSceneId: null,
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            
            const result = validateStoreConsistency(old, newState);
            
            expect(result.consistent).toBe(false);
            const imgDiff = result.differences.find(d => d.path.startsWith('generatedImages'));
            expect(imgDiff).toBeDefined();
            expect(imgDiff?.type).toBe('missing_in_new');
        });

        it('should respect ignorePaths option', () => {
            const old: OldStoreSnapshot = {
                scenes: [],
                activeSceneId: 'scene-1',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            const newState: NewStoreSnapshot = {
                scenes: [],
                selectedSceneId: null,
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            
            const result = validateStoreConsistency(old, newState, {
                ignorePaths: [/selectedSceneId/],
            });
            
            // The difference should be filtered out
            expect(result.differences.find(d => d.path === 'selectedSceneId')).toBeUndefined();
        });

        it('should respect onlyPaths option', () => {
            const scene = createTestScene({ id: 'scene-1', title: 'Title Diff' });
            const modifiedScene = { ...scene, title: 'Different Title' };
            
            const old: OldStoreSnapshot = {
                scenes: [scene],
                activeSceneId: 'scene-1',
                generatedImages: { 'img-1': 'data:image/png;base64,abc' },
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            const newState: NewStoreSnapshot = {
                scenes: [modifiedScene],
                selectedSceneId: 'scene-diff',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            
            const result = validateStoreConsistency(old, newState, {
                onlyPaths: ['scenes'],
            });
            
            // Should only have scene-related differences
            expect(result.differences.every(d => d.path.startsWith('scenes'))).toBe(true);
        });

        it('should calculate consistency percentage correctly', () => {
            const scene = createTestScene({ id: 'scene-1' });
            const old: OldStoreSnapshot = {
                scenes: [scene],
                activeSceneId: 'scene-1',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            const newState: NewStoreSnapshot = {
                scenes: [scene],
                selectedSceneId: 'scene-1',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            };
            
            const result = validateStoreConsistency(old, newState);
            
            expect(result.consistencyPercentage).toBe(100);
            expect(result.itemsCompared).toBeGreaterThan(0);
        });

        describe('migration phase handling', () => {
            it('should skip validation entirely for zustand-only phase', () => {
                const scene = createTestScene({ id: 'scene-1' });
                const old: OldStoreSnapshot = {
                    scenes: [],
                    activeSceneId: null,
                    generatedImages: {},
                    generatedShotImages: {},
                    sceneImageStatuses: {},
                };
                const newState: NewStoreSnapshot = {
                    scenes: [scene],
                    selectedSceneId: 'scene-1',
                    generatedImages: {},
                    generatedShotImages: {},
                    sceneImageStatuses: {},
                };
                
                const result = validateStoreConsistency(old, newState, {
                    migrationPhase: 'zustand-only',
                });
                
                expect(result.consistent).toBe(true);
                expect(result.differences.length).toBe(0);
                expect(result.criticalCount).toBe(0);
            });

            it('should downgrade missing_in_old to info in zustand-primary phase', () => {
                const scene = createTestScene({ id: 'scene-new', title: 'New Scene' });
                const old: OldStoreSnapshot = {
                    scenes: [],
                    activeSceneId: null,
                    generatedImages: {},
                    generatedShotImages: {},
                    sceneImageStatuses: {},
                };
                const newState: NewStoreSnapshot = {
                    scenes: [scene],
                    selectedSceneId: 'scene-new',
                    generatedImages: {},
                    generatedShotImages: {},
                    sceneImageStatuses: {},
                };
                
                const result = validateStoreConsistency(old, newState, {
                    migrationPhase: 'zustand-primary',
                });
                
                // Should have differences but no critical ones
                expect(result.differences.length).toBeGreaterThan(0);
                expect(result.criticalCount).toBe(0);
                
                // Check that missing_in_old is now info severity
                const missingDiff = result.differences.find(d => d.type === 'missing_in_old');
                expect(missingDiff).toBeDefined();
                expect(missingDiff?.severity).toBe('info');
                expect(missingDiff?.description).toContain('[Migration Expected]');
            });

            it('should downgrade selectedSceneId null-to-value mismatch in zustand-primary phase', () => {
                const scene = createTestScene({ id: 'scene-1' });
                const old: OldStoreSnapshot = {
                    scenes: [scene],
                    activeSceneId: null,
                    generatedImages: {},
                    generatedShotImages: {},
                    sceneImageStatuses: {},
                };
                const newState: NewStoreSnapshot = {
                    scenes: [scene],
                    selectedSceneId: 'scene-1',
                    generatedImages: {},
                    generatedShotImages: {},
                    sceneImageStatuses: {},
                };
                
                const result = validateStoreConsistency(old, newState, {
                    migrationPhase: 'zustand-primary',
                });
                
                // Should have the mismatch but as info, not warning
                const sceneIdDiff = result.differences.find(d => d.path === 'selectedSceneId');
                expect(sceneIdDiff).toBeDefined();
                expect(sceneIdDiff?.severity).toBe('info');
                expect(sceneIdDiff?.description).toContain('[Migration Expected]');
            });

            it('should still report critical for missing_in_new even in zustand-primary phase', () => {
                const scene = createTestScene({ id: 'scene-1', title: 'Important Scene' });
                const old: OldStoreSnapshot = {
                    scenes: [scene],
                    activeSceneId: 'scene-1',
                    generatedImages: {},
                    generatedShotImages: {},
                    sceneImageStatuses: {},
                };
                const newState: NewStoreSnapshot = {
                    scenes: [],
                    selectedSceneId: null,
                    generatedImages: {},
                    generatedShotImages: {},
                    sceneImageStatuses: {},
                };
                
                const result = validateStoreConsistency(old, newState, {
                    migrationPhase: 'zustand-primary',
                });
                
                // missing_in_new is still critical (data loss from Zustand store)
                expect(result.criticalCount).toBeGreaterThan(0);
            });
        });
    });

    describe('compareScenes', () => {
        it('should detect scene with modified title', () => {
            const oldScene = createTestScene({ id: 'scene-1', title: 'Original Title' });
            const newScene = createTestScene({ id: 'scene-1', title: 'Modified Title' });
            
            const diffs = compareScenes([oldScene], [newScene]);
            
            expect(diffs.length).toBeGreaterThan(0);
            const titleDiff = diffs.find(d => d.path.includes('title'));
            expect(titleDiff).toBeDefined();
            expect(titleDiff?.type).toBe('value_mismatch');
        });

        it('should detect timeline shot count differences', () => {
            const oldScene = createTestScene({ 
                id: 'scene-1', 
                timeline: { shots: [{ id: 'shot-1' }], transitions: [] } as unknown as TimelineData 
            });
            const newScene = createTestScene({ 
                id: 'scene-1', 
                timeline: { shots: [{ id: 'shot-1' }, { id: 'shot-2' }], transitions: [] } as unknown as TimelineData 
            });
            
            const diffs = compareScenes([oldScene], [newScene]);
            
            const shotDiff = diffs.find(d => d.path.includes('shots.length'));
            expect(shotDiff).toBeDefined();
            expect(shotDiff?.severity).toBe('critical');
        });

        it('should handle empty scene arrays', () => {
            const diffs = compareScenes([], []);
            expect(diffs).toHaveLength(0);
        });

        it('should detect missing timeline in new scene', () => {
            const oldScene = createTestScene({ 
                id: 'scene-1', 
                timeline: { shots: [{ id: 'shot-1' }], transitions: [] } as unknown as TimelineData 
            });
            const newScene = { ...createTestScene({ id: 'scene-1' }), timeline: undefined as unknown as TimelineData };
            
            const diffs = compareScenes([oldScene], [newScene]);
            
            const timelineDiff = diffs.find(d => d.path.includes('timeline') && d.type === 'missing_in_new');
            expect(timelineDiff).toBeDefined();
            expect(timelineDiff?.severity).toBe('critical');
        });
    });

    describe('compareRecords', () => {
        it('should detect missing keys in new record', () => {
            const old = { 'key-1': 'value-1', 'key-2': 'value-2' };
            const newRec = { 'key-1': 'value-1' };
            
            const diffs = compareRecords(old, newRec, 'testRecord');
            
            expect(diffs.length).toBe(1);
            expect(diffs[0]!.type).toBe('missing_in_new');
            expect(diffs[0]!.path).toBe('testRecord.key-2');
        });

        it('should detect missing keys in old record', () => {
            const old = { 'key-1': 'value-1' };
            const newRec = { 'key-1': 'value-1', 'key-2': 'value-2' };
            
            const diffs = compareRecords(old, newRec, 'testRecord');
            
            expect(diffs.length).toBe(1);
            expect(diffs[0]!.type).toBe('missing_in_old');
        });

        it('should detect value mismatches', () => {
            const old = { 'key-1': 'old-value' };
            const newRec = { 'key-1': 'new-value' };
            
            const diffs = compareRecords(old, newRec, 'testRecord');
            
            expect(diffs.length).toBe(1);
            expect(diffs[0]!.type).toBe('value_mismatch');
        });

        it('should handle empty records', () => {
            const diffs = compareRecords({}, {}, 'empty');
            expect(diffs).toHaveLength(0);
        });

        it('should handle complex objects', () => {
            const old = { 'key-1': { nested: 'value', count: 1 } };
            const newRec = { 'key-1': { nested: 'value', count: 2 } };
            
            const diffs = compareRecords(old, newRec, 'complex');
            
            expect(diffs.length).toBe(1);
            expect(diffs[0]!.type).toBe('value_mismatch');
        });
    });

    describe('logConsistencyResult', () => {
        it('should log success message when consistent', () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            
            const result: ConsistencyResult = {
                consistent: true,
                differences: [],
                timestamp: Date.now(),
                criticalCount: 0,
                warningCount: 0,
                itemsCompared: 10,
                consistencyPercentage: 100,
            };
            
            logConsistencyResult(result);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('✅ Stores are consistent')
            );
            
            consoleSpy.mockRestore();
        });

        it('should group warnings when inconsistent', () => {
            const consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
            const consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
            
            const result: ConsistencyResult = {
                consistent: false,
                differences: [{
                    path: 'test.path',
                    type: 'value_mismatch',
                    severity: 'warning',
                    description: 'Test difference',
                }],
                timestamp: Date.now(),
                criticalCount: 0,
                warningCount: 1,
                itemsCompared: 10,
                consistencyPercentage: 90,
            };
            
            logConsistencyResult(result);
            
            expect(consoleGroupSpy).toHaveBeenCalled();
            expect(consoleGroupEndSpy).toHaveBeenCalled();
            
            consoleGroupSpy.mockRestore();
            consoleGroupEndSpy.mockRestore();
        });
    });

    describe('trackConsistencyMetrics', () => {
        it('should log telemetry event', () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            
            const result: ConsistencyResult = {
                consistent: true,
                differences: [],
                timestamp: 1234567890,
                criticalCount: 0,
                warningCount: 0,
                itemsCompared: 5,
                consistencyPercentage: 100,
            };
            
            trackConsistencyMetrics(result);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[StoreConsistencyValidator:Telemetry]',
                expect.stringContaining('"event":"store_consistency_check"')
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('createOldStoreSnapshot', () => {
        it('should create snapshot with all required fields', () => {
            const snapshot = createOldStoreSnapshot({
                scenes: [],
                activeSceneId: 'test-id',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            });
            
            expect(snapshot).toHaveProperty('scenes');
            expect(snapshot).toHaveProperty('activeSceneId', 'test-id');
            expect(snapshot).toHaveProperty('generatedImages');
            expect(snapshot).toHaveProperty('generatedShotImages');
            expect(snapshot).toHaveProperty('sceneImageStatuses');
        });
    });

    describe('createNewStoreSnapshot', () => {
        it('should create snapshot with all required fields', () => {
            const snapshot = createNewStoreSnapshot({
                scenes: [],
                selectedSceneId: 'test-id',
                generatedImages: {},
                generatedShotImages: {},
                sceneImageStatuses: {},
            });
            
            expect(snapshot).toHaveProperty('scenes');
            expect(snapshot).toHaveProperty('selectedSceneId', 'test-id');
            expect(snapshot).toHaveProperty('generatedImages');
            expect(snapshot).toHaveProperty('generatedShotImages');
            expect(snapshot).toHaveProperty('sceneImageStatuses');
        });
    });

    describe('shouldRunParallelValidation', () => {
        it('should return false when flags are undefined', () => {
            expect(shouldRunParallelValidation(undefined)).toBe(false);
        });

        it('should return false when both flags are false', () => {
            expect(shouldRunParallelValidation({
                useUnifiedSceneStore: false,
                sceneStoreParallelValidation: false,
            })).toBe(false);
        });

        it('should return false when only one flag is true', () => {
            expect(shouldRunParallelValidation({
                useUnifiedSceneStore: true,
                sceneStoreParallelValidation: false,
            })).toBe(false);
            
            expect(shouldRunParallelValidation({
                useUnifiedSceneStore: false,
                sceneStoreParallelValidation: true,
            })).toBe(false);
        });

        it('should return true when both flags are true', () => {
            expect(shouldRunParallelValidation({
                useUnifiedSceneStore: true,
                sceneStoreParallelValidation: true,
            })).toBe(true);
        });
    });
});
