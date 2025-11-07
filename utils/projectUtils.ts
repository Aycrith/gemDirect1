import { StoryBible, Scene, LocalGenerationSettings, LocalGenerationStatus, SceneContinuityData } from '../types';

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

export const saveProjectToFile = (state: Omit<ProjectSaveState, 'version' | 'scenesToReview'> & { scenesToReview: Set<string> }) => {
    const projectData: ProjectSaveState = {
        ...state,
        version: 1,
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
                const projectData: ProjectSaveState = JSON.parse(result);
                
                if (!projectData.version) {
                    return reject(new Error('Invalid project file: missing version number.'));
                }
                
                // Convert scenesToReview back to a Set for in-app use
                if (Array.isArray(projectData.scenesToReview)) {
                    projectData.scenesToReview = new Set(projectData.scenesToReview);
                }

                resolve(projectData);
            } catch (e) {
                reject(new Error(`Failed to parse project file: ${e instanceof Error ? e.message : 'Unknown error'}`));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsText(file);
    });
};
