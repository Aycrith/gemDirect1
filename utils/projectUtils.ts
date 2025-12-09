
import { StoryBible, Scene, LocalGenerationSettings, LocalGenerationStatus, SceneContinuityData, KeyframeData } from '../types';
import { blobToBase64, base64ToBlob } from './videoUtils';
import { StoryToVideoResult } from '../services/storyToVideoPipeline';

export interface ProjectSaveState {
    version: number;
    storyBible: StoryBible | null;
    directorsVision: string;
    scenes: Scene[];
    generatedImages: Record<string, KeyframeData>;
    generatedShotImages: Record<string, string>;
    continuityData: Record<string, SceneContinuityData>;
    localGenSettings: LocalGenerationSettings;
    localGenStatus: Record<string, LocalGenerationStatus>;
    scenesToReview: string[] | Set<string>; // Handle both array for JSON and Set for in-app state
}

export const saveProjectToFile = async (state: Omit<ProjectSaveState, 'version' | 'scenesToReview'> & { scenesToReview: Set<string> }) => {
    // Convert continuityData to a serializable format
    const serializableContinuityData: Record<string, any> = {};
    for (const sceneId in state.continuityData) {
        const data = state.continuityData[sceneId];
        if (!data) continue;
        
        const { videoFile, videoSrc, ...rest } = data as { videoFile?: Blob; videoSrc?: string } & Omit<typeof data, 'videoFile' | 'videoSrc'>;
        
        let videoFileBase64: string | undefined;
        let videoFileType: string | undefined;

        if (videoFile) {
            try {
                videoFileBase64 = await blobToBase64(videoFile);
                videoFileType = videoFile.type;
            } catch (error) {
                console.error(`Could not convert video file to base64 for scene ${sceneId}:`, error);
            }
        }

        serializableContinuityData[sceneId] = {
            ...rest,
            videoFileBase64,
            videoFileType,
        };
    }

    const projectData = {
        ...state,
        version: 1,
        continuityData: serializableContinuityData,
        scenesToReview: Array.from(state.scenesToReview), // Convert Set to Array for JSON serialization
    };

    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = state.storyBible?.logline?.substring(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'cinematic_story';
    a.download = `${safeTitle}_project.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const loadProjectFromFile = (file: File): Promise<ProjectSaveState> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const result = event.target?.result;
                if (typeof result !== 'string') {
                    return reject(new Error('File content is not a string.'));
                }
                const projectData = JSON.parse(result) as {
                    version?: number;
                    continuityData?: Record<string, { videoFileBase64?: string; videoFileType?: string } & Record<string, unknown>>;
                    scenesToReview?: string[];
                    [key: string]: unknown;
                };
                
                if (!projectData.version) {
                    return reject(new Error(
                        `Invalid project file: missing version number. ` +
                        `The file "${file.name}" does not appear to be a valid gemDirect project. ` +
                        `Expected a JSON file with a "version" field (current format: v1). ` +
                        `Please check that you selected the correct file.`
                    ));
                }

                // Rehydrate continuityData from base64
                const rehydratedContinuityData: Record<string, SceneContinuityData> = {};
                const loadedContinuityData = projectData.continuityData || {};
                
                for (const sceneId in loadedContinuityData) {
                    const data = loadedContinuityData[sceneId];
                    if (!data) continue;
                    const { videoFileBase64, videoFileType, ...rest } = data;
                    
                    let videoFile: File | undefined;
                    let videoSrc: string | undefined;

                    if (videoFileBase64 && videoFileType) {
                        try {
                            const blob = base64ToBlob(videoFileBase64, videoFileType);
                            videoFile = new File([blob], `loaded_video_${sceneId}`, { type: videoFileType });
                            videoSrc = URL.createObjectURL(videoFile);
                        } catch (error) {
                            console.error(`Could not rehydrate video for scene ${sceneId}:`, error);
                        }
                    }

                    rehydratedContinuityData[sceneId] = {
                        status: 'idle',
                        ...(rest as any),
                        videoFile,
                        videoSrc,
                    } as SceneContinuityData;
                }
                
                // Construct final state
                const finalState = {
                    ...projectData,
                    continuityData: rehydratedContinuityData,
                    scenesToReview: Array.isArray(projectData.scenesToReview) 
                        ? new Set(projectData.scenesToReview) 
                        : new Set()
                } as unknown as ProjectSaveState;

                resolve(finalState);
            } catch (e) {
                reject(new Error(`Failed to parse project file: ${e instanceof Error ? e.message : 'Unknown error'}`));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsText(file);
    });
};

/**
 * Create a minimal project state from Quick Generate results for promotion to Director Mode
 */
export const createQuickProjectState = (result: StoryToVideoResult, _prompt: string): Omit<ProjectSaveState, 'version' | 'scenesToReview'> & { scenesToReview: Set<string> } => {
  // Convert StoryToVideoResult scenes to Scene objects
  const scenes: Scene[] = result.scenes.map(scene => ({
    id: scene.id,
    title: scene.title,
    summary: scene.summary,
    timeline: scene.timeline
  }));

  return {
    storyBible: result.storyBible,
    directorsVision: `${result.storyBible.characters}. ${result.storyBible.setting}. ${result.storyBible.plotOutline}`,
    scenes,
    generatedImages: {},
    generatedShotImages: {},
    continuityData: {},
    localGenSettings: {
      videoProvider: 'comfyui-local',
      comfyUIUrl: 'http://127.0.0.1:8188',
      comfyUIClientId: 'default-client',
      workflowJson: '',
      mapping: {},
    },
    localGenStatus: {},
    scenesToReview: new Set()
  };
};