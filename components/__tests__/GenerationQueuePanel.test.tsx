/**
 * Tests for GenerationQueuePanel component
 * @module components/__tests__/GenerationQueuePanel.test
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerationQueuePanel, getStatusLabel, getStatusColor } from '../GenerationQueuePanel';
import * as generationQueueModule from '../../services/generationQueue';
import type { QueueState } from '../../services/generationQueue';

// Mock the generationQueue module
vi.mock('../../services/generationQueue', async () => {
    const actual = await vi.importActual('../../services/generationQueue');
    return {
        ...actual,
        getGenerationQueue: vi.fn(),
    };
});

describe('GenerationQueuePanel', () => {
    const mockSubscribe = vi.fn();
    const mockCancelAll = vi.fn();
    const mockResetCircuitBreaker = vi.fn();
    
    const createMockQueue = (state: QueueState) => ({
        subscribe: (callback: (state: QueueState) => void) => {
            callback(state);
            mockSubscribe(callback);
            return vi.fn(); // unsubscribe
        },
        cancelAll: mockCancelAll,
        resetCircuitBreaker: mockResetCircuitBreaker,
    });
    
    beforeEach(() => {
        vi.clearAllMocks();
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    describe('rendering', () => {
        it('should not render when queue is empty', () => {
            const emptyState: QueueState = {
                size: 0,
                isRunning: false,
                currentTaskId: null,
                isCircuitOpen: false,
                consecutiveFailures: 0,
                stats: {
                    totalQueued: 0,
                    totalCompleted: 0,
                    totalFailed: 0,
                    totalCancelled: 0,
                    averageWaitTimeMs: 0,
                    averageExecutionTimeMs: 0,
                },
            };
            
            vi.mocked(generationQueueModule.getGenerationQueue).mockReturnValue(
                createMockQueue(emptyState) as unknown as generationQueueModule.GenerationQueue
            );
            
            const { container } = render(<GenerationQueuePanel />);
            expect(container.firstChild).toBeNull();
        });
        
        it('should render when tasks are queued', () => {
            const state: QueueState = {
                size: 2,
                isRunning: true,
                currentTaskId: 'video-scene-1',
                isCircuitOpen: false,
                consecutiveFailures: 0,
                stats: {
                    totalQueued: 5,
                    totalCompleted: 3,
                    totalFailed: 0,
                    totalCancelled: 0,
                    averageWaitTimeMs: 1000,
                    averageExecutionTimeMs: 5000,
                },
            };
            
            vi.mocked(generationQueueModule.getGenerationQueue).mockReturnValue(
                createMockQueue(state) as unknown as generationQueueModule.GenerationQueue
            );
            
            render(<GenerationQueuePanel />);
            expect(screen.getByText('Generation Queue')).toBeInTheDocument();
            expect(screen.getByText('2 tasks')).toBeInTheDocument();
        });
        
        it('should show circuit breaker warning when open', () => {
            const state: QueueState = {
                size: 1,
                isRunning: false,
                currentTaskId: null,
                isCircuitOpen: true,
                consecutiveFailures: 3,
                stats: {
                    totalQueued: 5,
                    totalCompleted: 2,
                    totalFailed: 3,
                    totalCancelled: 0,
                    averageWaitTimeMs: 1000,
                    averageExecutionTimeMs: 5000,
                },
            };
            
            vi.mocked(generationQueueModule.getGenerationQueue).mockReturnValue(
                createMockQueue(state) as unknown as generationQueueModule.GenerationQueue
            );
            
            render(<GenerationQueuePanel />);
            
            // Click to expand
            fireEvent.click(screen.getByText('Generation Queue'));
            
            expect(screen.getByText(/Circuit breaker open/)).toBeInTheDocument();
            expect(screen.getByText('Reset & Resume')).toBeInTheDocument();
        });
    });
    
    describe('interactions', () => {
        it('should expand when header is clicked', () => {
            const state: QueueState = {
                size: 2,
                isRunning: true,
                currentTaskId: 'video-scene-1',
                isCircuitOpen: false,
                consecutiveFailures: 0,
                stats: {
                    totalQueued: 5,
                    totalCompleted: 3,
                    totalFailed: 0,
                    totalCancelled: 0,
                    averageWaitTimeMs: 1000,
                    averageExecutionTimeMs: 5000,
                },
            };
            
            vi.mocked(generationQueueModule.getGenerationQueue).mockReturnValue(
                createMockQueue(state) as unknown as generationQueueModule.GenerationQueue
            );
            
            render(<GenerationQueuePanel />);
            
            // Initially collapsed - stats not visible
            expect(screen.queryByText('Completed:')).not.toBeInTheDocument();
            
            // Click to expand
            fireEvent.click(screen.getByText('Generation Queue'));
            
            // Now stats should be visible
            expect(screen.getByText('Completed:')).toBeInTheDocument();
        });
    });
    
    describe('helper functions', () => {
        it('getStatusLabel should return correct labels', () => {
            expect(getStatusLabel('pending')).toBe('Waiting');
            expect(getStatusLabel('running')).toBe('Running');
            expect(getStatusLabel('completed')).toBe('Done');
            expect(getStatusLabel('failed')).toBe('Failed');
            expect(getStatusLabel('cancelled')).toBe('Cancelled');
            expect(getStatusLabel('timeout')).toBe('Timed Out');
        });
        
        it('getStatusColor should return correct color classes', () => {
            expect(getStatusColor('pending')).toContain('yellow');
            expect(getStatusColor('running')).toContain('green');
            expect(getStatusColor('completed')).toContain('blue');
            expect(getStatusColor('failed')).toContain('red');
            expect(getStatusColor('cancelled')).toContain('slate');
            expect(getStatusColor('timeout')).toContain('orange');
        });
    });
});
