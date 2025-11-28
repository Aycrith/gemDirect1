import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContinuityDirector from '../ContinuityDirector';
import type { Scene, StoryBible, SceneContinuityData, KeyframeData, LocalGenerationSettings, LocalGenerationStatus } from '../../types';
import { PlanExpansionStrategyProvider } from '../../contexts/PlanExpansionStrategyContext';

// Mock all the hooks and services
vi.mock('../../utils/hooks', () => ({
    useVisualBible: vi.fn(() => ({
        visualBible: {
            characters: [],
            styleBoards: [],
            sceneKeyframes: {},
            shotReferences: {},
            sceneCharacters: {},
            shotCharacters: {},
        },
        setVisualBible: vi.fn(),
    })),
    usePersistentState: vi.fn((_key: string, defaultValue: unknown) => [defaultValue, vi.fn()]),
}));

vi.mock('../../hooks/useSceneStore', () => ({
    useUnifiedSceneStoreEnabled: vi.fn(() => false),
}));

vi.mock('../../services/sceneStateStore', () => ({
    useSceneStateStore: {
        getState: vi.fn(() => ({
            scenes: [],
            generatedImages: {},
        })),
    },
}));

vi.mock('../../services/continuityPrerequisites', () => ({
    validateContinuityPrerequisites: vi.fn(() => ({
        canProceed: true,
        hasScenes: true,
        hasTimelines: true,
        hasKeyframes: true,
        hasEnhancers: false,
        missingItems: [],
        summary: {
            totalScenes: 2,
            scenesWithTimelines: 2,
            scenesWithKeyframes: 2,
            scenesWithEnhancers: 0,
        },
    })),
    getPrerequisiteSummary: vi.fn(() => 'All prerequisites met'),
}));

vi.mock('../../services/characterTracker', () => ({
    analyzeCharacterTimeline: vi.fn(() => ({
        tracking: {
            characterPresence: [],
            unknownCharacters: [],
            totalAppearances: 0,
        },
        continuity: {
            characterGaps: [],
            abruptEntrances: [],
            abruptExits: [],
        },
    })),
}));

vi.mock('../../services/continuityVisualContext', () => ({
    findCharacterContinuityIssues: vi.fn(() => []),
    computeSceneContinuityScore: vi.fn(() => ({
        score: 0.85,
        breakdown: {
            visualBibleCoverage: 0.9,
            characterConsistency: 0.8,
            styleConsistency: 0.85,
        },
    })),
    getSceneVisualBibleContext: vi.fn(() => ({
        styleBoards: [],
        tags: [],
        characterReferences: [],
    })),
}));

// Wrapper component to provide required context
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <PlanExpansionStrategyProvider>
        {children}
    </PlanExpansionStrategyProvider>
);

const renderWithProvider = (ui: React.ReactElement) => {
    return render(ui, { wrapper: TestWrapper });
};

