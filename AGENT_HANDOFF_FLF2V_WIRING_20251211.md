# Agent Handoff: FLF2V Telemetry Wiring

## Summary
Completed the wiring of FLF2V telemetry data (`flf2vEnabled`, `interpolationElapsed`, `finalFps`, `upscaleMethod`) from the generation step to the manifest writer.

## Changes
1.  **`pipelines/productionQaGoldenPipeline.ts`**:
    -   Updated `createGenerateStep` to read telemetry fields from `results.json` (produced by the regression script).
    -   Updated `createManifestStep` to pass these fields as CLI arguments to `scripts/write-manifest.ts`.

2.  **`pipelines/narrativePipeline.ts`**:
    -   Updated `createShotGenerateStep` to read telemetry fields from `results.json`.
    -   Updated `createShotManifestStep` to pass these fields as CLI arguments to `scripts/write-manifest.ts`.

3.  **`scripts/test-bookend-regression.ps1`**:
    -   Updated to write `flf2vEnabled = true` to `results.json`.

## Status
-   **FLF2V Support**: The pipelines now correctly propagate FLF2V status to the manifest.
-   **Telemetry**: `flf2vEnabled` is now persisted. Other metrics (`interpolationElapsed`, etc.) are wired up and will be persisted if available in `results.json` (requires future updates to the regression script or generation logic to populate them).
-   **Manifest Writer**: `scripts/write-manifest.ts` was previously updated to accept these arguments.

## Next Steps
-   Update `scripts/test-bookend-regression.ps1` (or the underlying generation logic) to measure and report `interpolationElapsed`, `finalFps`, and `upscaleMethod` if possible. Currently, these will be undefined in the manifest for regression-based runs.
-   Verify end-to-end with a pipeline run.
