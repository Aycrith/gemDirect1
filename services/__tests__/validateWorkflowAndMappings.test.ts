import { describe, it, expect } from 'vitest';
import { validateWorkflowAndMappings } from '../comfyUIService';
import { createValidTestSettings } from './fixtures';
import type { LocalGenerationSettings, WorkflowProfile } from '../../types';

const getSettings = () => createValidTestSettings();

/**
 * Creates settings with empty root workflowJson but populated workflow profiles.
 * This simulates the modern approach where workflows are stored in profiles.
 */
const createProfileBasedSettings = (): LocalGenerationSettings => {
    const validSettings = createValidTestSettings();
    const workflowJson = validSettings.workflowJson;
    const mapping = validSettings.mapping;
    
    return {
        ...validSettings,
        workflowJson: '', // Empty root - profiles contain the actual workflow
        mapping: {}, // Empty root mapping
        workflowProfiles: {
            'wan-i2v': {
                id: 'wan-i2v',
                label: 'WAN I2V',
                workflowJson,
                mapping,
            } as WorkflowProfile,
            'wan-t2i': {
                id: 'wan-t2i',
                label: 'WAN T2I',
                workflowJson,
                mapping: {
                    'positive_clip:text': 'human_readable_prompt',
                    'negative_clip:text': 'negative_prompt',
                    'timeline_json:text': 'full_timeline_json',
                    'metadata_writer:text': 'full_timeline_json',
                },
            } as WorkflowProfile,
        },
    };
};

describe('validateWorkflowAndMappings', () => {
  it('passes when required mappings exist', () => {
    const settings = getSettings();
    expect(() => validateWorkflowAndMappings(settings)).not.toThrow();
  });

  it('throws when the main text prompt mapping is missing', () => {
    const settings = getSettings();
    delete settings.mapping['positive_clip:text'];
    delete settings.mapping['negative_clip:text'];
    delete settings.mapping['timeline_json:text'];
    delete settings.mapping['metadata_writer:text'];

    expect(() => validateWorkflowAndMappings(settings)).toThrow(
      /missing a mapping for the main text prompt/i
    );
  });

  it('throws when the keyframe image mapping is missing', () => {
    const settings = getSettings();
    delete settings.mapping['keyframe_loader:image'];

    expect(() => validateWorkflowAndMappings(settings)).toThrow(
      /missing a mapping for the keyframe image/i
    );
  });

  it('throws when CLIPTextEncode node is missing', () => {
    const settings = getSettings();
    const workflow = JSON.parse(settings.workflowJson);
    // Remove CLIP nodes
    delete workflow.prompt.positive_clip;
    delete workflow.prompt.negative_clip;
    settings.workflowJson = JSON.stringify(workflow);

    expect(() => validateWorkflowAndMappings(settings)).toThrow(
      /requires at least one CLIPTextEncode node/i
    );
  });

  it('throws when LoadImage node is missing', () => {
    const settings = getSettings();
    const workflow = JSON.parse(settings.workflowJson);
    // Remove LoadImage node
    delete workflow.prompt.keyframe_loader;
    settings.workflowJson = JSON.stringify(workflow);

    expect(() => validateWorkflowAndMappings(settings)).toThrow(
      /requires at least one LoadImage node/i
    );
  });

  it('throws when a mapped node no longer exists', () => {
    const settings = getSettings();
    settings.mapping['ghost_node:text'] = 'human_readable_prompt';

    expect(() => validateWorkflowAndMappings(settings)).toThrow(
      /Mapped node 'Node ghost_node' no longer exists/i
    );
  });

  it('throws when a mapped input is not available on the node', () => {
    const settings = getSettings();
    settings.mapping['positive_clip:missing_input'] = 'negative_prompt';

    expect(() => validateWorkflowAndMappings(settings)).toThrow(
      /Mapped input 'missing_input' not found on node 'CLIPTextEncode - Positive Prompt Layer'/i
    );
  });

  it('wan-t2i: does not require keyframe image mapping or LoadImage node', () => {
    const settings = getSettings();
    // Remove keyframe mapping and node to simulate t2i workflow
    delete (settings as any).mapping['keyframe_loader:image'];
    const workflow = JSON.parse(settings.workflowJson);
    delete workflow.prompt.keyframe_loader;
    settings.workflowJson = JSON.stringify(workflow);

    expect(() => validateWorkflowAndMappings(settings, 'wan-t2i')).not.toThrow();
  });

  it('wan-i2v: requires keyframe image mapping and LoadImage node', () => {
    const settings = getSettings();
    // Ensure removing mapping triggers error for i2v
    delete (settings as any).mapping['keyframe_loader:image'];

    expect(() => validateWorkflowAndMappings(settings, 'wan-i2v')).toThrow(/keyframe image/i);

    // Also ensure missing LoadImage node triggers error for i2v
    const workflow = JSON.parse(settings.workflowJson);
    delete workflow.prompt.keyframe_loader;
    settings.workflowJson = JSON.stringify(workflow);

    expect(() => validateWorkflowAndMappings(settings, 'wan-i2v')).toThrow(/LoadImage node/i);
  });
});

