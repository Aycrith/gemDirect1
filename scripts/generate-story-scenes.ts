import path from 'node:path';

import { CliOptions, generateStoryAssets } from './storyGenerator.ts';

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        outputDir: path.resolve(process.cwd(), 'logs', new Date().toISOString().replace(/[:.]/g, '-')),
        sceneCount: 3,
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--output' && args[i + 1]) {
            options.outputDir = path.resolve(args[i + 1] ?? '');
            i += 1;
        } else if (arg === '--scenes' && args[i + 1]) {
            options.sceneCount = Math.max(1, Math.min(3, Number(args[i + 1]) || 3));
            i += 1;
        } else if (arg === '--sampleKeyframe' && args[i + 1]) {
            options.sampleKeyframe = path.resolve(args[i + 1] ?? '');
            i += 1;
        } else if (arg === '--useLocalLLM') {
            options.useLocalLLM = true;
        } else if (arg === '--localLLMSeed' && args[i + 1]) {
            options.localLLMSeed = args[i + 1];
            i += 1;
        } else if (arg === '--providerUrl' && args[i + 1]) {
            options.providerUrl = args[i + 1];
            i += 1;
        } else if (arg === '--llmTimeoutMs' && args[i + 1]) {
            options.llmTimeoutMs = Number(args[i + 1]) || undefined;
            i += 1;
        } else if (arg === '--localLLMModel' && args[i + 1]) {
            options.localLLMModel = args[i + 1];
            i += 1;
        } else if (arg === '--localLLMTemperature' && args[i + 1]) {
            options.localLLMTemperature = Number(args[i + 1]) || undefined;
            i += 1;
        } else if (arg === '--llmRequestFormat' && args[i + 1]) {
            options.llmRequestFormat = args[i + 1] as CliOptions['llmRequestFormat'];
            i += 1;
        } else if (arg === '--customStoryIdea' && args[i + 1]) {
            options.customStoryIdea = args[i + 1];
            i += 1;
        }
    }

    options.providerUrl = process.env.LOCAL_STORY_PROVIDER_URL ?? options.providerUrl;
    if (!options.customStoryIdea && process.env.CUSTOM_STORY_IDEA) {
        options.customStoryIdea = process.env.CUSTOM_STORY_IDEA;
    }
    if (!options.localLLMSeed && process.env.LOCAL_LLM_SEED) {
        options.localLLMSeed = process.env.LOCAL_LLM_SEED;
    }
    if (!options.llmTimeoutMs && process.env.LOCAL_LLM_TIMEOUT_MS) {
        options.llmTimeoutMs = Number(process.env.LOCAL_LLM_TIMEOUT_MS);
    }
    if (!options.localLLMModel && process.env.LOCAL_LLM_MODEL) {
        options.localLLMModel = process.env.LOCAL_LLM_MODEL;
    }
    if (!options.localLLMTemperature && process.env.LOCAL_LLM_TEMPERATURE) {
        options.localLLMTemperature = Number(process.env.LOCAL_LLM_TEMPERATURE);
    }
    if (!options.llmRequestFormat && process.env.LOCAL_LLM_REQUEST_FORMAT) {
        options.llmRequestFormat = process.env.LOCAL_LLM_REQUEST_FORMAT as CliOptions['llmRequestFormat'];
    }
    if (!options.useLocalLLM && options.providerUrl) {
        options.useLocalLLM = true;
    }
    return options;
};

const options = parseArgs();

generateStoryAssets(options)
    .then(({ runStoryDir, story, generatedScenes, llm, warnings }) => {
        console.log('[StoryGenerator] Story assets created');
        console.log(`  ➜ Output directory: ${runStoryDir}`);
        console.log(`  ➜ Story ID: ${story.storyId}`);
        console.log(`  ➜ Scenes: ${generatedScenes.length}`);
        if (llm) {
            const statusDetails = [
                `status=${llm.status}`,
                llm.providerUrl ? `url=${llm.providerUrl}` : null,
                llm.seed ? `seed=${llm.seed}` : null,
                llm.model ? `model=${llm.model}` : null,
                llm.requestFormat ? `format=${llm.requestFormat}` : null,
                typeof llm.durationMs === 'number' ? `durationMs=${llm.durationMs}` : null,
                llm.error ? `error=${llm.error}` : null,
            ]
                .filter(Boolean)
                .join(' | ');
            console.log(`  ➜ LLM: ${statusDetails}`);
        }
        generatedScenes.forEach((scene) => {
            console.log(`    - ${scene.id}: ${scene.title} (${scene.keyframePath})`);
        });
        if (warnings?.length) {
            warnings.forEach((warning) => console.warn(`  ⚠ ${warning.message}`));
        }
    })
    .catch((error) => {
        console.error('[StoryGenerator] Failed to create story assets:', error instanceof Error ? error.message : error);
        process.exit(1);
    });
