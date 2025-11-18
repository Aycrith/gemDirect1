import { StoryBible, Scene, TimelineData, Shot, CreativeEnhancers, LocalGenerationSettings } from '../types';
import { createPlanExpansionActions } from './planExpansionService';
import { runSceneGenerationPipeline } from './sceneGenerationPipeline';
import { MediaGenerationActions } from './mediaGenerationService';
import { ApiLogCallback, ApiStateChangeCallback } from './geminiService';

/**
 * Canonical Story-to-Video Pipeline
 *
 * This service provides a unified, real implementation of the story-to-video generation pipeline,
 * replacing mock implementations with actual LLM and ComfyUI integrations.
 */

export interface StoryToVideoResult {
  storyId: string;
  storyBible: StoryBible;
  scenes: Array<{
    id: string;
    title: string;
    summary: string;
    timeline: TimelineData;
    videoPath?: string;
    status: 'pending' | 'queued' | 'rendering' | 'complete' | 'failed';
  }>;
  totalDuration: number;
  startedAt: number;
  completedAt?: number;
  status: 'pending' | 'in-progress' | 'complete' | 'failed';
  error?: Error;
}

export interface StoryToVideoOptions {
  mediaActions: MediaGenerationActions;
  localSettings?: LocalGenerationSettings;
  logApiCall: ApiLogCallback;
  onStateChange?: ApiStateChangeCallback;
  onProgress?: (sceneId: string, statusUpdate: { status: string; message: string; progress: number }) => void;
}

/**
 * Execute the complete story-to-video pipeline using real services
 */
export async function generateStoryToVideo(
  prompt: string,
  genre: string,
  options: StoryToVideoOptions
): Promise<StoryToVideoResult> {
  const startedAt = Date.now();
  const storyId = `story-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Create plan expansion service (defaulting to local for canonical pipeline)
  const planExpansionService = createPlanExpansionActions('local');

  try {
    // Step 1: Generate story bible
    options.onStateChange?.('loading', 'Generating story bible...');
    const storyBible = await planExpansionService.generateStoryBible(prompt, genre, options.logApiCall, options.onStateChange);

    // Step 2: Generate scenes from story bible
    options.onStateChange?.('loading', 'Generating scenes...');
    const scenes = await planExpansionService.generateSceneList(storyBible.plotOutline, storyBible.characters, options.logApiCall, options.onStateChange);

    // Convert to Scene objects with empty timelines
    const sceneObjects: Scene[] = scenes.map(scene => ({
      id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: scene.title,
      summary: scene.summary,
      timeline: {
        shots: [],
        shotEnhancers: {},
        transitions: [],
        negativePrompt: ''
      }
    }));

    // Step 3: For each scene, generate timeline and video
    const processedScenes: StoryToVideoResult['scenes'] = [];
    let totalDuration = 0;

    for (let i = 0; i < sceneObjects.length; i++) {
      const scene = sceneObjects[i];
      const directorsVision = `${storyBible.characters}. ${storyBible.setting}. ${storyBible.plotOutline}`;

      try {
        options.onProgress?.(scene.id, {
          status: 'running',
          message: `Processing scene ${i + 1}/${sceneObjects.length}: ${scene.title}`,
          progress: (i / sceneObjects.length) * 100
        });

        // Generate timeline for this scene
        const timeline = await generateSceneTimeline(scene, directorsVision, storyBible, options);

        // Run video generation pipeline
        const videoResult = await runSceneGenerationPipeline({
          settings: options.localSettings || {} as LocalGenerationSettings, // TODO: Handle missing settings
          timeline,
          directorsVision,
          sceneSummary: scene.summary,
          sceneId: scene.id,
          mediaActions: options.mediaActions,
          logApiCall: options.logApiCall,
          onStateChange: options.onStateChange,
          onShotProgress: (shotId, statusUpdate) => {
            options.onProgress?.(scene.id, {
              status: statusUpdate.status,
              message: `Shot ${shotId}: ${statusUpdate.message}`,
              progress: ((i + (statusUpdate.progress || 0) / 100) / sceneObjects.length) * 100
            });
          }
        });

        // Calculate duration from video results
        const sceneDuration = Object.values(videoResult.videoResults).reduce((sum, result) => sum + result.duration, 0);

        processedScenes.push({
          id: scene.id,
          title: scene.title,
          summary: scene.summary,
          timeline,
          videoPath: Object.values(videoResult.videoResults)[0]?.videoPath,
          status: 'complete'
        });

        totalDuration += sceneDuration;

      } catch (error) {
        console.error(`Failed to process scene ${scene.id}:`, error);
        processedScenes.push({
          id: scene.id,
          title: scene.title,
          summary: scene.summary,
          timeline: scene.timeline,
          status: 'failed'
        });
      }
    }

    return {
      storyId,
      storyBible,
      scenes: processedScenes,
      totalDuration,
      startedAt,
      completedAt: Date.now(),
      status: 'complete'
    };

  } catch (error) {
    return {
      storyId,
      storyBible: {
        logline: prompt,
        characters: '',
        setting: '',
        plotOutline: ''
      },
      scenes: [],
      totalDuration: 0,
      startedAt,
      completedAt: Date.now(),
      status: 'failed',
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Generate a timeline for a single scene
 */
async function generateSceneTimeline(
  scene: Scene,
  directorsVision: string,
  storyBible: StoryBible,
  options: StoryToVideoOptions
): Promise<TimelineData> {
  // Create plan expansion service
  const planExpansionService = createPlanExpansionActions('local');

  // Generate initial shots for the scene
  const narrativeContext = `Scene in story: ${storyBible.plotOutline}`;
  const prunedContext = await planExpansionService.getPrunedContextForShotGeneration(
    storyBible,
    narrativeContext,
    scene.summary,
    directorsVision,
    options.logApiCall,
    options.onStateChange
  );

  const detailedShots = await planExpansionService.generateAndDetailInitialShots(prunedContext, options.logApiCall, options.onStateChange);

  const shots: Shot[] = detailedShots.map(result => ({
    id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    description: result.description
  }));

  const shotEnhancers: Record<string, Partial<Omit<CreativeEnhancers, 'transitions'>>> = {};
  detailedShots.forEach((result, index) => {
    shotEnhancers[shots[index].id] = result.suggested_enhancers;
  });

  const transitions = Array(Math.max(0, shots.length - 1)).fill('Cut');

  return {
    shots,
    shotEnhancers,
    transitions,
    negativePrompt: 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic'
  };
}