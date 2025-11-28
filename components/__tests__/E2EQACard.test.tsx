import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import E2EQACard from '../E2EQACard';
import type { Scene, KeyframeData } from '../../types';

// Mock the hooks
vi.mock('../../utils/hooks', () => ({
    useVisualBible: vi.fn(() => ({
        visualBible: null,
        setVisualBible: vi.fn(),
    })),
}));

describe('E2EQACard', () => {
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

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('returns null when there are no scenes', () => {
            const { container } = render(
                <E2EQACard 
                    scenes={[]} 
                    generatedImages={{}} 
                />
            );
            expect(container.firstChild).toBeNull();
        });

        it('renders the card when scenes exist', () => {
            const scenes = [createMockScene('scene-1', 'Scene 1')];
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={{}} 
                />
            );
            expect(screen.getByText('End-to-End QA')).toBeInTheDocument();
        });

        it('displays total scene count', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
                createMockScene('scene-3', 'Scene 3'),
            ];
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={{}} 
                />
            );
            expect(screen.getByText('3')).toBeInTheDocument();
            expect(screen.getByText('in project')).toBeInTheDocument();
        });
    });

    describe('keyframe metrics', () => {
        it('counts scenes with single keyframes', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
            ];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': 'base64imagedata',
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={generatedImages} 
                />
            );
            expect(screen.getByText('1 / 2')).toBeInTheDocument();
        });

        it('counts scenes with bookend keyframes', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
            ];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': { start: 'startframe', end: 'endframe' },
                'scene-2': 'singleframe',
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={generatedImages} 
                />
            );
            // Both scenes have keyframes
            expect(screen.getByText('2 / 2')).toBeInTheDocument();
            // One scene is in bookend mode
            expect(screen.getByText('1')).toBeInTheDocument();
        });
    });

    describe('video metrics', () => {
        it('counts scenes with generated videos', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
                createMockScene('scene-3', 'Scene 3'),
            ];
            const generatedVideos = {
                'scene-1': 'video1.mp4',
                'scene-3': 'video3.mp4',
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={{}} 
                    generatedVideos={generatedVideos}
                />
            );
            // Check for videos count (2 / 3)
            const videosSection = screen.getByText('Videos').closest('div');
            expect(videosSection).toBeInTheDocument();
        });
    });

    describe('pipeline status', () => {
        it('shows "Not Started" when no keyframes or videos exist', () => {
            const scenes = [createMockScene('scene-1', 'Scene 1')];
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={{}} 
                />
            );
            expect(screen.getByText('Not Started')).toBeInTheDocument();
        });

        it('shows "Pipeline In Progress" when some keyframes exist', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
            ];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': 'keyframe1',
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={generatedImages} 
                />
            );
            expect(screen.getByText('Pipeline In Progress')).toBeInTheDocument();
        });

        it('shows "Pipeline Complete" when all scenes have videos', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
            ];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': 'keyframe1',
                'scene-2': 'keyframe2',
            };
            const generatedVideos = {
                'scene-1': 'video1.mp4',
                'scene-2': 'video2.mp4',
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={generatedImages} 
                    generatedVideos={generatedVideos}
                />
            );
            expect(screen.getByText('Pipeline Complete')).toBeInTheDocument();
        });

        it('shows "Pending Video Generation" when keyframes exist but videos are incomplete', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
            ];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': 'keyframe1',
                'scene-2': 'keyframe2',
            };
            const generatedVideos = {
                'scene-1': 'video1.mp4',
                // scene-2 has keyframe but no video
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={generatedImages} 
                    generatedVideos={generatedVideos}
                />
            );
            expect(screen.getByText('Pending Video Generation')).toBeInTheDocument();
        });
    });

    describe('action hints', () => {
        it('shows getting started hint when not started', () => {
            const scenes = [createMockScene('scene-1', 'Scene 1')];
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={{}} 
                />
            );
            expect(screen.getByText(/Getting Started/)).toBeInTheDocument();
        });

        it('shows pending videos hint when keyframes exist without videos', () => {
            const scenes = [
                createMockScene('scene-1', 'Scene 1'),
                createMockScene('scene-2', 'Scene 2'),
            ];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': 'keyframe1',
                'scene-2': 'keyframe2',
            };
            const generatedVideos = {
                'scene-1': 'video1.mp4',
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={generatedImages} 
                    generatedVideos={generatedVideos}
                />
            );
            expect(screen.getByText(/1 scene\(s\) have keyframes but no videos/)).toBeInTheDocument();
        });
    });

    describe('progress calculation', () => {
        it('calculates 0% progress when nothing is complete', () => {
            const scenes = [createMockScene('scene-1', 'Scene 1')];
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={{}} 
                />
            );
            expect(screen.getByText('0%')).toBeInTheDocument();
        });

        it('calculates 50% progress when keyframes are complete but no videos', () => {
            const scenes = [createMockScene('scene-1', 'Scene 1')];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': 'keyframe1',
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={generatedImages} 
                />
            );
            expect(screen.getByText('50%')).toBeInTheDocument();
        });

        it('calculates 100% progress when everything is complete', () => {
            const scenes = [createMockScene('scene-1', 'Scene 1')];
            const generatedImages: Record<string, KeyframeData> = {
                'scene-1': 'keyframe1',
            };
            const generatedVideos = {
                'scene-1': 'video1.mp4',
            };
            render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={generatedImages} 
                    generatedVideos={generatedVideos}
                />
            );
            expect(screen.getByText('100%')).toBeInTheDocument();
        });
    });

    describe('custom className', () => {
        it('applies custom className', () => {
            const scenes = [createMockScene('scene-1', 'Scene 1')];
            const { container } = render(
                <E2EQACard 
                    scenes={scenes} 
                    generatedImages={{}} 
                    className="custom-class"
                />
            );
            expect(container.firstChild).toHaveClass('custom-class');
        });
    });
});
