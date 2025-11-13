# Windows-Agent Testing Iteration - Visual Roadmap

**November 11, 2025** | Environment ✓ Ready | Blocker: SVD Model | Status: Ready for Execution

---

## 🎯 Overall Test Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WINDOWS-AGENT E2E TESTING FLOW                      │
└─────────────────────────────────────────────────────────────────────────┘

                              START HERE
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  1. DOWNLOAD SVD MODEL   │  (15-30 min)
                    │  (~2.5 GB checkpoint)    │  ← BLOCKING STEP
                    └──────────────────────────┘
                                  │
                         Download Complete? ──NO──> RETRY
                                  │ YES
                                  ▼
                    ┌──────────────────────────┐
                    │  2. RUN E2E TEST SUITE   │  (10-20 min)
                    │  run-comfyui-e2e.ps1     │
                    └──────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
          [Story Generation]        [Scene Processing]
              (30-60 sec)              (9-15 minutes)
                    │                           │
          3 scenes + prompts        Scene 1/2/3 (3-5 min each)
                    │                ├─ Load workflow
                    │                ├─ Inject prompt/keyframe
                    │                ├─ Queue to ComfyUI
                    │                ├─ Poll history (600s max)
                    │                ├─ Collect 25 frames
                    │                └─ Save history.json
                    │                           │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  [Vitest Suite Runs]      │  (1-2 min)
                    │  ├─ ComfyUI tests         │
                    │  ├─ E2E tests             │
                    │  └─ Scripts tests         │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  3. REVIEW RESULTS        │  (5 min)
                    │  ├─ Metadata JSON         │
                    │  ├─ Frame count (75?)     │
                    │  ├─ Test exit codes (0?)  │
                    │  └─ Archive generated?    │
                    └─────────────┬─────────────┘
                                  │
                        ┌─────────┴─────────┐
                        │                   │
                    SUCCESS ✓           FAILURE ❌
                        │                   │
            ┌───────────▼────────────┐     │
            │ - All 75 frames        │     │
            │ - Tests pass (0,0,0)   │     │
            │ - Archive created      │     │
            │ - Metadata complete    │     │
            └───────────┬────────────┘     │
                        │                   │
                PUBLISH REPORT            TROUBLESHOOT
                        │                   │
                        ▼                   ▼
                   END ✓ PASS      See Troubleshooting Guide
```

---

## 📊 Timeline Breakdown

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION TIMELINE                             │
└─────────────────────────────────────────────────────────────────────────┘

STEP 1: SVD Download
├─ Duration: 15-30 minutes (network dependent)
├─ Command: scripts/verify-svd-model.ps1 -Download $true
└─ Blocker: Must complete before tests

                            ✓ Download Complete
                                    │
STEP 2A: Story Generation           │
├─ Duration: 30-60 seconds          │
├─ Generates: 3 scenes + prompts ◄──┘
└─ Output: story/story.json

STEP 2B: Scene Processing (Parallel)
├─ Scene 1: 3-5 minutes (25 frames)
├─ Scene 2: 3-5 minutes (25 frames)
├─ Scene 3: 3-5 minutes (25 frames)
├─ Total: 9-15 minutes
└─ Output: 75 PNG frames total

STEP 3: Vitest Suites
├─ Duration: 1-2 minutes
├─ Suites: ComfyUI, E2E, Scripts
└─ Output: Exit codes (expect 0, 0, 0)

STEP 4: Metadata & Archive
├─ Duration: 30 seconds
├─ Creates: artifact-metadata.json, archive.zip
└─ Output: Results ready for analysis

STEP 5: Review Results
├─ Duration: 5 minutes
├─ Commands: Review logs/<ts>/run-summary.txt
└─ Output: Success/failure determination

─────────────────────────────────────────────────────────────
TOTAL TIME: 30-55 minutes
- Fastest: 30 min (fast network, fast GPU)
- Typical: 40-50 min (normal conditions)
- Slowest: 55 min (slow network, slow GPU)
```

---

## 🗂️ Documentation Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      DOCUMENTATION HIERARCHY                            │
└─────────────────────────────────────────────────────────────────────────┘

