/**
 * QueueStatusIndicator Component Tests
 * 
 * Tests for the generation queue status indicator component:
 * - Visibility based on feature flags
 * - Queue state display (size, pending, running)
 * - Health status indicators
 * - Circuit breaker display
 * - Compact mode
 * - Action buttons (cancel all, reset)
 * 
 * @module components/__tests__/QueueStatusIndicator.test.tsx
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { GenerationQueueUIState } from '../../hooks/useGenerationQueueState';

// Hoist mock functions so they're available before vi.mock hoisting
const { mockUseGenerationQueue, mockCancelAll, mockResetCircuitBreaker } = vi.hoisted(() => ({
    mockUseGenerationQueue: vi.fn(),
    mockCancelAll: vi.fn(() => 0),
    mockResetCircuitBreaker: vi.fn(),
}));

vi.mock('../../hooks/useGenerationQueueState', () => ({
    useGenerationQueue: (...args: unknown[]) => mockUseGenerationQueue(...args),
}));

// Import component AFTER mock is set up
import { QueueStatusIndicator } from '../QueueStatusIndicator';

// Default mock state - complete with all required fields
const createDefaultState = (): GenerationQueueUIState => ({
    isEnabled: true,
    size: 0,
    pendingCount: 0,
    isRunning: false,
    isCircuitOpen: false,
    consecutiveFailures: 0,
    healthStatus: 'healthy',
    successRate: 100,
    avgWaitTimeFormatted: '0s',
    avgExecTimeFormatted: '0s',
    currentTaskId: null,
    stats: {
        totalQueued: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalCancelled: 0,
        averageWaitTimeMs: 0,
        averageExecutionTimeMs: 0,
    },
});

// Helper to set test state
function setTestState(overrides: Partial<GenerationQueueUIState>) {
    mockUseGenerationQueue.mockReturnValue({
        ...createDefaultState(),
        ...overrides,
        cancelAll: mockCancelAll,
        resetCircuitBreaker: mockResetCircuitBreaker,
        cancelTask: vi.fn(() => true),
        clearQueue: vi.fn(),
    });
}

describe('QueueStatusIndicator', () => {
    beforeEach(() => {
        // Clear mocks FIRST, then set default state
        mockUseGenerationQueue.mockClear();
        mockCancelAll.mockClear();
        mockResetCircuitBreaker.mockClear();
        // Set default mock state after clearing
        setTestState({});
    });
    
    afterEach(() => {
        cleanup();
    });

    // =========================================================================
    // Visibility Tests
    // =========================================================================

    describe('visibility', () => {
        it('should not render when queue is disabled', () => {
            setTestState({ isEnabled: false });
            const { container } = render(<QueueStatusIndicator />);
            expect(container.firstChild).toBeNull();
        });

        it('should render when queue is enabled', () => {
            setTestState({ isEnabled: true });
            render(<QueueStatusIndicator />);
            expect(screen.getByText('Generation Queue')).toBeTruthy();
        });
    });

    // =========================================================================
    // Queue State Display Tests
    // =========================================================================

    describe('queue state display', () => {
        it('should show "Empty" when queue has no items', () => {
            setTestState({ size: 0, pendingCount: 0, isRunning: false });
            render(<QueueStatusIndicator />);
            expect(screen.getByText('Empty')).toBeTruthy();
        });

        it('should show running and pending counts when queue has items', () => {
            setTestState({ size: 3, pendingCount: 2, isRunning: true });
            render(<QueueStatusIndicator />);
            expect(screen.getByText(/1 running, 2 pending/)).toBeTruthy();
        });

        it('should show 0 running when isRunning is false', () => {
            setTestState({ size: 2, pendingCount: 2, isRunning: false });
            render(<QueueStatusIndicator />);
            expect(screen.getByText(/0 running, 2 pending/)).toBeTruthy();
        });
    });

    // =========================================================================
    // Health Status Tests
    // =========================================================================

    describe('health status', () => {
        it('should display healthy status indicator', () => {
            setTestState({ healthStatus: 'healthy' });
            render(<QueueStatusIndicator />);
            expect(screen.getByText('✓')).toBeTruthy();
        });

        it('should display degraded status indicator', () => {
            setTestState({ healthStatus: 'degraded' });
            render(<QueueStatusIndicator />);
            expect(screen.getByText('⚠')).toBeTruthy();
        });

        it('should display failing status indicator', () => {
            setTestState({ healthStatus: 'failing' });
            render(<QueueStatusIndicator />);
            expect(screen.getByText('✗')).toBeTruthy();
        });

        it('should display circuit-open status indicator', () => {
            setTestState({ healthStatus: 'circuit-open' });
            render(<QueueStatusIndicator />);
            expect(screen.getByText('🔒')).toBeTruthy();
        });
    });

    // =========================================================================
    // Circuit Breaker Tests
    // =========================================================================

    describe('circuit breaker', () => {
        it('should show consecutive failures when > 0 but circuit not open', () => {
            setTestState({ consecutiveFailures: 2, isCircuitOpen: false });
            render(<QueueStatusIndicator />);
            expect(screen.getByText('Failures')).toBeTruthy();
            expect(screen.getByText('2 consecutive')).toBeTruthy();
        });

        it('should show reset button when circuit is open', () => {
            setTestState({ isCircuitOpen: true, healthStatus: 'circuit-open' });
            render(<QueueStatusIndicator />);
            expect(screen.getByText('Circuit Open')).toBeTruthy();
            expect(screen.getByRole('button', { name: /Reset/i })).toBeTruthy();
        });

        it('should call resetCircuitBreaker when reset button clicked', () => {
            setTestState({ isCircuitOpen: true, healthStatus: 'circuit-open' });
            render(<QueueStatusIndicator />);
            const resetBtn = screen.getByRole('button', { name: /Reset/i });
            fireEvent.click(resetBtn);
            expect(mockResetCircuitBreaker).toHaveBeenCalledTimes(1);
        });

        it('should not show circuit breaker section when no failures and circuit closed', () => {
            setTestState({ consecutiveFailures: 0, isCircuitOpen: false });
            render(<QueueStatusIndicator />);
            expect(screen.queryByText('Circuit Open')).toBeNull();
            expect(screen.queryByText('Failures')).toBeNull();
        });
    });

    // =========================================================================
    // Compact Mode Tests
    // =========================================================================

    describe('compact mode', () => {
        it('should render compact badge when compact=true', () => {
            setTestState({ size: 3, healthStatus: 'healthy' });
            const { container } = render(<QueueStatusIndicator compact={true} />);
            expect(container.querySelector('.queue-indicator-compact')).toBeTruthy();
        });

        it('should show count in compact mode when size > 0', () => {
            setTestState({ size: 5 });
            const { container } = render(<QueueStatusIndicator compact={true} />);
            const countEl = container.querySelector('.queue-indicator-count');
            expect(countEl).toBeTruthy();
            expect(countEl?.textContent).toBe('5');
        });

        it('should not show count in compact mode when size = 0', () => {
            setTestState({ size: 0 });
            const { container } = render(<QueueStatusIndicator compact={true} />);
            expect(container.querySelector('.queue-indicator-count')).toBeNull();
        });

        it('should not render full container in compact mode', () => {
            const { container } = render(<QueueStatusIndicator compact={true} />);
            expect(container.querySelector('.queue-status-container')).toBeNull();
        });
    });

    // =========================================================================
    // Details Panel Tests
    // =========================================================================

    describe('details panel', () => {
        it('should not show details by default', () => {
            render(<QueueStatusIndicator />);
            expect(screen.queryByText('Success Rate')).toBeNull();
        });

        it('should show details when showDetails=true', () => {
            setTestState({
                successRate: 85.5,
                avgWaitTimeFormatted: '2.3s',
                avgExecTimeFormatted: '5.1s',
                stats: {
                    totalQueued: 10,
                    totalCompleted: 8,
                    totalFailed: 2,
                    totalCancelled: 0,
                    averageWaitTimeMs: 2300,
                    averageExecutionTimeMs: 5100,
                },
            });
            render(<QueueStatusIndicator showDetails={true} />);
            expect(screen.getByText('Success Rate')).toBeTruthy();
            expect(screen.getByText('85.5%')).toBeTruthy();
            expect(screen.getByText('8 / 10')).toBeTruthy();
            expect(screen.getByText('2.3s')).toBeTruthy();
            expect(screen.getByText('5.1s')).toBeTruthy();
        });
    });

    // =========================================================================
    // Cancel All Button Tests
    // =========================================================================

    describe('cancel all button', () => {
        it('should not show cancel all button when size <= 1', () => {
            setTestState({ size: 1 });
            render(<QueueStatusIndicator />);
            expect(screen.queryByText(/Cancel All/)).toBeNull();
        });

        it('should show cancel all button when size > 1', () => {
            setTestState({ size: 3, pendingCount: 2 });
            render(<QueueStatusIndicator />);
            expect(screen.getByRole('button', { name: /Cancel All/i })).toBeTruthy();
        });

        it('should show pending count in cancel button', () => {
            setTestState({ size: 4, pendingCount: 3 });
            render(<QueueStatusIndicator />);
            expect(screen.getByText(/Cancel All \(3\)/)).toBeTruthy();
        });

        it('should call cancelAll when cancel button clicked', () => {
            setTestState({ size: 3, pendingCount: 2 });
            render(<QueueStatusIndicator />);
            const cancelBtn = screen.getByRole('button', { name: /Cancel All/i });
            fireEvent.click(cancelBtn);
            expect(mockCancelAll).toHaveBeenCalledTimes(1);
        });
    });
});