describe('validateWorkflowAndMappings - Profile Resolution', () => {
  it('resolves workflow from profile when root workflowJson is empty', () => {
    const settings = createProfileBasedSettings();
    // Root workflowJson is empty, should resolve from wan-i2v profile
    expect(() => validateWorkflowAndMappings(settings, 'wan-i2v')).not.toThrow();
  });

  it('resolves workflow from wan-t2i profile correctly', () => {
    const settings = createProfileBasedSettings();
    // Should resolve from wan-t2i profile (doesn't require keyframe image)
    expect(() => validateWorkflowAndMappings(settings, 'wan-t2i')).not.toThrow();
  });

  it('throws when requested profile does not exist', () => {
    const settings = createProfileBasedSettings();
    // Non-existent profile should trigger "No workflow synced" error
    expect(() => validateWorkflowAndMappings(settings, 'flux-t2i')).toThrow(
      /No workflow has been synced from the server/i
    );
  });

  it('throws when workflowProfiles is undefined and root workflowJson is empty', () => {
    const settings: LocalGenerationSettings = {
      comfyUIUrl: 'http://127.0.0.1:8188',
      comfyUIClientId: 'test-client',
      workflowJson: '',
      mapping: {},
    };
    expect(() => validateWorkflowAndMappings(settings, 'wan-i2v')).toThrow(
      /No workflow has been synced from the server/i
    );
  });

  it('prefers root workflowJson when both root and profile exist', () => {
    const settings = getSettings();
    // Add a profile with different (invalid) workflow
    settings.workflowProfiles = {
      'wan-i2v': {
        id: 'wan-i2v',
        label: 'WAN I2V',
        workflowJson: '{}', // Invalid empty workflow
        mapping: {},
      } as WorkflowProfile,
    };
    // Should use root workflowJson (valid), not the profile (invalid)
    expect(() => validateWorkflowAndMappings(settings, 'wan-i2v')).not.toThrow();
  });

  it('uses profile mapping when resolving from profile', () => {
    const settings = createProfileBasedSettings();
    // Remove the keyframe mapping from the profile
    const profile = settings.workflowProfiles!['wan-i2v']!;
    delete (profile.mapping as Record<string, unknown>)['keyframe_loader:image'];
    
    // Should throw because profile mapping is missing keyframe_image
    expect(() => validateWorkflowAndMappings(settings, 'wan-i2v')).toThrow(
      /missing a mapping for the keyframe image/i
    );
  });

  it('validates correct profile based on profileId parameter', () => {
    const settings = createProfileBasedSettings();
    
    // wan-t2i profile doesn't have keyframe_image mapping - should pass for t2i
    expect(() => validateWorkflowAndMappings(settings, 'wan-t2i')).not.toThrow();
    
    // wan-i2v profile has keyframe_image mapping - should pass for i2v
    expect(() => validateWorkflowAndMappings(settings, 'wan-i2v')).not.toThrow();
  });

  it('defaults to wan-i2v profile when profileId is not specified', () => {
    const settings = createProfileBasedSettings();
    // Remove keyframe mapping from wan-i2v profile only
    const i2vProfile = settings.workflowProfiles!['wan-i2v']!;
    delete (i2vProfile.mapping as Record<string, unknown>)['keyframe_loader:image'];
    
    // Default profile is wan-i2v, which now lacks keyframe_image
    expect(() => validateWorkflowAndMappings(settings)).toThrow(
      /missing a mapping for the keyframe image/i
    );
  });
});
