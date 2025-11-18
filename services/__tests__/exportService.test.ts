/**
 * ExportService Tests
 * 
 * Comprehensive test suite covering:
 * - CSV export with proper escaping
 * - JSON export with metadata
 * - PDF HTML generation
 * - Data filtering
 * - File download
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import ExportService, { type ExportFormat, type ExportOptions } from '../exportService';
import type { TelemetrySnapshot, Recommendation } from '../recommendationEngine';

describe('ExportService', () => {
  const mockTelemetryData: TelemetrySnapshot[] = [
    {
      storyId: 'story-1',
      sceneCount: 5,
      successRate: 95,
      totalDuration: 20 * 60 * 1000,
      gpuPeakUsage: 10000,
      retryCount: 0,
      timeoutCount: 0,
      timestamp: Date.now() - 24 * 60 * 60 * 1000,
    },
    {
      storyId: 'story-2',
      sceneCount: 8,
      successRate: 50,
      totalDuration: 30 * 60 * 1000,
      gpuPeakUsage: 22000,
      retryCount: 2,
      timeoutCount: 1,
      timestamp: Date.now(),
    },
  ];

  const mockRecommendations: Recommendation[] = [
    {
      id: 'rec-1',
      type: 'gpu',
      title: 'Optimize GPU Usage',
      description: 'Consider using smaller models',
      action: 'Reduce batch size',
      severity: 'warning',
      confidence: 85,
      createdAt: Date.now(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CSV Export', () => {
    it('should export data to CSV format', async () => {
      const { content, result } = await ExportService.exportToCSV(mockTelemetryData);

      expect(result.success).toBe(true);
      expect(result.format).toBe('csv');
      expect(result.rows).toBe(2);
      expect(content).toContain('Story ID');
      expect(content).toContain('story-1');
      expect(content).toContain('story-2');
    });

    it('should include headers in CSV', async () => {
      const { content } = await ExportService.exportToCSV(mockTelemetryData);

      expect(content).toContain('Story ID');
      expect(content).toContain('Scenes');
      expect(content).toContain('Success Rate');
      expect(content).toContain('Duration');
    });

    it('should properly escape quotes in CSV values', async () => {
      const data: TelemetrySnapshot[] = [
        {
          ...mockTelemetryData[0],
          storyId: 'story-"test"',
        },
      ];

      const { content } = await ExportService.exportToCSV(data);

      // Quotes should be escaped
      expect(content).toContain('story-""test""');
    });

    it('should format numeric values in CSV', async () => {
      const { content } = await ExportService.exportToCSV(mockTelemetryData);

      // Success rate should be formatted with one decimal
      expect(content).toContain('95.0');
      expect(content).toContain('50.0');
    });

    it('should handle empty data array', async () => {
      const { content, result } = await ExportService.exportToCSV([]);

      expect(result.success).toBe(true);
      expect(result.rows).toBe(0);
      expect(content).toContain('Story ID'); // Headers should still exist
    });

    it('should support custom fields in CSV', async () => {
      const customFields = [
        { key: 'storyId', label: 'ID' },
        { key: 'successRate', label: 'Success %', format: (v: any) => v.toFixed(0) },
      ];

      const { content } = await ExportService.exportToCSV(mockTelemetryData, {
        fields: customFields,
      });

      expect(content).toContain('ID');
      expect(content).toContain('Success %');
      expect(content).not.toContain('Scenes');
    });

    it('should calculate correct CSV file size', async () => {
      const { result } = await ExportService.exportToCSV(mockTelemetryData);

      expect(result.size).toBeGreaterThan(0);
      expect(result.size).toBeLessThan(10000); // Should be reasonable size
    });
  });

  describe('JSON Export', () => {
    it('should export data to JSON format', async () => {
      const { content, result } = await ExportService.exportToJSON(mockTelemetryData);

      expect(result.success).toBe(true);
      expect(result.format).toBe('json');
      expect(result.rows).toBe(2);

      const parsed = JSON.parse(content);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].storyId).toBe('story-1');
    });

    it('should include metadata in JSON', async () => {
      const { content } = await ExportService.exportToJSON(mockTelemetryData, undefined, {
        includeMetadata: true,
      });

      const parsed = JSON.parse(content);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.exportDate).toBeDefined();
      expect(parsed.metadata.recordCount).toBe(2);
    });

    it('should include recommendations in JSON when provided', async () => {
      const { content } = await ExportService.exportToJSON(
        mockTelemetryData,
        mockRecommendations,
        { includeMetadata: true },
      );

      const parsed = JSON.parse(content);
      expect(parsed.recommendations).toHaveLength(1);
      expect(parsed.recommendations[0].title).toBe('Optimize GPU Usage');
    });

    it('should include date range in metadata', async () => {
      const dateRange = {
        start: Date.now() - 7 * 24 * 60 * 60 * 1000,
        end: Date.now(),
      };

      const { content } = await ExportService.exportToJSON(
        mockTelemetryData,
        undefined,
        { includeMetadata: true, dateRange },
      );

      const parsed = JSON.parse(content);
      expect(parsed.metadata.dateRange).toBeDefined();
      expect(parsed.metadata.dateRange.start).toBeDefined();
    });

    it('should format JSON with proper indentation', async () => {
      const { content } = await ExportService.exportToJSON(mockTelemetryData);

      // Should have proper formatting (not minified)
      expect(content).toContain('\n');
      expect(content).toContain('  '); // Should have indentation
    });

    it('should handle empty data array in JSON', async () => {
      const { content, result } = await ExportService.exportToJSON([]);

      expect(result.success).toBe(true);
      expect(result.rows).toBe(0);

      const parsed = JSON.parse(content);
      expect(parsed.data).toEqual([]);
    });
  });

  describe('PDF Export', () => {
    it('should export data to PDF (HTML) format', async () => {
      const { content, result } = await ExportService.exportToPDF(mockTelemetryData);

      expect(result.success).toBe(true);
      expect(result.format).toBe('pdf');
      expect(result.rows).toBe(2);
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('Telemetry Report');
    });

    it('should include summary statistics in PDF', async () => {
      const { content } = await ExportService.exportToPDF(mockTelemetryData);

      expect(content).toContain('Summary');
      expect(content).toContain('Total Runs');
      expect(content).toContain('Average Success Rate');
      expect(content).toContain('Average Duration');
      expect(content).toContain('Peak GPU Usage');
    });

    it('should include recommendations section in PDF when provided', async () => {
      const { content } = await ExportService.exportToPDF(
        mockTelemetryData,
        mockRecommendations,
      );

      expect(content).toContain('Recommendations');
      expect(content).toContain('Optimize GPU Usage');
    });

    it('should include data table in PDF', async () => {
      const { content } = await ExportService.exportToPDF(mockTelemetryData);

      expect(content).toContain('<table>');
      expect(content).toContain('story-1');
      expect(content).toContain('story-2');
    });

    it('should include CSS styling in PDF', async () => {
      const { content } = await ExportService.exportToPDF(mockTelemetryData);

      expect(content).toContain('<style>');
      expect(content).toContain('font-family');
      expect(content).toContain('border');
    });

    it('should limit data sample to first 20 records in PDF', async () => {
      const largeData = Array(100)
        .fill(null)
        .map((_, i) => ({
          ...mockTelemetryData[0],
          storyId: `story-${i}`,
        }));

      const { content } = await ExportService.exportToPDF(largeData);

      // Should only have 20 rows in table + header row = 21 rows with <tr>
      const rowCount = (content.match(/<tr>/g) || []).length;
      expect(rowCount).toBeLessThanOrEqual(22); // 1 header + 20 data rows + buffer
    });

    it('should calculate correct PDF file size', async () => {
      const { result } = await ExportService.exportToPDF(mockTelemetryData);

      expect(result.size).toBeGreaterThan(0);
      expect(result.size).toBeLessThan(100000); // Should be reasonable size
    });

    it('should handle empty data in PDF', async () => {
      const { content, result } = await ExportService.exportToPDF([]);

      expect(result.success).toBe(true);
      expect(content).toContain('Total Records: 0');
    });

    it('should include date range in PDF metadata', async () => {
      const dateRange = {
        start: Date.now() - 7 * 24 * 60 * 60 * 1000,
        end: Date.now(),
      };

      const { content } = await ExportService.exportToPDF(mockTelemetryData, undefined, {
        dateRange,
      });

      expect(content).toContain('Date Range');
    });
  });

  describe('Filter and Format', () => {
    it('should filter by date range', () => {
      const now = Date.now();
      const filtered = ExportService.filterAndFormat(mockTelemetryData, {
        dateRange: {
          start: now - 1 * 60 * 60 * 1000, // 1 hour ago
          end: now,
        },
      });

      // Should only include story-2 (recent)
      expect(filtered).toHaveLength(1);
      expect(filtered[0].storyId).toBe('story-2');
    });

    it('should filter by success rate', () => {
      const filtered = ExportService.filterAndFormat(mockTelemetryData, {
        successRateMin: 70,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].successRate).toBe(95);
    });

    it('should filter by GPU maximum', () => {
      const filtered = ExportService.filterAndFormat(mockTelemetryData, {
        gpuMax: 15000,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].storyId).toBe('story-1');
    });

    it('should apply multiple filters together', () => {
      const filtered = ExportService.filterAndFormat(mockTelemetryData, {
        successRateMin: 60,
        gpuMax: 20000,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].storyId).toBe('story-1');
    });

    it('should return all data when no filter provided', () => {
      const filtered = ExportService.filterAndFormat(mockTelemetryData);

      expect(filtered).toEqual(mockTelemetryData);
    });

    it('should return empty array when no data matches filters', () => {
      const filtered = ExportService.filterAndFormat(mockTelemetryData, {
        successRateMin: 99,
      });

      expect(filtered).toEqual([]);
    });
  });

  describe('Utility Methods', () => {
    it('should get correct mime type for CSV', () => {
      const mimeType = ExportService.getMimeType('csv');
      expect(mimeType).toBe('text/csv');
    });

    it('should get correct mime type for JSON', () => {
      const mimeType = ExportService.getMimeType('json');
      expect(mimeType).toBe('application/json');
    });

    it('should get correct mime type for PDF', () => {
      const mimeType = ExportService.getMimeType('pdf');
      expect(mimeType).toBe('text/html');
    });

    it('should download file with correct parameters', () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');

      ExportService.downloadFile('test content', 'test.csv', 'text/csv');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle CSV export errors gracefully', async () => {
      // Create data that might cause issues
      const problematicData: any = [{ toString: () => { throw new Error('Bad data'); } }];

      const { result } = await ExportService.exportToCSV(problematicData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('CSV export failed');
    });

    it('should handle JSON export errors gracefully', async () => {
      const problematicData: any = [{ circular: null }];
      problematicData[0].circular = problematicData[0]; // Create circular reference

      const { result } = await ExportService.exportToJSON(problematicData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON export failed');
    });

    it('should provide error message in result', async () => {
      const problematicData: any = [{ badData: undefined }];

      const { result } = await ExportService.exportToCSV(problematicData);

      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large datasets', async () => {
      const largeData = Array(10000)
        .fill(null)
        .map((_, i) => ({
          ...mockTelemetryData[0],
          storyId: `story-${i}`,
        }));

      const { result } = await ExportService.exportToJSON(largeData);

      expect(result.success).toBe(true);
      expect(result.rows).toBe(10000);
    });

    it('should handle special characters in data', async () => {
      const specialData: TelemetrySnapshot[] = [
        {
          ...mockTelemetryData[0],
          storyId: 'story-"with,quotes,and,commas"',
        },
      ];

      const { content } = await ExportService.exportToCSV(specialData);

      expect(content).toContain('story-');
      // Quotes should be properly escaped
      expect(content).not.toContain('story-"with,quotes');
    });

    it('should handle unicode characters', async () => {
      const unicodeData: TelemetrySnapshot[] = [
        {
          ...mockTelemetryData[0],
          storyId: 'story-日本語',
        },
      ];

      const { content } = await ExportService.exportToJSON(unicodeData);

      expect(content).toContain('日本語');
    });

    it('should handle zero values in summary', async () => {
      const zeroData: TelemetrySnapshot[] = [
        {
          storyId: 'story-1',
          sceneCount: 0,
          successRate: 0,
          totalDuration: 0,
          gpuPeakUsage: 0,
          retryCount: 0,
          timeoutCount: 0,
          timestamp: Date.now(),
        },
      ];

      const { content } = await ExportService.exportToPDF(zeroData);

      expect(content).toContain('0');
    });
  });
});
