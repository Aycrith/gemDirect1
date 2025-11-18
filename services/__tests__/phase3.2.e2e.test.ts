/**
 * Phase 3.2 E2E Integration Tests - Simplified
 * 
 * Comprehensive validation of telemetry analysis, filtering, and export flow
 * 
 * Test Scenarios:
 * 1. Recommendation Generation Flow
 * 2. Export Functionality
 * 3. Performance Benchmarks  
 * 4. Edge Cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationEngine, type Recommendation } from '../../services/recommendationEngine';
import ExportService from '../../services/exportService';

describe('Phase 3.2 E2E Integration Tests', () => {
  
  describe('Scenario 1: Recommendation Generation', () => {
    
    it('generates recommendations from telemetry', () => {
      const telemetry = [{
        storyId: 'test-story',
        scenes: 5,
        successRate: 98,
        durationSeconds: 1200,
        gpuUsageGb: 10,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      }] as any;

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('generates critical recommendations for poor performance', () => {
      const telemetry = [{
        storyId: 'poor-run',
        scenes: 8,
        successRate: 30,
        durationSeconds: 3600,
        gpuUsageGb: 26,
        retries: 5,
        timeouts: 2,
        timestamp: new Date(),
      }] as any;

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);

      expect(recommendations.length).toBeGreaterThan(0);
      const criticals = recommendations.filter(r => r.severity === 'critical');
      expect(criticals.length).toBeGreaterThan(0);
    });

    it('handles empty dataset gracefully', () => {
      const recommendations = RecommendationEngine.analyzeTelemetry([]);
      expect(recommendations).toEqual([]);
    });

    it('processes large datasets efficiently', () => {
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        storyId: `story-${i}`,
        scenes: 5 + (i % 10),
        successRate: 60 + (i % 40),
        durationSeconds: 900 + (i % 1000),
        gpuUsageGb: 8 + (i % 20) * 0.5,
        retries: i % 3,
        timeouts: i % 2,
        timestamp: new Date(Date.now() - (i * 3600000)),
      })) as any;
      
      const startTime = performance.now();
      const recommendations = RecommendationEngine.analyzeTelemetry(largeDataset);
      const elapsed = performance.now() - startTime;

      expect(recommendations).toBeDefined();
      expect(elapsed).toBeLessThan(100); // Should complete quickly
    });

    it('recommendations include all required fields', () => {
      const telemetry = [{
        storyId: 'test',
        scenes: 10,
        successRate: 40,
        durationSeconds: 2400,
        gpuUsageGb: 24,
        retries: 3,
        timeouts: 1,
        timestamp: new Date(),
      }] as any;

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);

      recommendations.forEach(rec => {
        expect(rec.id).toBeDefined();
        expect(rec.type).toBeDefined();
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(rec.severity).toMatch(/critical|warning|info/);
        expect(rec.confidence).toBeGreaterThan(0);
        expect(rec.createdAt).toBeDefined();
      });
    });
  });

  describe('Scenario 2: Export Functionality', () => {
    
    it('exports to CSV format', async () => {
      const data = [{
        storyId: 'export-test',
        sceneCount: 5,
        successRate: 85,
        totalDuration: 1200000,
        gpuPeakUsage: 12000,
        retryCount: 1,
        timeoutCount: 0,
        timestamp: Date.now(),
      }];

      const { content, result } = await ExportService.exportToCSV(data);

      expect(result.success).toBe(true);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('Story ID'); // Header
    });

    it('exports to JSON format', async () => {
      const data = [{
        storyId: 'json-test',
        sceneCount: 3,
        successRate: 92,
        totalDuration: 900000,
        gpuPeakUsage: 10000,
        retryCount: 0,
        timeoutCount: 0,
        timestamp: Date.now(),
      }];

      const { content, result } = await ExportService.exportToJSON(data);

      expect(result.success).toBe(true);
      expect(content).toBeDefined();
      const parsed = JSON.parse(content);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.length).toBe(1);
      expect(parsed.metadata).toBeDefined();
    });

    it('preserves data during CSV export', async () => {
      const original = {
        storyId: 'integrity-test',
        sceneCount: 7,
        successRate: 88.5,
        totalDuration: 1500000,
        gpuPeakUsage: 14000,
        retryCount: 2,
        timeoutCount: 1,
        timestamp: Date.now(),
      };

      const { content } = await ExportService.exportToCSV([original]);

      expect(content).toContain('integrity-test');
      expect(content).toContain('88.5');
    });

    it('handles export of multiple records', async () => {
      const data = Array.from({ length: 10 }, (_, i) => ({
        storyId: `story-${i}`,
        sceneCount: 3 + i,
        successRate: 70 + (i * 2),
        totalDuration: 900000 + (i * 100000),
        gpuPeakUsage: 10000 + (i * 1000),
        retryCount: i % 3,
        timeoutCount: i % 2,
        timestamp: Date.now(),
      }));

      const { result: csvResult } = await ExportService.exportToCSV(data);
      const { result: jsonResult } = await ExportService.exportToJSON(data);

      expect(csvResult.success).toBe(true);
      expect(csvResult.rows).toBe(10);
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.rows).toBe(10);
    });
  });

  describe('Scenario 3: Performance Benchmarks', () => {
    
    it('RecommendationEngine handles 100 records efficiently', () => {
      const dataset = Array.from({ length: 100 }, (_, i) => ({
        storyId: `perf-${i}`,
        scenes: 5,
        successRate: 85,
        durationSeconds: 1200,
        gpuUsageGb: 12,
        retries: 1,
        timeouts: 0,
        timestamp: new Date(Date.now() - (i * 1000)),
      })) as any;
      
      const start = performance.now();
      RecommendationEngine.analyzeTelemetry(dataset);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });

    it('CSV export completes quickly for 500 records', async () => {
      const data = Array.from({ length: 500 }, (_, i) => ({
        storyId: `export-${i}`,
        sceneCount: 5,
        successRate: 80 + Math.random() * 20,
        totalDuration: 1000000 + Math.random() * 1000000,
        gpuPeakUsage: 10000 + Math.random() * 15000,
        retryCount: Math.floor(Math.random() * 3),
        timeoutCount: Math.random() > 0.8 ? 1 : 0,
        timestamp: Date.now(),
      }));
      
      const start = performance.now();
      await ExportService.exportToCSV(data);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('Scenario 4: Edge Cases', () => {
    
    it('handles extreme performance values', () => {
      const extreme = [{
        storyId: 'extreme',
        scenes: 50,
        successRate: 0,
        durationSeconds: 7200,
        gpuUsageGb: 30,
        retries: 10,
        timeouts: 5,
        timestamp: new Date(),
      }] as any;

      const recommendations = RecommendationEngine.analyzeTelemetry(extreme);
      expect(recommendations.length).toBeGreaterThan(0);
      
      const critical = recommendations.filter(r => r.severity === 'critical');
      expect(critical.length).toBeGreaterThan(0);
    });

    it('filters data by success rate', () => {
      const mixed = [
        {
          storyId: 'good',
          sceneCount: 5,
          successRate: 95,
          totalDuration: 1200000,
          gpuPeakUsage: 12000,
          retryCount: 0,
          timeoutCount: 0,
          timestamp: Date.now(),
        },
        {
          storyId: 'bad',
          sceneCount: 5,
          successRate: 40,
          totalDuration: 1200000,
          gpuPeakUsage: 12000,
          retryCount: 2,
          timeoutCount: 1,
          timestamp: Date.now(),
        },
      ];

      const successfulOnly = mixed.filter(t => t.successRate > 80);
      expect(successfulOnly.length).toBe(1);
      expect(successfulOnly[0].storyId).toBe('good');
    });

    it('exports with metadata', async () => {
      const data = [{
        storyId: 'meta-test',
        sceneCount: 5,
        successRate: 85,
        totalDuration: 1200000,
        gpuPeakUsage: 12000,
        retryCount: 1,
        timeoutCount: 0,
        timestamp: Date.now(),
      }];

      const { content } = await ExportService.exportToJSON(data);
      const parsed = JSON.parse(content);

      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.exportDate).toBeDefined();
      expect(parsed.metadata.recordCount).toBe(1);
    });

    it('maintains data immutability during analysis', () => {
      const original = [{
        storyId: 'immut-test',
        scenes: 5,
        successRate: 85,
        durationSeconds: 1200,
        gpuUsageGb: 12,
        retries: 1,
        timeouts: 0,
        timestamp: new Date(),
      }] as any;

      const copy = JSON.parse(JSON.stringify(original));

      RecommendationEngine.analyzeTelemetry(original);

      expect(JSON.stringify(original)).toBe(JSON.stringify(copy));
    });
  });

  describe('Scenario 5: Integration Flows', () => {
    
    it('complete analysis → export flow', async () => {
      const telemetry = Array.from({ length: 20 }, (_, i) => ({
        storyId: `flow-${i}`,
        scenes: 3 + (i % 5),
        successRate: 70 + (i % 30),
        durationSeconds: 900 + (i % 1000),
        gpuUsageGb: 10 + (i % 15) * 0.1,
        retries: i % 3,
        timeouts: i % 2,
        timestamp: new Date(),
      })) as any;

      // Step 1: Analyze telemetry
      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      expect(recommendations.length).toBeGreaterThanOrEqual(0);

      // Step 2: Filter by success rate
      const highQuality = telemetry.filter(t => t.successRate > 80);
      expect(highQuality.length).toBeGreaterThan(0);

      // Step 3: Export filtered data (convert to ExportService format)
      const exportData = highQuality.map(t => ({
        storyId: t.storyId,
        sceneCount: t.scenes,
        successRate: t.successRate,
        totalDuration: t.durationSeconds * 1000,
        gpuPeakUsage: t.gpuUsageGb * 1024,
        retryCount: t.retries,
        timeoutCount: t.timeouts,
        timestamp: Date.now(),
      }));

      const { result, content } = await ExportService.exportToCSV(exportData);
      expect(result.success).toBe(true);
      expect(content.split('\n').length).toBeGreaterThan(1);
    });

    it('handles mixed quality telemetry', () => {
      const mixed = [
        // Good run
        {
          storyId: 'good-1',
          scenes: 5,
          successRate: 95,
          durationSeconds: 1200,
          gpuUsageGb: 11,
          retries: 0,
          timeouts: 0,
          timestamp: new Date(),
        },
        // Problematic run
        {
          storyId: 'bad-1',
          scenes: 8,
          successRate: 45,
          durationSeconds: 3000,
          gpuUsageGb: 27,
          retries: 4,
          timeouts: 2,
          timestamp: new Date(),
        },
      ] as any;

      const recommendations = RecommendationEngine.analyzeTelemetry(mixed);
      
      // Should have recommendations addressing issues
      expect(recommendations.length).toBeGreaterThan(0);
      
      // Good runs should be easily filterable
      const goodRuns = mixed.filter(t => t.successRate > 90);
      expect(goodRuns.length).toBe(1);
    });
  });
});
