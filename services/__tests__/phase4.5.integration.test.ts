import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationEngine, TelemetrySnapshot, Recommendation } from '../recommendationEngine';
import { ExportService, ExportResult } from '../exportService';

/**
 * Phase 4.5: Integration Testing
 * 
 * Comprehensive integration tests covering:
 * - Complete workflows (analyze → filter → export)
 * - Component orchestration
 * - State management across operations
 * - Database-like persistence patterns
 * - Full end-to-end user journeys
 */

describe('Phase 4.5: Integration Testing', () => {
  let mockTelemetryDatabase: TelemetrySnapshot[] = [];
  let mockRecommendations: Recommendation[] = [];

  beforeEach(() => {
    // Reset mock database before each test
    mockTelemetryDatabase = [];
    mockRecommendations = [];
  });

  describe('Workflow 1: Basic Analysis→Export Pipeline', () => {
    it('should complete basic telemetry analysis and export workflow', async () => {
      // Setup: Create test telemetry
      const telemetry: TelemetrySnapshot[] = [
        {
          storyId: 'story-001',
          scenes: 10,
          successRate: 95,
          durationSeconds: 120,
          gpuUsageGb: 2.5,
          retries: 1,
          timeouts: 0,
          timestamp: new Date('2024-11-14T10:00:00Z'),
        },
      ];

      // Step 1: Analyze telemetry
      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);
      expect(Array.isArray(recommendations)).toBe(true);

      // Step 2: Export results
      const exportResult = await ExportService.exportToJSON(telemetry, recommendations);
      expect(exportResult.result.success).toBe(true);
      expect(exportResult.result.format).toBe('json');

      // Verify exported data contains analysis
      const exported = JSON.parse(exportResult.content);
      expect(exported.metadata).toBeDefined();
      expect(exported.data).toBeDefined();
      expect(exported.data.length).toBe(1);
    });

    it('should handle multiple telemetry records in sequence', async () => {
      // Setup: Create multiple telemetry records
      const telemetries: TelemetrySnapshot[] = Array.from({ length: 5 }, (_, i) => ({
        storyId: `story-${String(i + 1).padStart(3, '0')}`,
        scenes: Math.floor(Math.random() * 20) + 5,
        successRate: Math.floor(Math.random() * 30) + 70,
        durationSeconds: Math.floor(Math.random() * 300) + 60,
        gpuUsageGb: Math.random() * 4 + 1,
        retries: Math.floor(Math.random() * 3),
        timeouts: Math.floor(Math.random() * 2),
        timestamp: new Date(Date.now() - Math.random() * 86400000),
      }));

      // Analyze entire batch
      const recommendations = RecommendationEngine.analyzeTelemetry(telemetries);
      expect(Array.isArray(recommendations)).toBe(true);

      // Export in multiple formats
      const csvResult = await ExportService.exportToCSV(telemetries);
      const jsonResult = await ExportService.exportToJSON(telemetries, recommendations);
      const pdfResult = await ExportService.exportToPDF(telemetries, recommendations);

      expect(csvResult.result.success).toBe(true);
      expect(jsonResult.result.success).toBe(true);
      expect(pdfResult.result.success).toBe(true);
      expect(jsonResult.result.rows).toBe(5);
    });
  });

  describe('Workflow 2: Data Filtering & Analysis', () => {
    it('should filter and analyze telemetry by date range', async () => {
      // Setup: Create telemetry spanning multiple dates
      const baseDate = new Date('2024-11-10');
      const telemetries: TelemetrySnapshot[] = Array.from({ length: 10 }, (_, i) => ({
        storyId: `story-${i}`,
        scenes: 10,
        successRate: 90,
        durationSeconds: 100,
        gpuUsageGb: 2,
        retries: 0,
        timeouts: 0,
        timestamp: new Date(baseDate.getTime() + i * 86400000), // Each day
      }));

      // Filter by date range (days 3-7)
      const startDate = new Date('2024-11-12T00:00:00Z');
      const endDate = new Date('2024-11-16T23:59:59Z');

      const filtered = telemetries.filter((t) => t.timestamp >= startDate && t.timestamp <= endDate);

      // Analyze filtered results
      const recommendations = RecommendationEngine.analyzeTelemetry(filtered);

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThanOrEqual(10);
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should filter by performance metrics and analyze', async () => {
      // Setup: Create varied telemetry with different performance levels
      const telemetries: TelemetrySnapshot[] = [
        {
          storyId: 'high-perf',
          scenes: 50,
          successRate: 98,
          durationSeconds: 50,
          gpuUsageGb: 1,
          retries: 0,
          timeouts: 0,
          timestamp: new Date(),
        },
        {
          storyId: 'low-perf',
          scenes: 5,
          successRate: 60,
          durationSeconds: 500,
          gpuUsageGb: 8,
          retries: 5,
          timeouts: 2,
          timestamp: new Date(),
        },
        {
          storyId: 'mid-perf',
          scenes: 20,
          successRate: 85,
          durationSeconds: 150,
          gpuUsageGb: 3,
          retries: 1,
          timeouts: 0,
          timestamp: new Date(),
        },
      ];

      // Filter low performers
      const lowPerformers = telemetries.filter((t) => t.successRate < 80);
      expect(lowPerformers.length).toBe(1);

      // Analyze low performers
      const recommendations = RecommendationEngine.analyzeTelemetry(lowPerformers);
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow 3: State Management & Persistence', () => {
    it('should maintain state through analyze-filter-export cycle', async () => {
      // Step 1: Load initial telemetry
      const initialTelemetry: TelemetrySnapshot[] = [
        {
          storyId: 'state-test-1',
          scenes: 15,
          successRate: 88,
          durationSeconds: 120,
          gpuUsageGb: 2.5,
          retries: 1,
          timeouts: 0,
          timestamp: new Date(),
        },
      ];

      mockTelemetryDatabase = [...initialTelemetry];
      expect(mockTelemetryDatabase.length).toBe(1);

      // Step 2: Analyze
      const recommendations = RecommendationEngine.analyzeTelemetry(mockTelemetryDatabase);
      mockRecommendations = recommendations;

      // Step 3: Filter (verify data unchanged)
      const filtered = mockTelemetryDatabase.filter((t) => t.successRate > 80);
      expect(filtered.length).toBe(1);
      expect(mockTelemetryDatabase.length).toBe(1); // Original unchanged

      // Step 4: Export with state
      const result = await ExportService.exportToJSON(filtered, mockRecommendations);
      expect(result.result.success).toBe(true);

      // Verify state consistency
      expect(mockTelemetryDatabase.length).toBe(1); // Still unchanged
    });

    it('should support incremental analysis workflow', async () => {
      // Setup: Simulate adding telemetry over time
      const batch1: TelemetrySnapshot[] = [
        {
          storyId: 'batch-1-record-1',
          scenes: 10,
          successRate: 90,
          durationSeconds: 100,
          gpuUsageGb: 2,
          retries: 0,
          timeouts: 0,
          timestamp: new Date('2024-11-14T10:00:00Z'),
        },
      ];

      mockTelemetryDatabase = [...batch1];
      let batchRecs = RecommendationEngine.analyzeTelemetry(mockTelemetryDatabase);
      expect(batchRecs).toBeDefined();

      // Add batch 2
      const batch2: TelemetrySnapshot[] = [
        {
          storyId: 'batch-1-record-2',
          scenes: 20,
          successRate: 75,
          durationSeconds: 200,
          gpuUsageGb: 4,
          retries: 2,
          timeouts: 1,
          timestamp: new Date('2024-11-14T11:00:00Z'),
        },
      ];

      mockTelemetryDatabase = [...mockTelemetryDatabase, ...batch2];
      expect(mockTelemetryDatabase.length).toBe(2);

      batchRecs = RecommendationEngine.analyzeTelemetry(mockTelemetryDatabase);
      expect(Array.isArray(batchRecs)).toBe(true);

      // Export cumulative results
      const result = await ExportService.exportToJSON(mockTelemetryDatabase, batchRecs);
      expect(result.result.rows).toBe(2);
    });
  });

  describe('Workflow 4: Multi-Format Export Pipeline', () => {
    it('should export same data in multiple formats with consistency', async () => {
      const telemetry: TelemetrySnapshot[] = [
        {
          storyId: 'multi-format-test',
          scenes: 25,
          successRate: 92,
          durationSeconds: 150,
          gpuUsageGb: 3,
          retries: 1,
          timeouts: 0,
          timestamp: new Date('2024-11-14T12:00:00Z'),
        },
      ];

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetry);

      // Export in all formats
      const csvResult = await ExportService.exportToCSV(telemetry);
      const jsonResult = await ExportService.exportToJSON(telemetry, recommendations);
      const pdfResult = await ExportService.exportToPDF(telemetry, recommendations);

      // All should succeed
      expect(csvResult.result.success).toBe(true);
      expect(jsonResult.result.success).toBe(true);
      expect(pdfResult.result.success).toBe(true);

      // All should contain the same data (row count)
      expect(csvResult.result.rows).toBe(1);
      expect(jsonResult.result.rows).toBe(1);
      expect(pdfResult.result.rows).toBe(1);

      // Verify content types
      expect(typeof csvResult.content).toBe('string');
      expect(typeof jsonResult.content).toBe('string');
      expect(typeof pdfResult.content).toBe('string');
    });

    it('should handle bulk export with performance tracking', async () => {
      const telemetries: TelemetrySnapshot[] = Array.from({ length: 100 }, (_, i) => ({
        storyId: `bulk-export-${i}`,
        scenes: Math.floor(Math.random() * 50),
        successRate: Math.floor(Math.random() * 30) + 70,
        durationSeconds: Math.floor(Math.random() * 300),
        gpuUsageGb: Math.random() * 4 + 0.5,
        retries: Math.floor(Math.random() * 5),
        timeouts: Math.floor(Math.random() * 3),
        timestamp: new Date(Date.now() - Math.random() * 604800000),
      }));

      const recommendations = RecommendationEngine.analyzeTelemetry(telemetries);

      // Track export performance
      const startTime = performance.now();
      const result = await ExportService.exportToJSON(telemetries, recommendations);
      const duration = performance.now() - startTime;

      expect(result.result.success).toBe(true);
      expect(result.result.rows).toBe(100);
      expect(duration < 500).toBe(true); // Should complete in <500ms
    });
  });

  describe('Workflow 5: Error Handling in Integrated Workflows', () => {
    it('should handle errors gracefully in multi-step workflows', async () => {
      // Step 1: Handle empty input
      const emptyAnalysis = RecommendationEngine.analyzeTelemetry([]);
      expect(Array.isArray(emptyAnalysis)).toBe(true);
      expect(emptyAnalysis.length).toBe(0);

      // Step 2: Export empty data should still work
      const emptyExport = await ExportService.exportToJSON([]);
      expect(emptyExport.result.success).toBe(true);
      expect(emptyExport.result.rows).toBe(0);

      // Step 3: Continue with valid data
      const validData: TelemetrySnapshot[] = [
        {
          storyId: 'recovery-test',
          scenes: 10,
          successRate: 85,
          durationSeconds: 100,
          gpuUsageGb: 2,
          retries: 0,
          timeouts: 0,
          timestamp: new Date(),
        },
      ];

      const validAnalysis = RecommendationEngine.analyzeTelemetry(validData);
      expect(validAnalysis).toBeDefined();
    });

    it('should recover from invalid data in batch operations', async () => {
      const mixedData: any[] = [
        {
          storyId: 'valid-1',
          scenes: 10,
          successRate: 90,
          durationSeconds: 100,
          gpuUsageGb: 2,
          retries: 0,
          timeouts: 0,
          timestamp: new Date(),
        },
        null, // Invalid entry
        undefined, // Invalid entry
        {
          storyId: 'valid-2',
          scenes: 20,
          successRate: 85,
          durationSeconds: 150,
          gpuUsageGb: 3,
          retries: 1,
          timeouts: 0,
          timestamp: new Date(),
        },
      ];

      // Filter out invalid entries
      const validData = mixedData.filter((item) => item && typeof item === 'object');
      expect(validData.length).toBe(2);

      // Analyze valid data only
      const analysis = RecommendationEngine.analyzeTelemetry(validData);
      expect(Array.isArray(analysis)).toBe(true);
    });
  });

  describe('Workflow 6: Concurrent Operations', () => {
    it('should handle concurrent analysis and export operations', async () => {
      const telemetries: TelemetrySnapshot[] = Array.from({ length: 50 }, (_, i) => ({
        storyId: `concurrent-${i}`,
        scenes: 10 + i,
        successRate: 80 + (i % 20),
        durationSeconds: 100 + i * 10,
        gpuUsageGb: 2 + (i % 4),
        retries: i % 3,
        timeouts: i % 2,
        timestamp: new Date(Date.now() - Math.random() * 604800000),
      }));

      // Run multiple operations concurrently
      const operations = [
        Promise.resolve().then(() => RecommendationEngine.analyzeTelemetry(telemetries)),
        ExportService.exportToJSON(telemetries),
        ExportService.exportToCSV(telemetries),
        ExportService.exportToPDF(telemetries),
      ];

      const results = await Promise.all(operations);

      expect(results[0]).toBeDefined(); // Analysis
      expect(results[1].result.success).toBe(true); // JSON
      expect(results[2].result.success).toBe(true); // CSV
      expect(results[3].result.success).toBe(true); // PDF
    });

    it('should maintain data consistency across concurrent operations', async () => {
      const originalData: TelemetrySnapshot = {
        storyId: 'consistency-test',
        scenes: 15,
        successRate: 88,
        durationSeconds: 120,
        gpuUsageGb: 2.5,
        retries: 1,
        timeouts: 0,
        timestamp: new Date(),
      };

      const telemetries = Array.from({ length: 10 }, () => ({ ...originalData }));

      // Export simultaneously and verify consistency
      const exports = await Promise.all([
        ExportService.exportToJSON(telemetries),
        ExportService.exportToJSON(telemetries),
        ExportService.exportToCSV(telemetries),
        ExportService.exportToCSV(telemetries),
      ]);

      // All exports should succeed
      expect(exports.every((e) => e.result.success)).toBe(true);

      // JSON exports should be identical
      expect(exports[0].content).toBe(exports[1].content);
      expect(exports[2].content).toBe(exports[3].content);
    });
  });

  describe('Workflow 7: Full User Journey Simulation', () => {
    it('should complete realistic end-to-end user workflow', async () => {
      // User Journey:
      // 1. Import telemetry data
      // 2. View analysis recommendations
      // 3. Filter by performance
      // 4. Export results
      // 5. Generate report

      // Step 1: Import (simulate database load)
      const importedData: TelemetrySnapshot[] = Array.from({ length: 20 }, (_, i) => ({
        storyId: `import-${i}`,
        scenes: Math.floor(Math.random() * 50) + 5,
        successRate: Math.floor(Math.random() * 40) + 60,
        durationSeconds: Math.floor(Math.random() * 400) + 50,
        gpuUsageGb: Math.random() * 6 + 0.5,
        retries: Math.floor(Math.random() * 8),
        timeouts: Math.floor(Math.random() * 4),
        timestamp: new Date(Date.now() - Math.random() * 2592000000), // Last 30 days
      }));

      mockTelemetryDatabase = [...importedData];
      expect(mockTelemetryDatabase.length).toBe(20);

      // Step 2: Analyze all data
      mockRecommendations = RecommendationEngine.analyzeTelemetry(mockTelemetryDatabase);
      expect(Array.isArray(mockRecommendations)).toBe(true);

      // Step 3: Filter poor performers
      const poorPerformers = mockTelemetryDatabase.filter((t) => t.successRate < 75);
      expect(poorPerformers.length).toBeGreaterThanOrEqual(0);

      // Step 4: Generate focused analysis on poor performers
      if (poorPerformers.length > 0) {
        const focusedRecs = RecommendationEngine.analyzeTelemetry(poorPerformers);
        expect(Array.isArray(focusedRecs)).toBe(true);

        // Step 5: Export focused report
        const report = await ExportService.exportToJSON(poorPerformers, focusedRecs);
        expect(report.result.success).toBe(true);
      }

      // Also export comprehensive report
      const comprehensiveReport = await ExportService.exportToJSON(
        mockTelemetryDatabase,
        mockRecommendations,
      );
      expect(comprehensiveReport.result.success).toBe(true);
      expect(comprehensiveReport.result.rows).toBe(20);
    });

    it('should handle multi-session workflow with state persistence', async () => {
      // Session 1: Initial analysis
      const session1Data: TelemetrySnapshot[] = [
        {
          storyId: 'session-1-story-1',
          scenes: 20,
          successRate: 92,
          durationSeconds: 150,
          gpuUsageGb: 3,
          retries: 0,
          timeouts: 0,
          timestamp: new Date('2024-11-14T08:00:00Z'),
        },
      ];

      mockTelemetryDatabase = [...session1Data];
      let sessionRecs = RecommendationEngine.analyzeTelemetry(mockTelemetryDatabase);
      expect(sessionRecs).toBeDefined();

      // Simulate session end (export)
      let sessionExport = await ExportService.exportToJSON(mockTelemetryDatabase, sessionRecs);
      expect(sessionExport.result.success).toBe(true);

      // Session 2: Load previous + new data
      const session2Data: TelemetrySnapshot[] = [
        {
          storyId: 'session-2-story-1',
          scenes: 15,
          successRate: 88,
          durationSeconds: 120,
          gpuUsageGb: 2.5,
          retries: 1,
          timeouts: 0,
          timestamp: new Date('2024-11-14T09:00:00Z'),
        },
      ];

      mockTelemetryDatabase = [...mockTelemetryDatabase, ...session2Data];
      expect(mockTelemetryDatabase.length).toBe(2);

      sessionRecs = RecommendationEngine.analyzeTelemetry(mockTelemetryDatabase);
      sessionExport = await ExportService.exportToJSON(mockTelemetryDatabase, sessionRecs);
      expect(sessionExport.result.rows).toBe(2);
    });
  });

  describe('Workflow 8: Integration Health Checks', () => {
    it('should pass integration health check for all components', async () => {
      const healthCheck = {
        recommendation_engine: false,
        export_service: false,
        data_flow: false,
        concurrent_safety: false,
      };

      // Check RecommendationEngine
      try {
        const result = RecommendationEngine.analyzeTelemetry([]);
        healthCheck.recommendation_engine = Array.isArray(result);
      } catch {
        healthCheck.recommendation_engine = false;
      }

      // Check ExportService
      try {
        const result = await ExportService.exportToJSON([]);
        healthCheck.export_service = result.result.success;
      } catch {
        healthCheck.export_service = false;
      }

      // Check data flow
      try {
        const data: TelemetrySnapshot[] = [
          {
            storyId: 'health-check',
            scenes: 10,
            successRate: 90,
            durationSeconds: 100,
            gpuUsageGb: 2,
            retries: 0,
            timeouts: 0,
            timestamp: new Date(),
          },
        ];
        const recs = RecommendationEngine.analyzeTelemetry(data);
        const exported = await ExportService.exportToJSON(data, recs);
        healthCheck.data_flow = exported.result.success && Array.isArray(recs);
      } catch {
        healthCheck.data_flow = false;
      }

      // Check concurrent safety
      try {
        const promises = [
          ExportService.exportToJSON([]),
          ExportService.exportToCSV([]),
          ExportService.exportToPDF([]),
        ];
        const results = await Promise.all(promises);
        healthCheck.concurrent_safety = results.every((r) => r.result.success);
      } catch {
        healthCheck.concurrent_safety = false;
      }

      // All health checks should pass
      expect(healthCheck.recommendation_engine).toBe(true);
      expect(healthCheck.export_service).toBe(true);
      expect(healthCheck.data_flow).toBe(true);
      expect(healthCheck.concurrent_safety).toBe(true);

      // Overall health
      const allHealthy = Object.values(healthCheck).every((v) => v === true);
      expect(allHealthy).toBe(true);
    });
  });
});
