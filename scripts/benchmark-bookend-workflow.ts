
import { generateVideoFromBookendsSequential, generateSceneKeyframeLocally, checkServerConnection } from '../services/comfyUIService';
import { LocalGenerationSettings, Scene, TimelineData } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localGenSettings = require('../localGenSettings.json');

// Mock browser globals if needed
if (typeof global.Blob === 'undefined') {
    const { Blob } = require('buffer');
    global.Blob = Blob;
}
if (typeof global.File === 'undefined') {
    const { File } = require('buffer');
    global.File = File;
}
if (typeof global.FormData === 'undefined') {
    const { FormData } = require('undici');
    global.FormData = FormData;
}

// Mock FileReader
if (typeof global.FileReader === 'undefined') {
    class MockFileReader {
        onloadend: (() => void) | null = null;
        onerror: ((error: any) => void) | null = null;
        result: string | ArrayBuffer | null = null;

        readAsDataURL(blob: Blob) {
            // In Node, Blob is likely from 'buffer' or 'undici'
            // We need to convert it to base64
            blob.arrayBuffer().then((buffer) => {
                const base64 = Buffer.from(buffer).toString('base64');
                // Guess mime type or default to image/png
                const mimeType = blob.type || 'image/png';
                this.result = `data:${mimeType};base64,${base64}`;
                if (this.onloadend) this.onloadend();
            }).catch((err) => {
                if (this.onerror) this.onerror(err);
            });
        }
    }
    (global as any).FileReader = MockFileReader;
}

// Wrap fetch to remove browser-specific options that might cause issues in Node
/*
const originalFetch = global.fetch || require('undici').fetch;
global.fetch = async (input, init) => {
    if (init) {
        // Remove options that might cause 403 or other issues in Node environment
        delete (init as any).mode;
        delete (init as any).credentials;
    }
    return originalFetch(input, init);
};
global.Response = global.Response || require('undici').Response;
global.Request = global.Request || require('undici').Request;
global.Headers = global.Headers || require('undici').Headers;
*/
// Mock WebSocket
if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = require('ws');
}

const OUTPUT_DIR = path.join(process.cwd(), 'temp', 'benchmark');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const SETTINGS: LocalGenerationSettings = {
    comfyUIUrl: 'http://127.0.0.1:8188',
    comfyUIClientId: 'benchmark_client_' + Date.now(),
    imageWorkflowProfile: 'wan-t2i',
    videoWorkflowProfile: 'wan-i2v',
    workflowProfiles: {
        'wan-t2i': {
            id: 'wan-t2i',
            label: 'WAN Text→Image',
            workflowJson: localGenSettings.workflowProfiles['wan-t2i'].workflowJson,
            mapping: localGenSettings.workflowProfiles['wan-t2i'].mapping
        },
        'wan-i2v': {
            id: 'wan-i2v',
            label: 'WAN Text+Image→Video',
            workflowJson: localGenSettings.workflowProfiles['wan-i2v'].workflowJson,
            mapping: localGenSettings.workflowProfiles['wan-i2v'].mapping
        }
    },
    // Fallback for service logic that might check root properties
    workflowJson: localGenSettings.workflowProfiles['wan-i2v'].workflowJson,
    mapping: localGenSettings.workflowProfiles['wan-i2v'].mapping
};

const MOCK_SCENE: Scene = {
    id: 'benchmark_scene_001',
    title: 'Benchmark Scene',
    summary: 'Futuristic city skyline at sunset, cyberpunk aesthetic, neon lights.',
    timeline: {
        shots: [],
        shotEnhancers: {},
        transitions: [],
        negativePrompt: ''
    },
    temporalContext: {
        startMoment: 'The sun begins to set behind the skyscrapers.',
        endMoment: 'The city lights turn on as darkness falls.'
    },
    // estimatedDuration: 4, // Removed as it might not be in Scene type
    // status: 'draft',
    // script: 'EXT. CITY - SUNSET',
    // visualStyle: 'Cyberpunk, high contrast, neon',
    // mood: 'Energetic',
    // lighting: 'Sunset, golden hour',
    // location: 'City',
    // timeOfDay: 'Sunset',
    // characters: []
};

