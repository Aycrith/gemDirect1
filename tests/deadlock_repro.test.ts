import { describe, it, expect } from 'vitest';
import { GenerationQueue, createVideoTask } from '../services/generationQueue';

describe('GenerationQueue Deadlock', () => {
    it('should deadlock if a task enqueues another task', async () => {
        const queue = new GenerationQueue();
        
        const task2 = createVideoTask(async () => {
            return 'task2 done';
        }, { sceneId: 's1', shotId: 'shot2' });

        const task1 = createVideoTask(async () => {
            console.log('Task 1 running');
            // Enqueue task 2 and wait for it
            const result = await queue.enqueue(task2);
            return 'task1 done ' + result;
        }, { sceneId: 's1', shotId: 'shot1' });

        // We expect this to timeout if deadlock occurs
        const promise = queue.enqueue(task1);
        
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
        
        await expect(Promise.race([promise, timeout])).rejects.toThrow('Timeout');
    });
});
