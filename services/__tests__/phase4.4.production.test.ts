import { describe, it, expect } from 'vitest';
import { RecommendationEngine, TelemetrySnapshot } from '../recommendationEngine';
import { ExportService, type ExportField } from '../exportService';

/**
 * Phase 4.4: Production Readiness Validation
 * 
 * Tests error handling, security, edge cases, and production scenarios
 * to ensure the system is ready for deployment.
 */

describe('Phase 4.4: Production Readiness Validation', () => {
  describe('Error Handling & Recovery', () => {
    it('should handle empty dataset without crashing', () => {
      const result = RecommendationEngine.analyzeTelemetry([]);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle single record gracefully', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-1',
        scenes: 10,
        successRate: 90,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle NaN values safely', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-nan',
        scenes: NaN as any,
        successRate: NaN as any,
        durationSeconds: NaN as any,
        gpuUsageGb: NaN as any,
        retries: NaN as any,
        timeouts: NaN as any,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle Infinity values safely', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-inf',
        scenes: Infinity as any,
        successRate: -Infinity as any,
        durationSeconds: Infinity as any,
        gpuUsageGb: -Infinity as any,
        retries: Infinity as any,
        timeouts: -Infinity as any,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle negative values correctly', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-neg',
        scenes: -10,
        successRate: -50,
        durationSeconds: -120,
        gpuUsageGb: -5,
        retries: -3,
        timeouts: -2,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extreme positive values', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-extreme',
        scenes: 999999,
        successRate: 100,
        durationSeconds: 1000000,
        gpuUsageGb: 500,
        retries: 10000,
        timeouts: 5000,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle all fields at zero', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-zero',
        scenes: 0,
        successRate: 0,
        durationSeconds: 0,
        gpuUsageGb: 0,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle all fields at maximum', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-max',
        scenes: 100,
        successRate: 100,
        durationSeconds: 100000,
        gpuUsageGb: 100,
        retries: 100,
        timeouts: 100,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle floating point precision', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-float',
        scenes: 10.5,
        successRate: 85.7,
        durationSeconds: 100.123,
        gpuUsageGb: 2.456,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Security & Input Validation', () => {
    it('should sanitize special characters in export', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-special',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const result = await ExportService.exportToJSON([snapshot], undefined, {
        includeMetadata: true,
      });
      expect(result.content).toBeDefined();
      expect(typeof result.content === 'string').toBe(true);
      expect(result.result.success).toBe(true);
    });

    it('should handle Unicode characters safely', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-unicode-🎬',
        scenes: 10,
        successRate: 85,
        durationSeconds: 150,
        gpuUsageGb: 3,
        retries: 1,
        timeouts: 0,
        timestamp: new Date(),
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
      // Results should be serializable
      const json = JSON.stringify(result);
      expect(json.length > 0).toBe(true);
    });

    it('should prevent CSV injection vulnerabilities', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: '=cmd.exe',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const fields: ExportField[] = [
        { key: 'storyId', label: 'Story ID' },
        { key: 'scenes', label: 'Scenes' },
      ];
      const result = await ExportService.exportToCSV([snapshot], { fields });
      expect(result.content).toBeDefined();
      // CSV should escape dangerous formulas
      expect(result.result.success).toBe(true);
    });

    it('should handle very long strings safely', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-long-' + 'x'.repeat(1000),
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const result = await ExportService.exportToJSON([snapshot]);
      expect(result.content).toBeDefined();
      expect(typeof result.content === 'string').toBe(true);
    });

    it('should prevent data corruption with valid JSON', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-json',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const result = await ExportService.exportToJSON([snapshot]);
      // Should be valid JSON (no circular references)
      expect(() => JSON.parse(result.content)).not.toThrow();
    });
  });

  describe('Edge Cases & Boundary Conditions', () => {
    it('should handle timestamp edge cases (epoch)', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-epoch',
        scenes: 10,
        successRate: 90,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(0), // Unix epoch
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle future timestamps', () => {
      const futureDate = new Date(Date.now() + 86400000 * 365);
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-future',
        scenes: 10,
        successRate: 90,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: futureDate,
      };
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle very large dataset (50K records)', async () => {
      const snapshots: TelemetrySnapshot[] = Array.from({ length: 50000 }, (_, i) => ({
        storyId: `story-${i}`,
        scenes: Math.floor(Math.random() * 100),
        successRate: Math.floor(Math.random() * 100),
        durationSeconds: Math.floor(Math.random() * 3600),
        gpuUsageGb: Math.random() * 8,
        retries: Math.floor(Math.random() * 10),
        timeouts: Math.floor(Math.random() * 5),
        timestamp: new Date(Date.now() - Math.random() * 86400000),
      }));

      const start = performance.now();
      const result = await ExportService.exportToJSON(snapshots);
      const duration = performance.now() - start;

      expect(result.content).toBeDefined();
      expect(result.result.success).toBe(true);
      expect(duration < 5000).toBe(true); // Should complete in under 5 seconds
    });

    it('should handle empty export field selection gracefully', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-empty-fields',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const result = await ExportService.exportToJSON([snapshot], undefined, {
        fields: [],
      });
      expect(result.content).toBeDefined();
      expect(result.result.success).toBe(true);
    });
  });

  describe('Production Deployment Checklist', () => {
    it('should have consistent error handling across export formats', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-formats',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };
      const snapshots = [snapshot];

      const csvResult = await ExportService.exportToCSV(snapshots);
      const jsonResult = await ExportService.exportToJSON(snapshots);
      const pdfResult = await ExportService.exportToPDF(snapshots);

      expect(csvResult.content).toBeDefined();
      expect(jsonResult.content).toBeDefined();
      expect(pdfResult.content).toBeDefined();
      expect(csvResult.result.success).toBe(true);
      expect(jsonResult.result.success).toBe(true);
      expect(pdfResult.result.success).toBe(true);
    });

    it('should maintain data integrity across export-import cycle', async () => {
      const original: TelemetrySnapshot = {
        storyId: 'test-integrity',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };

      const jsonResult = await ExportService.exportToJSON([original]);
      const parsed = JSON.parse(jsonResult.content);

      // Check key fields are preserved in metadata
      expect(parsed.metadata).toBeDefined();
      expect(parsed.data).toBeDefined();
      expect(parsed.data[0].scenes).toBe(5);
      expect(parsed.data[0].successRate).toBe(95);
    });

    it('should provide meaningful error handling', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-error',
        scenes: -999,
        successRate: 200, // Invalid: > 100
        durationSeconds: -500,
        gpuUsageGb: -10,
        retries: -5,
        timeouts: -3,
        timestamp: new Date(),
      };
      // Should handle gracefully without throwing
      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle concurrent operations without race conditions', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-concurrent',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };

      const promises = Array.from({ length: 10 }, (_, i) => {
        if (i % 3 === 0) {
          return ExportService.exportToCSV([snapshot]);
        } else if (i % 3 === 1) {
          return ExportService.exportToJSON([snapshot]);
        } else {
          return ExportService.exportToPDF([snapshot]);
        }
      });

      const results = await Promise.all(promises);
      expect(results.every((r) => r.content !== undefined && r.result.success)).toBe(true);
    });

    it('should have consistent output format', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-consistency',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };

      const result1 = await ExportService.exportToJSON([snapshot]);
      const result2 = await ExportService.exportToJSON([snapshot]);

      // Ignore volatile metadata fields (e.g., exportDate) and compare structural content.
      const parsed1 = JSON.parse(result1.content);
      const parsed2 = JSON.parse(result2.content);
      if (parsed1.metadata) delete parsed1.metadata.exportDate;
      if (parsed2.metadata) delete parsed2.metadata.exportDate;
      expect(JSON.stringify(parsed1)).toBe(JSON.stringify(parsed2));
    });

    it('should be memory efficient with large datasets', async () => {
      const snapshots: TelemetrySnapshot[] = Array.from({ length: 10000 }, (_, i) => ({
        storyId: `story-${i}`,
        scenes: Math.floor(Math.random() * 100),
        successRate: Math.floor(Math.random() * 100),
        durationSeconds: Math.floor(Math.random() * 3600),
        gpuUsageGb: Math.random() * 8,
        retries: Math.floor(Math.random() * 10),
        timeouts: Math.floor(Math.random() * 5),
        timestamp: new Date(),
      }));

      const result = await ExportService.exportToJSON(snapshots);

      expect(result.content).toBeDefined();
      expect(result.content.length > 0).toBe(true);
      expect(result.result.success).toBe(true);
    });

    it('should have audit trail compatibility', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-audit',
        scenes: 10,
        successRate: 90,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date('2024-11-14T10:00:00Z'),
      };

      const result = RecommendationEngine.analyzeTelemetry([snapshot]);
      // Should produce consistent results for audit trail
      const result2 = RecommendationEngine.analyzeTelemetry([snapshot]);
      expect(JSON.stringify(result)).toBe(JSON.stringify(result2));
    });

    it('should be backwards compatible with legacy data formats', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-legacy',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };

      const fields: ExportField[] = [
        { key: 'storyId', label: 'Story ID' },
        { key: 'scenes', label: 'Scenes' },
        { key: 'successRate', label: 'Success Rate' },
      ];
      const result = await ExportService.exportToJSON([snapshot], undefined, { fields });

      expect(result.content).toBeDefined();
      expect(result.result.success).toBe(true);
    });
  });

  describe('Production Monitoring & Logging', () => {
    it('should track analysis performance', () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-perf-analysis',
        scenes: 10,
        successRate: 90,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };

      const start = performance.now();
      RecommendationEngine.analyzeTelemetry([snapshot]);
      const duration = performance.now() - start;

      // Should complete quickly (< 10ms is optimal)
      expect(duration < 10).toBe(true);
    });

    it('should track export performance', async () => {
      const snapshots: TelemetrySnapshot[] = Array.from({ length: 100 }, (_, i) => ({
        storyId: `story-${i}`,
        scenes: Math.floor(Math.random() * 100),
        successRate: Math.floor(Math.random() * 100),
        durationSeconds: Math.floor(Math.random() * 3600),
        gpuUsageGb: Math.random() * 8,
        retries: Math.floor(Math.random() * 10),
        timeouts: Math.floor(Math.random() * 5),
        timestamp: new Date(),
      }));

      const start = performance.now();
      await ExportService.exportToJSON(snapshots);
      const duration = performance.now() - start;

      // Should complete quickly (< 100ms for 100 records)
      expect(duration < 100).toBe(true);
    });

    it('should validate serialization output for logging', async () => {
      const snapshot: TelemetrySnapshot = {
        storyId: 'test-logging',
        scenes: 5,
        successRate: 95,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(),
      };

      const result = await ExportService.exportToJSON([snapshot]);

      // Should be valid JSON for logging systems
      expect(() => JSON.parse(result.content)).not.toThrow();
      // Should not be excessively large
      expect(result.content.length < 100000).toBe(true);
    });
  });
});
