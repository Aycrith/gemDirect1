import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ManifestHistory from '../ManifestHistory';
import * as databaseUtils from '../../utils/database';
import * as browserReplayService from '../../services/browserReplayService';
import { GenerationManifest } from '../../services/generationManifestService';

// Mock dependencies
vi.mock('../../utils/database', () => ({
    getAllManifestsFromDB: vi.fn()
}));

vi.mock('../../services/browserReplayService', () => ({
    replayManifestInBrowser: vi.fn()
}));

vi.mock('../../contexts/LocalGenerationSettingsContext', () => ({
    useLocalGenerationSettings: () => ({
        settings: { comfyUIUrl: 'http://localhost:8188' }
    })
}));

vi.mock('../../contexts/ApiStatusContext', () => ({
    useApiStatus: () => ({
        updateApiStatus: vi.fn()
    })
}));

describe('ManifestHistory', () => {
    const mockManifest: GenerationManifest = {
        manifestVersion: '1.0.0',
        manifestId: 'test-manifest-1',
        // timestamp removed
        generationType: 'video',
        workflow: {
            profileId: 'wan-i2v',
            version: '1.0.0',
            label: 'Test Workflow'
        },
        inputs: {
            prompt: 'A test prompt'
        },
        determinism: {
            seed: 12345,
            seedExplicit: true
        },
        outputs: {
            videoPath: 'output.mp4'
        },
        timing: {
            queuedAt: new Date().toISOString()
        },
        comfyUIUrl: 'http://localhost:8188',
        sceneId: 'scene-1'
    };

    const mockOnClose = vi.fn();
    const mockAddToast = vi.fn();
    const mockGeneratedImages = { 'scene-1': 'base64image' };

    beforeEach(() => {
        vi.clearAllMocks();
        (databaseUtils.getAllManifestsFromDB as any).mockResolvedValue([mockManifest]);
    });

    it('renders loading state initially', async () => {
        // Delay the promise resolution to catch the loading state
        let resolvePromise: (value: any) => void;
        const promise = new Promise(resolve => { resolvePromise = resolve; });
        (databaseUtils.getAllManifestsFromDB as any).mockReturnValue(promise);

        render(<ManifestHistory onClose={mockOnClose} addToast={mockAddToast} generatedImages={mockGeneratedImages} />);
        expect(screen.getByText('Loading...')).toBeTruthy();

        resolvePromise!([mockManifest]);
        await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
    });

    it('renders manifest list after loading', async () => {
        render(<ManifestHistory onClose={mockOnClose} addToast={mockAddToast} generatedImages={mockGeneratedImages} />);
        
        await waitFor(() => {
            expect(screen.getByText('Test Workflow')).toBeTruthy();
        });
    });

    it('shows details when a manifest is selected', async () => {
        render(<ManifestHistory onClose={mockOnClose} addToast={mockAddToast} generatedImages={mockGeneratedImages} />);
        
        await waitFor(() => {
            expect(screen.getByText('Test Workflow')).toBeTruthy();
        });

        fireEvent.click(screen.getByText('Test Workflow'));

        expect(screen.getByText('A test prompt')).toBeTruthy();
        expect(screen.getByText('Seed: 12345')).toBeTruthy();
    });

    it('triggers replay when replay button is clicked', async () => {
        render(<ManifestHistory onClose={mockOnClose} addToast={mockAddToast} generatedImages={mockGeneratedImages} />);
        
        await waitFor(() => {
            expect(screen.getByText('Test Workflow')).toBeTruthy();
        });

        fireEvent.click(screen.getByText('Test Workflow'));
        
        const replayButton = screen.getByText('Replay Generation');
        fireEvent.click(replayButton);

        await waitFor(() => {
            expect(browserReplayService.replayManifestInBrowser).toHaveBeenCalledWith(
                mockManifest,
                expect.anything(),
                'base64image',
                expect.anything()
            );
        });
    });

    it('calls onClose when close button is clicked', async () => {
        render(<ManifestHistory onClose={mockOnClose} addToast={mockAddToast} generatedImages={mockGeneratedImages} />);
        
        await waitFor(() => {
            expect(screen.getByText('Test Workflow')).toBeTruthy();
        });

        const closeButton = screen.getByText('✕');
        fireEvent.click(closeButton);

        expect(mockOnClose).toHaveBeenCalled();
    });
});
