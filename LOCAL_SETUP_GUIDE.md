# gemDirect1 - Local Setup Guide

## Project Overview

**gemDirect1** (Cinematic Story Generator) is an AI-powered storytelling and cinematography tool that creates complete cinematic stories from concept to shot-by-shot details, with integrated support for local video generation via ComfyUI.

### Technology Stack
- **Frontend**: React 19 + TypeScript + Vite
- **AI**: Google Gemini API (2.5-flash, 2.5-pro, 2.5-flash-image)
- **Styling**: Tailwind CSS (via CDN)
- **Local Generation**: ComfyUI Integration
- **Storage**: IndexedDB (via idb library)

## Installation Complete! ✅

The project has been successfully set up with:
1. ✅ Dependencies installed
2. ✅ Environment variables configured
3. ✅ Development server running on **http://localhost:3000**

## Current Status

### What's Working:
- ✅ Gemini API configured with your key
- ✅ Dev server running on port 3000
- ✅ All dependencies installed

### What Needs Attention:
- ⚠️ **ComfyUI is NOT currently running** on the default port (8188)
- You mentioned ComfyUI is "online and running/ready in the background" - please verify the port it's running on

## Project Architecture

### Core Workflow Stages:
1. **Idea** → Input your story concept
2. **Story Bible** → AI generates logline, characters, setting, plot outline
3. **Director's Vision** → Define cinematic aesthetic and style
4. **Director (Timeline)** → Shot-by-shot editing with creative enhancers
5. **Continuity** → Video analysis and quality scoring

### Key Features:

