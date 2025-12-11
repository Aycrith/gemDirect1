import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateTimelineVideos } from '../services/comfyUIService';
import { getGenerationQueue, createVideoTask } from '../services/generationQueue';
import { LocalGenerationSettings, TimelineData } from '../types';

describe('GenerationQueue Integration', () => {
    let queue: any;

    beforeEach(() => {
        queue = getGenerationQueue();
        queue.clear();
    });

    afterEach(() => {
        queue.clear();
    });

    it('generateTimelineVideos should not deadlock when shots use the queue', async () => {
        const settings = {
            featureFlags: { useGenerationQueue: true },
            comfyUIUrl: 'http://localhost:8188'
        } as LocalGenerationSettings;

        const timeline = {
            shots: [
                { id: 'shot1', description: 'shot 1' },
                { id: 'shot2', description: 'shot 2' }
            ],
            shotEnhancers: {},
            transitions: []
        } as unknown as TimelineData;

        // Mock shot generator that uses the queue
        const mockShotGenerator = async (settings: any, shot: any) => {
            const q = getGenerationQueue();
            const task = createVideoTask(async () => {
                return {
                    videoPath: `video_${shot.id}.mp4`,
                    duration: 5,
                    filename: `video_${shot.id}.mp4`
                };
            }, { sceneId: 'scene1', shotId: shot.id });
            
            return q.enqueue(task);
        };

        const result = await generateTimelineVideos(
            settings,
            timeline,
            'vision',
            'summary',
            { shot1: 'img1', shot2: 'img2' },
            undefined,
            { shotGenerator: mockShotGenerator }
        );

        expect(result.shot1.videoPath).toBe('video_shot1.mp4');
        expect(result.shot2.videoPath).toBe('video_shot2.mp4');
    });
});
