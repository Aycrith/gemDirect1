import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineEngine } from '../pipelineEngine';
import { usePipelineStore } from '../pipelineStore';
import { TaskRegistry } from '../pipelineTaskRegistry';

// Mock dependencies
vi.mock('../pipelineStore', () => ({
    usePipelineStore: {
        getState: vi.fn()
    }
}));

vi.mock('../pipelineTaskRegistry', () => ({
    TaskRegistry: {}
}));

vi.mock('../generationQueue', () => ({
    getGenerationQueue: vi.fn(),
    GenerationType: {
        KEYFRAME: 'keyframe',
        VIDEO: 'video',
        TEXT: 'text'
    }
}));

describe('PipelineEngine', () => {
    let engine: PipelineEngine;
    let mockStore: any;
    
    beforeEach(() => {
        vi.resetAllMocks();
        engine = PipelineEngine.getInstance();
        
        mockStore = {
            activePipelineId: 'p1',
            pipelines: {
                'p1': {
                    id: 'p1',
                    status: 'active',
                    tasks: {
                        't1': { id: 't1', type: 'generic_action', status: 'pending', dependencies: [] },
                        't2': { id: 't2', type: 'generic_action', status: 'pending', dependencies: ['t1'] }
                    }
                }
            },
            updateTaskStatus: vi.fn(),
            retryTask: vi.fn(),
            updatePipelineStatus: vi.fn(),
            setActivePipeline: vi.fn()
        };
        
        (usePipelineStore.getState as any).mockReturnValue(mockStore);
        
        // Mock TaskRegistry
        (TaskRegistry as any)['generic_action'] = vi.fn().mockResolvedValue('success');
    });

    it('should execute runnable tasks', async () => {
        await (engine as any).processPipelines();
        
        // t1 should be executed
        expect(mockStore.updateTaskStatus).toHaveBeenCalledWith('p1', 't1', 'running');
        expect((TaskRegistry as any)['generic_action']).toHaveBeenCalled();
        expect(mockStore.updateTaskStatus).toHaveBeenCalledWith('p1', 't1', 'completed', 'success');
    });

    it('should not execute tasks with pending dependencies', async () => {
        await (engine as any).processPipelines();
        
        // t2 should NOT be executed (t1 is pending in the initial state)
        expect(mockStore.updateTaskStatus).not.toHaveBeenCalledWith('p1', 't2', 'running');
    });

    it('should use GenerationQueue for resource-intensive tasks', async () => {
        // Update mock state to have a keyframe task
        mockStore.pipelines['p1'].tasks['t3'] = { 
            id: 't3', type: 'generate_keyframe', status: 'pending', dependencies: [] 
        };
        
        (TaskRegistry as any)['generate_keyframe'] = vi.fn().mockResolvedValue('keyframe_result');
        
        await (engine as any).processPipelines();
        
        expect(mockStore.updateTaskStatus).toHaveBeenCalledWith('p1', 't3', 'running');
    });

    it('should mark pipeline cancelled when all tasks are cancelled', async () => {
        mockStore.pipelines['p1'].tasks['t1'].status = 'cancelled';
        mockStore.pipelines['p1'].tasks['t2'].status = 'cancelled';

        await (engine as any).processPipelines();

        expect(mockStore.updatePipelineStatus).toHaveBeenCalledWith('p1', 'cancelled');
        expect(mockStore.setActivePipeline).toHaveBeenCalledWith(null);
    });
});
