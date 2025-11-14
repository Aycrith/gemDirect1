# Quick Reference Card: Integrated Pipeline Implementation

**Laminate this card or keep at desk for easy reference**

---

## 🎯 The Mission (1 sentence)

Deploy a production-ready AI story generator that combines local Mistral LLM + React UI + ComfyUI video production with comprehensive telemetry and reliability.

---

## ⏱️ Timeline at a Glance

```
Days 1–3:   LLM Foundation (Mistral, prompts, quality metrics)
Days 4–6:   React UI + ComfyUI Telemetry (parallel)
Days 7–8:   Testing + Performance (parallel)
Days 9–10:  Deployment + Docs + CI/CD (parallel)
```

**Deadline**: Day 10 (production ready) ✓

---

## 📖 Documents You'll Need

| Document | Purpose | When to Read |
|---|---|---|
| **MASTER_IMPLEMENTATION_INDEX.md** | Navigation guide | First thing (5 min) |
| **INTEGRATED_PIPELINE_EXECUTIVE_SUMMARY.md** | High-level overview | Before starting phase |
| **INTEGRATED_PIPELINE_IMPLEMENTATION_ROADMAP.md** | Detailed 10-day plan | Your phase (bookmark!) |
| **IMPLEMENTATION_COMPLETE_CHECKLIST.md** | Task tracking + success criteria | Daily check-in |
| **TELEMETRY_CONTRACT.md** | What data gets logged | Phase 3 + validation |
| **QUALITY_METRICS.md** | KPIs and validation | Phase 1 |
| **SCALABILITY_GUIDE.md** | Resource management | Phase 5–6 |
| **MONITORING_GUIDE.md** | Operations + incident response | Phase 6 onward + incidents |

---

## 🔑 Key Architectural Decisions

1. **Local Mistral 7B** (LM Studio) – no cloud costs, full privacy
2. **Atomic done-marker** (write .tmp → rename .done) – eliminate race conditions
3. **Telemetry-first ops** – all runs logged to artifact-metadata.json
4. **Distributed ownership** – parallel phase execution with clear task owners

---

## ✅ Critical Path (What Can't Be Skipped)

1. Phase 1 (LLM foundation) → everything else
2. Phase 3 (telemetry completion) → Phase 4 validation
3. Phase 4 (testing) → Phase 8 CI/CD enforcement

---

## 🚨 Do This First (Day 1)

- [ ] Read MASTER_IMPLEMENTATION_INDEX.md (5 min)
- [ ] Read INTEGRATED_PIPELINE_EXECUTIVE_SUMMARY.md (10 min)
- [ ] Find your phase in INTEGRATED_PIPELINE_IMPLEMENTATION_ROADMAP.md (5 min)
- [ ] Bookmark IMPLEMENTATION_COMPLETE_CHECKLIST.md (daily check-in)
- [ ] Identify your phase lead's contact (from IMPLEMENTATION_COMPLETE_CHECKLIST.md)

---

## 🎯 Success Metrics (Remember These)

**Reliability**: ✅ Telemetry in 100% of runs | ✅ Done-marker in 95%+ | ✅ Zero-frame < 2%

**Performance**: ✅ Avg frames ≥ 25 | ✅ P95 latency ≤ 120s | ✅ GPU VRAM delta ≤ 18 GB

**Quality**: ✅ Coherence ≥ 4.0/5 | ✅ Diversity entropy ≥ 2.0 | ✅ Alignment ≥ 0.75

**Operations**: ✅ Incident playbooks work | ✅ Weekly reviews run | ✅ Health checks active

---

## 🔧 Essential Scripts

```powershell
# Run full pipeline (Days 7+)
pwsh ./scripts/run-comfyui-e2e.ps1

# Validate your work
pwsh ./scripts/verify-telemetry-contract.ps1 -RunDir logs/<timestamp>

# Test the quality validators
pwsh ./scripts/quality-checks/run-quality-checks.ps1

# Analyze performance across runs
pwsh ./scripts/generate-sweep-report.ps1

# Install deployment helpers
pwsh ./scripts/install-sentinel-service.ps1
pwsh ./scripts/install-sentinel-scheduledtask.ps1

# Health check
pwsh ./scripts/health-check.ps1
```

---

## 📋 Phase Checklist Template (Use Daily)

**Phase: _____ | Owner: _____ | Days: _____**

- [ ] Task 1: __________________ (DUE: _____)
- [ ] Task 2: __________________ (DUE: _____)
- [ ] Task 3: __________________ (DUE: _____)
- [ ] Test this phase's work
- [ ] Update IMPLEMENTATION_COMPLETE_CHECKLIST.md
- [ ] Brief next phase lead
- [ ] Commit PRs with artifacts

---

## 🚨 Something Broken? Go Here

