/**
 * Continuity Prerequisites Service
 * 
 * Phase 2.2: Validates that all prerequisites are met before accessing
 * the Continuity Review page. This prevents the page from instantly
 * redirecting when required data is missing.
 * 
 * Prerequisites checked:
 * 1. At least one scene exists
 * 2. All scenes have timeline data with at least one shot
 * 3. All scenes have generated keyframe images
 * 4. (Optional) Scenes have enhancers defined
 */

import { Scene, KeyframeData } from '../types';

export interface PrerequisiteItem {
  type: 'scenes' | 'timeline' | 'keyframe' | 'enhancer';
  sceneId?: string;
  sceneTitle?: string;
  message: string;
  severity: 'error' | 'warning';
  actionLabel?: string;
  actionRoute?: string;
}

export interface ContinuityPrerequisites {
  /** Whether all required prerequisites are met */
  canProceed: boolean;
  
  /** Whether at least one scene exists */
  hasScenes: boolean;
  
  /** Whether all scenes have timeline data with shots */
  hasTimelines: boolean;
  
  /** Whether all scenes have keyframe images */
  hasKeyframes: boolean;
  
  /** Whether all scenes have enhancers (optional) */
  hasEnhancers: boolean;
  
  /** List of missing items preventing access */
  missingItems: PrerequisiteItem[];
  
  /** Summary counts for UI display */
  summary: {
    totalScenes: number;
    scenesWithTimelines: number;
    scenesWithKeyframes: number;
    scenesWithEnhancers: number;
  };
}

/**
 * Validates all prerequisites for accessing the Continuity Review page
 * 
 * @param scenes - Array of scenes in the project
 * @param generatedImages - Map of scene IDs to their keyframe data
 * @returns Validation result with detailed breakdown of what's missing
 */
export function validateContinuityPrerequisites(
  scenes: Scene[],
  generatedImages: Record<string, KeyframeData>
): ContinuityPrerequisites {
  const missingItems: PrerequisiteItem[] = [];
  
  // Check: At least one scene exists
  if (scenes.length === 0) {
    missingItems.push({
      type: 'scenes',
      message: 'No scenes have been generated. Create scenes from your Story Bible first.',
      severity: 'error',
      actionLabel: 'Go to Director Mode',
      actionRoute: 'director'
    });
  }
  
  // Track counts for summary
  let scenesWithTimelines = 0;
  let scenesWithKeyframes = 0;
  let scenesWithEnhancers = 0;
  
  // Check each scene for required data
  scenes.forEach((scene, idx) => {
    const sceneNum = idx + 1;
    
    // Check: Timeline with shots
    const hasValidTimeline = scene.timeline && 
                            scene.timeline.shots && 
                            scene.timeline.shots.length > 0;
    
    if (!hasValidTimeline) {
      missingItems.push({
        type: 'timeline',
        sceneId: scene.id,
        sceneTitle: scene.title,
        message: `Scene ${sceneNum}: "${scene.title}" has no shots defined`,
        severity: 'error',
        actionLabel: 'Add shots to timeline',
        actionRoute: 'director'
      });
    } else {
      scenesWithTimelines++;
    }
    
    // Check: Keyframe image
    const hasKeyframe = !!generatedImages[scene.id];
    
    if (!hasKeyframe) {
      missingItems.push({
        type: 'keyframe',
        sceneId: scene.id,
        sceneTitle: scene.title,
        message: `Scene ${sceneNum}: "${scene.title}" has no keyframe image generated`,
        severity: 'warning',
        actionLabel: 'Generate keyframe',
        actionRoute: 'director'
      });
    } else {
      scenesWithKeyframes++;
    }
    
    // Check: Enhancers (optional - only warn)
    const hasEnhancers = scene.timeline?.shotEnhancers && 
                        Object.keys(scene.timeline.shotEnhancers).length > 0 &&
                        scene.timeline.shots?.some(shot => {
                          const enhancerObj = scene.timeline.shotEnhancers[shot.id];
                          if (!enhancerObj) return false;
                          // Check if any enhancer field has a non-empty array value
                          return Object.keys(enhancerObj).some(key => {
                            const val = (enhancerObj as Record<string, unknown>)[key];
                            // Enhancer values are string arrays (framing, movement, etc.)
                            return Array.isArray(val) && val.length > 0;
                          });
                        });
    
    if (!hasEnhancers && hasValidTimeline) {
      // This is a soft warning, not blocking
      scenesWithEnhancers += 0;
    } else if (hasEnhancers) {
      scenesWithEnhancers++;
    }
  });
  
  // Compute overall status
  const hasScenes = scenes.length > 0;
  const hasTimelines = scenesWithTimelines === scenes.length;
  const hasKeyframes = scenesWithKeyframes === scenes.length;
  const hasEnhancers = scenesWithEnhancers === scenes.length;
  
  // Can proceed if we have scenes with timelines
  // Keyframes are recommended but not strictly required
  const errorCount = missingItems.filter(item => item.severity === 'error').length;
  const canProceed = hasScenes && hasTimelines && errorCount === 0;
  
  console.log('[ContinuityPrerequisites] Validation result:', {
    canProceed,
    hasScenes,
    hasTimelines,
    hasKeyframes,
    hasEnhancers,
    errorCount,
    warningCount: missingItems.filter(item => item.severity === 'warning').length
  });
  
  return {
    canProceed,
    hasScenes,
    hasTimelines,
    hasKeyframes,
    hasEnhancers,
    missingItems,
    summary: {
      totalScenes: scenes.length,
      scenesWithTimelines,
      scenesWithKeyframes,
      scenesWithEnhancers
    }
  };
}

/**
 * Returns a human-readable summary of what's missing
 */
export function getPrerequisiteSummary(prerequisites: ContinuityPrerequisites): string {
  if (prerequisites.canProceed) {
    return 'All prerequisites met. Ready for Continuity Review.';
  }
  
  const errors = prerequisites.missingItems.filter(item => item.severity === 'error');
  const warnings = prerequisites.missingItems.filter(item => item.severity === 'warning');
  
  const parts: string[] = [];
  
  if (errors.length > 0) {
    parts.push(`${errors.length} required item(s) missing`);
  }
  
  if (warnings.length > 0) {
    parts.push(`${warnings.length} recommended item(s) missing`);
  }
  
  return parts.join(', ') + '. Complete these in Director Mode before continuing.';
}

/**
 * Groups missing items by scene for easier UI display
 */
export function groupMissingItemsByScene(
  prerequisites: ContinuityPrerequisites
): Record<string, PrerequisiteItem[]> {
  const grouped: Record<string, PrerequisiteItem[]> = {
    general: []
  };
  
  prerequisites.missingItems.forEach(item => {
    if (item.sceneId) {
      if (!grouped[item.sceneId]) {
        grouped[item.sceneId] = [];
      }
      grouped[item.sceneId]!.push(item);
    } else {
      grouped['general']!.push(item);
    }
  });
  
  return grouped;
}
