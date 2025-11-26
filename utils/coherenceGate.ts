import { SceneContinuityData, SceneContinuityScore, Suggestion } from '../types';
import { isFeatureEnabled } from './featureFlags';

export const COHERENCE_THRESHOLD = 0.7;

export interface CoherenceCheckResult {
  passed: boolean;
  score: number;
  threshold: number;
  message: string;
  /** Auto-generated suggestions when score is below threshold */
  suggestions?: Suggestion[];
  /** Flag indicating suggestions should be auto-generated */
  shouldAutoGenerateSuggestions?: boolean;
}

/**
 * Generate default suggestions based on low score components
 */
function generateDefaultSuggestions(
  continuityScore: SceneContinuityScore | undefined,
  sceneId: string
): Suggestion[] {
  if (!continuityScore) return [];
  
  const suggestions: Suggestion[] = [];
  const scores = continuityScore;
  
  // Check visual bible consistency
  if (scores.visualBibleConsistency !== undefined && scores.visualBibleConsistency < 0.7) {
    suggestions.push({
      type: 'UPDATE_SCENE',
      description: 'Improve visual consistency with Story Bible characters and locations',
      reason: `Visual Bible consistency score is ${Math.round(scores.visualBibleConsistency * 100)}%`,
      targetId: sceneId,
      payload: {
        action: 'review_visual_bible',
        priority: 'high',
      }
    });
  }
  
  // Check structural continuity
  if (scores.structuralContinuity !== undefined && scores.structuralContinuity < 0.7) {
    suggestions.push({
      type: 'UPDATE_SHOT',
      description: 'Review shot transitions and visual flow for better structural continuity',
      reason: `Structural continuity score is ${Math.round(scores.structuralContinuity * 100)}%`,
      targetId: sceneId,
      payload: {
        action: 'review_transitions',
        priority: 'medium',
      }
    });
  }
  
  // Check transition quality
  if (scores.transitionQuality !== undefined && scores.transitionQuality < 0.7) {
    suggestions.push({
      type: 'UPDATE_TRANSITION',
      description: 'Improve transition effects between shots for smoother flow',
      reason: `Transition quality score is ${Math.round(scores.transitionQuality * 100)}%`,
      targetId: sceneId,
      payload: {
        action: 'improve_transitions',
        priority: 'medium',
      }
    });
  }
  
  // Check duration consistency
  if (scores.durationConsistency !== undefined && scores.durationConsistency < 0.7) {
    suggestions.push({
      type: 'UPDATE_SHOT',
      description: 'Adjust shot durations for better pacing and rhythm',
      reason: `Duration consistency score is ${Math.round(scores.durationConsistency * 100)}%`,
      targetId: sceneId,
      payload: {
        action: 'adjust_durations',
        priority: 'low',
      }
    });
  }
  
  return suggestions;
}

/**
 * Check if a scene passes the coherence gate threshold
 * A scene must have continuityScore.overallScore >= 0.7 to be marked as final
 * 
 * When autoGenerateSuggestions is enabled (via SceneContinuityData or featureFlags),
 * this will also generate suggestions for improving the score.
 */
export function checkCoherenceGate(
  continuityData: SceneContinuityData | undefined,
  options?: {
    sceneId?: string;
    featureFlags?: Record<string, boolean>;
  }
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
  
  // Determine if we should auto-generate suggestions
  const shouldAutoGenerate = continuityData.autoGenerateSuggestions || 
    isFeatureEnabled(options?.featureFlags, 'coherenceAutoSuggestions');
  
  // Generate suggestions if score is below threshold and feature is enabled
  let suggestions: Suggestion[] | undefined;
  if (!passed && shouldAutoGenerate && options?.sceneId) {
    suggestions = generateDefaultSuggestions(continuityData.continuityScore, options.sceneId);
  }

  return {
    passed,
    score,
    threshold: COHERENCE_THRESHOLD,
    message: passed
      ? `Scene passed coherence gate with score ${(score * 100).toFixed(0)}%`
      : `Scene coherence score (${(score * 100).toFixed(0)}%) is below the required threshold (${(COHERENCE_THRESHOLD * 100).toFixed(0)}%). Please apply suggested refinements and re-review.`,
    suggestions,
    shouldAutoGenerateSuggestions: shouldAutoGenerate && !passed,
  };
}