START HERE
    │
    ├─ QUICK_START_E2E_TODAY.md (100 lines)
    │  └─ 3 steps, copy-paste commands, done in ~1 hour
    │
    ├─ WINDOWS_AGENT_TESTING_SESSION_SUMMARY.md (300 lines)
    │  └─ What was done, current status, next actions
    │
    ├─ DOCUMENTATION_INDEX_20251111.md (350 lines)
    │  └─ Navigation map, find right document for your need
    │
    ├─ E2E_EXECUTION_CHECKLIST_20251111.md (400 lines)
    │  ├─ Pre-execution checks
    │  ├─ Step-by-step execution
    │  ├─ Post-run analysis
    │  ├─ Success criteria table
    │  └─ Troubleshooting (6 scenarios)
    │
    └─ WINDOWS_AGENT_TEST_ITERATION_PLAN.md (500+ lines)
       ├─ Comprehensive reference
       ├─ All procedures detailed
       ├─ Full troubleshooting guide
       └─ Context and background

HELPER SCRIPTS
    │
    └─ scripts/verify-svd-model.ps1
       ├─ Check if SVD exists
       └─ Auto-download if missing
```

---

## 🔄 Decision Tree for Operators

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WHICH DOCUMENT DO I NEED?                           │
└─────────────────────────────────────────────────────────────────────────┘

START
  │
  ├─ "I want to START TESTING RIGHT NOW"
  │  └─→ QUICK_START_E2E_TODAY.md (100 lines)
  │      Run 3 commands, minimal reading
  │
  ├─ "I need to UNDERSTAND THE PROCESS"
  │  └─→ WINDOWS_AGENT_TEST_ITERATION_PLAN.md (500+ lines)
  │      Comprehensive reference for everything
  │
  ├─ "I'M EXECUTING TESTS NOW and need STEP-BY-STEP GUIDANCE"
  │  └─→ E2E_EXECUTION_CHECKLIST_20251111.md (400 lines)
  │      Follow numbered steps, has all commands
  │
  ├─ "I need to BRIEF MY TEAM on STATUS"
  │  └─→ WINDOWS_AGENT_TESTING_SESSION_SUMMARY.md (300 lines)
  │      Executive overview of what's done
  │
  ├─ "I NEED A QUICK ANSWER to a SPECIFIC QUESTION"
  │  ├─→ "How do I troubleshoot X?"
  │  │   └─ See E2E_EXECUTION_CHECKLIST_20251111.md Section 5
  │  │
  │  ├─→ "What files were created?"
  │  │   └─ See SESSION_DELIVERY_SUMMARY_20251111.md
  │  │
  │  ├─→ "What's the current status?"
  │  │   └─ See WINDOWS_AGENT_TESTING_SESSION_SUMMARY.md Section 2
  │  │
  │  └─→ "How do I find what I need?"
  │      └─ See DOCUMENTATION_INDEX_20251111.md
  │
  └─ "I DON'T KNOW WHERE TO START"
     └─→ DOCUMENTATION_INDEX_20251111.md (350 lines)
        Navigation map + recommended reading order
```

---

## ✅ Pre-Execution Validation Checklist

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    READY TO START TESTS? CHECK THIS                    │
└─────────────────────────────────────────────────────────────────────────┘

Environment Validation
  ├─ [✓] Node v22.19.0
  │   Command: node -v
  │   Expected: v22.19.0 or higher
  │
  ├─ [✓] PowerShell 7+
  │   Command: $PSVersionTable.PSVersion
  │   Expected: 7.x.x (Core)
  │
  ├─ [✓] ComfyUI Running at 127.0.0.1:8188
  │   Command: Test-NetConnection -ComputerName 127.0.0.1 -Port 8188
  │   Expected: TcpTestSucceeded = True
  │
  └─ [⏳] SVD Model Present
      Command: Test-Path "C:\ComfyUI\...\SVD\svd_xt.safetensors"
      Expected: True (if False, run verify-svd-model.ps1 -Download $true)

Disk Space Check
  ├─ [✓] ~10 GB free (for SVD + frames + archive)
  │   Command: Get-Volume C: | Select-Object SizeRemaining
  │   Expected: > 10 GB remaining
  │
  └─ [✓] Disk writable (input/output directories)
      Command: "test" | Out-File "C:\ComfyUI\.../test.txt"; Remove-Item "...test.txt"
      Expected: File write/delete succeeds

