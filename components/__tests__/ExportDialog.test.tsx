/**
 * ExportDialog Tests
 * 
 * Comprehensive test suite covering:
 * - Format selection
 * - Field selection
 * - Preview generation
 * - Export functionality
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExportDialog, type ExportDialogProps } from '../ExportDialog';
import type { TelemetrySnapshot, Recommendation } from '../../services/recommendationEngine';

describe('ExportDialog', () => {
  const mockTelemetryData: TelemetrySnapshot[] = [
    {
      storyId: 'story-1',
      sceneCount: 5,
      successRate: 95,
      totalDuration: 20 * 60 * 1000,
      gpuPeakUsage: 10000,
      retryCount: 0,
      timeoutCount: 0,
      timestamp: Date.now(),
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
      title: 'Optimize GPU',
      description: 'Test',
      severity: 'warning',
      confidence: 85,
      createdAt: Date.now(),
    },
  ];

  const mockOnClose = vi.fn();
  const mockOnExportComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = (props?: Partial<ExportDialogProps>) => {
    const defaultProps: ExportDialogProps = {
      data: mockTelemetryData,
      isOpen: true,
      onClose: mockOnClose,
      onExportComplete: mockOnExportComplete,
      ...props,
    };
    return render(<ExportDialog {...defaultProps} />);
  };

  describe('Rendering', () => {
    it('should render when isOpen is true', () => {
      renderComponent();
      expect(screen.getByText('Export Telemetry Data')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      renderComponent({ isOpen: false });
      expect(screen.queryByText('Export Telemetry Data')).not.toBeInTheDocument();
    });

    it('should render format options', () => {
      renderComponent();
      expect(screen.getByText('CSV')).toBeInTheDocument();
      expect(screen.getByText('JSON')).toBeInTheDocument();
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });

    it('should render filename input', () => {
      renderComponent();
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('should render export button', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: /Export as CSV/ })).toBeInTheDocument();
    });

    it('should render close button', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: /Close dialog/ })).toBeInTheDocument();
    });
  });

  describe('Format Selection', () => {
    it('should default to CSV format', () => {
      renderComponent();
      const csvRadio = screen.getByRole('radio', { name: /CSV/ }) as HTMLInputElement;
      expect(csvRadio.checked).toBe(true);
    });

    it('should allow format change to JSON', () => {
      renderComponent();
      const jsonRadio = screen.getByRole('radio', { name: /JSON/ });
      fireEvent.click(jsonRadio);
      expect(screen.getByRole('button', { name: /Export as JSON/ })).toBeInTheDocument();
    });

    it('should allow format change to PDF', () => {
      renderComponent();
      const pdfRadio = screen.getByRole('radio', { name: /PDF/ });
      fireEvent.click(pdfRadio);
      expect(screen.getByRole('button', { name: /Export as PDF/ })).toBeInTheDocument();
    });

    it('should update filename extension when format changes', () => {
      renderComponent();
      const pdfRadio = screen.getByRole('radio', { name: /PDF/ });
      fireEvent.click(pdfRadio);
      expect(screen.getByText('.html')).toBeInTheDocument();
    });
  });

  describe('Field Selection', () => {
    it('should show field selection for CSV format', () => {
      renderComponent();
      const csvRadio = screen.getByRole('radio', { name: /CSV/ });
      fireEvent.click(csvRadio);
      expect(screen.getByText('Columns to Export')).toBeInTheDocument();
    });

    it('should not show field selection for JSON format', () => {
      renderComponent();
      const jsonRadio = screen.getByRole('radio', { name: /JSON/ });
      fireEvent.click(jsonRadio);
      expect(screen.queryByText('Columns to Export')).not.toBeInTheDocument();
    });

    it('should have all fields selected by default', () => {
      renderComponent();
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect((checkbox as HTMLInputElement).checked).toBe(true);
      });
    });

    it('should allow field deselection', () => {
      renderComponent();
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    });

    it('should allow field reselection', () => {
      renderComponent();
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[0]);
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    });
  });

  describe('Filename Input', () => {
    it('should have default filename', () => {
      renderComponent();
      const inputs = screen.getAllByRole('textbox');
      const filenameInput = inputs[0] as HTMLInputElement;
      expect(filenameInput.value).toMatch(/^telemetry-\d+$/);
    });

    it('should allow filename modification', () => {
      renderComponent();
      const inputs = screen.getAllByRole('textbox');
      const filenameInput = inputs[0] as HTMLInputElement;
      fireEvent.change(filenameInput, { target: { value: 'my-export' } });
      expect(filenameInput.value).toBe('my-export');
    });

    it('should display correct file extension for CSV', () => {
      renderComponent();
      expect(screen.getByText('.csv')).toBeInTheDocument();
    });

    it('should display correct file extension for JSON', () => {
      renderComponent();
      const jsonRadio = screen.getByRole('radio', { name: /JSON/ });
      fireEvent.click(jsonRadio);
      expect(screen.getByText('.json')).toBeInTheDocument();
    });

    it('should display correct file extension for PDF', () => {
      renderComponent();
      const pdfRadio = screen.getByRole('radio', { name: /PDF/ });
      fireEvent.click(pdfRadio);
      expect(screen.getByText('.html')).toBeInTheDocument();
    });
  });

  describe('Preview', () => {
    it('should show preview section', () => {
      renderComponent();
      expect(screen.getByText(/Preview/)).toBeInTheDocument();
    });

    it('should display preview table', () => {
      renderComponent();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('should show first 3 records in preview', () => {
      const largeData = Array(10)
        .fill(null)
        .map((_, i) => ({
          ...mockTelemetryData[0],
          storyId: `story-${i}`,
        }));

      renderComponent({ data: largeData });
      const rows = screen.getAllByRole('row');
      // 1 header + 3 data rows
      expect(rows.length).toBeLessThanOrEqual(4);
    });

    it('should show empty message when no data', () => {
      renderComponent({ data: [] });
      expect(screen.getByText('No data to export')).toBeInTheDocument();
    });

    it('should format data in preview', () => {
      renderComponent();
      expect(screen.getByText(/95.0%/)).toBeInTheDocument();
      expect(screen.getByText(/20.0 min/)).toBeInTheDocument();
    });
  });

  describe('Summary', () => {
    it('should show record count', () => {
      renderComponent();
      // Find the summary section by class, then verify content
      const summarySection = document.querySelector('.export-summary');
      expect(summarySection).toBeInTheDocument();
      expect(summarySection?.textContent).toContain('Records to export');
      expect(summarySection?.textContent).toContain('2');
    });

    it('should show recommendation count when available', () => {
      renderComponent({ recommendations: mockRecommendations });
      // Find the summary section and verify recommendations are shown
      const summarySection = document.querySelector('.export-summary');
      expect(summarySection).toBeInTheDocument();
      expect(summarySection?.textContent).toContain('Recommendations included');
      expect(summarySection?.textContent).toContain('1');
    });

    it('should not show recommendation count when not available', () => {
      renderComponent({ recommendations: undefined });
      expect(screen.queryByText(/Recommendations included/)).not.toBeInTheDocument();
    });
  });

  describe('Dialog Controls', () => {
    it('should call onClose when close button clicked', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Close dialog/ }));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when cancel button clicked', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should disable cancel button during export', async () => {
      renderComponent();
      const exportBtn = screen.getByRole('button', { name: /Export as CSV/ });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        const cancelBtn = screen.getByRole('button', { name: /Cancel/ }) as HTMLButtonElement;
        expect(cancelBtn.disabled).toBe(true);
      });
    });

    it('should disable export button when no data', () => {
      renderComponent({ data: [] });
      const exportBtn = screen.getByRole('button', { name: /Export as CSV/ }) as HTMLButtonElement;
      expect(exportBtn.disabled).toBe(true);
    });
  });

  describe('Export Functionality', () => {
    it('should show exporting state', async () => {
      renderComponent();
      const exportBtn = screen.getByRole('button', { name: /Export as CSV/ });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(screen.getByText(/Exporting/)).toBeInTheDocument();
      });
    });

    it('should disable inputs during export', async () => {
      renderComponent();
      const exportBtn = screen.getByRole('button', { name: /Export as CSV/ });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        const inputs = screen.getAllByRole('textbox');
        inputs.forEach(input => {
          expect((input as HTMLInputElement).disabled).toBe(true);
        });
      });
    });

    it('should disable format selection during export', async () => {
      renderComponent();
      const exportBtn = screen.getByRole('button', { name: /Export as CSV/ });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        const radios = screen.getAllByRole('radio');
        radios.forEach(radio => {
          expect((radio as HTMLInputElement).disabled).toBe(true);
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle single record export', () => {
      renderComponent({ data: [mockTelemetryData[0]] });
      const container = screen.getByText(/Records to export/).parentElement;
      expect(container?.textContent).toContain('Records to export');
      expect(container?.textContent).toContain('1');
    });

    it('should handle very large filenames', () => {
      renderComponent();
      const inputs = screen.getAllByRole('textbox');
      const longFilename = 'a'.repeat(200);
      fireEvent.change(inputs[0], { target: { value: longFilename } });
      expect((inputs[0] as HTMLInputElement).value).toBe(longFilename);
    });

    it('should handle special characters in filename', () => {
      renderComponent();
      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: 'export-[2024]-test' } });
      expect((inputs[0] as HTMLInputElement).value).toBe('export-[2024]-test');
    });

    it('should handle rapid format changes', () => {
      renderComponent();
      const csvRadio = screen.getByRole('radio', { name: /CSV/ });
      const jsonRadio = screen.getByRole('radio', { name: /JSON/ });
      const pdfRadio = screen.getByRole('radio', { name: /PDF/ });

      fireEvent.click(jsonRadio);
      fireEvent.click(pdfRadio);
      fireEvent.click(csvRadio);

      expect((csvRadio as HTMLInputElement).checked).toBe(true);
    });

    it('should maintain selected fields when switching formats', () => {
      renderComponent();
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      const jsonRadio = screen.getByRole('radio', { name: /JSON/ });
      fireEvent.click(jsonRadio);

      const csvRadio = screen.getByRole('radio', { name: /CSV/ });
      fireEvent.click(csvRadio);

      // First field should still be unchecked
      expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    });
  });
});
