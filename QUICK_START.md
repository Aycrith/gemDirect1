# 🚀 Quick Start Guide - gemDirect1

## ✅ Setup Complete!

Your gemDirect1 (Cinematic Story Generator) is now running locally at:
**http://localhost:3000**

---

## 🎬 First Steps

### 1. Open the Application
The app should already be open in your browser. If not, navigate to:
```
http://localhost:3000
```

### 2. Close the Welcome Modal (if shown)
Click to dismiss the welcome guide and start creating!

### 3. Create Your First Story

#### Option A: Use a Suggestion
1. Click "Suggest Ideas" button
2. Select one of the AI-generated concepts
3. Click "Generate Story Bible"

#### Option B: Write Your Own
1. Enter a one-sentence story idea, for example:
   - *"A detective investigates a murder in a futuristic city where memories can be bought and sold"*
   - *"A young witch discovers her powers on her first day at magic school"*
   - *"An astronaut stranded on Mars must survive using only their wit and limited supplies"*
2. Click "Generate Story Bible"

### 4. Review & Refine Story Bible
The AI will generate:
- **Logline** - One-sentence story summary
- **Characters** - Key character descriptions
- **Setting** - World and atmosphere
- **Plot Outline** - Full story structure

You can:
- ✏️ Edit any section manually
- 🔄 Click "Refine" on characters or plot for AI enhancement
- ➡️ Click "Proceed to Director's Vision" when satisfied

### 5. Define Director's Vision

#### Option A: Use a Suggestion
1. Click "Suggest Visions"
2. Review 3 AI-generated cinematic styles
3. Select one and click "Use This Vision"

#### Option B: Write Your Own
1. Enter your desired cinematic style, for example:
   - *"Gritty neo-noir with high-contrast lighting, rain-soaked streets, and a brooding atmosphere"*
   - *"Whimsical Studio Ghibli-inspired with lush watercolor backgrounds and warm color palette"*
   - *"Documentary-style handheld camera, natural lighting, intimate close-ups"*
2. Optionally click "Refine Vision" for AI enhancement
3. Click "Generate Scenes"

### 6. Explore the Director Stage
The AI will generate:
- Multiple scenes (typically 4-6)
- Each scene has a keyframe image
- Each scene has 3-4 initial shots with creative enhancers

**Navigation**:
- Left sidebar: Scene list (click to switch between scenes)
- Main area: Timeline editor for current scene
- Each shot shows description and enhancers (framing, lighting, mood, etc.)

### 7. Edit Your Timeline

**Try These Actions**:

#### Drag & Drop
- Reorder shots by dragging them

#### Edit a Shot
- Click the pencil icon on any shot
- Modify the description
- Toggle enhancers on/off
- Click "Save"

#### Add a Shot
- Click "Add Shot" button
- Enter description
- Select enhancers
- Choose position in timeline

#### Batch Processing
- Click "Batch Process" button
- Select multiple shots
- Choose actions (refine description, suggest enhancers)
- Apply to all selected shots at once

#### Co-Director Suggestions
- Click "Co-Director" tab
- Enter a creative objective, for example:
  - *"Inject more visual tension and suspense"*
  - *"Add a shocking plot twist"*
  - *"Use lighting to create mystery"*
- Review AI suggestions
- Click checkmark to apply any suggestion

### 8. Generate Previews

#### Scene Keyframe (Already Generated)
Each scene has a keyframe image automatically created.

#### Individual Shot Preview
- Click the image icon on any shot
- Gemini will generate a photorealistic preview image
- Wait 10-30 seconds for generation
- Image appears in shot card

---

## 🖥️ ComfyUI Integration (Optional but Powerful!)

### Prerequisites
1. ComfyUI must be installed and running
2. Default URL: `http://localhost:8188`

### Setup Steps

#### 1. Start ComfyUI (if not already running)
Open a new terminal/command prompt:
```bash
cd path/to/ComfyUI
python main.py
```

Wait for: `To see the GUI go to: http://127.0.0.1:8188`

#### 2. Configure in gemDirect1
1. Click the **⚙️ Settings icon** (top-right corner)
2. In the modal that opens:
   - **Server URL**: `http://127.0.0.1:8188` (or click "Auto-Discover")
   - Click **"Test Connection"**
   - Should show: "✓ Connected to ComfyUI"
3. Click **"Sync Workflow from Server"**
   - This fetches your currently loaded ComfyUI workflow
   - The app will auto-map inputs (or you can configure manually)
4. Verify the mappings:
   - **Human-Readable Prompt** → should map to a CLIPTextEncode node
   - **Keyframe Image** → should map to a LoadImage node
   - **Negative Prompt** → should map to a negative CLIPTextEncode node
5. Click **"Run Pre-flight Checks"** to verify everything is working
6. Click **"Save"**

#### 3. Generate Local Video/Image
1. Navigate to any scene in the Director stage
2. Ensure the scene has shots defined
3. Click **"Generate Local Preview"** button (may be labeled differently)
4. The app will:
   - Show progress in real-time
   - Display queue position
   - Show which node is currently executing
   - Display final output when complete
