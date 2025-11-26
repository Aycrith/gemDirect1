# ⚡ WAVE 3: QUICK START (5 Minutes)

**Status**: Ready to go | **Next Step**: Start testing

---

## 🎯 Objective

Verify Wave 3 infrastructure works end-to-end: ComfyUI → Data Flow → IndexedDB → UI

---

## ⏱️ 5-Minute Quick Start

### Step 1: Terminal 1 (Dev Server)
```bash
cd C:\Dev\gemDirect1
npm run dev
# Wait for: "Local: http://localhost:3000"
```

### Step 2: Terminal 2 (ComfyUI)
```
VS Code Tasks → Run Task → "Start ComfyUI Server"
# Wait for: "Listening on 0.0.0.0:8188"
```

### Step 3: Browser
```
Open: http://localhost:3000
Press: F12 (DevTools)
Go to: Console tab
Look for:
  ✓ "ComfyUI Callback Manager initialized"
  ✓ "Queue Monitor polling started (5s interval)"
```

### Step 4: ComfyUI
```
Open: http://127.0.0.1:8188
Create and run a test workflow
Watch console for polling messages
```

### Step 5: Verification
```
DevTools → Application → IndexedDB → gemDirect1_telemetry
Check "runs" object store for new entry
Check "recommendations" for suggestions
Check UI for HistoricalTelemetryCard display
```

---

## ✅ Success Looks Like

```
Browser Console:
✓ ComfyUI Callback Manager initialized
✓ Queue Monitor polling started (5s interval)
[QueueMonitor] Polling... found 1 new completions
✓ Workflow completed and saved: run-id-xxx
Generated recommendations: [success_rate, gpu_usage, ...]
```

---

## 🔍 What to Check

| Check | Where | What |
|-------|-------|------|
| Services init | Browser console | "✓" messages |
| Polling active | Browser console | Polling log messages |
| Data in DB | DevTools Application | New entries in "runs" |
| UI displays | Browser | HistoricalTelemetryCard |
| No errors | Browser console | Clear of errors |

---

## ⚠️ If Something's Wrong

| Problem | Quick Fix |
|---------|-----------|
| No console messages | Refresh page (Ctrl+F5) |
| ComfyUI not found | Check http://127.0.0.1:8188/system_stats |
| No data in IndexedDB | Wait 5-10 seconds, then refresh |
| React errors | Check App.tsx has ComfyUICallbackProvider |
| Still stuck | See WAVE_3_INTEGRATION_GUIDE.md troubleshooting |

---

## 📚 Next Level

**Need more details?**
- Quick Ref: WAVE_3_QUICK_REFERENCE.md
- Technical: WAVE_3_INTEGRATION_GUIDE.md
- Summary: WAVE_3_SESSION_SUMMARY.md

---

## 🎉 You're Done!

Wave 3 infrastructure is working when:
1. Services initialize (console messages)
2. Polling active (console logs)
3. Data in IndexedDB (DevTools)
4. UI displays (browser view)
5. No errors (clean console)

**Estimated Time**: 5 minutes to start | 25 minutes total testing

---

*Ready? Start with Step 1 above! →*
