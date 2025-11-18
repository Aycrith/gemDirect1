/**
 * RecommendationEngine Tests
 * 
 * Comprehensive test suite covering:
 * - Telemetry analysis and pattern detection
 * - Local recommendation generation
 */

import { describe, it, expect } from 'vitest';
import {
  RecommendationEngine,
  type TelemetrySnapshot,
  type Recommendation,
} from '../recommendationEngine';

describe('RecommendationEngine', () => {
  const mockTelemetry: TelemetrySnapshot = {
    storyId: 'story-1',
    scenes: 5,
    successRate: 95,
    durationSeconds: 1200,
    gpuUsageGb: 18,
    retries: 0,
    timeouts: 0,
    timestamp: new Date(),
  };

  describe('analyzeTelemetry', () => {
    it('should return empty array for empty telemetry data', () => {
      const recommendations = RecommendationEngine.analyzeTelemetry([]);
      expect(recommendations).toEqual([]);
    });

    it('should detect low success rate pattern', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, successRate: 45 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      const successRec = recommendations.find(r => r.type === 'success_rate');
      
      expect(successRec).toBeDefined();
      expect(successRec?.severity).toBe('critical');
      expect(successRec?.confidence).toBe(90);
    });

    it('should detect high GPU usage pattern', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, gpuUsageGb: 25 }, // Must be > 24 for critical
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      const gpuRec = recommendations.find(r => r.type === 'gpu');
      
      expect(gpuRec).toBeDefined();
      expect(gpuRec?.severity).toBe('critical');
      expect(gpuRec?.title).toContain('GPU');
    });

    it('should detect timeout patterns', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, timeouts: 2 },
        { ...mockTelemetry, timeouts: 1 },
        { ...mockTelemetry, timeouts: 0 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      const timeoutRec = recommendations.find(r => r.type === 'timeout');
      
      expect(timeoutRec).toBeDefined();
      expect(timeoutRec?.title).toContain('Timeout');
    });

    it('should detect long duration patterns', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, durationSeconds: 2000 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      const perfRec = recommendations.find(r => r.type === 'performance');
      
      expect(perfRec).toBeDefined();
      expect(perfRec?.title).toContain('Duration');
    });

    it('should detect high retry rates', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, retries: 3 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      const retryRec = recommendations.find(r => r.type === 'retry');
      
      expect(retryRec).toBeDefined();
      expect(retryRec?.title).toContain('Retry');
    });

    it('should not generate recommendations for healthy telemetry', () => {
      const recommendations = RecommendationEngine.analyzeTelemetry([mockTelemetry]);
      expect(recommendations.length).toBe(0);
    });

    it('should handle multiple telemetry snapshots', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, successRate: 40 },
        { ...mockTelemetry, successRate: 50 },
        { ...mockTelemetry, successRate: 45 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should assign correct severity levels', () => {
      const criticalTelemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, successRate: 40, gpuUsageGb: 25 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(criticalTelemetry);
      const critical = recommendations.filter(r => r.severity === 'critical');
      
      expect(critical.length).toBeGreaterThan(0);
    });

    it('should set action text for recommendations', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, successRate: 60 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      const recommendation = recommendations[0];
      
      expect(recommendation.action).toBeDefined();
      expect(recommendation.action?.length).toBeGreaterThan(0);
    });

    it('should set correct confidence scores', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, successRate: 50 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      const recommendation = recommendations[0];
      
      expect(recommendation.confidence).toBeGreaterThanOrEqual(70);
      expect(recommendation.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('generateFromTelemetry', () => {
    it('should return recommendations async', async () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, successRate: 50 },
      ];

      const recommendations = await RecommendationEngine.generateFromTelemetry(telemetry);
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should work with empty telemetry', async () => {
      const recommendations = await RecommendationEngine.generateFromTelemetry([]);
      expect(recommendations).toEqual([]);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations from telemetry', async () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, successRate: 45, timeouts: 2 },
      ];

      const recommendations = await RecommendationEngine.generateRecommendations(telemetry);
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle telemetry with zero retries and timeouts', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, retries: 0, timeouts: 0 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should handle very large telemetry datasets', () => {
      const telemetry: TelemetrySnapshot[] = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...mockTelemetry,
          storyId: `story-${i}`,
          successRate: 50 + Math.random() * 40,
        }));

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should handle recommendations with all fields populated', () => {
      const telemetry: TelemetrySnapshot[] = [
        { ...mockTelemetry, successRate: 30, gpuUsageGb: 25, timeouts: 5, retries: 10 },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      recommendations.forEach((rec: Recommendation) => {
        expect(rec.id).toBeDefined();
        expect(rec.type).toBeDefined();
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(rec.severity).toBeDefined();
        expect(rec.confidence).toBeDefined();
        expect(rec.createdAt).toBeDefined();
      });
    });

    it('should handle boundary conditions', () => {
      const telemetry: TelemetrySnapshot[] = [
        {
          ...mockTelemetry,
          successRate: 70.1, // Just above 70% threshold
          gpuUsageGb: 20.0, // Exactly at 20GB threshold
          durationSeconds: 1499.9, // Just below 25 minute threshold
        },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      expect(recommendations.length).toBe(0);
    });
  });
});
