# Implementation Plan - P4.4: Pipeline Orchestration

**Status**: Planning  
**Owner**: Copilot Agent  
**Date**: 2025-12-09

## Objective
Implement a robust pipeline orchestration system to manage complex, multi-step generation workflows (e.g., Text-to-Image -> Image-to-Video -> Upscale -> Interpolation) with dependency management, error recovery, and state persistence.

## Problem Statement
Currently, generation tasks are either:
1.  Single-step (e.g., "Generate Keyframe").
2.  Hardcoded sequences (e.g., `generateTimelineVideos` loops through shots).
3.  Manual (User generates keyframe, then clicks "Generate Video").

There is no formal definition of dependencies. If a user wants to "Upscale Scene 1", the system doesn't automatically know it must first "Generate Video for Scene 1" if it's missing.

## Requirements

### Core Features
1.  **DAG (Directed Acyclic Graph) Support**: Define tasks and their dependencies.
2.  **State Persistence**: Pipelines must survive page reloads (IndexedDB).
3.  **Resumability**: Failed or interrupted pipelines can be resumed from the last successful step.
4.  **Concurrency Control**: Respect `GenerationQueue` limits for heavy tasks (GPU), but allow parallel execution for light tasks (CPU/API).
5.  **Dynamic Pipeline Creation**: Ability to generate a pipeline plan based on user intent (e.g., "Export Full Movie" -> generates 50+ tasks).

### Architecture

#### 1. Data Structures
```typescript
interface PipelineTask {
    id: string;
    type: 'generate_keyframe' | 'generate_video' | 'upscale_video' | 'export_timeline';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    dependencies: string[]; // IDs of tasks that must complete first
    payload: any; // Data required for the task
    output?: any; // Result of the task
    error?: string;
    retryCount: number;
}

interface Pipeline {
    id: string;
    name: string;
    createdAt: number;
    status: 'active' | 'completed' | 'failed' | 'paused';
    tasks: Record<string, PipelineTask>;
}
```

#### 2. Pipeline Engine (`services/pipelineEngine.ts`)
- **Topological Sort**: Determine execution order.
- **Scheduler**: Monitor task status and dispatch ready tasks to `GenerationQueue`.
- **Event Emitter**: Notify UI of progress.

#### 3. Store (`services/pipelineStore.ts`)
- Zustand store backed by IndexedDB.
- Actions: `createPipeline`, `pausePipeline`, `resumePipeline`, `retryTask`.

#### 4. UI Components
- `PipelineMonitor`: Dashboard showing active pipelines.
- `DependencyGraph`: Visual representation (optional, maybe simple list first).

## Implementation Steps

### Step 1: Core Infrastructure (Day 1)
- [ ] Define types in `types/pipeline.ts`.
- [ ] Create `pipelineStore.ts` with persistence.
- [ ] Implement `PipelineEngine` basic logic (dependency resolution).

### Step 2: Task Executors (Day 2)
- [ ] Create `TaskRegistry` to map task types to execution functions.
- [ ] Implement executors for existing features:
    - `KeyframeGenerator` (wraps `comfyUIService.generateImage`)
    - `VideoGenerator` (wraps `comfyUIService.generateVideo`)
- [ ] Integrate with `GenerationQueue` (Engine submits to Queue).

### Step 3: UI Integration (Day 3)
- [ ] Create `PipelineStatusPanel` (floating or sidebar).
- [ ] Add "Export All" button to ContinuityDirector that creates a pipeline.

### Step 4: Testing & Hardening (Day 4)
- [ ] Unit tests for DAG resolution.
- [ ] Integration tests with mocked ComfyUI.
- [ ] Error handling scenarios (network failure, timeout).

## Success Criteria
- Can create a pipeline with 3 dependent tasks (A->B->C).
- Pipeline executes in order.
- If B fails, C is not started.
- Can retry B, and then C runs.
