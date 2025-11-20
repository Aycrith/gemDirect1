# gemDirect1 + ComfyUI Setup & Troubleshooting Guide

## Quick Start Setup

### Prerequisites
- Windows 10/11 or macOS/Linux
- NVIDIA GPU (RTX 3080 or better recommended)
- Node.js 18+ 
- Python 3.10+
- 10GB+ free disk space for models

### Installation Steps

#### 1. Install ComfyUI
```bash
git clone https://github.com/comfyorg/ComfyUI
cd ComfyUI
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
python main.py
```

#### 2. Start gemDirect1
```bash
cd gemDirect1
npm install
npm run dev
```

#### 3. Configure Connection
1. Open http://localhost:3000
2. Click Settings (gear icon)
3. Click "Automatically Find My ComfyUI Server"
4. Server address should auto-populate (usually http://127.0.0.1:8000)
5. Click "Save Settings"

#### 4. Verify Connection
1. Still in Settings, click "Run System Check"
2. Should see:
   - ✅ Server Connection successful
   - ✅ GPU detected
   - ✅ Queue empty

### First Workflow

1. Generate a Story Bible (left panel, Story Bible button)
2. Run a test workflow in ComfyUI:
   - Open http://127.0.0.1:8000 in another tab
   - Click "Run" to execute default workflow
3. Return to gemDirect1 Settings
4. Click "Configure with AI" to auto-map workflow
5. Click "Save Settings"

---

## Troubleshooting Guide

### Issue: "Server not found" in auto-discovery

**Symptoms:** 
- Auto-discovery fails
- "Could not find server automatically" message

**Solutions:**
1. **Check ComfyUI is running:**
   ```powershell
   curl -I http://127.0.0.1:8000
   ```
   Should return `HTTP/1.1 200 OK`

2. **Check port number:**
   - Open ComfyUI terminal/console
   - Look for: `Starting server at: http://127.0.0.1:XXXX`
   - Note the actual port (might not be 8000)
   - Manually enter in Settings: Server Address field

3. **Check firewall:**
   - Ensure Windows Firewall allows Python/ComfyUI
   - Try disabling firewall temporarily for testing

4. **Check CORS is enabled:**
   ```powershell
   curl -I -X OPTIONS http://127.0.0.1:8000/history
   ```
   Should include: `Access-Control-Allow-Origin: *`

### Issue: "No workflow history found" when using Configure with AI

**Symptoms:**
- Settings saved successfully
- Running System Check shows green checkmarks
- "Configure with AI" button shows error: "No workflow history found"

**Cause:** ComfyUI history is empty (no workflows have been executed yet)

**Solution:**
1. Go to http://127.0.0.1:8000 (ComfyUI)
2. Load or create a workflow
3. Click the "Run" button
4. Wait for execution (may take 1-5 minutes depending on GPU and settings)
5. Go back to gemDirect1 Settings
6. Click "Configure with AI" again
7. Wait 10-30 seconds for Gemini API to analyze
8. Should show: "AI configuration complete! Workflow synced and mapped."

### Issue: "Prompt execution failed" in ComfyUI

**Symptoms:**
- ComfyUI workflow execution fails
- Error about missing model or invalid configuration

**Causes & Solutions:**

**Missing Checkpoint Model:**
- Download a model (e.g., Stable Diffusion checkpoint .safetensors file)
- Place in: `ComfyUI/models/checkpoints/`
- Restart ComfyUI
- Try workflow again

**Missing VAE or CLIP:**
- Similar process for `models/vae/` and `models/clip/`
- Restart ComfyUI

**Invalid Workflow:**
- Use a template from ComfyUI examples
- Or use the "Create a new blank workflow" button
- Start with basic: CheckpointLoader → CLIPTextEncode → KSampler → VAEDecode → SaveImage

### Issue: CORS Error in Browser Console

**Symptoms:**
- Browser console shows: "Access to XMLHttpRequest blocked by CORS policy"
- Network tab shows failed requests to ComfyUI API

**Solution:**
1. Verify CORS header is set in ComfyUI startup
   - Should see: `--enable-cors-header *` in server output
   - Check that no `--disable-cors` flag is present

2. If using custom ComfyUI installation:
   - Edit: `ComfyUI/server.py`
   - Find CORS middleware section
   - Ensure it includes: `resp.headers['Access-Control-Allow-Origin'] = '*'`
   - Remove any credentials-related headers

3. Restart ComfyUI after changes

### Issue: Story Generation Takes Too Long

**Symptoms:**
- Story generation stuck on "Generating..."
- After 30+ seconds still loading

**Cause:** Gemini API slowness or missing API key

**Solutions:**
1. **Check API key:**
   - Open `.env.local` in gemDirect1 root
   - Verify `API_KEY=your_key_here` is present
   - Get key from: https://aistudio.google.com/app/apikeys

2. **Check API quota:**
   - Visit https://console.cloud.google.com
   - Check Gemini API usage
   - May need to wait for quota reset

3. **Retry story generation:**
   - Click "Story Idea" button
   - Re-enter story text
   - Click "Generate Story Bible" again

4. **Check network:**
   - Ensure internet connection is stable
   - Try ping: `ping google.com`

### Issue: "Save project" not working

**Symptoms:**
- Click "Save project" button
- Nothing happens or error appears

**Solution:**
1. Check browser console for errors (Press F12)
2. Ensure localStorage is enabled in browser
3. Check available disk space
4. Try saving project with different name
5. Try in Incognito/Private mode to test

### Issue: Settings don't save

**Symptoms:**
- Enter server address and client ID
- Click Save Settings
- Next time opening settings, fields are empty

**Causes & Solutions:**

**Browser Storage Issue:**
1. Clear browser cache/cookies
2. Try different browser (Chrome, Edge, Firefox)
3. Check if browser storage is enabled

**Firewall/Network:**
1. Check if API calls are being blocked
2. Check Windows Firewall logs
3. Try adding ComfyUI to firewall whitelist

### Issue: Low GPU Performance / Generation Slow

**Symptoms:**
- Workflows execute but very slowly
- GPU not fully utilized

**Causes & Solutions:**

**GPU Memory Exhausted:**
```powershell
# Check GPU VRAM in gemDirect1 Settings → Run System Check
# Look for VRAM Free in output
```
- Close other GPU applications
- Use smaller resolution (256x256 instead of 512x512)
- Reduce steps (10-15 instead of 20-30)

**Wrong GPU Selected:**
- Ensure NVIDIA GPU is primary compute device
- Check CUDA is available:
  ```bash
  python -c "import torch; print(torch.cuda.is_available())"
  ```
- If False, reinstall PyTorch with CUDA support

**CPU Fallback:**
- ComfyUI may fallback to CPU if GPU has issues
- Check ComfyUI startup logs for warnings
- Restart both applications

---

## Performance Optimization Tips

### 1. Image Generation Speed
- Start with smaller resolution (256x256)
- Reduce steps to 15-20 (default is often 50+)
- Use "euler" or "normal" samplers (fastest)

### 2. Multiple Workflows
- Don't queue too many workflows (causes memory buildup)
- Process in batches: 3-5 workflows, wait for completion, continue

### 3. Model Loading
- Keep only needed models loaded
- Use "Unload Models" button in ComfyUI between large sessions
- Consider model optimization tools (quantization, pruning)

### 4. Memory Management
- Monitor VRAM usage in Settings → System Check
- If nearing limit, restart ComfyUI and gemDirect1
- Check for memory leaks (VRAM shouldn't creep up over time)

---

## Advanced Configuration

### Custom ComfyUI Port
If ComfyUI runs on non-standard port (not 8000):

1. **Method 1: Auto-Discovery**
   - Click "Automatically Find My ComfyUI Server" in Settings
   - Should find whatever port is active

2. **Method 2: Manual Entry**
   - Note the port from ComfyUI startup message
   - Enter full URL in Settings: `http://127.0.0.1:XXXX`
   - Save Settings

### Remote ComfyUI Server
If ComfyUI runs on different machine:

1. **Get server IP:**
   - ComfyUI machine: Open terminal, type `ipconfig`
   - Find IPv4 address (e.g., 192.168.1.100)

2. **In gemDirect1 Settings:**
   - Enter: `http://192.168.1.100:8000`
   - Save Settings

3. **Ensure firewall allows inbound:**
   - On ComfyUI machine, allow port 8000 through firewall
   - Test: `curl http://192.168.1.100:8000/system_stats` from gemDirect1 machine

---

## Health Check Procedures

### Daily Health Check
```powershell
# 1. Check both servers respond
curl http://localhost:3000
curl http://127.0.0.1:8000/system_stats

# 2. Check GPU status
$stats = Invoke-RestMethod http://127.0.0.1:8000/system_stats
Write-Host "GPU VRAM: $($stats.devices[0].vram_free / 1GB) GB free"

# 3. Check workflow history
$history = Invoke-RestMethod http://127.0.0.1:8000/history
Write-Host "Executed workflows: $($history.Count)"
```

### Weekly Health Check
1. Run System Check in gemDirect1 settings
2. Generate a test story
3. Execute a workflow in ComfyUI
4. Verify Configure with AI works
5. Check for error messages in browser console
6. Verify all UI buttons respond

---

## Support & Contact

### Where to Find Help
1. **gemDirect1 Issues:** Check GitHub Issues
2. **ComfyUI Issues:** ComfyUI GitHub or Forums
3. **Google Gemini Issues:** Check API Status Page
4. **NVIDIA Issues:** NVIDIA Developer Forums

### Log Files
- **ComfyUI:** Check terminal/console output
- **Browser:** Press F12 → Console tab
- **gemDirect1:** Check browser console

### Reporting Issues
Include:
- OS version
- GPU model and driver version
- ComfyUI version
- Browser version
- Full error message from console
- Screenshot of Settings → System Check results

---

## FAQ

**Q: Can I use CPU instead of GPU?**
A: Yes, but very slow. Expected generation times: 5-15 minutes per image (vs 30-60 seconds on GPU)

**Q: Do I need to keep ComfyUI terminal window open?**
A: Yes, if running from terminal. Consider installing as service or using process manager.

**Q: Can I run gemDirect1 and ComfyUI on different computers?**
A: Yes, see "Remote ComfyUI Server" in Advanced Configuration section.

**Q: What if I get "Model not found" errors?**
A: Download models and place in `ComfyUI/models/` subdirectories. See ComfyUI documentation.

**Q: Does gemDirect1 require internet?**
A: For story generation (Gemini API): Yes. For image generation (ComfyUI): No, works fully offline.

**Q: Is my data private?**
A: Story generation sends text to Google's API. Local image generation stays on your machine.

---

## Version History
- **v1.0** - Initial release, tested with ComfyUI 0.3.67, gemDirect1 with React 19.2.0
