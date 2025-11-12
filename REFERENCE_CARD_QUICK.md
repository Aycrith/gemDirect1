# Reference Card: Windows-Agent Testing Session

## 🎯 What Was Delivered

### Documents (8 Files)
1. `QUICK_START_E2E_TODAY.md` - 3 commands, start now
2. `E2E_EXECUTION_CHECKLIST_20251111.md` - Step-by-step guide
3. `WINDOWS_AGENT_TEST_ITERATION_PLAN.md` - Comprehensive reference
4. `WINDOWS_AGENT_TESTING_SESSION_SUMMARY.md` - Session overview
5. `DOCUMENTATION_INDEX_20251111.md` - Navigation map
6. `VISUAL_ROADMAP_20251111.md` - Diagrams & flowcharts
7. `SESSION_DELIVERY_SUMMARY_20251111.md` - Handoff summary
8. `START_HERE_COMPLETE_DELIVERY.md` - This delivery

### Scripts (1 File)
- `scripts/verify-svd-model.ps1` - SVD auto-download helper

---

## 🚀 Three Quick Commands

### 1. Download SVD Model (15-30 min)
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
```

### 2. Run E2E Tests (10-20 min)
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

### 3. Review Results (5 min)
```powershell
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Get-Content "logs/$ts/run-summary.txt" | Select-Object -Last 30
```

**Total Time**: 30-55 minutes

---

## ✅ Environment Status

| Component | Status | Check |
|-----------|--------|-------|
| Node.js | ✓ v22.19.0 | `node -v` |
| PowerShell | ✓ 7.5.3 | `$PSVersionTable` |
| ComfyUI | ✓ Running | `Test-NetConnection -ComputerName 127.0.0.1 -Port 8188` |
| SVD Model | ⏳ Missing | `Test-Path C:\ComfyUI\...\SVD\svd_xt.safetensors` |

---

## 📊 Expected Results

```
Success Indicators:
├─ Frames generated: 75/75 ✓
├─ Test exit codes: 0, 0, 0 ✓
├─ History retrieved: 3/3 ✓
├─ Validation passed: Yes ✓
└─ Archive created: Yes ✓

Failure Indicators:
├─ Exit code: 1 (non-zero)
├─ Frames: < 50
├─ Tests: Any exit code ≠ 0
└─ Errors: Red text in output
```

---

## 📚 Which Document Do I Need?

| Your Need | Document |
|-----------|----------|
| Start NOW | QUICK_START_E2E_TODAY.md |
| Step-by-step | E2E_EXECUTION_CHECKLIST_20251111.md |
| Deep understanding | WINDOWS_AGENT_TEST_ITERATION_PLAN.md |
| Find anything | DOCUMENTATION_INDEX_20251111.md |
| Troubleshoot | E2E_EXECUTION_CHECKLIST_20251111.md Section 5 |
| Status update | WINDOWS_AGENT_TESTING_SESSION_SUMMARY.md |
| Visual overview | VISUAL_ROADMAP_20251111.md |

---

## 🔴 Critical Blocker

**File Needed**: `svd_xt.safetensors` (~2.5 GB)  
**Location**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\`  

**Solution**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
```

---

## ⚡ Quick Commands

```powershell
# Check if SVD is present
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"

# Check ComfyUI is running
Test-NetConnection -ComputerName 127.0.0.1 -Port 8188

# View latest run summary
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Get-Content "logs/$ts/run-summary.txt"

# View latest metadata
$metadata = Get-Content "logs/$ts/artifact-metadata.json" | ConvertFrom-Json
$metadata.Scenes | Select-Object SceneId, FrameCount, Success | Format-Table

# Check frame count
$total = 0; for ($i = 1; $i -le 3; $i++) { $count = @(Get-ChildItem "logs/$ts/scene_$i/generated-frames" -File 2>/dev/null).Count; Write-Host "Scene $i: $count"; $total += $count }; Write-Host "Total: $total"
```

---

## 📋 Success Checklist (11 Items)

- [ ] Exit code = 0
- [ ] 3 scenes generated
- [ ] 75 frames total (25 per scene)
- [ ] Scene 1 success = True
- [ ] Scene 2 success = True
- [ ] Scene 3 success = True
- [ ] History retrieved = 3/3
- [ ] ComfyUI tests = 0
- [ ] E2E tests = 0
- [ ] Scripts tests = 0
- [ ] Validation passed

**All ✓ = SUCCESS**

---

## 🎯 What to Do Next

1. **Immediate** (Today):
   - Download SVD model (1 command)
   - Run E2E tests (1 command)
   - Review results (1-2 commands)

2. **Short-term** (This week):
   - Document findings
   - Plan iteration 2
   - Test with LLM enhancement

3. **Medium-term** (Next sprint):
   - Increase scene count
   - Measure performance
   - Optimize GPU usage

---

## 📞 Help

**Can't find something?** → See `DOCUMENTATION_INDEX_20251111.md`

**Error during execution?** → Check `E2E_EXECUTION_CHECKLIST_20251111.md` Section 5

**Need background?** → Read `WINDOWS_AGENT_TEST_ITERATION_PLAN.md`

**Just want to start?** → Follow `QUICK_START_E2E_TODAY.md`

---

## ✨ What Makes This Ready

✅ All environment components validated  
✅ Single clear blocker identified  
✅ 8 comprehensive documents  
✅ 1 helper script  
✅ 6 troubleshooting scenarios  
✅ 11 success criteria  
✅ Multiple documentation entry points  
✅ Copy-paste ready commands  
✅ Expected outputs documented  
✅ Post-run analysis procedures  

---

**Status**: ✅ READY FOR EXECUTION  
**Blocker**: ⏳ SVD model (15-30 min to resolve)  
**Time to Complete**: 30-55 minutes total

**Next**: Download SVD → Run tests → Review results

---

**Reference Card v1.0** | November 11, 2025

