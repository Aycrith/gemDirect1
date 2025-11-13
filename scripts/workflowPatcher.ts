export interface WorkflowPatchOptions {
    keyframeName: string;
    scenePrefix: string;
    prompt: string;
    negativePrompt: string;
}

const deepClone = (value: any) => JSON.parse(JSON.stringify(value));

export const patchWorkflowPlaceholders = (
    workflowTemplate: Record<string, any>,
    options: WorkflowPatchOptions,
) => {
    const cloned = deepClone(workflowTemplate);

    if (cloned['2']) {
        cloned['2'].inputs.image = options.keyframeName;
        if (Array.isArray(cloned['2'].widgets_values) && cloned['2'].widgets_values.length > 0) {
            cloned['2'].widgets_values[0] = options.keyframeName;
        }
    }

    if (cloned['7']) {
        cloned['7'].inputs = cloned['7'].inputs || {};
        cloned['7'].inputs.filename_prefix = options.scenePrefix;
        if (!cloned['7']._meta) {
            cloned['7']._meta = {};
        }
        cloned['7']._meta.scene_prompt = options.prompt;
        cloned['7']._meta.negative_prompt = options.negativePrompt;
    }

    return cloned;
};
