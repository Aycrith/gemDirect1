# Video Processing Pipeline Architecture

**Last Updated**: 2025-12-11
**Status**: Active

## Overview

This document details the architecture of the video processing pipeline, specifically focusing on advanced features like First-Last-Frame-to-Video (FLF2V) continuity and Video Interpolation.

## First-Last-Frame-to-Video (FLF2V)

FLF2V ensures visual continuity between consecutive shots by using the last frame of the previous shot as the starting keyframe for the next shot.

### Architecture

The implementation handles both Browser and Node.js (Headless) environments to support both UI-driven and automated pipeline executions.

#### 1. Dependency Resolution
- The `TaskRegistry` identifies `generate_video` dependencies.
- If `enableFLF2V` is active, it retrieves the output video path from the dependency.

#### 2. Frame Extraction Strategy

**Browser Environment:**
- Uses `fetchVideoAsFile` to retrieve the video blob.
- Uses `extractFramesFromVideo` (Canvas API) to extract the last frame.

**Node.js / Headless Environment:**
- Detects environment via `typeof window === 'undefined'`.
- Uses `child_process` to spawn `ffmpeg`.
- Command: `ffmpeg -sseof -0.5 -i "input.mp4" -vsync 0 -q:v 2 -update 1 "output.jpg"`
- Extracts the frame to a temporary directory and reads it back as a base64 string.
- Dynamic imports (`import('child_process')`, `import('fs')`) are used to prevent bundling errors in the browser build.

### Telemetry
- `flf2vEnabled`: Boolean indicating if the feature was active.
- `flf2vSource`: `'last-frame'` (successful extraction) or `'keyframe'` (fallback).

## Video Interpolation

Video interpolation increases the frame rate of generated videos using AI models (e.g., RIFE) via ComfyUI.

### Architecture

Interpolation is implemented as a distinct pipeline task (`interpolate_video`) that wraps a ComfyUI workflow.

#### 1. Workflow Integration
- Uses the `queueComfyUIPromptWithQueue` service.
- Target Profile: `rife-interpolation` (virtual or actual profile ID).
- Input: Passes the source video path via `inputVideo` in `QueuePromptOptions`.

#### 2. Configuration
- **Multiplier**: Frame rate multiplier (e.g., 2x, 4x).
- **Model**: Interpolation model (e.g., 'RIFE').

#### 3. Execution Flow
1. `executeInterpolateVideo` task receives `videoPath` from dependencies.
2. Constructs a payload with `inputVideo` mapped to the source.
3. Queues the job in ComfyUI with `waitForCompletion: true`.
4. Returns the path to the interpolated video.

### Telemetry
- `upscaleMethod`: The model used (e.g., 'RIFE').
- `finalFps`: Estimated final frame rate.
- `interpolationElapsed`: Time taken for the interpolation process.
