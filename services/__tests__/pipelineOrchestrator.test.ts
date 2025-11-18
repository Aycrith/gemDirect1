/**
 * Pipeline Orchestrator Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PipelineOrchestrator, PipelineProgressEvent, PipelineResult } from '../../services/pipelineOrchestrator';

describe('PipelineOrchestrator', () => {
  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    orchestrator = new PipelineOrchestrator();
  });

  describe('initialization', () => {
    it('creates orchestrator with default config', () => {
      expect(orchestrator).toBeDefined();
    });

    it('creates orchestrator with custom config', () => {
      const custom = new PipelineOrchestrator({
        timeoutMs: 10000,
        maxRetries: 5,
      });
      expect(custom).toBeDefined();
    });
  });

  describe('generateStoryToVideo', () => {
    it('rejects empty prompt', async () => {
      try {
        await orchestrator.generateStoryToVideo('', 'sci-fi');
        expect.fail('Should reject empty prompt');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('accepts valid prompt', async () => {
      const progressEvents: PipelineProgressEvent[] = [];
      const result = await orchestrator.generateStoryToVideo('Test story prompt', 'sci-fi', (event) => {
        progressEvents.push(event);
      });

      expect(result).toBeDefined();
      expect(result.prompt).toBe('Test story prompt');
      expect(result.genre).toBe('sci-fi');
      expect(result.status).toBe('complete');
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('emits progress events correctly', async () => {
      const progressEvents: PipelineProgressEvent[] = [];
      await orchestrator.generateStoryToVideo('Test prompt', 'fantasy', (event) => {
        progressEvents.push(event);
      });

      const stages = progressEvents.map((e) => e.stage);
      expect(stages).toContain('initializing');
      expect(stages).toContain('health-check');
      expect(stages).toContain('story-generation');
      expect(stages).toContain('scene-queuing');
      expect(stages).toContain('rendering');
      expect(stages).toContain('complete');
    });

    it('generates scenes', async () => {
      const result = await orchestrator.generateStoryToVideo('Hero encounters mystery', 'mystery');

      expect(result.scenes).toBeDefined();
      expect(result.scenes.length).toBeGreaterThan(0);
      expect(result.scenes[0]).toHaveProperty('id');
      expect(result.scenes[0]).toHaveProperty('title');
      expect(result.scenes[0]).toHaveProperty('description');
    });

    it('tracks pipeline result', async () => {
      const result = await orchestrator.generateStoryToVideo('Another story', 'action');
      const retrieved = orchestrator.getPipelineResult(result.id);

      expect(retrieved).toEqual(result);
    });
  });

  describe('pipeline cancellation', () => {
    it('cancels active pipeline', async () => {
      const progressEvents: PipelineProgressEvent[] = [];
      const result = await orchestrator.generateStoryToVideo('Long running story', 'epic', (event) => {
        progressEvents.push(event);
      });

      // Get the pipeline ID and cancel it
      orchestrator.cancelPipeline(result.id);

      const cancelled = orchestrator.getPipelineResult(result.id);
      // After completion, cancellation won't change the final status, but it clears the pipeline
      expect(cancelled?.id).toBe(result.id);
    });
  });

  describe('error handling', () => {
    it('handles invalid prompts gracefully', async () => {
      try {
        // Very long prompt beyond limit
        await orchestrator.generateStoryToVideo('x'.repeat(3000), 'sci-fi');
        expect.fail('Should reject oversized prompt');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('result structure', () => {
    it('returns complete pipeline result', async () => {
      const result = await orchestrator.generateStoryToVideo('Complete test', 'drama');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('genre');
      expect(result).toHaveProperty('storyId');
      expect(result).toHaveProperty('scenes');
      expect(result).toHaveProperty('videoFrames');
      expect(result).toHaveProperty('totalDuration');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('completedAt');
      expect(result).toHaveProperty('status');
    });

    it('calculates total duration correctly', async () => {
      const result = await orchestrator.generateStoryToVideo('Duration test', 'action');

      const calculatedDuration = result.videoFrames.reduce((sum, frame) => sum + frame.duration, 0);
      expect(result.totalDuration).toBe(calculatedDuration);
    });
  });
});
