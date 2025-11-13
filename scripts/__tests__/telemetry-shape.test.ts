import { describe, it, expect } from 'vitest';

type ValidationResult = { valid: boolean; errors: string[] };

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function isISO8601(s: any) {
    return typeof s === 'string' && ISO8601_RE.test(s);
}

function isFiniteNumber(v: any) {
    return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeInteger(v: any) {
    return Number.isInteger(v) && v >= 0;
}

function validateTelemetry(telemetry: any): ValidationResult {
    const errors: string[] = [];
    if (!telemetry || typeof telemetry !== 'object') {
        errors.push('Telemetry missing or not an object');
        return { valid: false, errors };
    }

    // Core metrics
    if (!isFiniteNumber(telemetry.DurationSeconds)) errors.push('DurationSeconds missing or not a number');
    if (!telemetry.QueueStart || !isISO8601(telemetry.QueueStart)) errors.push('QueueStart missing or not ISO8601');
    if (!telemetry.QueueEnd || !isISO8601(telemetry.QueueEnd)) errors.push('QueueEnd missing or not ISO8601');

    if (!isNonNegativeInteger(telemetry.MaxWaitSeconds)) errors.push('MaxWaitSeconds missing or not a non-negative integer');
    if (!isNonNegativeInteger(telemetry.PollIntervalSeconds)) errors.push('PollIntervalSeconds missing or not a non-negative integer');

    if (!isNonNegativeInteger(telemetry.HistoryAttempts)) errors.push('HistoryAttempts missing or not a non-negative integer');
    if (!isNonNegativeInteger(telemetry.HistoryAttemptLimit)) errors.push('HistoryAttemptLimit missing or not a non-negative integer');

    const exitReasons = ['success', 'maxWait', 'attemptLimit', 'postExecution', 'unknown'];
    if (typeof telemetry.HistoryExitReason !== 'string' || !exitReasons.includes(telemetry.HistoryExitReason)) {
        errors.push(`HistoryExitReason missing or invalid; expected one of ${exitReasons.join(',')}`);
    }

    if (typeof telemetry.ExecutionSuccessDetected !== 'boolean') errors.push('ExecutionSuccessDetected missing or not boolean');
    if (telemetry.ExecutionSuccessDetected === true && !isISO8601(telemetry.ExecutionSuccessAt)) errors.push('ExecutionSuccessAt required and must be ISO8601 when ExecutionSuccessDetected=true');

    if (!isNonNegativeInteger(telemetry.PostExecutionTimeoutSeconds)) errors.push('PostExecutionTimeoutSeconds missing or not a non-negative integer');
    if (typeof telemetry.HistoryPostExecutionTimeoutReached !== 'boolean') errors.push('HistoryPostExecutionTimeoutReached missing or not boolean');
    if (!isNonNegativeInteger(telemetry.SceneRetryBudget)) errors.push('SceneRetryBudget missing or not a non-negative integer');

    // GPU checks
    if (!telemetry.GPU || typeof telemetry.GPU !== 'object') {
        errors.push('GPU object missing');
    } else {
        const g = telemetry.GPU;
        if (!g.Name || typeof g.Name !== 'string') errors.push('GPU.Name missing or not a string');
        if (!g.Type || typeof g.Type !== 'string') errors.push('GPU.Type missing or not a string');
        if (!Number.isInteger(g.Index) || g.Index < 0) errors.push('GPU.Index missing or not a non-negative integer');
        if (!isFiniteNumber(g.VramTotal)) errors.push('GPU.VramTotal missing or not a number');

        // MB fields
        if (!isFiniteNumber(g.VramBeforeMB)) errors.push('GPU.VramBeforeMB missing or not a number');
        if (!isFiniteNumber(g.VramAfterMB)) errors.push('GPU.VramAfterMB missing or not a number');
        if (!isFiniteNumber(g.VramDeltaMB)) errors.push('GPU.VramDeltaMB missing or not a number');

        // Consistency check: delta == after - before (allow small floating tolerance)
        if (isFiniteNumber(g.VramBeforeMB) && isFiniteNumber(g.VramAfterMB) && isFiniteNumber(g.VramDeltaMB)) {
            const expected = Number(g.VramAfterMB - g.VramBeforeMB);
            if (Math.abs(expected - g.VramDeltaMB) > 0.5) {
                errors.push('GPU.VramDeltaMB inconsistent with VramAfterMB - VramBeforeMB');
            }
        }
    }

    // System fallbacks
    if (!telemetry.System || typeof telemetry.System !== 'object') {
        errors.push('System object missing');
    } else {
        if (!Array.isArray(telemetry.System.FallbackNotes)) errors.push('System.FallbackNotes missing or not an array');
        else {
            for (const note of telemetry.System.FallbackNotes) {
                if (typeof note !== 'string') errors.push('System.FallbackNotes must be array of strings');
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

describe('Telemetry shape validation (exhaustive)', () => {
    it('accepts a valid telemetry payload', () => {
        const telemetry = {
            DurationSeconds: 45.2,
            QueueStart: '2025-11-12T10:23:00Z',
            QueueEnd: '2025-11-12T10:23:45Z',
            MaxWaitSeconds: 600,
            PollIntervalSeconds: 2,
            HistoryAttempts: 150,
            HistoryAttemptLimit: 0,
            HistoryExitReason: 'success',
            ExecutionSuccessDetected: true,
            ExecutionSuccessAt: '2025-11-12T10:23:05Z',
            PostExecutionTimeoutSeconds: 30,
            HistoryPostExecutionTimeoutReached: false,
            SceneRetryBudget: 1,
            GPU: {
                Name: 'NVIDIA GeForce RTX 3090',
                Type: 'cuda',
                Index: 0,
                VramTotal: 25589547008,
                VramBeforeMB: 24000.0,
                VramAfterMB: 22600.0,
                VramDeltaMB: -1400.0,
            },
            System: { FallbackNotes: [] },
        };

        const result = validateTelemetry(telemetry);
        if (!result.valid) console.error('Validation errors:', result.errors.join('; '));
        expect(result.valid).toBe(true);
    });

    it('rejects missing DurationSeconds', () => {
        const telemetry: any = {
            QueueStart: '2025-11-12T10:23:00Z',
            QueueEnd: '2025-11-12T10:23:45Z',
            MaxWaitSeconds: 600,
            PollIntervalSeconds: 2,
            HistoryAttempts: 1,
            HistoryAttemptLimit: 0,
            HistoryExitReason: 'success',
            ExecutionSuccessDetected: false,
            PostExecutionTimeoutSeconds: 30,
            HistoryPostExecutionTimeoutReached: false,
            SceneRetryBudget: 0,
            GPU: { Name: 'x', Type: 'cuda', Index: 0, VramTotal: 1, VramBeforeMB: 1, VramAfterMB: 1, VramDeltaMB: 0 },
            System: { FallbackNotes: [] },
        };
        const res = validateTelemetry(telemetry);
        expect(res.valid).toBe(false);
        expect(res.errors).toContain('DurationSeconds missing or not a number');
    });

    it('requires ExecutionSuccessAt when ExecutionSuccessDetected=true', () => {
        const telemetry: any = {
            DurationSeconds: 1,
            QueueStart: '2025-11-12T10:23:00Z',
            QueueEnd: '2025-11-12T10:23:01Z',
            MaxWaitSeconds: 600,
            PollIntervalSeconds: 2,
            HistoryAttempts: 1,
            HistoryAttemptLimit: 0,
            HistoryExitReason: 'success',
            ExecutionSuccessDetected: true,
            // ExecutionSuccessAt missing
            PostExecutionTimeoutSeconds: 30,
            HistoryPostExecutionTimeoutReached: false,
            SceneRetryBudget: 0,
            GPU: { Name: 'x', Type: 'cuda', Index: 0, VramTotal: 1, VramBeforeMB: 1, VramAfterMB: 1, VramDeltaMB: 0 },
            System: { FallbackNotes: [] },
        };
        const res = validateTelemetry(telemetry);
        expect(res.valid).toBe(false);
        expect(res.errors.some((e) => e.includes('ExecutionSuccessAt'))).toBe(true);
    });

    it('validates HistoryExitReason enum', () => {
        const telemetry: any = {
            DurationSeconds: 1,
            QueueStart: '2025-11-12T10:23:00Z',
            QueueEnd: '2025-11-12T10:23:01Z',
            MaxWaitSeconds: 600,
            PollIntervalSeconds: 2,
            HistoryAttempts: 1,
            HistoryAttemptLimit: 0,
            HistoryExitReason: 'not-a-real-reason',
            ExecutionSuccessDetected: false,
            PostExecutionTimeoutSeconds: 30,
            HistoryPostExecutionTimeoutReached: false,
            SceneRetryBudget: 0,
            GPU: { Name: 'x', Type: 'cuda', Index: 0, VramTotal: 1, VramBeforeMB: 1, VramAfterMB: 1, VramDeltaMB: 0 },
            System: { FallbackNotes: [] },
        };
        const res = validateTelemetry(telemetry);
        expect(res.valid).toBe(false);
        expect(res.errors.some((e) => e.includes('HistoryExitReason'))).toBe(true);
    });

    it('rejects non-numeric GPU VRAM fields', () => {
        const tele: any = {
            DurationSeconds: 1,
            QueueStart: '2025-11-12T10:23:00Z',
            QueueEnd: '2025-11-12T10:23:01Z',
            MaxWaitSeconds: 600,
            PollIntervalSeconds: 2,
            HistoryAttempts: 1,
            HistoryAttemptLimit: 0,
            HistoryExitReason: 'success',
            ExecutionSuccessDetected: false,
            PostExecutionTimeoutSeconds: 30,
            HistoryPostExecutionTimeoutReached: false,
            SceneRetryBudget: 0,
            GPU: { Name: 'x', Type: 'cuda', Index: 0, VramTotal: 'not-a-number', VramBeforeMB: 'x', VramAfterMB: null, VramDeltaMB: 'NaN' },
            System: { FallbackNotes: [] },
        };
        const res = validateTelemetry(tele);
        expect(res.valid).toBe(false);
        expect(res.errors.some((e) => e.includes('GPU.VramTotal') || e.includes('VramBeforeMB') || e.includes('VramAfterMB'))).toBe(true);
    });

    it('detects inconsistent VramDeltaMB', () => {
        const tele: any = {
            DurationSeconds: 1,
            QueueStart: '2025-11-12T10:23:00Z',
            QueueEnd: '2025-11-12T10:23:01Z',
            MaxWaitSeconds: 600,
            PollIntervalSeconds: 2,
            HistoryAttempts: 1,
            HistoryAttemptLimit: 0,
            HistoryExitReason: 'success',
            ExecutionSuccessDetected: false,
            PostExecutionTimeoutSeconds: 30,
            HistoryPostExecutionTimeoutReached: false,
            SceneRetryBudget: 0,
            GPU: { Name: 'x', Type: 'cuda', Index: 0, VramTotal: 1, VramBeforeMB: 1000, VramAfterMB: 900, VramDeltaMB: -50 },
            System: { FallbackNotes: [] },
        };
        const res = validateTelemetry(tele);
        expect(res.valid).toBe(false);
        expect(res.errors.some((e) => e.includes('VramDeltaMB inconsistent'))).toBe(true);
    });

    it('requires System.FallbackNotes to be an array of strings', () => {
        const tele: any = {
            DurationSeconds: 1,
            QueueStart: '2025-11-12T10:23:00Z',
            QueueEnd: '2025-11-12T10:23:01Z',
            MaxWaitSeconds: 600,
            PollIntervalSeconds: 2,
            HistoryAttempts: 1,
            HistoryAttemptLimit: 0,
            HistoryExitReason: 'success',
            ExecutionSuccessDetected: false,
            PostExecutionTimeoutSeconds: 30,
            HistoryPostExecutionTimeoutReached: false,
            SceneRetryBudget: 0,
            GPU: { Name: 'x', Type: 'cuda', Index: 0, VramTotal: 1, VramBeforeMB: 1, VramAfterMB: 1, VramDeltaMB: 0 },
            System: { FallbackNotes: 'not-an-array' },
        };
        const res = validateTelemetry(tele);
        expect(res.valid).toBe(false);
        expect(res.errors.some((e) => e.includes('System.FallbackNotes'))).toBe(true);
    });
});
