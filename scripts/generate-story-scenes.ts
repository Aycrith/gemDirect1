import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

interface CliOptions {
    outputDir: string;
    sceneCount: number;
    sampleKeyframe?: string;
}

interface SceneTemplate {
    title: string;
    summary: string;
    prompt: string;
    mood: string;
}

interface GeneratedScene {
    id: string;
    title: string;
    summary: string;
    prompt: string;
    mood: string;
    keyframePath: string;
    expectedFrames: number;
    negativePrompt: string;
}

const DEFAULT_NEGATIVE_PROMPT =
    'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur';

const SAMPLE_SCENES: SceneTemplate[] = [
    {
        title: 'Signal in the Mist',
        summary: 'A lone courier crosses a suspended rail bridge as aurora storm clouds simmer below.',
        prompt:
            'Ultra-wide cinematic shot of a courier silhouetted on a floating rail bridge, vaporous aurora and neon mist swirling beneath, volumetric lighting, shallow haze, 1970s film grain',
        mood: 'Resolute, breathless',
    },
    {
        title: 'Archive Heartbeat',
        summary: 'Holo-projectors bloom inside a cathedral-like archive while drones carve through shafts of light.',
        prompt:
            'Slow dolly shot through a vaulted archive lit by cascading holograms, bronze shelves, reflective marble floor, micro drones tracing glowing calligraphy, richly saturated cinematic palette',
        mood: 'Wondrous, reverent',
    },
    {
        title: 'Rainlight Market',
        summary: 'An alleyway bazaar flickers with bioluminescent fibers and mirrored puddles after a downpour.',
        prompt:
            'Handheld tracking shot weaving through a rain-soaked bazaar, bioluminescent fabric stalls, reflections on stone, warm lanterns contrasted with cool cyan signage, shallow depth of field',
        mood: 'Alive, kinetic',
    },
];

const FALLBACK_PIXEL_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAI0lEQVR4nGNgYGD4z0AEYBxVSFIBDcQZiAJQGyCmAZhGIAEAOwECkbnWD+YAAAAASUVORK5CYII=';

const ensureDir = async (dir: string) => fs.mkdir(dir, { recursive: true });

const fileExists = async (target: string | undefined): Promise<boolean> => {
    if (!target) return false;
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
};

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        outputDir: path.resolve(process.cwd(), 'logs', new Date().toISOString().replace(/[:.]/g, '-')),
        sceneCount: 3,
    };

    for (let i = 0; i < args.length; i += 1) {
        const value = args[i];
        if (value === '--output' && args[i + 1]) {
            options.outputDir = path.resolve(args[i + 1]);
            i += 1;
        } else if (value === '--scenes' && args[i + 1]) {
            options.sceneCount = Math.max(1, Math.min(SAMPLE_SCENES.length, Number(args[i + 1]) || 1));
            i += 1;
        } else if (value === '--sampleKeyframe' && args[i + 1]) {
            options.sampleKeyframe = path.resolve(args[i + 1]);
            i += 1;
        }
    }

    return options;
};

const ensureSampleKeyframe = async (preferredPath: string | undefined, outputDir: string): Promise<string> => {
    if (await fileExists(preferredPath)) {
        return preferredPath as string;
    }
    const fallbackPath = path.join(outputDir, 'fallback-keyframe.png');
    await ensureDir(path.dirname(fallbackPath));
    await fs.writeFile(fallbackPath, Buffer.from(FALLBACK_PIXEL_BASE64, 'base64'));
    return fallbackPath;
};

const writeSceneArtifacts = async (
    storyDir: string,
    keyframeSource: string,
    scene: SceneTemplate,
    order: number,
): Promise<GeneratedScene> => {
    const sceneId = `scene-${String(order + 1).padStart(3, '0')}`;
    const sceneDir = path.join(storyDir, 'scenes');
    const keyframeDir = path.join(storyDir, 'keyframes');
    await Promise.all([ensureDir(sceneDir), ensureDir(keyframeDir)]);

    const keyframeFilename = `${sceneId}.png`;
    const keyframePath = path.join(keyframeDir, keyframeFilename);
    await fs.copyFile(keyframeSource, keyframePath);

    const generated: GeneratedScene = {
        id: sceneId,
        title: scene.title,
        summary: scene.summary,
        prompt: scene.prompt,
        mood: scene.mood,
        keyframePath,
        expectedFrames: 25,
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    };

    const sceneJsonPath = path.join(sceneDir, `${sceneId}.json`);
    await fs.writeFile(sceneJsonPath, JSON.stringify(generated, null, 2), 'utf-8');

    return generated;
};

const main = async () => {
    const options = parseArgs();
    const runStoryDir = options.outputDir;
    await ensureDir(runStoryDir);
    const sampleKeyframe = await ensureSampleKeyframe(options.sampleKeyframe, runStoryDir);

    const selectedScenes = SAMPLE_SCENES.slice(0, options.sceneCount);
    const generatedScenes: GeneratedScene[] = [];

    for (let i = 0; i < selectedScenes.length; i += 1) {
        const generated = await writeSceneArtifacts(runStoryDir, sampleKeyframe, selectedScenes[i], i);
        generatedScenes.push(generated);
    }

    const story = {
        storyId: `story-${crypto.randomUUID()}`,
        generatedAt: new Date().toISOString(),
        logline: 'An exhausted courier discovers that their encoded deliveries are rewriting the future of the skyline.',
        directorsVision:
            'Analog-inspired futurism with bold silhouettes, rain-bent reflections, and saturated bioluminescent accents. Camera work should feel like a patient steadicam with occasional handheld breathing.',
        scenes: generatedScenes,
        generator: 'scripts/generate-story-scenes.ts',
    };

    const storyPath = path.join(runStoryDir, 'story.json');
    await fs.writeFile(storyPath, JSON.stringify(story, null, 2), 'utf-8');

    console.log('[StoryGenerator] Story assets created');
    console.log(`  ➤ Output directory: ${runStoryDir}`);
    console.log(`  ➤ Scenes: ${generatedScenes.length}`);
    generatedScenes.forEach((scene) => {
        console.log(`    - ${scene.id}: ${scene.title} (${scene.keyframePath})`);
    });
};

main().catch((error) => {
    console.error('[StoryGenerator] Failed to create story assets:', error instanceof Error ? error.message : error);
    process.exit(1);
});
