/**
 * Experiment History Service Tests
 * 
 * Unit tests for the experiment history loading and filtering functionality.
 * 
 * @module services/__tests__/experimentHistoryService.test
 */

import { describe, it, expect } from 'vitest';
import {
    filterExperiments,
    sortExperiments,
    type ExperimentEntry,
    type ExperimentFilter,
} from '../experimentHistoryService';

// Mock entries for testing
const mockEntries: ExperimentEntry[] = [
    {
        id: 'manifest-001',
        type: 'single-shot',
        label: 'Scene: intro - wan-flf2v [production-qa]',
        date: '2025-12-01T10:00:00Z',
        preset: 'production-qa',
        stabilityProfile: 'production-qa',
        qaVerdict: 'pass',
        hasCameraPath: true,
        cameraPathId: 'slow-pan',
        temporalRegularization: 'fixed',
        manifestPath: '/data/manifests/manifest-001.json',
        videoPath: '/videos/intro.mp4',
        sceneId: 'intro',
        shotId: 'shot-001',
        workflowProfileId: 'wan-flf2v',
        tags: ['production', 'camera-path'],
    },
    {
        id: 'manifest-002',
        type: 'ab-compare',
        label: 'A/B Comparison: fast vs production',
        date: '2025-12-02T14:30:00Z',
        preset: 'production-qa',
        qaVerdict: 'warn',
        hasCameraPath: false,
        temporalRegularization: 'none',
        manifestPath: '/data/manifests/manifest-002.json',
        tags: ['ab-compare'],
    },
    {
        id: 'narrative-001',
        type: 'narrative',
        label: 'Narrative: Three-Shot Demo',
        date: '2025-12-03T09:15:00Z',
        qaVerdict: 'pass',
        hasCameraPath: true,
        temporalRegularization: 'adaptive',
        narrativeScriptId: 'three-shot-demo',
        narrativeShotCount: 3,
        videoPath: '/videos/narrative-001.mp4',
        tags: [],
    },
    {
        id: 'manifest-003',
        type: 'single-shot',
        label: 'Scene: climax - cinematic',
        date: '2025-12-01T08:00:00Z',
        preset: 'cinematic',
        qaVerdict: 'fail',
        hasCameraPath: false,
        temporalRegularization: 'none',
        tags: ['cinematic'],
    },
    {
        id: 'manifest-004',
        type: 'single-shot',
        label: 'Scene: ending - fast preview',
        date: '2025-12-04T16:00:00Z',
        preset: 'fast',
        qaVerdict: 'unknown',
        hasCameraPath: false,
        temporalRegularization: 'none',
        tags: ['fast'],
    },
];

