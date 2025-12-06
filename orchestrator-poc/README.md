# External Orchestrator PoC

This directory contains proof-of-concept examples for integrating gemDirect1 pipeline runs
with external workflow orchestrators.

## Candidates Evaluated

### 1. Temporal.io (Recommended)
**Best for**: Complex, long-running workflows with strong error handling
- Durable execution model
- Built-in retries and timeouts
- Strong TypeScript SDK
- Activity-based composition

### 2. Prefect
**Best for**: Python-centric teams, good visualization
- Python-first with good JS/TS interop
- Good dashboard
- Free tier available

### 3. Dagster
**Best for**: Data-focused pipelines with strict typing
- Strong asset/lineage tracking
- Good for ML pipeline observability
- Python-based

## Recommendation

For gemDirect1, **Temporal.io** is recommended because:
1. Native TypeScript support matches our stack
2. Durable execution is ideal for long GPU workflows
3. Activity model maps well to our pipeline steps
4. Strong error handling for flaky ComfyUI connections

## Files

- `temporal-workflow.ts` - Example Temporal workflow definition
- `README.md` - This file

## Next Steps (Not Implemented)

1. Set up Temporal Cloud or local dev server
2. Convert pipeline orchestrator to Temporal activities
3. Add workflow UI integration
4. Configure retry policies per activity type
