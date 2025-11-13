# ComfyUI Integration Test Guide

## ✅ Current Status

**ComfyUI Server Detected:**
- ✅ Running on **http://127.0.0.1:8000** (ComfyUI Desktop)
- ✅ CORS enabled for all origins (*** = wildcard)
- ✅ System stats accessible
- ✅ GPU: NVIDIA GeForce RTX 3090 (CUDA)

**gemDirect1 App:**
- ✅ Running on http://localhost:3000
- ✅ Updated to auto-discover port 8000

---

## 🔧 Configuration Steps

### Step 1: Open Settings Modal
1. Navigate to http://localhost:3000
2. Click the **⚙️ Settings icon** (top-right corner)
3. The "Local Generation Settings" modal will open

### Step 2: Discover/Configure ComfyUI
**Option A: Auto-Discovery (Recommended)**
1. Click the **"Auto-Discover"** button
2. The app will try:
   - http://127.0.0.1:8000 ✅ (should work!)
   - http://localhost:8000
   - http://127.0.0.1:8188
   - http://localhost:8188
3. When found, the URL field will auto-populate
4. Status should show: "✓ Server found at http://127.0.0.1:8000"

**Option B: Manual Entry**
1. In the "Server URL" field, enter: `http://127.0.0.1:8000`
2. Click **"Test Connection"**
3. Should show: "✓ Connected to ComfyUI"

### Step 3: View System Info
After connection, the pre-flight check should display:
- **GPU**: NVIDIA GeForce RTX 3090
- **VRAM Total**: ~24 GB
- **VRAM Free**: ~[current free amount]
- **Queue Status**: 0 running, 0 pending

### Step 4: Sync Workflow
1. **Load a workflow in ComfyUI first!**
   - Open ComfyUI at http://127.0.0.1:8000
   - Load or create a workflow (e.g., default SD workflow)
   - Make sure it has at least:
     - CLIPTextEncode (for positive prompt)
     - LoadImage (for keyframe)
     - Optional: CLIPTextEncode (for negative prompt)

2. **In gemDirect1 Settings Modal:**
   - Click **"Sync Workflow from Server"**
   - The app will fetch the currently loaded workflow
   - Workflow JSON will appear (collapsed in UI)

### Step 5: Configure Mappings

**Automatic Mapping (AI-powered):**
1. After syncing, click **"Auto-Map Inputs"**
2. AI will analyze the workflow and suggest mappings
3. Review the suggested mappings:
   - `Human-Readable Prompt` → should map to positive CLIPTextEncode
   - `Keyframe Image` → should map to LoadImage
   - `Negative Prompt` → should map to negative CLIPTextEncode (if present)

**Manual Mapping:**
1. For each row in the mapping table:
   - **Left column**: Shows ComfyUI node info (e.g., "Node 6: CLIPTextEncode - text")
   - **Right column**: Dropdown to select app data type
2. Match them appropriately:
   - Positive text input → "Human-Readable Prompt"
   - Image input → "Keyframe Image"
   - Negative text input → "Negative Prompt"
   - Leave others as "none" if not needed

### Step 6: Run Pre-flight Checks
1. Click **"Run Pre-flight Checks"** button
2. All checks should pass:
   - ✅ Server Connection
   - ✅ System Resources (VRAM check)
   - ✅ Queue Status
   - ✅ Workflow Validity
   - ✅ Mapping Consistency

### Step 7: Save Settings
1. Click **"Save"** button
2. Settings are persisted to localStorage
3. Modal closes

---

## 🎬 Testing Generation

### Test 1: Simple Story Creation
1. Close the settings modal
2. Enter a story idea: "A detective in a cyberpunk city investigates a mysterious case"
3. Click "Generate Story Bible"
4. Wait for AI to generate logline, characters, setting, plot
5. Review and proceed to "Director's Vision"

### Test 2: Director's Vision
1. Click "Suggest Visions" for AI ideas, or enter your own:
   - Example: "Neo-noir aesthetic with neon lights, rain-soaked streets, high contrast shadows, cinematic wide shots"
2. Click "Generate Scenes"
3. AI will create 4-6 scenes with keyframe images

### Test 3: Timeline Editing
1. Click on a scene in the left sidebar
2. Review the shot list (3-4 initial shots)
3. Make a small edit to a shot description or add an enhancer
4. Verify changes save

### Test 4: Local Generation (The Main Test!)
1. In a scene with shots defined
2. Look for a button like:
   - "Generate Local Preview"
   - "Generate with ComfyUI"
   - Or a dropdown with "Local Generation" option
3. Click it
4. **Expected Behavior:**
   - Pre-flight checks run automatically
   - Keyframe image uploads to ComfyUI
   - Workflow gets data injected
   - Prompt queued to ComfyUI
   - WebSocket connection established
   - Progress updates appear:
     - "Queued... Position: X"
     - "Executing: [Node Name]"
     - Progress bar: 0% → 100%
   - Final output displayed (image or video)

