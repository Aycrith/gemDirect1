import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { generateVideoFromShot } from '../services/comfyUIService.ts';
import type { CreativeEnhancers, LocalGenerationSettings, Shot } from '../types.ts';

(globalThis as any).WebSocket = WebSocket;

// Resolve project root from this script's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load workflow JSON by reading the file directly
const workflowJsonPath = path.join(projectRoot, 'workflows', 'text-to-video.json');
const workflowJsonContent = await fs.readFile(workflowJsonPath, 'utf-8');
const workflowJson = JSON.parse(workflowJsonContent);

const modelsRoot = path.resolve('C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\models');
const checkpointsDir = path.join(modelsRoot, 'checkpoints', 'SVD');
const keyframePath = path.join(projectRoot, 'sample_frame_start.png');

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

const directorsVision = 'Sweeping wide angles with deep reflections and cinematic depth.';

const REQUIRED_FRAME_FILTER = 'gemdirect1_shot';

async function findModelFile(dir: string, pattern: RegExp): Promise<string> {
    try {
        const entries = await fs.readdir(dir);
        const match = entries.find((entry) => pattern.test(entry));
        if (!match) {
            throw new Error(`No model matching ${pattern} found in ${dir}`);
        }
        return match;
    } catch (error) {
        throw new Error(`Failed to find model in ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

const buildSettings = async (): Promise<LocalGenerationSettings> => {
    const svdFilename = await findModelFile(checkpointsDir, /^svd.*\.safetensors$/i);
    console.log(`Using SVD checkpoint: ${svdFilename}`);

    const workflow = JSON.parse(JSON.stringify(workflowJson));
    workflow['1'].inputs.ckpt_name = `SVD\\${svdFilename}`;

    return {
        comfyUIUrl: 'http://127.0.0.1:8188',
        comfyUIClientId: 'queue-real-shot',
        workflowJson: JSON.stringify(workflow),
        mapping: {
            '2:image': 'keyframe_image',
        },
    };
};

async function readKeyframe(): Promise<string> {
    const buffer = await fs.readFile(keyframePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function logGeneratedFrames() {
    try {
        const outputsDir = path.resolve('C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\outputs');
        const files = await fs.readdir(outputsDir);
        const generatedFrames = files.filter((file) => file.startsWith(REQUIRED_FRAME_FILTER));
        if (generatedFrames.length === 0) {
            console.warn('No gemdirect1 frame files were detected in the outputs directory.');
            return;
        }
        console.log(`Detected ${generatedFrames.length} frames:`);
        generatedFrames.forEach((file) => console.log(`  • ${file}`));
    } catch (error) {
        console.warn('Frame enumeration skipped:', error instanceof Error ? error.message : error);
    }
}

async function main() {
    try {
        const settings = await buildSettings();
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
        await logGeneratedFrames();
    } catch (error) {
        console.error('Real shot generation failed:', error);
        process.exit(1);
    }
}

await main();
