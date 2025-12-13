import { LocalGenerationSettings, WorkflowMapping } from '../types';

export interface ProfileReadiness {
  profileId: string;
  label: string;
  isReady: boolean;
  hasTextMapping: boolean;
  hasKeyframeMapping: boolean;
  hasStartEndMapping: boolean;
  missingRequirements: string[];
  workflowSource: 'embedded' | 'file' | 'none';
}

/**
 * Determine the workflow source type for a profile.
 * - 'embedded': Has workflowJson with content
 * - 'file': Has workflowFile reference (legacy, but should work if file exists)
 * - 'none': No workflow configured
 */
function getWorkflowSource(profile: { workflowJson?: string; workflowFile?: string }): 'embedded' | 'file' | 'none' {
  if (profile.workflowJson && profile.workflowJson.trim().length > 10) {
    return 'embedded';
  }
  if (profile.workflowFile && profile.workflowFile.trim().length > 0) {
    return 'file';
  }
  return 'none';
}

/**
 * Check if a WAN profile has all required mappings to be considered "ready"
 * 
 * Profile requirements:
 * - wan-t2i, flux-t2i (text-to-image): Requires CLIP text mapping for prompts
 * - wan-i2v (image-to-video): Requires CLIP text + LoadImage for keyframe_image
 * - wan-flf2v, wan-fun-inpaint (bookend): Requires CLIP text + start_image + end_image
 * - wan-fun-control: Requires CLIP text + ref_image + control_video
 * - video-upscaler* (variants): Requires input_video mapping
 * - rife-interpolation* (variants): Requires input_video mapping
 */
export function checkProfileReadiness(
  settings: LocalGenerationSettings,
  profileId: string
): ProfileReadiness {
  const profile = settings.workflowProfiles?.[profileId];
  const label = profile?.label || profileId;
  const missingRequirements: string[] = [];

  if (!profile) {
    return {
      profileId,
      label,
      isReady: false,
      hasTextMapping: false,
      hasKeyframeMapping: false,
      hasStartEndMapping: false,
      missingRequirements: ['Profile not found'],
      workflowSource: 'none'
    };
  }

  const workflowSource = getWorkflowSource(profile);
  
  if (workflowSource === 'none') {
    return {
      profileId,
      label,
      isReady: false,
      hasTextMapping: false,
      hasKeyframeMapping: false,
      hasStartEndMapping: false,
      missingRequirements: ['Workflow not configured'],
      workflowSource: 'none'
    };
  }

  const mapping: WorkflowMapping = profile.mapping || {};
  const mappedTypes = new Set(Object.values(mapping));
  
  const hasTextMapping = mappedTypes.has('human_readable_prompt') || mappedTypes.has('full_timeline_json');
  const hasKeyframeMapping = mappedTypes.has('keyframe_image');
  const hasStartEndMapping = mappedTypes.has('start_image') && mappedTypes.has('end_image');
  const hasRefImage = mappedTypes.has('ref_image');
  const hasControlVideo = mappedTypes.has('control_video');
  const hasInputVideo = mappedTypes.has('input_video');

  // Profile-specific requirements
  const isImageToVideoProfile = profileId === 'wan-i2v';
  const isBookendProfile = profileId === 'wan-flf2v' || profileId === 'wan-fun-inpaint';
  const isUpscalerProfile = profileId.startsWith('video-upscaler');
  const isInterpolationProfile = profileId.startsWith('rife-interpolation');
  // Only the known WAN control profile requires ref/control mappings.
  // Avoid broad matching (e.g. "*-control") so postproc variant IDs don't
  // accidentally get treated as control profiles.
  const isControlProfile = profileId === 'wan-fun-control';
  const isInputVideoOnlyProfile = isUpscalerProfile || isInterpolationProfile;

  // Always require text mapping for generation profiles (not upscaler)
  if (!isInputVideoOnlyProfile && !hasTextMapping) {
    missingRequirements.push('CLIP text mapping (for prompts)');
  }

  // Image-to-video profiles need keyframe
  if (isImageToVideoProfile && !hasKeyframeMapping) {
    missingRequirements.push('LoadImage mapping (for keyframe_image)');
  }

  // Bookend profiles need start + end images
  if (isBookendProfile && !hasStartEndMapping) {
    if (!mappedTypes.has('start_image')) {
      missingRequirements.push('LoadImage mapping (for start_image)');
    }
    if (!mappedTypes.has('end_image')) {
      missingRequirements.push('LoadImage mapping (for end_image)');
    }
  }

  // Control profiles need ref_image + control_video
  if (isControlProfile) {
    if (!hasRefImage) {
      missingRequirements.push('LoadImage mapping (for ref_image)');
    }
    if (!hasControlVideo) {
      missingRequirements.push('LoadVideo mapping (for control_video)');
    }
  }

  // Upscaler profiles need input_video
  if (isInputVideoOnlyProfile && !hasInputVideo) {
    missingRequirements.push('LoadVideo mapping (for input_video)');
  }

  const isReady = missingRequirements.length === 0;

  return {
    profileId,
    label,
    isReady,
    hasTextMapping,
    hasKeyframeMapping,
    hasStartEndMapping,
    missingRequirements,
    workflowSource
  };
}

/**
 * Check readiness for all known WAN profiles
 */
export function checkAllProfilesReadiness(settings: LocalGenerationSettings): ProfileReadiness[] {
  const baseGenerationProfileIds = [
    'wan-t2i',
    'wan-i2v',
    'wan-flf2v',
    'wan-fun-inpaint',
    'wan-fun-control',
    'flux-t2i',
  ];

  // Post-processing profiles may have multiple variants (e.g. "video-upscaler-v2", "rife-interpolation-fast").
  // Prefer listing configured variants to avoid showing a misleading "missing" base profile.
  const configuredProfileIds = Object.keys(settings.workflowProfiles || {});
  const configuredUpscalerIds = configuredProfileIds.filter((id) => id.startsWith('video-upscaler'));
  const configuredInterpolationIds = configuredProfileIds.filter((id) => id.startsWith('rife-interpolation'));

  const upscalerProfileIds = configuredUpscalerIds.length > 0 ? configuredUpscalerIds : ['video-upscaler'];
  const interpolationProfileIds = configuredInterpolationIds.length > 0 ? configuredInterpolationIds : ['rife-interpolation'];

  const profileIds = Array.from(
    new Set([
      ...baseGenerationProfileIds,
      ...upscalerProfileIds,
      ...interpolationProfileIds,
    ])
  );

  return profileIds.map((id) => checkProfileReadiness(settings, id));
}

/**
 * Convenience helper: whether the current settings are ready to run any configured upscaler workflow.
 * Includes variant IDs (e.g. "video-upscaler-v2") and checks mapping readiness.
 */
export function isUpscalingReady(settings: LocalGenerationSettings): boolean {
  const flags = settings.featureFlags;
  if (!flags?.videoUpscaling) return false;
  if (!settings.comfyUIUrl) return false;

  return checkAllProfilesReadiness(settings).some(
    (p) => p.profileId.startsWith('video-upscaler') && p.isReady
  );
}

/**
 * Convenience helper: whether the current settings are ready to run any configured interpolation workflow.
 * Includes variant IDs (e.g. "rife-interpolation-fast") and checks mapping readiness.
 */
export function isInterpolationReady(settings: LocalGenerationSettings): boolean {
  const flags = settings.featureFlags;
  if (!flags?.frameInterpolationEnabled) return false;
  if (!settings.comfyUIUrl) return false;

  return checkAllProfilesReadiness(settings).some(
    (p) => p.profileId.startsWith('rife-interpolation') && p.isReady
  );
}
