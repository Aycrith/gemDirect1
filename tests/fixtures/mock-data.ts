import { StoryBible, Scene, WorkflowStage, LocalGenerationStatus } from '../../types';

/**
 * Mock Story Bible for testing
 */
export const mockStoryBible: StoryBible = {
  logline: 'A hacker uncovers a corporate surveillance conspiracy',
  characters: `**Jordan Chen**: Paranoid, brilliant coder, determined
**Alex Rivera**: Corporate insider, conflicted, secretly sympathetic`,
  setting: 'Near-future megacity with neon-lit streets and omnipresent surveillance',
  plotOutline: `Act I
- Scene 1: Discovery of data anomaly
Act II
- Scene 2: Investigation and alliance building
Act III
- Scene 3: Race to expose conspiracy`
};

/**
 * Mock Scenes with timeline data
 */
export const mockScenes: Scene[] = [
  {
    id: 'scene-001',
    title: 'The Discovery',
    summary: 'Jordan discovers suspicious network patterns while working late',
    timeline: {
      shots: [
        {
          id: 'shot-001-01',
          description: 'Wide shot of apartment interior, Jordan at desk'
        },
        {
          id: 'shot-001-02',
          description: 'Close-up of screen reflection in Jordan\'s glasses'
        },
        {
          id: 'shot-001-03',
          description: 'Extreme close-up of Jordan\'s face, realization dawning'
        }
      ],
      shotEnhancers: {},
      transitions: [],
      negativePrompt: ''
    }
  },
  {
    id: 'scene-002',
    title: 'The Meeting',
    summary: 'Jordan meets Alex in underground club',
    timeline: {
      shots: [
        {
          id: 'shot-002-01',
          description: 'Tracking shot through crowded club to booth'
        },
        {
          id: 'shot-002-02',
          description: 'Two-shot of Jordan and Alex in conversation'
        },
        {
          id: 'shot-002-03',
          description: 'Close-up of data drive being passed under table'
        }
      ],
      shotEnhancers: {},
      transitions: [],
      negativePrompt: ''
    }
  },
  {
    id: 'scene-003',
    title: 'The Infiltration',
    summary: 'Final showdown in corporate server farm',
    timeline: {
      shots: [
        {
          id: 'shot-003-01',
          description: 'Wide establishing shot of server farm'
        },
        {
          id: 'shot-003-02',
          description: 'Jordan running through server racks'
        },
        {
          id: 'shot-003-03',
          description: 'Close-up of fingers typing on terminal'
        }
      ],
      shotEnhancers: {},
      transitions: [],
      negativePrompt: ''
    }
  }
];

/**
 * Mock Director's Vision
 */
export const mockDirectorsVision = `Cinematic noir with cyberpunk influence. 
Blade Runner meets Mr. Robot aesthetic. Rain and neon throughout.
Close-ups on faces and screens. Color palette: blues, whites, neon pinks.`;

/**
 * Mock Generated Images (keyframes)
 */
export const mockGeneratedImages: Record<string, string> = {
  'scene-001': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'scene-002': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'scene-003': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
};

/**
 * Mock Local Generation Status
 */
export const mockLocalGenStatus: Record<string, LocalGenerationStatus> = {
  'scene-001': {
    status: 'complete',
    message: 'Video generation completed successfully',
    progress: 100,
    final_output: {
      type: 'video',
      data: '/artifacts/video/scene-001_00001_.mp4',
      filename: 'scene-001_00001_.mp4'
    }
  },
  'scene-002': {
    status: 'running',
    message: 'Processing frame 5/12',
    progress: 42
  },
  'scene-003': {
    status: 'queued',
    message: 'Waiting in queue',
    progress: 0,
    queue_position: 1
  }
};

/**
 * Full project state for save/load testing
 */
export const fullProjectState = {
  workflowStage: 'timeline' as WorkflowStage,
  storyBible: mockStoryBible,
  directorsVision: mockDirectorsVision,
  scenes: mockScenes,
  generatedImages: mockGeneratedImages,
  localGenStatus: mockLocalGenStatus,
  timestamp: Date.now()
};

/**
 * Empty project state for new project testing
 */
export const emptyProjectState = {
  workflowStage: 'idea' as WorkflowStage,
  storyBible: null,
  directorsVision: '',
  scenes: [],
  generatedImages: {},
  localGenStatus: {},
  timestamp: Date.now()
};
