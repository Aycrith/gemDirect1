import type { LocalGenerationSettings, WorkflowMapping } from '../../types';

const createWorkflowNodes = () => ({
    positive_clip: {
        _meta: { title: 'CLIPTextEncode - Positive Prompt Layer' },
        class_type: 'CLIPTextEncode',
        inputs: { text: '' },
    },
    negative_clip: {
        _meta: { title: 'CLIPTextEncode - Negative Prompt Layer' },
        class_type: 'CLIPTextEncode',
        inputs: { text: '' },
    },
    timeline_json: {
        _meta: { title: 'LoadText - Timeline JSON' },
        class_type: 'LoadText',
        inputs: { text: '' },
    },
    keyframe_loader: {
        _meta: { title: 'LoadImage - Keyframe' },
        class_type: 'LoadImage',
        inputs: { image: '' },
    },
    metadata_writer: {
        _meta: { title: 'LoadText - Timeline Metadata' },
        class_type: 'LoadText',
        inputs: { text: '' },
    },
    audio_descriptor: {
        _meta: { title: 'LoadText - Audio Descriptor' },
        class_type: 'LoadText',
        inputs: { text: '' },
    },
});

const defaultMapping: WorkflowMapping = {
    'positive_clip:text': 'human_readable_prompt',
    'negative_clip:text': 'negative_prompt',
    'timeline_json:text': 'full_timeline_json',
    'keyframe_loader:image': 'keyframe_image',
    'metadata_writer:text': 'full_timeline_json',
    'audio_descriptor:text': 'none',
};

const buildSettings = (workflow: Record<string, unknown>, mapping: WorkflowMapping) => ({
    comfyUIUrl: 'http://127.0.0.1:8188',
    comfyUIClientId: 'test-client',
    workflowJson: JSON.stringify({ prompt: workflow }),
    mapping: { ...mapping },
} satisfies LocalGenerationSettings);

export const createValidTestWorkflow = () => createWorkflowNodes();

export const createValidTestSettings = (): LocalGenerationSettings =>
    buildSettings(createWorkflowNodes(), defaultMapping);

export const createWorkflowMissingNodeSettings = (missingNodeKey: string): LocalGenerationSettings => {
    const workflow = createWorkflowNodes();
    delete workflow[missingNodeKey as keyof typeof workflow];
    return buildSettings(workflow, defaultMapping);
};

export const createWorkflowMissingInputSettings = (): LocalGenerationSettings => {
    const workflow = createWorkflowNodes();
    const node = workflow.positive_clip;
    delete node.inputs.text;
    return buildSettings(workflow, defaultMapping);
};


export const createInvalidMappingSettings = (): LocalGenerationSettings =>
    buildSettings(createWorkflowNodes(), {
        ...defaultMapping,
        'positive_clip:nonexistent': 'human_readable_prompt',
    });

export const createWorkflowWithTransitionMetadataSettings = (): LocalGenerationSettings => {
    const workflow = createWorkflowNodes();
    workflow.timeline_json.inputs.text = JSON.stringify({
        transitions: ['Cut', 'Fade'],
        extra_context: 'metadata for transitions',
        audio: { descriptors: ['synth swell', 'low rumble'] },
    });
    return buildSettings(workflow, defaultMapping);
};

export const createWorkflowWithAudioDescriptorSettings = (): LocalGenerationSettings => {
    const workflow = createWorkflowNodes();
    workflow.audio_descriptor.inputs.text = 'ambient drone underscore';
    return buildSettings(workflow, defaultMapping);
};
