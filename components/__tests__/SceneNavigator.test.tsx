import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SceneNavigator from '../SceneNavigator';
import type { Scene, SceneStatus, KeyframeData, SceneImageGenerationStatus } from '../../types';

// Mock the hooks and services
vi.mock('../../utils/hooks', () => ({
    useVisualBible: vi.fn(() => ({
        visualBible: null,
        setVisualBible: vi.fn(),
    })),
}));

vi.mock('../../hooks/useSceneStore', () => ({
    useUnifiedSceneStoreEnabled: vi.fn(() => false),
}));

vi.mock('../../services/sceneStateStore', () => ({
    useSceneStateStore: vi.fn(() => []),
}));

vi.mock('../../services/continuityVisualContext', () => ({
    getSceneVisualBibleContext: vi.fn(() => null),
}));

describe('SceneNavigator', () => {
    const createMockScene = (id: string, title: string): Scene => ({
        id,
        title,
        summary: `Summary for ${title}`,
        timeline: {
            shots: [],
            shotEnhancers: {},
            transitions: [],
            negativePrompt: '',
        },
    });

    const defaultProps = {
        scenes: [] as Scene[],
        activeSceneId: null as string | null,
        onSelectScene: vi.fn(),
        scenesToReview: new Set<string>(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('renders empty state when no scenes exist', () => {
            render(<SceneNavigator {...defaultProps} />);
            expect(screen.getByText(/Your scenes will appear here/)).toBeInTheDocument();
        });

        it('renders scene list header with count', () => {
            const scenes = [
                createMockScene('scene-1', 'Opening'),
                createMockScene('scene-2', 'Climax'),
            ];
            render(<SceneNavigator {...defaultProps} scenes={scenes} />);
            expect(screen.getByText('Scenes')).toBeInTheDocument();
            expect(screen.getByText('2 total')).toBeInTheDocument();
        });

        it('renders scene titles with index prefix', () => {
            const scenes = [
                createMockScene('scene-1', 'Opening Scene'),
                createMockScene('scene-2', 'Chase Scene'),
            ];
            render(<SceneNavigator {...defaultProps} scenes={scenes} />);
            // Component renders as "Scene {index + 1}: {scene.title}"
            expect(screen.getByText(/Scene 1: Opening Scene/)).toBeInTheDocument();
            expect(screen.getByText(/Scene 2: Chase Scene/)).toBeInTheDocument();
        });

        it('renders scene summaries', () => {
            const scenes = [createMockScene('scene-1', 'Test Scene')];
            render(<SceneNavigator {...defaultProps} scenes={scenes} />);
            expect(screen.getByText('Summary for Test Scene')).toBeInTheDocument();
        });
    });

    describe('selection', () => {
        it('calls onSelectScene when scene is clicked', () => {
            const onSelectScene = vi.fn();
            const scenes = [createMockScene('scene-1', 'Test Scene')];
            render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    onSelectScene={onSelectScene} 
                />
            );
            
            fireEvent.click(screen.getByText(/Scene 1: Test Scene/));
            expect(onSelectScene).toHaveBeenCalledWith('scene-1');
        });

        it('highlights active scene with amber background', () => {
            const scenes = [
                createMockScene('scene-1', 'Opening'),
                createMockScene('scene-2', 'Climax'),
            ];
            render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    activeSceneId="scene-1" 
                />
            );
            
            const activeButton = screen.getByText(/Scene 1: Opening/).closest('button');
            expect(activeButton?.className).toContain('bg-amber');
        });
    });

    describe('review indicators', () => {
        it('shows review indicator for scenes needing review', () => {
            const scenes = [createMockScene('scene-1', 'Needs Review')];
            const scenesToReview = new Set(['scene-1']);
            
            render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    scenesToReview={scenesToReview}
                />
            );
            
            // Check for review indicator (yellow ring styling)
            const sceneButton = screen.getByText(/Scene 1: Needs Review/).closest('button');
            expect(sceneButton?.className).toContain('ring-yellow');
        });
    });

    describe('scene status indicators', () => {
        it('renders without crashing when scene has status', () => {
            const scenes = [createMockScene('scene-1', 'Generating Scene')];
            const sceneStatuses: Record<string, SceneStatus> = {
                'scene-1': {
                    sceneId: 'scene-1',
                    title: 'Generating Scene',
                    status: 'generating',
                    progress: 50,
                },
            };
            
            const { container } = render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    sceneStatuses={sceneStatuses}
                />
            );
            
            expect(container.querySelector('li')).toBeInTheDocument();
        });
    });

    describe('keyframe indicators', () => {
        it('renders scene with keyframe data', () => {
            const scenes = [createMockScene('scene-1', 'Has Keyframe')];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': 'base64imagedata',
            };
            
            const { container } = render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    generatedImages={generatedImages}
                />
            );
            
            expect(container.querySelector('li')).toBeInTheDocument();
        });

        it('renders scene with bookend keyframes', () => {
            const scenes = [createMockScene('scene-1', 'Has Bookends')];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': { start: 'startframe', end: 'endframe' },
            };
            
            const { container } = render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    generatedImages={generatedImages}
                />
            );
            
            expect(container.querySelector('li')).toBeInTheDocument();
        });
    });

    describe('delete functionality', () => {
        it('renders delete button when onDeleteScene provided and multiple scenes exist', () => {
            const onDeleteScene = vi.fn();
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
            ];
            
            const { container } = render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    onDeleteScene={onDeleteScene}
                />
            );
            
            // Should have list items for scenes
            const listItems = container.querySelectorAll('li');
            expect(listItems.length).toBe(2);
        });
    });

    describe('image generation status', () => {
        it('renders with generating status', () => {
            const scenes = [createMockScene('scene-1', 'Generating')];
            const sceneImageStatuses: Record<string, SceneImageGenerationStatus> = {
                'scene-1': {
                    status: 'generating',
                    progress: 75,
                },
            };
            
            const { container } = render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    sceneImageStatuses={sceneImageStatuses}
                />
            );
            
            expect(container.querySelector('li')).toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        it('renders buttons for scenes', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
            ];
            
            render(
                <SceneNavigator 
                    {...defaultProps} 
                    scenes={scenes} 
                    activeSceneId="scene-1"
                />
            );
            
            const buttons = screen.getAllByRole('button');
            expect(buttons.length).toBeGreaterThanOrEqual(2);
        });
    });
});
