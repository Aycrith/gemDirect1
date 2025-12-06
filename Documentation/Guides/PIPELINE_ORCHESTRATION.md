# Pipeline Orchestration Guide

**Part of D1 – Pipeline Orchestration & Workflow Management**  
**Last Updated**: 2025-12-05

## Overview

The Pipeline Orchestrator is a lightweight, internal TypeScript layer for defining and running multi-step pipelines. It enables:

- **Declarative pipelines**: Define steps and dependencies as data
- **Repeatable runs**: Same definition produces consistent execution order
- **Context passing**: Steps share data through a typed context object
- **Failure handling**: Dependent steps are skipped when dependencies fail

This is **not** an external orchestrator like Temporal or Prefect. It's a minimal, dependency-free solution for composing existing scripts and services into named pipelines.

## Quick Start

Run the production QA golden pipeline:

```powershell
npm run pipeline:production-qa-golden
```

This executes the full generation → Vision QA → benchmark → manifest flow for a known golden sample.

### CLI Options

```powershell
# List available pipelines
npm run pipeline:list

# Run with verbose output
npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --verbose

# Dry run (shows what would happen without executing)
npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --dry-run

# Use a different sample
npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --sample sample-002-character
```

## Core Concepts

### Pipeline Definition

A pipeline is a collection of steps with optional dependencies:

```typescript
import type { PipelineDefinition } from './services/pipelineOrchestrator';

const myPipeline: PipelineDefinition = {
    id: 'my-pipeline',
    description: 'Does something useful',
    steps: [
        { id: 'step-a', description: 'First step', run: async (ctx) => ({ status: 'succeeded' }) },
        { id: 'step-b', description: 'Depends on A', dependsOn: ['step-a'], run: async (ctx) => ({ status: 'succeeded' }) },
    ],
};
```

### Step Context

Steps read from and write to a shared context object:

```typescript
const step: PipelineStep = {
    id: 'processor',
    description: 'Process data',
    run: async (ctx) => {
        // Read from context
        const inputPath = ctx.inputPath as string;
        
        // Do work...
        
        // Write to context
        return {
            status: 'succeeded',
            contextUpdates: {
                outputPath: '/path/to/output',
                processedItems: 42,
            },
        };
    },
};
```

### Step Results

Each step returns a `PipelineStepResult`:

```typescript
interface PipelineStepResult {
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
    contextUpdates?: Record<string, unknown>;
    errorMessage?: string;
    durationMs?: number;
}
```

### Dependencies

Steps can declare dependencies on other steps:

```typescript
{
    id: 'step-c',
    dependsOn: ['step-a', 'step-b'],  // Runs after both A and B succeed
    run: async (ctx) => ({ status: 'succeeded' }),
}
```

If a dependency fails, all dependent steps are marked as `skipped`.

## Available Pipelines

### production-qa-golden

The canonical end-to-end validation pipeline for golden samples.

**Steps:**

| Step | Description | Dependencies |
|------|-------------|--------------|
| `generate-golden-video` | Generate video using regression test script | None |
| `run-vision-qa` | Run Vision QA analysis | `generate-golden-video` |
| `run-video-benchmark` | Run video quality benchmark | `generate-golden-video` |
| `verify-manifest` | Verify/write generation manifest | `generate-golden-video` |

**Context Outputs:**

| Key | Description |
|-----|-------------|
| `runDir` | Path to the regression run directory |
| `videoPath` | Path to generated video file |
| `visionQaStatus` | PASS / WARN / FAIL |
| `visionQaResultsPath` | Path to vision-qa-latest.json |
| `benchmarkJsonPath` | Path to benchmark JSON output |
| `benchmarkReportPath` | Path to benchmark Markdown report |
| `manifestPath` | Path to generation manifest |

**Usage:**

```powershell
npm run pipeline:production-qa-golden
```

## Creating New Pipelines

### 1. Define the Pipeline

Create a new file in `pipelines/`:

```typescript
// pipelines/myNewPipeline.ts
import type { PipelineDefinition, PipelineStep } from '../services/pipelineOrchestrator';

function createMyStep(): PipelineStep {
    return {
        id: 'my-step',
        description: 'Does something',
        run: async (ctx) => {
            // Your logic here
            return { status: 'succeeded' };
        },
    };
}

export function getMyNewPipeline(): PipelineDefinition {
    return {
        id: 'my-new-pipeline',
        description: 'My new pipeline',
        steps: [createMyStep()],
    };
}
```

### 2. Register the Pipeline

Add the pipeline to the CLI in `scripts/run-pipeline.ts`:

```typescript
import { getMyNewPipeline } from '../pipelines/myNewPipeline';

function getPipelineById(id: string): PipelineDefinition | null {
    switch (id) {
        case 'production-qa-golden':
            return getProductionQaGoldenPipeline();
        case 'my-new-pipeline':  // Add this
            return getMyNewPipeline();
        default:
            return null;
    }
}
```

Update `AVAILABLE_PIPELINES` in your pipeline file if needed.

### 3. Add NPM Script (Optional)

In `package.json`:

