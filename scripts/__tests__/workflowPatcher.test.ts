import { describe, it, expect } from 'vitest';

import { patchWorkflowPlaceholders } from '../workflowPatcher';

describe('workflow patcher', () => {
    const baseWorkflow = {
        '2': {
            inputs: { image: '__KEYFRAME_IMAGE__' },
            widgets_values: ['__KEYFRAME_IMAGE__'],
        },
        '7': {
            inputs: { filename_prefix: '__SCENE_PREFIX__' },
            _meta: {
                scene_prompt: '__SCENE_PROMPT__',
                negative_prompt: '__NEGATIVE_PROMPT__',
            },
        },
    };

    it('replaces keyframe and scene metadata placeholders', () => {
        const patched = patchWorkflowPlaceholders(baseWorkflow, {
            keyframeName: 'scene-001_keyframe.png',
            scenePrefix: 'gemdirect1_scene-001',
            prompt: 'a test prompt',
            negativePrompt: 'no bad stuff',
        });

        expect(patched['2'].inputs.image).toBe('scene-001_keyframe.png');
        expect(patched['2'].widgets_values[0]).toBe('scene-001_keyframe.png');
        expect(patched['7'].inputs.filename_prefix).toBe('gemdirect1_scene-001');
        expect(patched['7']._meta.scene_prompt).toBe('a test prompt');
        expect(patched['7']._meta.negative_prompt).toBe('no bad stuff');
    });

    it('does not mutate the original workflow template', () => {
        const patched = patchWorkflowPlaceholders(baseWorkflow, {
            keyframeName: 'scene-002_keyframe.png',
            scenePrefix: 'gemdirect1_scene-002',
            prompt: 'new prompt',
            negativePrompt: 'new neg',
        });
        expect(baseWorkflow['2'].inputs.image).toBe('__KEYFRAME_IMAGE__');
        expect(patched['2'].inputs.image).toBe('scene-002_keyframe.png');
    });

    it('handles templates missing optional nodes without throwing', () => {
        const minimal = { '5': { inputs: {} } };
        expect(() =>
            patchWorkflowPlaceholders(minimal as any, {
                keyframeName: 'simple.png',
                scenePrefix: 'demo',
                prompt: 'prompt',
                negativePrompt: 'neg',
            }),
        ).not.toThrow();
    });
});
