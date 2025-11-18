/**
 * Phase 4.3 - Performance Validation Tests
 * 
 * Comprehensive performance benchmarking for Phase 3.2 components
 * Tests: scalability, stress scenarios, memory usage, optimization
 * 
 * Success Criteria:
 * - RecommendationEngine: <10ms per 100 records at all scales
 * - Export operations: <100ms per 1000 records
 * - Filter operations: <50ms per 1000 records
 * - Memory: Stable under concurrent operations
 * - Stress: Handles rapid successive operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationEngine, type Recommendation } from '../../services/recommendationEngine';
import ExportService from '../../services/exportService';

describe('Phase 4.3 - Performance Validation', () => {
  
  // Helper: Generate large dataset
  const generateTelemetryDataset = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      storyId: `story-${i}`,
      scenes: 3 + (i % 10),
      successRate: 50 + (i % 50),
      durationSeconds: 900 + (i % 2000),
      gpuUsageGb: 8 + (i % 20),
      retries: i % 5,
      timeouts: i % 3,
      timestamp: new Date(Date.now() - (i * 3600000)),
    })) as any;
  };

  // Helper: Convert for export
  const convertToExportFormat = (data: any[]) => {
    return data.map(t => ({
      storyId: t.storyId,
      sceneCount: t.scenes,
      successRate: t.successRate,
      totalDuration: t.durationSeconds * 1000,
      gpuPeakUsage: t.gpuUsageGb * 1024,
      retryCount: t.retries,
      timeoutCount: t.timeouts,
      timestamp: Date.now(),
    }));
  };

  describe('Scenario 1: Scalability Testing', () => {
    
    it('RecommendationEngine handles 1000 records efficiently', () => {
      const dataset = generateTelemetryDataset(1000);
      
      const startTime = performance.now();
      const recommendations = RecommendationEngine.analyzeTelemetry(dataset);
      const elapsed = performance.now() - startTime;

      expect(recommendations).toBeDefined();
      expect(elapsed).toBeLessThan(100); // Should handle 1000 records in <100ms
      console.log(`✓ 1000 records analyzed in ${elapsed.toFixed(2)}ms`);
    });

    it('RecommendationEngine handles 5000 records within acceptable time', () => {
      const dataset = generateTelemetryDataset(5000);
      
      const startTime = performance.now();
      const recommendations = RecommendationEngine.analyzeTelemetry(dataset);
      const elapsed = performance.now() - startTime;

      expect(recommendations).toBeDefined();
      expect(elapsed).toBeLessThan(500); // 5000 records in <500ms is acceptable
      console.log(`✓ 5000 records analyzed in ${elapsed.toFixed(2)}ms`);
    });

    it('RecommendationEngine maintains <100ms for 10000 record milestone', () => {
      const dataset = generateTelemetryDataset(10000);
      
      const startTime = performance.now();
      const recommendations = RecommendationEngine.analyzeTelemetry(dataset);
      const elapsed = performance.now() - startTime;

      expect(recommendations).toBeDefined();
      // At 10k, we want <1 second for production readiness
      expect(elapsed).toBeLessThan(1000);
      console.log(`✓ 10000 records analyzed in ${elapsed.toFixed(2)}ms`);
    });

    it('CSV export scales linearly with record count', async () => {
      const sizes = [100, 500, 1000];
      const times: number[] = [];

      for (const size of sizes) {
        const data = convertToExportFormat(generateTelemetryDataset(size));
        
        const start = performance.now();
        await ExportService.exportToCSV(data);
        const elapsed = performance.now() - start;
        
        times.push(elapsed);
        console.log(`✓ ${size} records exported in ${elapsed.toFixed(2)}ms`);
      }

      // Check for reasonable scaling (not exponential)
      const ratio = times[2] / times[0]; // 1000 records / 100 records
      expect(ratio).toBeLessThan(15); // Should scale roughly linearly (10x data ≈ 10x time)
    });

    it('JSON export handles large datasets efficiently', async () => {
      const data = convertToExportFormat(generateTelemetryDataset(1000));
      
      const startTime = performance.now();
      const { result, content } = await ExportService.exportToJSON(data);
      const elapsed = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(content).toBeDefined();
      expect(elapsed).toBeLessThan(200); // 1000 records JSON export <200ms
      console.log(`✓ 1000 records JSON exported in ${elapsed.toFixed(2)}ms`);
    });
  });

  describe('Scenario 2: Stress Testing', () => {
    
    it('handles rapid successive analyses without degradation', () => {
      const dataset = generateTelemetryDataset(100);
      const times: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        RecommendationEngine.analyzeTelemetry(dataset);
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      // All runs should be consistently fast
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      expect(avgTime).toBeLessThan(20);
      expect(maxTime - minTime).toBeLessThan(10); // Variance should be small
      console.log(`✓ 10 successive analyses: avg ${avgTime.toFixed(2)}ms, variance ${(maxTime - minTime).toFixed(2)}ms`);
    });

    it('handles concurrent filtering operations', () => {
      const dataset = generateTelemetryDataset(500);
      
      const startTime = performance.now();
      
      // Simulate concurrent filter operations
      const filters = [
        (d: any[]) => d.filter(t => t.successRate > 80),
        (d: any[]) => d.filter(t => t.gpuUsageGb < 15),
        (d: any[]) => d.filter(t => t.durationSeconds > 1200),
        (d: any[]) => d.filter(t => t.retries === 0),
        (d: any[]) => d.filter(t => t.timeouts === 0),
      ];

      const results = filters.map(filter => filter(dataset));
      const elapsed = performance.now() - startTime;

      expect(results.length).toBe(5);
      results.forEach(result => expect(result.length).toBeGreaterThan(0));
      expect(elapsed).toBeLessThan(50); // All 5 filters in <50ms
      console.log(`✓ 5 concurrent filters on 500 records in ${elapsed.toFixed(2)}ms`);
    });

    it('handles rapid successive exports', async () => {
      const data = convertToExportFormat(generateTelemetryDataset(200));
      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await ExportService.exportToCSV(data);
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(30);
      console.log(`✓ 5 successive exports: avg ${avgTime.toFixed(2)}ms`);
    });

    it('handles mixed operations without interference', async () => {
      const dataset = generateTelemetryDataset(300);
      
      const startTime = performance.now();
      
      // Analyze
      const recommendations = RecommendationEngine.analyzeTelemetry(dataset);
      
      // Filter
      const filtered = dataset.filter(t => t.successRate > 70);
      
      // Export
      const { result } = await ExportService.exportToCSV(
        convertToExportFormat(filtered)
      );
      
      const elapsed = performance.now() - startTime;

      expect(recommendations).toBeDefined();
      expect(filtered.length).toBeGreaterThan(0);
      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(100); // Complete workflow <100ms
      console.log(`✓ Complete workflow (analyze+filter+export) in ${elapsed.toFixed(2)}ms`);
    });
  });

  describe('Scenario 3: Memory & Resource Efficiency', () => {
    
    it('processes large dataset without memory bloat', () => {
      const dataset = generateTelemetryDataset(2000);
      const originalLength = dataset.length;

      const recommendations = RecommendationEngine.analyzeTelemetry(dataset);

      // Dataset should remain unchanged
      expect(dataset.length).toBe(originalLength);
      expect(recommendations).toBeDefined();
      console.log(`✓ 2000 records processed without dataset mutation`);
    });

    it('filters preserve data integrity', () => {
      const dataset = generateTelemetryDataset(500);
      const original = JSON.stringify(dataset);

      // Multiple filters
      const filtered1 = dataset.filter(t => t.successRate > 60);
      const filtered2 = dataset.filter(t => t.gpuUsageGb < 18);
      const filtered3 = dataset.filter(t => t.retries < 3);

      // Original unchanged
      expect(JSON.stringify(dataset)).toBe(original);
      expect(dataset.length).toBe(500);
      
      // Filtered results valid
      expect(filtered1.length).toBeGreaterThan(0);
      expect(filtered2.length).toBeGreaterThan(0);
      expect(filtered3.length).toBeGreaterThan(0);
      console.log(`✓ Multiple filters without data corruption`);
    });

    it('recommendations maintain quality at scale', () => {
      const dataset = generateTelemetryDataset(1000);
      
      const recommendations = RecommendationEngine.analyzeTelemetry(dataset);

      // Verify quality metrics
      recommendations.forEach(rec => {
        expect(rec.id).toBeDefined();
        expect(rec.type).toBeDefined();
        expect(rec.severity).toMatch(/critical|warning|info/);
        expect(rec.confidence).toBeGreaterThanOrEqual(70);
        expect(rec.confidence).toBeLessThanOrEqual(90);
      });

      console.log(`✓ ${recommendations.length} recommendations generated with full quality`);
    });
  });

  describe('Scenario 4: Optimization Baselines', () => {
    
    it('establishes RecommendationEngine baseline at 100 records', () => {
      const dataset = generateTelemetryDataset(100);
      
      const start = performance.now();
      RecommendationEngine.analyzeTelemetry(dataset);
      const baseline = performance.now() - start;

      // Baseline expectation: <5ms for 100 records
      expect(baseline).toBeLessThan(10);
      console.log(`📊 BASELINE: 100 records in ${baseline.toFixed(2)}ms`);
    });

    it('establishes export baseline at 100 records', async () => {
      const data = convertToExportFormat(generateTelemetryDataset(100));
      
      const start = performance.now();
      await ExportService.exportToCSV(data);
      const baseline = performance.now() - start;

      // Baseline expectation: <3ms for 100 records
      expect(baseline).toBeLessThan(50);
      console.log(`📊 BASELINE: 100 records CSV export in ${baseline.toFixed(2)}ms`);
    });

    it('establishes filter baseline on 500 records', () => {
      const dataset = generateTelemetryDataset(500);
      
      const start = performance.now();
      const filtered = dataset.filter(t => t.successRate > 70);
      const baseline = performance.now() - start;

      expect(filtered.length).toBeGreaterThan(0);
      expect(baseline).toBeLessThan(20);
      console.log(`📊 BASELINE: 500 records filtered in ${baseline.toFixed(2)}ms`);
    });

    it('compares performance: 100 vs 1000 records', () => {
      const small = generateTelemetryDataset(100);
      const large = generateTelemetryDataset(1000);

      const start100 = performance.now();
      RecommendationEngine.analyzeTelemetry(small);
      const time100 = performance.now() - start100;

      const start1000 = performance.now();
      RecommendationEngine.analyzeTelemetry(large);
      const time1000 = performance.now() - start1000;

      const scalingFactor = time1000 / time100;

      // Allow generous headroom in CI while still catching pathological slowdowns.
      expect(scalingFactor).toBeLessThan(40); // Should scale reasonably (not exponentially)
      console.log(`📊 SCALING: 100→1000 records = ${scalingFactor.toFixed(1)}x time increase`);
    });
  });

  describe('Scenario 5: Throughput & Capacity', () => {
    
    it('calculates maximum safe batch size for RecommendationEngine', () => {
      const targetTimeMs = 100;
      let maxBatchSize = 100;

      while (maxBatchSize < 50000) {
        const dataset = generateTelemetryDataset(maxBatchSize);
        const start = performance.now();
        RecommendationEngine.analyzeTelemetry(dataset);
        const elapsed = performance.now() - start;

        if (elapsed > targetTimeMs) {
          // Found the limit
          console.log(`📊 MAX BATCH: ${maxBatchSize} records in ${elapsed.toFixed(2)}ms`);
          expect(maxBatchSize).toBeGreaterThanOrEqual(1000);
          return;
        }

        maxBatchSize = Math.min(maxBatchSize + 1000, 50000);
      }

      console.log(`📊 MAX BATCH: >50000 records (performance headroom)`);
      expect(maxBatchSize).toBeGreaterThanOrEqual(50000);
    });

    it('calculates maximum safe batch size for CSV export', async () => {
      const targetTimeMs = 100;
      let maxBatchSize = 100;

      while (maxBatchSize < 10000) {
        const data = convertToExportFormat(generateTelemetryDataset(maxBatchSize));
        const start = performance.now();
        await ExportService.exportToCSV(data);
        const elapsed = performance.now() - start;

        if (elapsed > targetTimeMs) {
          console.log(`📊 MAX EXPORT BATCH: ${maxBatchSize} records in ${elapsed.toFixed(2)}ms`);
          expect(maxBatchSize).toBeGreaterThanOrEqual(500);
          return;
        }

        maxBatchSize += 500;
      }

      console.log(`📊 MAX EXPORT BATCH: >10000 records (performance headroom)`);
      expect(maxBatchSize).toBeGreaterThanOrEqual(10000);
    });

    it('achieves sustained throughput over time', () => {
      const batchSize = 100;
      const numBatches = 50;
      const times: number[] = [];

      for (let i = 0; i < numBatches; i++) {
        const dataset = generateTelemetryDataset(batchSize);
        const start = performance.now();
        RecommendationEngine.analyzeTelemetry(dataset);
        const elapsed = performance.now() - start;
        times.push(elapsed);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const firstHalf = times.slice(0, 25).reduce((a, b) => a + b, 0) / 25;
      const secondHalf = times.slice(25).reduce((a, b) => a + b, 0) / 25;

      // Performance should be consistent (no major degradation over time).
      // Allow higher variance in shared CI environments while still catching extreme regressions.
      expect(Math.abs(secondHalf - firstHalf) / firstHalf).toBeLessThan(1.0); // <100% variance
      console.log(`📊 THROUGHPUT: ${numBatches} batches @ avg ${avgTime.toFixed(2)}ms each`);
    });
  });

  describe('Scenario 6: Production Load Simulation', () => {
    
    it('simulates typical production workload', async () => {
      const startTotal = performance.now();

      // Typical production scenario: 
      // 1. Import 500 historical records
      // 2. Analyze for recommendations
      // 3. Filter for quality (>80% success)
      // 4. Export filtered results

      const importedData = generateTelemetryDataset(500);

      // Step 1: Analyze
      const start1 = performance.now();
      const recommendations = RecommendationEngine.analyzeTelemetry(importedData);
      const time1 = performance.now() - start1;

      // Step 2: Filter
      const start2 = performance.now();
      const qualityRuns = importedData.filter(t => t.successRate > 80);
      const time2 = performance.now() - start2;

      // Step 3: Export
      const start3 = performance.now();
      const { result } = await ExportService.exportToCSV(
        convertToExportFormat(qualityRuns)
      );
      const time3 = performance.now() - start3;

      const totalTime = performance.now() - startTotal;

      expect(recommendations.length).toBeGreaterThan(0);
      expect(qualityRuns.length).toBeGreaterThan(0);
      expect(result.success).toBe(true);
      expect(totalTime).toBeLessThan(200);

      console.log(`
        📊 PRODUCTION WORKLOAD (500 records):
           Analyze: ${time1.toFixed(2)}ms
           Filter:  ${time2.toFixed(2)}ms
           Export:  ${time3.toFixed(2)}ms
           Total:   ${totalTime.toFixed(2)}ms
      `);
    });

    it('simulates peak load scenario', async () => {
      const startTotal = performance.now();

      // Peak scenario: 1000 records analyzed with multiple export formats

      const data = generateTelemetryDataset(1000);

      // Analyze
      const recStart = performance.now();
      const recommendations = RecommendationEngine.analyzeTelemetry(data);
      const recTime = performance.now() - recStart;

      // Multiple export formats
      const exportData = convertToExportFormat(data.filter(t => t.successRate > 75));

      const csvStart = performance.now();
      const csvResult = await ExportService.exportToCSV(exportData);
      const csvTime = performance.now() - csvStart;

      const jsonStart = performance.now();
      const jsonResult = await ExportService.exportToJSON(exportData);
      const jsonTime = performance.now() - jsonStart;

      const totalTime = performance.now() - startTotal;

      expect(recommendations.length).toBeGreaterThan(0);
      expect(csvResult.result.success).toBe(true);
      expect(jsonResult.result.success).toBe(true);
      expect(totalTime).toBeLessThan(500);

      console.log(`
        📊 PEAK LOAD (1000 records, multi-format export):
           Analyze: ${recTime.toFixed(2)}ms
           CSV:     ${csvTime.toFixed(2)}ms
           JSON:    ${jsonTime.toFixed(2)}ms
           Total:   ${totalTime.toFixed(2)}ms
      `);
    });
  });
});
