
import { StoryBible, Scene, LocalGenerationSettings, LocalGenerationStatus, SceneContinuityData } from '../types';
import { blobToBase64, base64ToBlob } from './videoUtils';

export interface ProjectSaveState {
    version: number;
    storyBible: StoryBible | null;
    directorsVision: string;
    scenes: Scene[];
    generatedImages: Record<string, string>;
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
        const { videoFile, videoSrc, ...rest } = data; // Destructure to remove non-serializable parts
        
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
                const projectData: any = JSON.parse(result);
                
                if (!projectData.version) {
                    return reject(new Error('Invalid project file: missing version number.'));
                }

                // Rehydrate continuityData from base64
                const rehydratedContinuityData: Record<string, SceneContinuityData> = {};
                const loadedContinuityData = projectData.continuityData || {};
                
                for (const sceneId in loadedContinuityData) {
                    const data = loadedContinuityData[sceneId];
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
                        ...rest,
                        videoFile,
                        videoSrc,
                    };
                }
                projectData.continuityData = rehydratedContinuityData;
                
                // Convert scenesToReview back to a Set for in-app use
                if (Array.isArray(projectData.scenesToReview)) {
                    projectData.scenesToReview = new Set(projectData.scenesToReview);
                }

                resolve(projectData as ProjectSaveState);
            } catch (e) {
                reject(new Error(`Failed to parse project file: ${e instanceof Error ? e.message : 'Unknown error'}`));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsText(file);
    });
};