### Test 5: Verify in ComfyUI
While generation is running:
1. Open http://127.0.0.1:8000 in another tab
2. You should see:
   - The workflow with injected data
   - Green progress bars on executing nodes
   - Queue panel showing the job

---

## 🐛 Troubleshooting

### Issue: "Auto-Discovery failed"
**Cause**: Port 8000 not in discovery list (should be fixed now)
**Solution**: Manually enter `http://127.0.0.1:8000`

### Issue: "Failed to sync workflow"
**Cause**: No workflow loaded in ComfyUI
**Solution**: 
1. Open ComfyUI (http://127.0.0.1:8000)
2. Load a workflow (Load Default, or drag & drop a workflow JSON)
3. Return to gemDirect1 and click "Sync Workflow" again

### Issue: "Mapping validation failed"
**Cause**: Workflow changed or mappings incorrect
**Solution**:
1. Re-sync workflow
2. Clear existing mappings
3. Re-configure mappings (auto or manual)

### Issue: "Failed to upload image"
**Cause**: ComfyUI input directory not writable
**Solution**: Check ComfyUI logs, verify permissions on `C:\COMFYUI\input`

### Issue: "Generation stuck at 0%"
**Cause**: WebSocket not connected
**Solution**:
1. Check browser console (F12) for WebSocket errors
2. Verify ComfyUI allows WebSocket connections
3. Try refreshing the page

### Issue: "Out of memory" during generation
**Cause**: Not enough VRAM
**Solution**:
1. In ComfyUI, reduce image resolution
2. Disable VAE or upscaling nodes
3. Check VRAM usage in settings pre-flight check

---

## 📋 Checklist for Successful Integration

- [ ] ComfyUI running on http://127.0.0.1:8000
- [ ] gemDirect1 can auto-discover ComfyUI
- [ ] Test connection shows "Connected"
- [ ] System stats display GPU info
- [ ] Workflow synced from ComfyUI
- [ ] Mappings configured (auto or manual)
- [ ] Pre-flight checks all pass
- [ ] Settings saved
- [ ] Story bible generated
- [ ] Director's vision defined
- [ ] Scenes created
- [ ] Local generation initiated
- [ ] Progress tracking works
- [ ] Final output received and displayed
- [ ] No errors in browser console (F12)
- [ ] No errors in ComfyUI terminal

---

## 🎯 Expected Workflow Example

### ComfyUI Workflow Requirements
A minimal workflow that works with gemDirect1:

```
CheckpointLoaderSimple → CLIP → CLIPTextEncode (positive) ──┐
                                                              ├─→ KSampler → VAEDecode → SaveImage
EmptyLatentImage ───────────────────────────────────────────┤
                          CLIPTextEncode (negative) ─────────┘
```

### Mapping Configuration
```
Node 6: CLIPTextEncode (Positive) - text    → Human-Readable Prompt
Node 7: CLIPTextEncode (Negative) - text    → Negative Prompt
```

Note: For Image-to-Image or Image-to-Video workflows, also map:
```
Node 10: LoadImage - image                   → Keyframe Image
```

---

## 📊 What to Look For

### In gemDirect1 (Browser)
1. **Settings Modal**:
   - Green checkmarks for all pre-flight checks
   - Valid workflow JSON displayed
   - Mappings table shows configured inputs

2. **During Generation**:
   - Status changes: idle → queued → running → complete
   - Progress bar updates
   - Node names displayed as they execute
   - Queue position shown (if applicable)

3. **After Generation**:
   - Final image/video displays in the UI
   - Can save or download the output
   - Status shows "complete"

### In ComfyUI (http://127.0.0.1:8000)
1. **Workflow**:
   - Text inputs show injected prompts (from gemDirect1)
   - LoadImage shows uploaded keyframe (if mapped)

2. **Queue Panel**:
   - Shows active job
   - Client ID: `csg_[timestamp]` or similar

3. **Output**:
   - Final image/video saved to `C:\COMFYUI\output\`
   - Filename matches what gemDirect1 displays

### In Browser Console (F12)
Look for:
- `ComfyUI WebSocket connection established.`
- No CORS errors
- No 404 or 500 errors on API calls
- WebSocket messages flowing during generation

---

## 🚀 Ready to Test!

1. Open http://localhost:3000
2. Follow the configuration steps above
3. Test the complete workflow
4. Report any issues or errors

**Expected Outcome**: Complete end-to-end story creation with local video/image generation via ComfyUI! 🎬

---

**Note**: The app has been updated to prioritize port 8000 in auto-discovery, so it should find your ComfyUI Desktop instance immediately!
