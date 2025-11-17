import { describe, it, expect } from 'vitest';
import { validateWorkflowAndMappings } from '../comfyUIService';
import { createValidTestSettings } from './fixtures';

const getSettings = () => createValidTestSettings();

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
});