5. Review the generated video/image

---

## 📊 Track Your Usage

1. Click the **📊 Bar Chart icon** (top-right corner)
2. View:
   - Total tokens consumed
   - Breakdown by model (Pro vs Flash)
   - Breakdown by operation type
   - Success/error rates
3. Export data if needed

---

## 💾 Save Your Project

### Save
1. Click the **💾 Save icon** (top-right corner)
2. A `.json` file will download to your computer
3. This file contains EVERYTHING:
   - Story bible, vision, scenes
   - All generated images
   - ComfyUI settings
   - Continuity data

### Load
1. Click the **☁️ Upload icon** (top-right corner)
2. Select a previously saved `.json` file
3. Your entire project state will be restored

---

## 🎥 Advanced: Continuity Stage

### When to Use
After you've generated some videos locally (or elsewhere), you can analyze them for quality.

### Process
1. Click **"Continuity"** in the workflow tracker (top of page)
2. For each scene:
   - Upload the generated video
   - Click "Analyze Video"
   - AI extracts frames and analyzes content
   - Click "Score Continuity"
   - Review scores (1-10) for:
     - Narrative Coherence
     - Aesthetic Alignment
     - Thematic Resonance
   - Read AI feedback and suggestions
   - Apply suggestions to fix issues
3. Optionally:
   - Click "Extend Timeline" to generate a new scene that follows the video
   - Provide direction for what happens next
   - AI creates a new scene with visual continuity

---

## 🐛 Troubleshooting

### "API Error" or "Rate Limit"
- **Wait 10-30 seconds** and try again (auto-retry happens automatically)
- Check your Gemini API quota in Google AI Studio
- The app uses retry logic, so most errors self-resolve

### "Failed to connect to ComfyUI"
1. Verify ComfyUI is running: Open `http://localhost:8188` in a browser
2. Check the port (might be different than 8188)
3. Try both `127.0.0.1` and `localhost` in settings
4. Check firewall settings (Windows may block local connections)

### "Workflow validation failed"
1. Re-sync workflow from ComfyUI server
2. Verify workflow has necessary nodes (CLIPTextEncode, LoadImage)
3. Check that mapped nodes still exist
4. Review console (F12) for specific errors

### Generation Seems Slow
- **Gemini API**: First requests may be slow (cold start), subsequent requests faster
- **ComfyUI**: Check queue status in settings, generation speed depends on your GPU
- **Images**: 10-30 seconds per image is normal
- **Videos**: Can take several minutes depending on length and quality

### Lost My Work!
- Check browser's IndexedDB (DevTools → Application → IndexedDB → projectDatabase)
- Use "Save Project" frequently to create backups
- Load from a saved `.json` file

---

## 🎯 Pro Tips

### Efficient Workflow
1. Start with a simple story concept
2. Generate Story Bible quickly (don't over-refine yet)
3. Create Director's Vision (this is crucial - affects everything downstream)
4. Generate scenes
5. **Focus on 1-2 scenes** for initial testing
6. Perfect those scenes before expanding to all scenes

### Best Results
- **Be specific in Director's Vision**: Mention lighting, camera style, color palette
- **Use Co-Director wisely**: Give it specific objectives, not generic requests
- **Leverage batch processing**: Don't manually edit every shot, use batch for speed
- **Save often**: Use the save/load feature frequently

### ComfyUI Optimization
- **Start simple**: Basic SD workflow first, add complexity later
- **Test workflow in ComfyUI** before syncing to app
- **Watch VRAM**: Monitor via settings modal pre-flight check
- **Use lower resolutions** for initial tests (512x512), increase later

### Token Management
- Monitor usage via dashboard
- Story Bible generation is the most expensive operation (~500-1000 tokens)
- Image generation is separate (not counted in text token usage)
- Use "flash" model suggestions when offered (faster, cheaper)

---

## 📚 Additional Resources

- **Full Setup Guide**: `LOCAL_SETUP_GUIDE.md`
- **ComfyUI Integration Details**: `COMFYUI_INTEGRATION.md`
- **Comprehensive Project Overview**: `PROJECT_OVERVIEW.md`
- **Original AI Studio Project**: https://ai.studio/apps/drive/1uvkkeiyDr3iI4KPyB4ICS6JaMrDY4TjF
- **GitHub Repository**: https://github.com/Aycrith/gemDirect1

---

## ✨ You're Ready!

**Everything is set up and ready to go!**

1. ✅ Server running at http://localhost:3000
2. ✅ Gemini API configured
3. ✅ Dependencies installed
4. ✅ Documentation created

**Next Action**: Start creating your first cinematic story! 🎬

---

**Questions or Issues?**
- Check the console (F12) for detailed error messages
- Review the comprehensive documentation files
- Verify ComfyUI is running if attempting local generation

**Happy Storytelling!** 🚀