```json
{
  "scripts": {
    "pipeline:my-new": "npx tsx scripts/run-pipeline.ts --pipeline my-new-pipeline"
  }
}
```

## Helper Functions

The orchestrator provides helper functions for common step patterns:

### createNoOpStep

Creates a step that always succeeds (useful for placeholders):

```typescript
import { createNoOpStep } from './services/pipelineOrchestrator';

const step = createNoOpStep('placeholder', 'To be implemented');
```

### createShellStep

Creates a step that runs a shell command:

```typescript
import { createShellStep } from './services/pipelineOrchestrator';

const step = createShellStep(
    'run-tests',
    'Run unit tests',
    'npm test -- --run',
    { contextOutputKey: 'testOutput' }
);
```

### createPowerShellStep

Convenience wrapper for PowerShell scripts:

```typescript
import { createPowerShellStep } from './services/pipelineOrchestrator';

const step = createPowerShellStep(
    'vision-qa',
    'Run Vision QA',
    'scripts/run-bookend-vision-qa.ps1',
    { Sample: 'sample-001-geometric', Runs: '3' }
);
```

## Best Practices

### 1. Keep Steps Focused

Each step should do one thing well. Prefer multiple small steps over one large step.

### 2. Use Context for Data Flow

Don't use global state or file-based communication between steps when context suffices.

### 3. Handle Failures Gracefully

Return `{ status: 'failed', errorMessage: '...' }` rather than throwing exceptions when possible.

### 4. Document Context Keys

Each pipeline should document which context keys it reads and writes.

### 5. Make Steps Idempotent

Steps should be safe to re-run. Check for existing outputs before regenerating.

## Integration with Existing Tools

The orchestrator **calls** existing scripts/services rather than reimplementing their logic:

| Tool | Integration |
|------|-------------|
| ComfyUI Generation | Via `scripts/test-bookend-regression.ps1` |
| Vision QA | Via `scripts/run-bookend-vision-qa.ps1` |
| Video Benchmarks | Via `scripts/benchmarks/run-video-quality-benchmark.ps1` |
| Manifests | Via `scripts/write-manifest.ts` |

See these related guides:

- [Getting Started](./GETTING_STARTED.md) – Environment setup
- [Recipes](./RECIPES.md) – Common workflows
- [Pipeline Configs](./PIPELINE_CONFIGS.md) – Config-driven presets
- [Versioning and Manifests](./VERSIONING_AND_MANIFESTS.md) – Reproducibility tracking

## External Orchestrator Bridge (Temporal PoC)

For production workflows requiring durability, retries, and distributed execution, a bridge script provides integration with external orchestrators like Temporal.io.

### Check Availability

```powershell
npm run pipeline:external:check
```

This checks whether Temporal is available. If not, pipelines fall back to direct execution.

### Usage

```powershell
# Run golden set via Temporal (if available) or fallback
npm run pipeline:external -- --golden-set --parallel 2

# Run single pipeline
npm run pipeline:external -- --pipeline production-qa-preview --sample geometric-baseline

# Dry run to preview execution
npm run pipeline:external -- --golden-set --dry-run
```

### Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `gemDirect-pipelines` | Task queue name |
| `TEMPORAL_ENABLED` | `false` | Enable Temporal orchestration |

### Graceful Fallback

When Temporal is not available:
- SDK not installed → Falls back to direct execution
- Server unreachable → Falls back with warning
- `TEMPORAL_ENABLED=false` → Uses direct execution

Direct execution uses the local scripts (`run-golden-set.ts`, etc.) without orchestration features.

### Setting Up Temporal

1. Install SDK:
   ```powershell
   npm install @temporalio/client @temporalio/worker
   ```

2. Start Temporal server (see [Temporal docs](https://docs.temporal.io/self-hosted-guide))

3. Enable in environment:
   ```powershell
   $env:TEMPORAL_ENABLED = 'true'
   $env:TEMPORAL_ADDRESS = 'localhost:7233'
   ```

4. Run with orchestration:
   ```powershell
   npm run pipeline:external -- --golden-set
   ```

### Related Files

| Path | Description |
|------|-------------|
| `scripts/run-pipeline-external.ts` | Bridge script |
| `orchestrator-poc/temporal-workflow.ts` | Temporal workflow definitions |
| `orchestrator-poc/README.md` | PoC evaluation notes |

## Troubleshooting

### Pipeline fails at generation step

**Cause**: ComfyUI server not running or misconfigured.

**Fix**: Start ComfyUI via VS Code task: "Start ComfyUI Server (Patched - Recommended)"

### Vision QA step fails

**Cause**: LM Studio not running or Gemini API not configured.

**Fix**: Ensure `GEMINI_API_KEY` is set in `.env.local` or LM Studio is running.

### Steps marked as skipped

**Cause**: A dependency failed.

**Fix**: Check the error message for the failed dependency step. Skipped steps will run once dependencies succeed.

### "Could not determine run directory"

**Cause**: Generation script output format changed or no runs exist.

**Fix**: Check `test-results/bookend-regression/` for run directories. Ensure the script completed successfully.
