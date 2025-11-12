# Quick Start: SVD Download → E2E Tests → Results

**Status**: Environment ready ✓ | Blocked on SVD model | Tests ready to execute

---

## 1. Download SVD Model (15-30 minutes)

**Check if present**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1
```

**Download (if missing)**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
```

✓ Wait for completion (you'll see: "✓ SVD model downloaded successfully!")

---

## 2. Run Full E2E Test Suite (10-20 minutes)

**Execute**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

**What happens**:
- ✓ Generates 3-scene story
- ✓ Processes each scene through SVD (3-5 min per scene)
- ✓ Generates 75 PNG frames (25 per scene)
- ✓ Runs Vitest suites
- ✓ Creates metadata & archive

✓ Wait for "Story-to-video e2e complete!" message

---

## 3. Review Results (5 minutes)

**Get timestamp of latest run**:
```powershell
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Write-Host "Latest run: $ts"
```

**View summary**:
```powershell
Get-Content "logs/$ts/run-summary.txt" | Select-Object -Last 30
```

**Check frame count**:
```powershell
$total = 0
for ($i = 1; $i -le 3; $i++) {
    $count = @(Get-ChildItem "logs/$ts/scene_$i/generated-frames" -File 2>/dev/null).Count
    Write-Host "Scene $i: $count frames"
    $total += $count
}
Write-Host "TOTAL: $total / 75 ✓"
```

**View metadata**:
```powershell
$metadata = Get-Content "logs/$ts/artifact-metadata.json" | ConvertFrom-Json
$metadata.Scenes | Select-Object SceneId, FrameCount, Success, HistoryRetrieved | Format-Table
```

---

## Success Indicators

✓ All output looks like this:

```
[HH:mm:ss] Story ready: story-xyz (scenes=3)
[HH:mm:ss] [Scene scene_1][Attempt 1] Frames=25 Duration=180s Prefix=gemdirect1_scene_1
[HH:mm:ss] [Scene scene_2][Attempt 1] Frames=25 Duration=175s Prefix=gemdirect1_scene_2
[HH:mm:ss] [Scene scene_3][Attempt 1] Frames=25 Duration=182s Prefix=gemdirect1_scene_3
[HH:mm:ss] Scene summary: 3/3 succeeded | total frames=75 | requeues=0
[HH:mm:ss] [Validation] run-summary validation passed

============================
Story-to-video e2e complete!
Logs: logs/{timestamp}
Summary: logs/{timestamp}/run-summary.txt
==============================
```

---

## Troubleshooting (If Needed)

| Symptom | Fix | Time |
|---------|-----|------|
| SVD download fails | Retry command or use browser option (see plan) | 5 min |
| Frames < 25 | History polling timeout (check metadata) | 10 min |
| E2E fails | Check vitest-*.log, see troubleshooting guide | 15 min |
| ComfyUI crashes | Restart: Stop-Process (python), then re-run | 2 min |

**Detailed help**: See `E2E_EXECUTION_CHECKLIST_20251111.md`

---

## Artifacts Generated

After successful run, check:

✓ Frames: `logs/{timestamp}/scene_*/generated-frames/*.png` (75 total)  
✓ Metadata: `logs/{timestamp}/artifact-metadata.json` (machine-readable)  
✓ Archive: `artifacts/comfyui-e2e-{timestamp}.zip` (~500 MB)  
✓ Dashboard feed: `public/artifacts/latest-run.json`  

---

## Total Time Estimate

| Step | Time | Cumulative |
|------|------|-----------|
| SVD Download | 15-30 min | 15-30 min |
| E2E Test Suite | 10-20 min | 25-50 min |
| Results Review | 5 min | 30-55 min |
| **TOTAL** | **30-55 min** | |

---

## Next Steps After Success

1. **Create report**: Document results in markdown
2. **Archive logs**: Clean up old runs if needed
3. **Plan iteration 2**: Run with LLM enhancement, more scenes, etc.

---

**Ready to start?** Begin with SVD download command above ↑