#### 1. Story Generation
- Multi-framework narrative support (Hero's Journey, Three-Act, Kishōtenketsu, etc.)
- AI-assisted character development
- Plot outline refinement

#### 2. Cinematic Direction
- Shot-by-shot timeline editing
- Creative enhancers (framing, lighting, movement, lens, mood, VFX)
- Negative prompt suggestions
- Batch shot processing

#### 3. Co-Director AI
- Suggests creative improvements
- Can modify shots, add new beats, change transitions
- Respects established creative boundaries

#### 4. ComfyUI Integration
- **Auto-discovery**: Automatically finds ComfyUI on common ports
- **Workflow Mapping**: Maps story data to ComfyUI workflow nodes
  - Human-readable prompts
  - Structured JSON timelines
  - Keyframe images
  - Negative prompts
- **Real-time Tracking**: WebSocket connection for generation progress
- **Pre-flight Checks**: Validates server connection, VRAM, queue status

#### 5. Continuity Director
- Video frame analysis
- Scores narrative coherence, aesthetic alignment, thematic resonance
- Suggests corrections at project or scene level
- Can extend timelines based on generated videos

### File Structure

```
gemDirect1/
├── services/
│   ├── geminiService.ts       # All Gemini API interactions
│   ├── comfyUIService.ts      # ComfyUI integration & workflow mapping
│   ├── payloadService.ts      # Prompt generation
│   └── videoGenerationService.ts
├── components/                 # React components
│   ├── StoryIdeaForm.tsx
│   ├── StoryBibleEditor.tsx
│   ├── DirectorsVisionForm.tsx
│   ├── TimelineEditor.tsx
│   ├── ContinuityDirector.tsx
│   ├── LocalGenerationSettingsModal.tsx
│   └── [many more...]
├── contexts/
│   ├── ApiStatusContext.tsx   # API status tracking
│   └── UsageContext.tsx       # Token usage tracking
├── utils/
│   ├── hooks.ts               # Custom React hooks
│   ├── database.ts            # IndexedDB operations
│   ├── projectUtils.ts        # Save/load projects
│   └── videoUtils.ts          # Video processing
├── types.ts                    # TypeScript definitions
├── App.tsx                     # Main app component
└── .env.local                  # Your Gemini API key (created)
```

## How to Use

### 1. Access the Application
Open your browser to: **http://localhost:3000**

### 2. Create Your First Story
1. Enter a story idea in the initial form
2. AI generates a Story Bible (logline, characters, setting, plot)
3. Refine the Story Bible if needed
4. Define your Director's Vision (cinematic style)
5. AI generates scenes with shot lists
6. Edit timelines, add/modify shots
7. Generate previews or connect to ComfyUI for local video generation

### 3. ComfyUI Setup (For Local Video Generation)

#### Prerequisites:
- ComfyUI must be running and accessible
- Default URL: `http://127.0.0.1:8188` or `http://localhost:8188`

#### Configuration Steps:
1. Click the **Settings icon** (⚙️) in the top-right corner
2. In the "Local Generation Settings" modal:
   - **Server URL**: Enter your ComfyUI server URL
   - **Client ID**: Auto-generated (optional to customize)
   - Click **"Test Connection"** to verify ComfyUI is accessible
3. Click **"Sync Workflow from Server"** to fetch your active ComfyUI workflow
4. The app will auto-map your workflow inputs, or you can manually configure:
   - **Human-Readable Prompt** → CLIPTextEncode node's "text" input
   - **Keyframe Image** → LoadImage node's "image" input
   - **Negative Prompt** → Negative CLIPTextEncode node's "text" input
5. Save settings

#### Starting ComfyUI (If Not Running):
```bash
# Navigate to your ComfyUI directory
cd path/to/ComfyUI

# Run ComfyUI (Python)
python main.py

# Or if using a specific port:
python main.py --port 8188
```

**⚠️ Windows Users - UTF-8 Encoding Required**

If you encounter a `UnicodeEncodeError` when running ComfyUI on Windows (typically from tqdm progress bars), you must set UTF-8 encoding **before** starting ComfyUI:

```powershell
# PowerShell (Windows)
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONLEGACYWINDOWSSTDIO = '0'
python main.py --port 8188

# Or use the provided UTF-8 wrapper script:
.\scripts\start-comfyui-utf8.ps1
```

**Why?** Windows defaults to cp1252 encoding, which cannot render Unicode block characters (█) used by tqdm progress bars. This causes KSampler workflows to fail during frame generation.

**Verification**: If the error is fixed, you should see properly formatted progress bars:
```
 75%|██████▌   | 15/20 [01:30<00:30, 2.0s/it]
```

The app includes **Pre-flight Checks** that verify:
- ✅ Server connection
- ✅ System resources (VRAM)
- ✅ Queue status
- ✅ Workflow validity
- ✅ Data mapping consistency

### 4. Generate Local Videos/Images
1. Navigate to a scene in the Director stage
2. Ensure the scene has shots defined
3. Click **"Generate Local Preview"** or similar button
4. The app will:
   - Upload the keyframe image to ComfyUI
   - Inject prompts into your workflow
   - Queue the generation
   - Track progress via WebSocket
   - Display the final output when complete

### 5. Continuity Review
1. Complete some scenes and generate videos
2. Go to the **Continuity** stage
3. Upload generated videos
4. AI analyzes frames and scores alignment with your creative vision
5. Review suggestions to fix deviations
6. Apply suggested changes or extend the timeline

## Advanced Features

### Project Persistence
- **Save Project**: Click 💾 icon to download `.json` file with full state
- **Load Project**: Click ☁️ icon to restore a saved project
- All generated images, videos, settings, and continuity data are included

### Usage Dashboard
- Click the 📊 icon to view API usage statistics
- Tracks token consumption by model and operation
- Shows success/error rates

### Workflow Mapping Intelligence
The app can automatically map your ComfyUI workflow by:
1. Analyzing the workflow JSON structure
2. Identifying common node types (CLIPTextEncode, LoadImage, etc.)
3. Suggesting optimal data mappings
4. Validating mappings before generation

### Co-Director Suggestions
- Request creative improvements for specific scenes
- AI suggests diverse changes: cinematography, plot twists, transitions
- Each suggestion is actionable and can be applied with one click

## Troubleshooting

### ComfyUI Connection Issues
**Problem**: "Failed to connect to ComfyUI"

**Solutions**:
1. Verify ComfyUI is running: `http://localhost:8188` should show the interface
2. Check firewall settings (Windows may block local connections)
3. Ensure CORS is enabled in ComfyUI (usually enabled by default)
4. Try both `127.0.0.1` and `localhost` in settings

### API Key Issues
**Problem**: Gemini API errors

**Solutions**:
1. Verify `.env.local` contains: `GEMINI_API_KEY=AIzaSyBSlMmOTFo07pm3oRTAIABcuxf09b9KtOQ`
2. Restart the dev server after changing `.env.local`
3. Check Google AI Studio for API quota limits

### Generation Errors
**Problem**: "Workflow validation failed"

**Solutions**:
1. Re-sync workflow from ComfyUI server
2. Verify workflow mappings in settings
3. Check that mapped nodes still exist in your workflow
4. Review console for specific error messages

### Performance Issues
**Problem**: Slow generation or high token usage

**Solutions**:
1. Use `gemini-2.5-flash` for faster responses (already configured)
2. Reduce scene complexity (fewer shots)
3. Use batch processing features for multiple shots
4. Check Usage Dashboard to identify expensive operations

## Important Notes

### API Costs
- This app uses Gemini API which may incur costs based on usage
- Monitor usage via the built-in Usage Dashboard
- The app uses context pruning to minimize token consumption

### Data Privacy
- All story data is stored locally in your browser (IndexedDB)
- API calls go to Google Gemini (for AI processing)
- ComfyUI communication is local-only (no cloud)
- Use "Save Project" to backup important work

### Browser Compatibility
- Tested with modern browsers (Chrome, Edge, Firefox)
- Requires WebSocket support for ComfyUI tracking
- Requires IndexedDB support for local storage

## Next Steps

1. ✅ **Server is running** - Open http://localhost:3000
2. ⚠️ **Start ComfyUI** - Ensure it's running on port 8188
3. 🎬 **Create your first story** - Start with a simple concept
4. ⚙️ **Configure ComfyUI integration** - Use the Settings modal
5. 🎥 **Generate your first video** - Test the complete workflow

## Development Commands

```bash
# Start dev server (already running)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Install dependencies (if needed again)
npm install --ignore-scripts
```

## Troubleshooting

### ComfyUI Connection Issues

**Problem**: "Cannot connect to ComfyUI" or "Failed to reach server"

**Solutions**:
1. Verify ComfyUI is running: `curl http://127.0.0.1:8188/system_stats` (PowerShell) or `Invoke-RestMethod http://127.0.0.1:8188/system_stats`
2. Check the port matches your ComfyUI startup command
3. Ensure firewall allows port 8188
4. Try `http://localhost:8188` instead of `127.0.0.1:8188`

---

### Windows: UnicodeEncodeError in KSampler

**Problem**: 
```
UnicodeEncodeError: 'charmap' codec can't encode character '\u258e' in position 6
```

**Root Cause**: Windows console uses cp1252 encoding by default, which cannot render Unicode block characters used by tqdm progress bars.

**Solution - Set UTF-8 BEFORE starting ComfyUI**:

```powershell
# Option 1: Set environment variables in PowerShell
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONLEGACYWINDOWSSTDIO = '0'
cd C:\ComfyUI\ComfyUI_windows_portable
.\python_embeded\python.exe -s ComfyUI\main.py --listen 0.0.0.0 --port 8188

# Option 2: Use the provided UTF-8 wrapper script
.\scripts\start-comfyui-utf8.ps1

# Option 3: Use VS Code task "Start ComfyUI Server" (UTF-8 pre-configured)
# Ctrl+Shift+P → Tasks: Run Task → Start ComfyUI Server
```

**Verification**: Progress bar should display properly:
```
 50%|█████     | 15/30 [00:45<00:45, 3.0s/it]
```

---

### Frame Generation Not Working

**Problem**: Scenes complete but 0 frames generated

**Checklist**:
1. ✅ Check ComfyUI logs for errors (watch terminal while generating)
2. ✅ Verify SVD model is loaded: `curl http://127.0.0.1:8188/system_stats`
3. ✅ Check VRAM availability (need ~12GB for SVD video generation)
4. ✅ Ensure keyframe image was properly uploaded to ComfyUI
5. ✅ Verify workflow mapping is correct in Settings
6. ✅ Check `ComfyUI/user/logs/` for detailed error logs

---

### Gemini API Issues

**Problem**: "API rate limit exceeded" or "Quota exceeded"

**Solutions**:
1. Check your quota at: https://ai.google.dev/pricing
2. Verify API key in `.env.local` is correct: `cat .env.local`
3. Wait 1 minute before retrying (rate limiting: Flash 60 RPM, Pro 15 RPM)
4. Use Flash model instead of Pro for faster operations

**Problem**: Empty or malformed responses

**Solutions**:
1. Ensure JSON schemas match expected structure
2. Check Gemini API status: https://status.cloud.google.com
3. Try regenerating with a simpler prompt

---

### App Data Not Persisting

**Problem**: Lose project data after page refresh

**Solution**: Ensure using `usePersistentState` hook for all user data (not regular `useState`)
- This automatically saves to IndexedDB

**Data Stored**:
- ✅ Project metadata
- ✅ Stories and scenes
- ✅ Generated images/frames
- ✅ Settings
- ✅ Continuity analysis

---

### Port Already in Use

**Problem**: "Port 3000 already in use" or "Port 8188 already in use"

**Solutions**:

*For dev server (port 3000)*:
```powershell
# Find process using port 3000
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
# Kill it
Stop-Process -Id <PID> -Force
# Restart dev server
npm run dev
```

*For ComfyUI (port 8188)*:
```powershell
# Find process using port 8188
Get-NetTCPConnection -LocalPort 8188 | Select-Object OwningProcess
# Kill it
Stop-Process -Id <PID> -Force
# Restart ComfyUI
.\scripts\start-comfyui-utf8.ps1
```

---

### Video Generation Timeout

**Problem**: Generation starts but hangs or times out after X minutes

**Causes**:
- GPU is thermal throttling (check temps)
- Out of VRAM (need GPU restart)
- Workflow is stuck waiting for node input
- Network connectivity lost to ComfyUI

**Solutions**:
1. Reduce frame count in workflow (default 30, try 15-20)
2. Use smaller model if available
3. Ensure GPU has adequate cooling
4. Restart ComfyUI: `.\scripts\check-comfyui-recovery.ps1`
5. Check ComfyUI queue: `curl http://127.0.0.1:8188/queue`

---

### CORS Errors

**Problem**: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solution**: ComfyUI must be started with CORS enabled:

```powershell
# UTF-8 wrapper script already includes CORS flag
.\scripts\start-comfyui-utf8.ps1

# Or manually with CORS:
python main.py --listen 0.0.0.0 --port 8188 --enable-cors-header "*"
```

---

## Support & Resources

- **Original AI Studio Project**: https://ai.studio/apps/drive/1uvkkeiyDr3iI4KPyB4ICS6JaMrDY4TjF
- **GitHub Repository**: https://github.com/Aycrith/gemDirect1
- **Gemini API Key**: Configured in `.env.local`
- **Windows UTF-8 Fix**: See `WINDOWS_UTF8_FIX_SUCCESS.md` for complete details

---

**Project Status**: ✅ Ready to use!
**Server URL**: http://localhost:3000
**Next Action**: Open the app in your browser and start creating!
