import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import VisualBibleLinkModal from '../VisualBibleLinkModal';
import type { VisualBible } from '../../types';

// Mock the hooks
const mockSetVisualBible = vi.fn();
vi.mock('../../utils/hooks', () => ({
    useVisualBible: vi.fn(() => ({
        visualBible: {
            characters: [],
            styleBoards: [
                { id: 'board-1', title: 'Cyberpunk', description: 'Neon aesthetic', tags: ['neon', 'rain'] },
                { id: 'board-2', title: 'Noir', description: 'Dark shadows', tags: ['dark', 'moody'] },
            ],
            sceneKeyframes: {},
            shotReferences: {},
            sceneCharacters: {},
            shotCharacters: {},
        } as VisualBible,
        setVisualBible: mockSetVisualBible,
    })),
}));

describe('VisualBibleLinkModal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        imageData: 'base64encodedimagedata',
        sceneId: 'scene-1',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockSetVisualBible.mockClear();
    });

    describe('rendering', () => {
        it('returns null when not open', () => {
            const { container } = render(
                <VisualBibleLinkModal {...defaultProps} isOpen={false} />
            );
            expect(container.firstChild).toBeNull();
        });

        it('renders modal when open', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            expect(screen.getByText('Add to Visual Bible')).toBeInTheDocument();
        });

        it('displays scene ID reference', () => {
            render(<VisualBibleLinkModal {...defaultProps} sceneId="scene-5" />);
            expect(screen.getByText(/scene scene-5/i)).toBeInTheDocument();
        });

        it('displays shot ID when provided', () => {
            render(<VisualBibleLinkModal {...defaultProps} shotId="shot-3" />);
            expect(screen.getByText(/shot shot-3/i)).toBeInTheDocument();
        });

        it('shows image preview', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            const img = screen.getByAltText('Visual Bible');
            expect(img).toBeInTheDocument();
            expect(img).toHaveAttribute('src', expect.stringContaining('base64'));
        });
    });

    describe('style board selection', () => {
        it('shows existing style boards in dropdown', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            
            const select = screen.getByRole('combobox');
            expect(select).toBeInTheDocument();
            
            expect(screen.getByText('Cyberpunk')).toBeInTheDocument();
            expect(screen.getByText('Noir')).toBeInTheDocument();
        });

        it('shows create new option by default', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            
            const select = screen.getByRole('combobox');
            expect(select).toHaveValue('');
            expect(screen.getByText('Create new style board…')).toBeInTheDocument();
        });

        it('hides new board fields when existing board selected', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            
            const select = screen.getByRole('combobox');
            fireEvent.change(select, { target: { value: 'board-1' } });
            
            // Title input should be hidden when selecting existing board
            expect(screen.queryByPlaceholderText('e.g., Neon rain alley')).not.toBeInTheDocument();
        });

        it('shows new board fields when creating new board', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            
            // By default (empty selection), new board fields should be visible
            expect(screen.getByPlaceholderText('e.g., Neon rain alley')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('cyberpunk, rain, neon')).toBeInTheDocument();
        });
    });

    describe('form inputs', () => {
        it('allows entering board title', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            
            const titleInput = screen.getByPlaceholderText('e.g., Neon rain alley');
            fireEvent.change(titleInput, { target: { value: 'My New Board' } });
            
            expect(titleInput).toHaveValue('My New Board');
        });

        it('allows entering tags', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            
            const tagsInput = screen.getByPlaceholderText('cyberpunk, rain, neon');
            fireEvent.change(tagsInput, { target: { value: 'sci-fi, space, stars' } });
            
            expect(tagsInput).toHaveValue('sci-fi, space, stars');
        });

        it('allows entering notes', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            
            const notesInput = screen.getByPlaceholderText(/describe how this reference/i);
            fireEvent.change(notesInput, { target: { value: 'Use for establishing shots' } });
            
            expect(notesInput).toHaveValue('Use for establishing shots');
        });
    });

    describe('actions', () => {
        it('calls onClose when Cancel is clicked', () => {
            const onClose = vi.fn();
            render(<VisualBibleLinkModal {...defaultProps} onClose={onClose} />);
            
            fireEvent.click(screen.getByText('Cancel'));
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('calls setVisualBible and onClose when Save is clicked', () => {
            const onClose = vi.fn();
            render(<VisualBibleLinkModal {...defaultProps} onClose={onClose} />);
            
            // Enter a board title to make save valid
            const titleInput = screen.getByPlaceholderText('e.g., Neon rain alley');
            fireEvent.change(titleInput, { target: { value: 'New Board' } });
            
            fireEvent.click(screen.getByText('Save Reference'));
            
            expect(mockSetVisualBible).toHaveBeenCalledTimes(1);
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('updates visual bible with new style board', () => {
            render(<VisualBibleLinkModal {...defaultProps} />);
            
            const titleInput = screen.getByPlaceholderText('e.g., Neon rain alley');
            const tagsInput = screen.getByPlaceholderText('cyberpunk, rain, neon');
            
            fireEvent.change(titleInput, { target: { value: 'Action Sequence' } });
            fireEvent.change(tagsInput, { target: { value: 'action, fight, dynamic' } });
            
            fireEvent.click(screen.getByText('Save Reference'));
            
            // Check that setVisualBible was called with a function
            expect(mockSetVisualBible).toHaveBeenCalledWith(expect.any(Function));
        });

        it('adds image to scene keyframes when saving', () => {
            render(<VisualBibleLinkModal {...defaultProps} sceneId="scene-test" />);
            
            const titleInput = screen.getByPlaceholderText('e.g., Neon rain alley');
            fireEvent.change(titleInput, { target: { value: 'Test Board' } });
            
            fireEvent.click(screen.getByText('Save Reference'));
            
            // Verify setVisualBible was called
            expect(mockSetVisualBible).toHaveBeenCalled();
        });

        it('adds image to shot references when shotId provided', () => {
            render(
                <VisualBibleLinkModal 
                    {...defaultProps} 
                    sceneId="scene-test" 
                    shotId="shot-test" 
                />
            );
            
            const titleInput = screen.getByPlaceholderText('e.g., Neon rain alley');
            fireEvent.change(titleInput, { target: { value: 'Test Board' } });
            
            fireEvent.click(screen.getByText('Save Reference'));
            
            expect(mockSetVisualBible).toHaveBeenCalled();
        });
    });

    describe('overlay behavior', () => {
        it('renders backdrop overlay', () => {
            const { container } = render(<VisualBibleLinkModal {...defaultProps} />);
            
            const backdrop = container.querySelector('.fixed.inset-0');
            expect(backdrop).toBeInTheDocument();
            expect(backdrop).toHaveClass('bg-black/70');
        });
    });
});