All Checks Pass? ✓ YOU'RE READY TO TEST
Any Checks Fail? ❌ FIX AND RETRY
```

---

## 📈 Expected Results Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WHAT TO EXPECT AFTER E2E TESTS                       │
└─────────────────────────────────────────────────────────────────────────┘

SUCCESSFUL RUN ✓
├─ Exit Code: 0
├─ Scenes Generated: 3/3
├─ Total Frames: 75/75 (25 per scene)
├─ Frame Files: 75 PNG images in scene_*/generated-frames/
├─ History Retrieved: All 3 scenes (history.json files exist)
├─ Vitest Exit Codes: 0, 0, 0 (ComfyUI, E2E, Scripts)
├─ Metadata: artifact-metadata.json complete
├─ Archive: comfyui-e2e-{timestamp}.zip created
├─ Logs: logs/{timestamp}/run-summary.txt with SUCCESS message
└─ Message: "Story-to-video e2e complete!" + exit 0

PARTIAL SUCCESS ⚠️ (Frames < 25)
├─ Exit Code: 0 (not fatal if frames exist)
├─ Scenes Generated: 3/3
├─ Total Frames: 50-70 (less than 75 but usable)
├─ History Retrieved: Some or all
├─ Vitest Exit Codes: 0, 0, 0
├─ Action Needed: Review history poll log in metadata
│  └─ Likely cause: GPU slow, increase timeout in queue-real-workflow.ps1
└─ Status: USABLE (retry with longer timeout if full 25 needed)

FAILURE ❌
├─ Exit Code: 1
├─ Error Messages: RED lines in terminal output
├─ Scenes Generated: 0-2 (incomplete)
├─ Total Frames: < 50
├─ Vitest Exit Codes: 1 for one or more suites
├─ Metadata: Incomplete or missing
├─ Action Needed: See troubleshooting section
│  ├─ Check ComfyUI is running
│  ├─ Check SVD model present
│  ├─ Review error logs
│  └─ Follow remediation steps
└─ Status: NEEDS INVESTIGATION
```

---

## 🚨 Blocker Resolution Flowchart

```
┌─────────────────────────────────────────────────────────────────────────┐
│              SVD MODEL BLOCKER - HOW TO RESOLVE                         │
└─────────────────────────────────────────────────────────────────────────┘

ISSUE: SVD Model Missing
│
├─ QUICK CHECK
│  └─ Command: Test-Path "C:\ComfyUI\...\SVD\svd_xt.safetensors"
│     ├─ Returns: True  → ✓ YOU'RE GOOD, PROCEED TO TESTS
│     └─ Returns: False → ⏳ DOWNLOAD NEEDED (see options below)
│
├─ OPTION 1: Automated Download (RECOMMENDED)
│  ├─ Command: pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
│  ├─ Duration: 15-30 minutes
│  ├─ Pros: Fully automated, validates after download, progress bar
│  ├─ Cons: Requires network connectivity
│  └─ Result: ✓ File downloaded, validated, ready for tests
│
├─ OPTION 2: Browser Download (IN-BROWSER)
│  ├─ Steps:
│  │  1. Open http://127.0.0.1:8188 in browser
│  │  2. Click "Manager" button
│  │  3. Click "Install Models"
│  │  4. Search "svd_xt"
│  │  5. Click "Install"
│  ├─ Duration: 15-30 minutes
│  ├─ Pros: Visual feedback, ComfyUI Manager handles it
│  ├─ Cons: Requires UI interaction
│  └─ Result: ✓ Model auto-placed in correct location
│
└─ OPTION 3: Manual Download (TECHNICAL)
   ├─ Steps:
   │  1. Download: https://huggingface.co/.../svd_xt.safetensors
   │  2. Create: C:\ComfyUI\...\models\checkpoints\SVD\
   │  3. Place: svd_xt.safetensors in that directory
   │  4. Verify: Test-Path "C:\ComfyUI\...\SVD\svd_xt.safetensors"
   ├─ Duration: 20-40 minutes
   ├─ Pros: Full control, understand process
   ├─ Cons: Multiple manual steps, easy to miss details
   └─ Result: ✓ File in correct location, ready for tests

VERIFICATION
└─ After any option:
   └─ Command: Test-Path "C:\ComfyUI\...\SVD\svd_xt.safetensors"
      └─ Expected: True
      └─ If False: Retry or try different option

PROCEED TO TESTS
└─ Once verified True:
   └─ Command: pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
   └─ Tests start automatically
```