| Problem | Solution |
|---|---|
| **LM Studio unavailable** | See MONITORING_GUIDE.md > Incident: LLM Unavailable |
| **GPU OOM** | See MONITORING_GUIDE.md > Incident: GPU OOM |
| **Done-marker never appears** | See MONITORING_GUIDE.md > Incident: Done-marker Missing |
| **Telemetry missing** | See TELEMETRY_CONTRACT.md > Enforcement Points |
| **Test fails** | See IMPLEMENTATION_COMPLETE_CHECKLIST.md > Questions |
| **Don't know where to start** | See MASTER_IMPLEMENTATION_INDEX.md > "Getting Started" |

---

## 👥 Who to Contact

**LLM & Quality (Phase 1)**: AI Implementation Lead  
**React UI (Phase 2)**: Frontend Lead  
**ComfyUI & Workflow (Phase 3)**: Workflow Engineer  
**Testing (Phase 4)**: QA Lead  
**Performance (Phase 5)**: Performance Engineer  
**Deployment (Phase 6)**: DevOps Lead  
**Documentation (Phase 7)**: Tech Writer  
**CI/CD (Phase 8)**: DevOps/CI Lead  

→ Full contact list in: IMPLEMENTATION_COMPLETE_CHECKLIST.md > Key Contacts

---

## 📊 Daily Standup Talking Points

**1. What did you complete yesterday?**
→ Update IMPLEMENTATION_COMPLETE_CHECKLIST.md

**2. What are you doing today?**
→ Check next task in INTEGRATED_PIPELINE_IMPLEMENTATION_ROADMAP.md

**3. Are you blocked?**
→ Escalate to phase owner (see contact list above)

**4. Any telemetry/test failures?**
→ Check MONITORING_GUIDE.md incident playbooks

**Total time**: 15 minutes

---

## 🎓 One-Page Primer: How It Works

1. **React UI** (user input) → Story scene request
2. **LLM** (Mistral 7B) → Generates text prompt + metadata
3. **Watcher** (scene trigger) → Queues scene with ComfyUI
4. **ComfyUI** (video production) → Generates frames, writes .done marker
5. **Poller** (queue script) → Waits for marker, copies frames
6. **Telemetry** (logging) → Records all metrics to artifact-metadata.json
7. **Validator** (verify-telemetry-contract.ps1) → Ensures all fields present
8. **UI** (Artifact Snapshot) → Displays results + feedback panel

---

## 💡 Pro Tips

- **Parallelize**: Phase 2 + Phase 3 run simultaneously (no dependencies)
- **Early validation**: Run tests daily; don't wait until Day 8
- **Document failures**: Use MONITORING_GUIDE.md to track incidents
- **Weekly reviews**: Every Friday, run generate-sweep-report.ps1 (automation saves time)
- **Bookmark paths**: logs/<timestamp>/ contains all artifacts for your runs

---

## 🔗 Key Directories

```
source code:    src/, components/, services/, scripts/
workflows:      workflows/
config:         .env.local, vite.config.ts, vitest.config.ts
artifacts:      logs/<timestamp>/*, artifacts/comfyui-e2e-*.zip
docs:           docs/, README.md (update daily)
external:       LM Studio (192.168.50.192:1234), ComfyUI (127.0.0.1:8188)
```

---

## ⚡ Emergency Abort (If Everything Breaks)

1. Stop ComfyUI: Run "Stop ComfyUI Server" task
2. Kill any hung processes: `Get-Process python* | Stop-Process -Force`
3. Check logs: `Get-Content logs/<latest>/artifact-metadata.json | ConvertFrom-Json | Select-Object -ExpandProperty ErrorLog`
4. Restart clean: `pwsh ./scripts/run-comfyui-e2e.ps1 -Debug`
5. Escalate to phase owner if still broken

---

## 📝 Fill in Your Details

```
Your Name:                    _______________________________
Your Phase:                   _______________________________
Your Tasks:                   _______________________________
Your Deadline:                _______________________________
Your Escalation Contact:      _______________________________
Your Team's Slack Channel:    _______________________________
Daily Standup Time:           _______________________________
Weekly Review Day/Time:       _______________________________
```

---

## 🎯 Remember

- **Telemetry is sacred**: Every field in TELEMETRY_CONTRACT.md must be logged
- **Done-marker matters**: It's the sync point between producer (ComfyUI) and consumer (queue script)
- **Quality is measurable**: KPIs in QUALITY_METRICS.md drive weekly reviews
- **Monitoring saves lives**: MONITORING_GUIDE.md playbooks handle 95% of incidents
- **Documentation wins**: Your clear notes today save hours of debugging tomorrow

---

**Print this. Tape to your monitor. Refer often. ✨**

Last Updated: November 13, 2025

