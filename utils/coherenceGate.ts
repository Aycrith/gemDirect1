import { SceneContinuityData, SceneContinuityScore } from '../types';

export const COHERENCE_THRESHOLD = 0.7;

export interface CoherenceCheckResult {
  passed: boolean;
  score: number;
  threshold: number;
  message: string;
}

/**
 * Check if a scene passes the coherence gate threshold
 * A scene must have continuityScore.overallScore >= 0.7 to be marked as final
 */
export function checkCoherenceGate(
  continuityData: SceneContinuityData | undefined
): CoherenceCheckResult {
  if (!continuityData) {
    return {
      passed: false,
      score: 0,
      threshold: COHERENCE_THRESHOLD,
      message: 'No continuity review has been performed for this scene.'
    };
  }

  if (continuityData.status === 'error') {
    return {
      passed: false,
      score: 0,
      threshold: COHERENCE_THRESHOLD,
      message: `Continuity analysis failed: ${continuityData.error || 'Unknown error'}`
    };
  }

  if (!continuityData.continuityScore) {
    return {
      passed: false,
      score: 0,
      threshold: COHERENCE_THRESHOLD,
      message: 'Continuity score not yet computed. Please complete the continuity review.'
    };
  }

  const score = continuityData.continuityScore.overallScore;
  const passed = score >= COHERENCE_THRESHOLD;

  return {
    passed,
    score,
    threshold: COHERENCE_THRESHOLD,
    message: passed
      ? `Scene passed coherence gate with score ${(score * 100).toFixed(0)}%`
      : `Scene coherence score (${(score * 100).toFixed(0)}%) is below the required threshold (${(COHERENCE_THRESHOLD * 100).toFixed(0)}%). Please apply suggested refinements and re-review.`
  };
}
