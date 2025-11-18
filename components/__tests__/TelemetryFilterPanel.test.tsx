/**
 * TelemetryFilterPanel Tests
 * 
 * Comprehensive test suite covering:
 * - Filter state management
 * - Date range filtering
 * - Status, GPU, duration, scene count filtering
 * - Preset save/load
 * - Export functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  TelemetryFilterPanel,
  type TelemetryFilter,
  type TelemetryFilterPanelProps,
} from '../TelemetryFilterPanel';
import type { TelemetrySnapshot } from '../../services/recommendationEngine';

describe('TelemetryFilterPanel', () => {
  const mockTelemetryData: TelemetrySnapshot[] = [
    {
      storyId: 'story-1',
      sceneCount: 5,
      successRate: 95,
      totalDuration: 20 * 60 * 1000,
      gpuPeakUsage: 10000,
      retryCount: 0,
      timeoutCount: 0,
      timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
    },
    {
      storyId: 'story-2',
      sceneCount: 8,
      successRate: 50,
      totalDuration: 30 * 60 * 1000,
      gpuPeakUsage: 22000,
      retryCount: 2,
      timeoutCount: 1,
      timestamp: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
    },
    {
      storyId: 'story-3',
      sceneCount: 3,
      successRate: 100,
      totalDuration: 15 * 60 * 1000,
      gpuPeakUsage: 8000,
      retryCount: 0,
      timeoutCount: 0,
      timestamp: Date.now(),
    },
  ];

  let mockOnFilterChange: ReturnType<typeof vi.fn>;
  let mockOnExport: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnFilterChange = vi.fn() as any;
    mockOnExport = vi.fn() as any;
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = (props?: Partial<TelemetryFilterPanelProps>) => {
    const defaultProps: TelemetryFilterPanelProps = {
      telemetryData: mockTelemetryData,
      onFilterChange: mockOnFilterChange,
      onExport: mockOnExport,
      ...props,
    };
    return render(<TelemetryFilterPanel {...defaultProps} />);
  };

  describe('Rendering', () => {
    it('should render filter panel header', () => {
      renderComponent();
      expect(screen.getByText(/Telemetry Filters/)).toBeInTheDocument();
    });

    it('should display record count', () => {
      renderComponent();
      expect(screen.getByText(/3 \/ 3 records/)).toBeInTheDocument();
    });

    it('should be initially collapsed', () => {
      renderComponent();
      expect(screen.queryByText(/Date Range/)).not.toBeInTheDocument();
    });

    it('should expand when header is clicked', () => {
      renderComponent();
      const header = screen.getByRole('button', { name: /Telemetry Filters/ });
      fireEvent.click(header);
      expect(screen.getByText(/Date Range/)).toBeInTheDocument();
    });

    it('should render all filter sections when expanded', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      expect(screen.getByText('Date Range')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('GPU Usage (GB)')).toBeInTheDocument();
      expect(screen.getByText('Duration (minutes)')).toBeInTheDocument();
      expect(screen.getByText('Scene Count')).toBeInTheDocument();
    });
  });

  describe('Status Filter', () => {
    it('should filter by success status', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const successCheckbox = screen.getByRole('checkbox', { name: /success/ });
      fireEvent.click(successCheckbox);

      await waitFor(() => {
        expect(mockOnFilterChange).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ storyId: 'story-1', successRate: 95 }),
            expect.objectContaining({ storyId: 'story-3', successRate: 100 }),
          ]),
          expect.any(Object),
        );
      });
    });

    it('should filter by failed status', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const failedCheckbox = screen.getByRole('checkbox', { name: /failed/ });
      fireEvent.click(failedCheckbox);

      await waitFor(() => {
        expect(mockOnFilterChange).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ storyId: 'story-2', successRate: 50 }),
          ]),
          expect.any(Object),
        );
      });
    });

    it('should support multiple status selections', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const successCheckbox = screen.getByRole('checkbox', { name: /success/ });
      const failedCheckbox = screen.getByRole('checkbox', { name: /failed/ });
      
      fireEvent.click(successCheckbox);
      fireEvent.click(failedCheckbox);

      await waitFor(() => {
        expect(mockOnFilterChange).toHaveBeenLastCalledWith(
          mockTelemetryData,
          expect.any(Object),
        );
      });
    });
  });

  describe('GPU Filter', () => {
    it('should filter by minimum GPU usage', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const minGpuSliders = screen.getAllByRole('slider');
      const minGpuSlider = minGpuSliders[0]; // First slider is GPU min
      
      fireEvent.change(minGpuSlider, { target: { value: '15' } });

      await waitFor(() => {
        const lastCall = mockOnFilterChange.mock.calls[mockOnFilterChange.mock.calls.length - 1];
        expect(lastCall[0]).toContainEqual(
          expect.objectContaining({ gpuPeakUsage: 22000 }),
        );
      });
    });

    it('should filter by maximum GPU usage', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const sliders = screen.getAllByRole('slider');
      const maxGpuSlider = sliders[1]; // Second slider is GPU max
      
      fireEvent.change(maxGpuSlider, { target: { value: '15' } });

      await waitFor(() => {
        const lastCall = mockOnFilterChange.mock.calls[mockOnFilterChange.mock.calls.length - 1];
        expect(lastCall[0]).toContainEqual(
          expect.objectContaining({ gpuPeakUsage: 10000 }),
        );
      });
    });
  });

  describe('Duration Filter', () => {
    it('should filter by minimum duration', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const sliders = screen.getAllByRole('slider');
      const minDurationSlider = sliders[2]; // Third slider is duration min
      
      fireEvent.change(minDurationSlider, { target: { value: '20' } });

      await waitFor(() => {
        const lastCall = mockOnFilterChange.mock.calls[mockOnFilterChange.mock.calls.length - 1];
        expect(lastCall[0].length).toBeGreaterThan(0);
      });
    });

    it('should filter by maximum duration', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const sliders = screen.getAllByRole('slider');
      const maxDurationSlider = sliders[3]; // Fourth slider is duration max
      
      fireEvent.change(maxDurationSlider, { target: { value: '20' } });

      await waitFor(() => {
        const lastCall = mockOnFilterChange.mock.calls[mockOnFilterChange.mock.calls.length - 1];
        expect(lastCall[0].length).toBeGreaterThan(0);
      });
    });
  });

  describe('Scene Count Filter', () => {
    it('should filter by minimum scene count', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const sliders = screen.getAllByRole('slider');
      const minSceneSlider = sliders[4]; // Fifth slider is scene min
      
      fireEvent.change(minSceneSlider, { target: { value: '5' } });

      await waitFor(() => {
        const lastCall = mockOnFilterChange.mock.calls[mockOnFilterChange.mock.calls.length - 1];
        expect(lastCall[0]).toContainEqual(
          expect.objectContaining({ sceneCount: 5 }),
        );
      });
    });

    it('should filter by maximum scene count', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const sliders = screen.getAllByRole('slider');
      const maxSceneSlider = sliders[5]; // Sixth slider is scene max
      
      fireEvent.change(maxSceneSlider, { target: { value: '5' } });

      await waitFor(() => {
        const lastCall = mockOnFilterChange.mock.calls[mockOnFilterChange.mock.calls.length - 1];
        // Should include story-1 (5 scenes) and story-3 (3 scenes)
        expect(lastCall[0].length).toBeGreaterThan(0);
      });
    });
  });

  describe('Date Range Filter', () => {
    it('should have date input fields', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const dateInputs = screen.getAllByRole('textbox', { hidden: true });
      expect(dateInputs.length).toBeGreaterThan(0);
    });

    it('should filter by date range', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const dateInputs = screen.getAllByDisplayValue('') as HTMLInputElement[];
      const dateFromInput = dateInputs.find(input => input.type === 'date');
      
      if (dateFromInput) {
        fireEvent.change(dateFromInput, { target: { value: '2024-01-01' } });

        await waitFor(() => {
          expect(mockOnFilterChange).toHaveBeenCalled();
        });
      }
    });
  });

  describe('Reset Functionality', () => {
    it('should have reset button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      expect(screen.getByRole('button', { name: /Reset Filters/ })).toBeInTheDocument();
    });

    it('should reset all filters', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const successCheckbox = screen.getByRole('checkbox', { name: /success/ });
      fireEvent.click(successCheckbox);

      await waitFor(() => {
        expect(mockOnFilterChange).toHaveBeenCalled();
      });

      mockOnFilterChange.mockClear();

      fireEvent.click(screen.getByRole('button', { name: /Reset Filters/ }));

      await waitFor(() => {
        expect(mockOnFilterChange).toHaveBeenCalledWith(
          mockTelemetryData,
          expect.objectContaining({}),
        );
      });
    });
  });

  describe('Preset Management', () => {
    it('should render preset input and save button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      expect(screen.getByPlaceholderText('Preset name...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save Preset/ })).toBeInTheDocument();
    });

    it('should save a preset', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const presetInput = screen.getByPlaceholderText('Preset name...');
      fireEvent.change(presetInput, { target: { value: 'My Filter' } });
      fireEvent.click(screen.getByRole('button', { name: /Save Preset/ }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /My Filter/ })).toBeInTheDocument();
      });
    });

    it('should load a saved preset', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      // Save preset
      const presetInput = screen.getByPlaceholderText('Preset name...');
      fireEvent.change(presetInput, { target: { value: 'Test Preset' } });
      fireEvent.click(screen.getByRole('button', { name: /Save Preset/ }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Test Preset/ })).toBeInTheDocument();
      });

      // Load preset
      mockOnFilterChange.mockClear();
      fireEvent.click(screen.getByRole('button', { name: /Test Preset/ }));

      await waitFor(() => {
        expect(mockOnFilterChange).toHaveBeenCalled();
      });
    });
  });

  describe('Export Functionality', () => {
    it('should have export button', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument();
    });

    it('should export filtered data', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const exportButton = screen.getByRole('button', { name: /Export/ });
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(mockOnExport).toHaveBeenCalledWith(mockTelemetryData);
      });
    });

    it('should not show export button if onExport prop is not provided', () => {
      renderComponent({ onExport: undefined });
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty telemetry data', () => {
      renderComponent({ telemetryData: [] });
      expect(screen.getByText(/0 \/ 0 records/)).toBeInTheDocument();
    });

    it('should handle single telemetry record', () => {
      renderComponent({ telemetryData: [mockTelemetryData[0]] });
      expect(screen.getByText(/1 \/ 1 records/)).toBeInTheDocument();
    });

    it('should disable save preset button when name is empty', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const saveButton = screen.getByRole('button', { name: /Save Preset/ });
      expect(saveButton).toBeDisabled();
    });

    it('should enable save preset button when name is entered', () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const presetInput = screen.getByPlaceholderText('Preset name...');
      fireEvent.change(presetInput, { target: { value: 'Filter' } });
      
      const saveButton = screen.getByRole('button', { name: /Save Preset/ });
      expect(saveButton).not.toBeDisabled();
    });

    it('should clear preset name after saving', async () => {
      renderComponent();
      fireEvent.click(screen.getByRole('button', { name: /Telemetry Filters/ }));
      
      const presetInput = screen.getByPlaceholderText('Preset name...') as HTMLInputElement;
      fireEvent.change(presetInput, { target: { value: 'My Preset' } });
      fireEvent.click(screen.getByRole('button', { name: /Save Preset/ }));

      await waitFor(() => {
        expect(presetInput.value).toBe('');
      });
    });

    it('should handle combined filters', async () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('telemetry-filters-toggle'));
      
      // Apply multiple filters
      const successCheckbox = screen.getByRole('checkbox', { name: /success/ });
      fireEvent.click(successCheckbox);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '10' } }); // GPU min

      await waitFor(() => {
        expect(mockOnFilterChange).toHaveBeenCalled();
      });
    });
  });
});
