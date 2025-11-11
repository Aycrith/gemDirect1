import fs from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { generateVideoFromShot } from '../services/comfyUIService';
import type { CreativeEnhancers, LocalGenerationSettings, Shot } from '../types';
import workflow from '../workflows/text-to-video.json' assert { type: 'json' };

(globalThis as any).WebSocket = WebSocket;

const settings: LocalGenerationSettings = {
    comfyUIUrl: 'http://127.0.0.1:8188',
    comfyUIClientId: 'queue-real-shot',
    workflowJson: JSON.stringify(workflow),
    mapping: {
        '3:text': 'human_readable_prompt',
        '4:text': 'negative_prompt',
        '2:image': 'keyframe_image',
    },
};

const shot: Shot = {
    id: 'auto-shot',
    description: 'A cinematic crane shot traveling through a luminous bioluminescent forest',
};

const enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> = {
    framing: ['overhead'],
    movement: ['tracking'],
    lighting: ['neon glow', 'mist'],
    mood: ['ethereal'],
};

const directorsVision = 'Sweeping wide angle with deep contrast and vibrant reflections.';

const keyframePath = path.resolve('sample_frame_start.png');

async function readKeyframe(): Promise<string> {
    const buffer = await fs.readFile(keyframePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function main() {
    try {
        const keyframeImage = await readKeyframe();
        const result = await generateVideoFromShot(
            settings,
            shot,
            enhancers,
            directorsVision,
            keyframeImage
        );
        console.log('Real shot generation completed:');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Real shot generation failed:', error);
        process.exit(1);
    }
}

main();