const MOCK_TIMELINE: TimelineData = {
    shots: [
        {
            id: 'shot_001',
            description: 'Wide shot of the city skyline.',
            // duration: 4, // Removed
            // cameraMovement: 'Static',
            // shotType: 'Wide',
            // order: 1,
            // visualDetail: 'Skyscrapers with neon lights.',
            // audioPrompt: 'City ambience.'
        }
    ],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: 'blurry, low quality'
};

async function runBenchmark() {
    console.log('=== Bookend Workflow Benchmark ===');
    console.log(`Output Directory: ${OUTPUT_DIR}`);

    try {
        // 1. Check Connection
        console.log('Checking ComfyUI connection...');
        await checkServerConnection(SETTINGS.comfyUIUrl);
        console.log('✓ ComfyUI Connected');

        // 2. Generate Keyframes
        console.log('\n--- Phase 1: Generating Keyframes ---');
        const startKeyframeStart = Date.now();
        console.log('Generating START keyframe...');
        const startImage = await generateSceneKeyframeLocally(
            SETTINGS,
            'Cyberpunk style',
            MOCK_SCENE.temporalContext!.startMoment,
            MOCK_SCENE.id,
            (status) => console.log(`[Start Keyframe] ${status.message}`)
        );
        const startKeyframeDuration = (Date.now() - startKeyframeStart) / 1000;
        console.log(`✓ Start Keyframe generated in ${startKeyframeDuration.toFixed(2)}s`);
        
        // Save start image
        fs.writeFileSync(path.join(OUTPUT_DIR, 'start_keyframe.jpg'), Buffer.from(startImage, 'base64'));

        const endKeyframeStart = Date.now();
        console.log('Generating END keyframe...');
        const endImage = await generateSceneKeyframeLocally(
            SETTINGS,
            'Cyberpunk style',
            MOCK_SCENE.temporalContext!.endMoment,
            MOCK_SCENE.id,
            (status) => console.log(`[End Keyframe] ${status.message}`)
        );
        const endKeyframeDuration = (Date.now() - endKeyframeStart) / 1000;
        console.log(`✓ End Keyframe generated in ${endKeyframeDuration.toFixed(2)}s`);

        // Save end image
        fs.writeFileSync(path.join(OUTPUT_DIR, 'end_keyframe.jpg'), Buffer.from(endImage, 'base64'));

        // 3. Generate Video (Sequential)
        console.log('\n--- Phase 2: Sequential Video Generation ---');
        const videoStart = Date.now();
        
        const videoPath = await generateVideoFromBookendsSequential(
            SETTINGS,
            MOCK_SCENE,
            MOCK_TIMELINE,
            { start: startImage, end: endImage },
            'Cinematic benchmark test',
            (_log: Omit<import('../types').ApiCallLog, 'id' | 'timestamp'>) => console.log(`[API Log]`),
            (state: { message?: string; progress?: number }) => {
                if (state.message) console.log(`[Video Gen] ${state.message}`);
                if (state.progress) process.stdout.write(`Progress: ${state.progress}%\r`);
            }
        );
        
        const videoDuration = (Date.now() - videoStart) / 1000;
        console.log(`\n✓ Video generated in ${videoDuration.toFixed(2)}s`);
        console.log(`Output: ${videoPath}`);

        // Copy to output dir if it's not already there (it might be in a temp folder)
        if (fs.existsSync(videoPath)) {
            const destPath = path.join(OUTPUT_DIR, 'final_bookend_video.mp4');
            fs.copyFileSync(videoPath, destPath);
            console.log(`Saved to: ${destPath}`);
        }

        // 4. Report
        console.log('\n=== Benchmark Results ===');
        console.log(`Start Keyframe: ${startKeyframeDuration.toFixed(2)}s`);
        console.log(`End Keyframe:   ${endKeyframeDuration.toFixed(2)}s`);
        console.log(`Video Gen:      ${videoDuration.toFixed(2)}s`);
        console.log(`Total Time:     ${(startKeyframeDuration + endKeyframeDuration + videoDuration).toFixed(2)}s`);
        
    } catch (error) {
        console.error('Benchmark Failed:', error);
        process.exit(1);
    }
}

runBenchmark();
