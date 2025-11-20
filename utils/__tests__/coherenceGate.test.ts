import { describe, it, expect } from 'vitest';
import { checkCoherenceGate, COHERENCE_THRESHOLD } from '../coherenceGate';
import type { SceneContinuityData } from '../../types';

describe('coherenceGate', () => {
  describe('checkCoherenceGate', () => {
    it('should fail when continuityData is undefined', () => {
      const result = checkCoherenceGate(undefined);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.threshold).toBe(COHERENCE_THRESHOLD);
      expect(result.message).toContain('No continuity review');
    });

    it('should fail when continuityData status is error', () => {
      const data: SceneContinuityData = {
        status: 'error',
        error: 'Test error message'
      };
      const result = checkCoherenceGate(data);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.message).toContain('Continuity analysis failed');
      expect(result.message).toContain('Test error message');
    });

    it('should fail when continuityScore is missing', () => {
      const data: SceneContinuityData = {
        status: 'complete'
      };
      const result = checkCoherenceGate(data);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.message).toContain('Continuity score not yet computed');
    });

    it('should fail when overallScore is below threshold (0.5 < 0.7)', () => {
      const data: SceneContinuityData = {
        status: 'complete',
        continuityScore: {
          visualBibleConsistency: 0.5,
          styleBoardReuseCount: 0,
          structuralContinuity: 0.6,
          transitionQuality: 0.4,
          durationConsistency: 0.5,
          overallScore: 0.5
        }
      };
      const result = checkCoherenceGate(data);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.5);
      expect(result.message).toContain('50%');
      expect(result.message).toContain('70%');
      expect(result.message).toContain('below the required threshold');
    });

    it('should pass when overallScore equals threshold (0.7)', () => {
      const data: SceneContinuityData = {
        status: 'complete',
        continuityScore: {
          visualBibleConsistency: 0.7,
          styleBoardReuseCount: 1,
          structuralContinuity: 0.7,
          transitionQuality: 0.7,
          durationConsistency: 0.7,
          overallScore: 0.7
        }
      };
      const result = checkCoherenceGate(data);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.7);
      expect(result.message).toContain('passed coherence gate');
      expect(result.message).toContain('70%');
    });

    it('should pass when overallScore exceeds threshold (0.85 > 0.7)', () => {
      const data: SceneContinuityData = {
        status: 'complete',
        continuityScore: {
          visualBibleConsistency: 0.85,
          styleBoardReuseCount: 2,
          structuralContinuity: 0.9,
          transitionQuality: 0.8,
          durationConsistency: 0.82,
          overallScore: 0.85
        }
      };
      const result = checkCoherenceGate(data);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.85);
      expect(result.message).toContain('passed coherence gate');
      expect(result.message).toContain('85%');
    });

    it('should handle edge case at 0.69 (just below threshold)', () => {
      const data: SceneContinuityData = {
        status: 'complete',
        continuityScore: {
          visualBibleConsistency: 0.69,
          styleBoardReuseCount: 1,
          overallScore: 0.69
        }
      };
      const result = checkCoherenceGate(data);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.69);
    });

    it('should handle edge case at 0.70001 (just above threshold)', () => {
      const data: SceneContinuityData = {
        status: 'complete',
        continuityScore: {
          visualBibleConsistency: 0.70001,
          styleBoardReuseCount: 1,
          overallScore: 0.70001
        }
      };
      const result = checkCoherenceGate(data);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.70001);
    });
  });
});