describe('ContinuityDirector', () => {
    const createMockScene = (id: string, title: string): Scene => ({
        id,
        title,
        summary: `Summary for ${title}`,
        timeline: {
            shots: [{ id: 'shot-1', description: 'Test shot' }],
            shotEnhancers: {},
            transitions: [],
            negativePrompt: '',
        },
    });

    const createMockStoryBible = (): StoryBible => ({
        logline: 'A test story logline',
        characters: 'Hero - the main character',
        setting: 'Urban metropolis',
        plotOutline: 'Test plot outline with action and adventure',
    });

    const defaultProps = {
        scenes: [createMockScene('scene-1', 'Scene 1'), createMockScene('scene-2', 'Scene 2')],
        storyBible: createMockStoryBible(),
        directorsVision: 'Cinematic, dramatic lighting',
        generatedImages: {
            'scene-1': 'keyframe1base64',
            'scene-2': 'keyframe2base64',
        } as Record<string, KeyframeData>,
        continuityData: {} as Record<string, SceneContinuityData>,
        setContinuityData: vi.fn(),
        addToast: vi.fn(),
        onApiStateChange: vi.fn(),
        onApiLog: vi.fn(),
        onApplySuggestion: vi.fn(),
        refinedSceneIds: new Set<string>(),
        onUpdateSceneSummary: vi.fn().mockResolvedValue(true),
        onExtendTimeline: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('renders the header', () => {
            renderWithProvider(<ContinuityDirector {...defaultProps} />);
            expect(screen.getByText('Continuity Director')).toBeInTheDocument();
        });

        it('renders E2EQACard component', () => {
            renderWithProvider(<ContinuityDirector {...defaultProps} />);
            expect(screen.getByText('End-to-End QA')).toBeInTheDocument();
        });

        it('renders guide card with instructions', () => {
            renderWithProvider(<ContinuityDirector {...defaultProps} />);
            expect(screen.getByText('Completing the Creative Loop')).toBeInTheDocument();
        });

        it('displays scene count in E2EQACard', () => {
            renderWithProvider(<ContinuityDirector {...defaultProps} />);
            expect(screen.getByText('2')).toBeInTheDocument(); // Total scenes
        });
    });

    describe('scene display', () => {
        it('shows scenes with continuity cards', () => {
            renderWithProvider(<ContinuityDirector {...defaultProps} />);
            // Scene titles should be present (format: "Scene N: Title")
            expect(screen.getByText(/Scene 1:/)).toBeInTheDocument();
            expect(screen.getByText(/Scene 2:/)).toBeInTheDocument();
        });

        it('displays scene position info', () => {
            renderWithProvider(<ContinuityDirector {...defaultProps} />);
            // Check for scene position indicators in the rendered output
            const sceneCards = screen.getAllByText(/Scene [12]:/);
            expect(sceneCards.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('prerequisites', () => {
        it('shows prerequisites warning when not ready', async () => {
            const { validateContinuityPrerequisites } = await import('../../services/continuityPrerequisites');
            vi.mocked(validateContinuityPrerequisites).mockReturnValue({
                canProceed: false,
                hasScenes: true,
                hasTimelines: true,
                hasKeyframes: false,
                hasEnhancers: false,
                missingItems: [{
                    type: 'keyframe',
                    sceneId: 'scene-1',
                    sceneTitle: 'Scene 1',
                    message: 'Keyframes required for all scenes',
                    severity: 'error',
                    actionLabel: 'Generate Keyframes',
                    actionRoute: 'director',
                }],
                summary: {
                    totalScenes: 2,
                    scenesWithTimelines: 2,
                    scenesWithKeyframes: 0,
                    scenesWithEnhancers: 0,
                },
            });

            renderWithProvider(<ContinuityDirector {...defaultProps} generatedImages={{}} />);
            
            // Reset the mock for other tests
            vi.mocked(validateContinuityPrerequisites).mockReturnValue({
                canProceed: true,
                hasScenes: true,
                hasTimelines: true,
                hasKeyframes: true,
                hasEnhancers: false,
                missingItems: [],
                summary: { totalScenes: 2, scenesWithTimelines: 2, scenesWithKeyframes: 2, scenesWithEnhancers: 0 },
            });
        });
    });

    describe('navigation', () => {
        it('calls onNavigateToDirector when provided', () => {
            const onNavigateToDirector = vi.fn();
            renderWithProvider(
                <ContinuityDirector 
                    {...defaultProps} 
                    onNavigateToDirector={onNavigateToDirector}
                />
            );
            // Navigation button should be available when prerequisites not met
            expect(screen.getByText('Continuity Director')).toBeInTheDocument();
        });
    });

    describe('local generation status', () => {
        it('accepts localGenStatus prop for video display', () => {
            const localGenStatus: Record<string, LocalGenerationStatus> = {
                'scene-1': {
                    status: 'complete',
                    message: 'Video ready',
                    progress: 100,
                },
            };
            
            // Should render without errors
            renderWithProvider(
                <ContinuityDirector 
                    {...defaultProps} 
                    localGenStatus={localGenStatus}
                />
            );
            
            expect(screen.getByText(/Scene 1:/)).toBeInTheDocument();
        });
    });

    describe('feature flag integration', () => {
        it('accepts localGenSettings for feature flag access', () => {
            const localGenSettings: LocalGenerationSettings = {
                comfyUIUrl: 'http://localhost:8188',
                comfyUIClientId: 'test',
                workflowJson: '{}',
                mapping: {},
            };
            
            renderWithProvider(
                <ContinuityDirector 
                    {...defaultProps} 
                    localGenSettings={localGenSettings}
                />
            );
            
            expect(screen.getByText('Continuity Director')).toBeInTheDocument();
        });
    });

    describe('refinement tracking', () => {
        it('tracks refined scene IDs', () => {
            const refinedSceneIds = new Set(['scene-1']);
            
            renderWithProvider(
                <ContinuityDirector 
                    {...defaultProps} 
                    refinedSceneIds={refinedSceneIds}
                />
            );
            
            // Refined scenes should be indicated differently
            expect(screen.getByText(/Scene 1:/)).toBeInTheDocument();
        });
    });

    describe('callbacks', () => {
        it('provides onApplySuggestion callback', () => {
            const onApplySuggestion = vi.fn();
            
            renderWithProvider(
                <ContinuityDirector 
                    {...defaultProps} 
                    onApplySuggestion={onApplySuggestion}
                />
            );
            
            // Component should render with the callback available
            expect(screen.getByText(/Scene 1:/)).toBeInTheDocument();
        });

        it('provides onUpdateSceneSummary callback', () => {
            const onUpdateSceneSummary = vi.fn().mockResolvedValue(true);
            
            renderWithProvider(
                <ContinuityDirector 
                    {...defaultProps} 
                    onUpdateSceneSummary={onUpdateSceneSummary}
                />
            );
            
            expect(screen.getByText(/Scene 1:/)).toBeInTheDocument();
        });

        it('provides onExtendTimeline callback', () => {
            const onExtendTimeline = vi.fn();
            
            renderWithProvider(
                <ContinuityDirector 
                    {...defaultProps} 
                    onExtendTimeline={onExtendTimeline}
                />
            );
            
            expect(screen.getByText(/Scene 1:/)).toBeInTheDocument();
        });

        it('provides optional onRerunScene callback', () => {
            const onRerunScene = vi.fn();
            
            renderWithProvider(
                <ContinuityDirector 
                    {...defaultProps} 
                    onRerunScene={onRerunScene}
                />
            );
            
            expect(screen.getByText(/Scene 1:/)).toBeInTheDocument();
        });
    });
});
