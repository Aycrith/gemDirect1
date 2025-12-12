import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import LocalGenerationSettingsModal from '../LocalGenerationSettingsModal';
import { LocalGenerationSettings } from '../../types';
import { DEFAULT_FEATURE_FLAGS } from '../../utils/featureFlags';

describe('LocalGenerationSettingsModal', () => {
    const mockSettings: LocalGenerationSettings = {
        comfyUIUrl: 'http://localhost:8188',
        comfyUIClientId: 'test-client',
        workflowProfiles: {},
        featureFlags: { ...DEFAULT_FEATURE_FLAGS },
        // Add other required fields with defaults
        videoProvider: 'comfyui-local',
        comfyUIWebSocketUrl: 'ws://localhost:8188/ws',
        workflowJson: '',
        mapping: {},
        modelId: 'flux',
        keyframeMode: 'single',
        llmProviderUrl: '',
        llmModel: '',
        llmTemperature: 0.7,
        llmTimeoutMs: 30000,
        llmRequestFormat: 'openai',
        useMockLLM: false,
        visionLLMProviderUrl: '',
        visionLLMModel: '',
        visionLLMTemperature: 0.7,
        visionLLMTimeoutMs: 30000,
        useUnifiedVisionModel: false,
        healthCheckIntervalMs: 30000,
        promptVersion: 'v1',
        comfyUIFetchMaxRetries: 3,
        comfyUIFetchTimeoutMs: 30000,
        comfyUIFetchRetryDelayMs: 1000,
    };

    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();
    const mockAddToast = vi.fn();

    beforeEach(() => {
        mockOnClose.mockClear();
        mockOnSave.mockClear();
        mockAddToast.mockClear();
    });

    it('renders the FLF2V toggle in the Continuity category', () => {
        render(
            <LocalGenerationSettingsModal
                isOpen={true}
                onClose={mockOnClose}
                settings={mockSettings}
                onSave={mockOnSave}
                addToast={mockAddToast}
            />
        );

        // Switch to Features tab
        const featuresTab = screen.getByRole('button', { name: /Features/ });
        fireEvent.click(featuresTab);

        // Check for Continuity category
        expect(screen.getByText('Continuity')).toBeDefined();

        // Check for FLF2V toggle label
        expect(screen.getByText('First-Last-Frame-to-Video')).toBeDefined();
        
        // Check for description
        expect(screen.getByText(/Use the last frame of the previous shot/)).toBeDefined();
    });

    it('renders the Video Upscaling toggle in the Quality Enhancement category', () => {
        render(
            <LocalGenerationSettingsModal
                isOpen={true}
                onClose={mockOnClose}
                settings={mockSettings}
                onSave={mockOnSave}
                addToast={mockAddToast}
            />
        );

        // Switch to Features tab
        fireEvent.click(screen.getByRole('button', { name: /Features/ }));

        // Check for Quality category
        expect(screen.getByText('Quality Enhancement')).toBeDefined();

        // Check for Video Upscaling toggle label
        expect(screen.getByText('Video Upscaling')).toBeDefined();

        // Check for description
        expect(screen.getByText(/Apply upscaler workflow as post-processing step after video generation/)).toBeDefined();
    });

    it('toggles Video Upscaling flag', () => {
        render(
            <LocalGenerationSettingsModal
                isOpen={true}
                onClose={mockOnClose}
                settings={mockSettings}
                onSave={mockOnSave}
                addToast={mockAddToast}
            />
        );

        // Switch to Features tab
        fireEvent.click(screen.getByRole('button', { name: /Features/ }));

        const labelText = screen.getByText('Video Upscaling');
        const label = labelText.closest('label');
        expect(label).toBeTruthy();
        fireEvent.click(within(label as HTMLElement).getByRole('checkbox'));

        fireEvent.click(screen.getByText('Save Settings'));

        expect(mockOnSave).toHaveBeenCalled();
        const savedSettings = mockOnSave.mock.calls.at(-1)?.[0];
        expect(savedSettings?.featureFlags?.videoUpscaling).toBe(true);
    });

    it('toggles FLF2V flag', () => {
        render(
            <LocalGenerationSettingsModal
                isOpen={true}
                onClose={mockOnClose}
                settings={mockSettings}
                onSave={mockOnSave}
                addToast={mockAddToast}
            />
        );

        // Switch to Features tab
        fireEvent.click(screen.getByRole('button', { name: /Features/ }));

        const labelText = screen.getByText('First-Last-Frame-to-Video');
        const label = labelText.closest('label');
        expect(label).toBeTruthy();
        fireEvent.click(within(label as HTMLElement).getByRole('checkbox'));

        // Since state is local to the modal until saved, we can't check onSave yet
        // But we can check if the checkbox state changed visually if we could query it
        
        // Let's try to save and see if the new settings contain the flag
        fireEvent.click(screen.getByText('Save Settings'));

        expect(mockOnSave).toHaveBeenCalled();
        const savedSettings = mockOnSave.mock.calls.at(-1)?.[0];
        // Default is false, so clicking should make it true
        expect(savedSettings?.featureFlags?.enableFLF2V).toBe(true);
    });
});
