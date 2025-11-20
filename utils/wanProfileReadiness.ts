import { LocalGenerationSettings, WorkflowMapping } from '../types';

export interface ProfileReadiness {
  profileId: string;
  label: string;
  isReady: boolean;
  hasTextMapping: boolean;
  hasKeyframeMapping: boolean;
  missingRequirements: string[];
}

/**
 * Check if a WAN profile has all required mappings to be considered "ready"
 * 
 * wan-t2i (text-to-image): Requires CLIP text mapping for prompts
 * wan-i2v (image-to-video): Requires CLIP text + LoadImage for keyframe_image
 */
export function checkProfileReadiness(
  settings: LocalGenerationSettings,
  profileId: string
): ProfileReadiness {
  const profile = settings.workflowProfiles?.[profileId];
  const label = profile?.label || profileId;
  const missingRequirements: string[] = [];

  if (!profile || !profile.workflowJson) {
    return {
      profileId,
      label,
      isReady: false,
      hasTextMapping: false,
      hasKeyframeMapping: false,
      missingRequirements: ['Workflow not configured']
    };
  }

  const mapping: WorkflowMapping = profile.mapping || {};
  const mappedTypes = new Set(Object.values(mapping));
  
  const hasTextMapping = mappedTypes.has('human_readable_prompt') || mappedTypes.has('full_timeline_json');
  const hasKeyframeMapping = mappedTypes.has('keyframe_image');

  // Profile-specific requirements
  if (!hasTextMapping) {
    missingRequirements.push('CLIP text mapping (for prompts)');
  }

  if (profileId === 'wan-i2v' && !hasKeyframeMapping) {
    missingRequirements.push('LoadImage mapping (for keyframe_image)');
  }

  const isReady = missingRequirements.length === 0;

  return {
    profileId,
    label,
    isReady,
    hasTextMapping,
    hasKeyframeMapping,
    missingRequirements
  };
}

/**
 * Check readiness for all known WAN profiles
 */
export function checkAllProfilesReadiness(settings: LocalGenerationSettings): ProfileReadiness[] {
  const profileIds = ['wan-t2i', 'wan-i2v'];
  return profileIds.map(id => checkProfileReadiness(settings, id));
}