---

## 🎬 Action Items Priority Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WHAT TO DO NEXT - PRIORITY ORDER                    │
└─────────────────────────────────────────────────────────────────────────┘

🔴 URGENT (DO IMMEDIATELY - 15-30 min)
├─ [ ] Download SVD model using verify-svd-model.ps1
│   Command: pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
│   Blocker: Tests won't run without this
│   Estimated: 15-30 minutes
│   Status: CRITICAL PATH
│
└─ [ ] After download completes

🟡 HIGH (DO NEXT - 10-20 min)
├─ [ ] Run full E2E test suite
│   Command: pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
│   Depends on: SVD model downloaded
│   Estimated: 10-20 minutes
│   Status: PRIMARY ACTION
│
└─ [ ] After tests complete

🟢 MEDIUM (DO AFTER TESTS - 5 min)
├─ [ ] Review results using checklist commands
│   Depends on: E2E tests completed
│   Estimated: 5 minutes
│   See: E2E_EXECUTION_CHECKLIST_20251111.md Section 3
│
└─ [ ] Determine success/failure

🟣 LOW (OPTIONAL - 20+ min)
├─ [ ] Create detailed test report (template provided)
├─ [ ] Archive old logs if needed
├─ [ ] Plan iteration 2 (LLM enhancement, more scenes)
└─ [ ] Measure and document performance metrics

⏸️ BLOCKED (NOTHING TO DO - WAITING)
└─ Cannot proceed until SVD download completes
```

---

## 📞 Quick Help Reference

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         QUICK HELP LOOKUP                              │
└─────────────────────────────────────────────────────────────────────────┘

Q: "Where do I start?"
A: Open QUICK_START_E2E_TODAY.md and follow 3 steps

Q: "How do I download the SVD model?"
A: Run: pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true

Q: "How long will this take?"
A: 30-55 minutes (15-30 min SVD + 10-20 min tests + 5 min review)

Q: "What if tests fail?"
A: See troubleshooting in E2E_EXECUTION_CHECKLIST_20251111.md Section 5 (6 scenarios covered)

Q: "How do I know if it succeeded?"
A: Check success criteria table in E2E_EXECUTION_CHECKLIST_20251111.md (11 items)

Q: "What do I do with the results?"
A: See documentation & reporting in E2E_EXECUTION_CHECKLIST_20251111.md Section 6

Q: "Where are the generated files?"
A: logs/{timestamp}/ contains all outputs (frames, metadata, logs, archive)

Q: "How much disk space do I need?"
A: ~10 GB (SVD ~2.5 GB + frames ~2-3 GB + workspace)

Q: "Is ComfyUI still running?"
A: Check: Test-NetConnection -ComputerName 127.0.0.1 -Port 8188

Q: "Can I run this multiple times?"
A: Yes, each run creates new logs/{timestamp}/ folder with unique timestamp
```

---

## ✨ Success! What's Next?

```
After E2E Tests Complete Successfully ✓

├─ PUBLISH RESULTS
│  ├─ Archive: artifacts/comfyui-e2e-{timestamp}.zip
│  ├─ Metadata: public/artifacts/latest-run.json
│  ├─ Report: logs/{timestamp}/run-summary.txt
│  └─ Frames: logs/{timestamp}/scene_*/generated-frames/
│
├─ ANALYZE QUALITY
│  ├─ Review frame generation quality
│  ├─ Check story coherence across scenes
│  ├─ Validate metadata completeness
│  └─ Note any improvements needed
│
├─ PLAN NEXT ITERATION
│  ├─ Increase scene count (5, 10 scenes)
│  ├─ Add LLM enhancement for better prompts
│  ├─ Measure performance metrics (GPU time, throughput)
│  ├─ Test with different GPU settings
│  └─ Document findings
│
└─ TEAM COMMUNICATION
   ├─ Share success report
   ├─ Document any issues encountered
   ├─ Create runbook for operators
   └─ Plan training if needed
```

---

**Visual Roadmap Generated**: November 11, 2025  
**Status**: Ready for Operator Action  
**Next**: Follow Decision Tree → Execute Tests → Review Results