describe('experimentHistoryService', () => {
    describe('filterExperiments', () => {
        it('should return all entries when no filter is provided', () => {
            const result = filterExperiments(mockEntries, {});
            expect(result).toHaveLength(mockEntries.length);
        });

        it('should filter by type (single-shot)', () => {
            const filter: ExperimentFilter = { types: ['single-shot'] };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(3);
            expect(result.every(e => e.type === 'single-shot')).toBe(true);
        });

        it('should filter by type (narrative)', () => {
            const filter: ExperimentFilter = { types: ['narrative'] };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(1);
            expect(result[0]?.type).toBe('narrative');
        });

        it('should filter by multiple types', () => {
            const filter: ExperimentFilter = { types: ['single-shot', 'ab-compare'] };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(4);
            expect(result.every(e => e.type === 'single-shot' || e.type === 'ab-compare')).toBe(true);
        });

        it('should filter by search text (label match)', () => {
            const filter: ExperimentFilter = { searchText: 'intro' };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(1);
            expect(result[0]?.label).toContain('intro');
        });

        it('should filter by search text (preset match)', () => {
            const filter: ExperimentFilter = { searchText: 'cinematic' };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(1);
            expect(result[0]?.preset).toBe('cinematic');
        });

        it('should filter by search text (case insensitive)', () => {
            const filter: ExperimentFilter = { searchText: 'NARRATIVE' };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(1);
            expect(result[0]?.type).toBe('narrative');
        });

        it('should filter by QA verdict (pass)', () => {
            const filter: ExperimentFilter = { qaVerdicts: ['pass'] };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(2);
            expect(result.every(e => e.qaVerdict === 'pass')).toBe(true);
        });

        it('should filter by multiple QA verdicts', () => {
            const filter: ExperimentFilter = { qaVerdicts: ['pass', 'warn'] };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(3);
        });

        it('should filter by camera path presence', () => {
            const filter: ExperimentFilter = { hasCameraPath: true };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(2);
            expect(result.every(e => e.hasCameraPath)).toBe(true);
        });

        it('should filter by temporal regularization mode', () => {
            const filter: ExperimentFilter = { temporalRegularization: ['fixed', 'adaptive'] };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(2);
            expect(result.every(e => e.temporalRegularization !== 'none')).toBe(true);
        });

        it('should filter by date range (from)', () => {
            const filter: ExperimentFilter = { dateFrom: '2025-12-02T00:00:00Z' };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(3);
        });

        it('should filter by date range (to)', () => {
            const filter: ExperimentFilter = { dateTo: '2025-12-02T00:00:00Z' };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(2);
        });

        it('should combine multiple filters', () => {
            const filter: ExperimentFilter = {
                types: ['single-shot'],
                qaVerdicts: ['pass'],
                hasCameraPath: true,
            };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(1);
            expect(result[0]?.id).toBe('manifest-001');
        });

        it('should handle empty search text', () => {
            const filter: ExperimentFilter = { searchText: '   ' };
            const result = filterExperiments(mockEntries, filter);
            
            expect(result).toHaveLength(mockEntries.length);
        });
    });

    describe('sortExperiments', () => {
        it('should sort by date descending (default)', () => {
            const result = sortExperiments(mockEntries, false);
            
            expect(result[0]?.date).toBe('2025-12-04T16:00:00Z');
            expect(result[result.length - 1]?.date).toBe('2025-12-01T08:00:00Z');
        });

        it('should sort by date ascending', () => {
            const result = sortExperiments(mockEntries, true);
            
            expect(result[0]?.date).toBe('2025-12-01T08:00:00Z');
            expect(result[result.length - 1]?.date).toBe('2025-12-04T16:00:00Z');
        });

        it('should not mutate the original array', () => {
            const original = [...mockEntries];
            sortExperiments(mockEntries, false);
            
            expect(mockEntries).toEqual(original);
        });
    });

    describe('entry field extraction', () => {
        it('should correctly identify camera path presence', () => {
            const entryWithPath = mockEntries.find(e => e.id === 'manifest-001');
            const entryWithoutPath = mockEntries.find(e => e.id === 'manifest-003');
            
            expect(entryWithPath?.hasCameraPath).toBe(true);
            expect(entryWithPath?.cameraPathId).toBe('slow-pan');
            expect(entryWithoutPath?.hasCameraPath).toBe(false);
        });

        it('should correctly identify temporal regularization mode', () => {
            const fixedEntry = mockEntries.find(e => e.id === 'manifest-001');
            const adaptiveEntry = mockEntries.find(e => e.id === 'narrative-001');
            const noneEntry = mockEntries.find(e => e.id === 'manifest-003');
            
            expect(fixedEntry?.temporalRegularization).toBe('fixed');
            expect(adaptiveEntry?.temporalRegularization).toBe('adaptive');
            expect(noneEntry?.temporalRegularization).toBe('none');
        });

        it('should correctly identify narrative entries', () => {
            const narrativeEntry = mockEntries.find(e => e.id === 'narrative-001');
            
            expect(narrativeEntry?.type).toBe('narrative');
            expect(narrativeEntry?.narrativeScriptId).toBe('three-shot-demo');
            expect(narrativeEntry?.narrativeShotCount).toBe(3);
        });
    });
});
