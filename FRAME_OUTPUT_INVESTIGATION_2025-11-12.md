# Frame Output Investigation Summary - November 12, 2025

## Current Status
**Infrastructure**: 14/15 components operational (93%)
**Critical Issue**: SaveImage node generates frames but they don't appear in expected directory with expected filename

## Key Findings

### 1. Workflow Execution Is Working
- ComfyUI processes successfully execute (GPU VRAM consumed, progress bar advances)
- SVD model loads and generates latent frames
- VAE decoding completes

### 2. SaveImage Node Behavior Is Problematic
- **Expected**: Frames saved to `output/` with filename prefix `gemdirect1_scene-001_00001_.png`
- **Actual**: No frames with that prefix appear
- **Old files exist**: `gemdirect1_shot_00001_.png` (from Nov 9-10, not updated)

### 3. Workflow Patching Works Correctly
- PowerShell ConvertFrom-Json/ConvertTo-Json properly patches `__SCENE_PREFIX__` → `gemdirect1_scene-001`
- Verified with isolated test: placeholder replacement confirmed functional
- Workflow JSON is correct before submission

### 4. Root Cause Candidates

#### Hypothesis A: SaveImage Output Format Issue
- SaveImage node may not include file paths in history.outputs
- History polling checks for `$history.$promptId.outputs` to exist
- May need different output node or connection pattern

#### Hypothesis B: File Path/Permission Issue
- SaveImage may be saving to wrong output directory
- Permission issue writing with that prefix
- Subfolder creation problem

#### Hypothesis C: Workflow Input Format
- SaveImage needs image data in specific format
- Previous working version used different node connections
- Reroute node (added node 8) may not propagate data correctly

## Previous Working Configuration
Found evidence of successful frame generation from earlier sessions:
- Frames: `gemdirect1_shot_00167_.png` through `gemdirect1_shot_00175_.png` 
- These used different naming pattern entirely
- Suggests different workflow configuration was in use

## Next Steps Required

### Option 1: Investigate SaveImage Output Format
- Check ComfyUI documentation for SaveImage output structure
- Verify SaveImage returns file paths in history.outputs
- May need to connect different output node

### Option 2: Use Alternative Output Node
- Explore other available nodes that return file metadata
- Check if websocket_image_save custom node provides better tracking

### Option 3: Debug with ComfyUI WebUI
- Use ComfyUI frontend to create and export working workflow
- Export as "API Format" to see exact node configuration
- Compare with our current workflow.json

### Option 4: Check ComfyUI Logs
- Review ComfyUI server logs for SaveImage error messages
- Check output directory creation logs
- Verify file write permissions

## Files Modified
- `workflows/text-to-video.json`: Added ReroutePrimitive node (node 8) to track SaveImage completion
- This change did not resolve the core issue

## Critical Insight
The issue is NOT infrastructure-level. The problem is specifically in how the SaveImage node's output is tracked and retrieved via the history API. The workflow executes, but the frame detection mechanism fails because:
1. SaveImage may not return structured output in history
2. Or frames are saved but not indexed/queryable via history API
3. Or there's a timing/completion detection issue

The solution likely requires either:
- Different node configuration for output tracking
- Alternative method to detect completion (WebSocket vs history polling)
- Custom frame detection beyond history API
