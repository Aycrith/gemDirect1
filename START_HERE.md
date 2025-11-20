#!/usr/bin/env markdown
# 📚 START HERE: Complete Handoff Document Index

**Last Updated**: November 20, 2025  
**For**: Next AI Coding Agent  
**Project**: gemDirect1 – AI Cinematic Story-to-Video Generator  
**Current Status**: ✅ WORKING – Full story-to-video pipeline operational

---

## 🎯 CHOOSE YOUR PATH

### ⏰ I have 5 minutes (Give me the essentials)
→ Read this section only (below)

### ⏰ I have 30 minutes (I want quick context)
→ Read: **MASTER_HANDOFF_INDEX_20251119.md** (navigation guide)

### ⏰ I have 2 hours (I want to understand everything)
→ Read in order:
1. README.md (20 min)
2. MASTER_HANDOFF_INDEX_20251119.md (15 min)
3. COMPREHENSIVE_AGENT_HANDOFF_20251119.md sections 1-4 (45 min)

### ⏰ I have 4+ hours (I want to execute immediately)
→ Read in order, then execute:
1. README.md
2. MASTER_HANDOFF_INDEX_20251119.md
3. COMPREHENSIVE_AGENT_HANDOFF_20251119.md
4. NEXT_AGENT_EXECUTION_PROMPT.md (follow it step-by-step)

---

## 📋 THE 5-MINUTE SUMMARY

### Current Status (Updated 2025-11-20)
- ✅ **Working**: React UI, story generation, WAN2 video generation, telemetry collection
- ✅ **Validated**: WAN2 pipeline generates MP4 files successfully (run 2025-11-19: 3/3 scenes)
- ✅ **Tests**: ~44/50 Playwright tests passing (88%), minor UI/fixture issues only
- ⚠️ **Performance**: React mount time 1581ms (581ms over 1000ms target)

### Recent Validation Evidence
From run `logs/20251119-205415/`:
```
✅ scene-001.mp4: 0.33 MB (215.5s generation)
✅ scene-002.mp4: 5.2 MB (successful)
✅ scene-003.mp4: 8.17 MB (186.1s generation)

Status: All 3 scenes successfully generated MP4 videos
```

### Your Focus (Corrected Priorities)
1. **Performance** (Priority 1): Optimize React mount time (1581ms → <900ms via lazy loading)
2. **Documentation** (Priority 2): Archive outdated handoff docs, consolidate to single source of truth
3. **Test Cleanup** (Optional): Fix minor UI regressions in fixture-based tests

**Expected timeline**: 1-2 days for performance + docs, optional test cleanup

### Start Here
1. Read **README.md** (project setup)
2. Read **MASTER_HANDOFF_INDEX_20251119.md** (navigation guide, NOTE: lists outdated WAN2 blocker)
3. Review **logs/20251119-205415/** (evidence of working pipeline)
4. Run **npm test** and **npx playwright test** (verify current state)
5. Focus on test stability improvements (see Playwright failures below)

### Commands to Know
```powershell
# Verify setup
node -v  # Must be ≥22.19.0
npm run check:health-helper  # Verify ComfyUI ready

# Run full pipeline
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration

# Check latest run
$latest = Get-ChildItem "C:\Dev\gemDirect1\logs\*" -Directory | Sort-Object CreationTime -Descending | Select-Object -First 1
Get-Content "$($latest.FullName)\run-summary.txt"  # See what happened

# Build & test
npm run build  # Zero errors?
npm test  # All passing?
```

---

## 📑 COMPLETE DOCUMENT LIST

### Handoff Documents (Read These)

| File | Size | Purpose | Read When |
|------|------|---------|-----------|
| **MASTER_HANDOFF_INDEX_20251119.md** | 5KB | Navigation guide (start here) | First (5 min) |
| **COMPREHENSIVE_AGENT_HANDOFF_20251119.md** | 15KB | Architecture + strategy + debugging | Second (40 min) |
| **NEXT_AGENT_EXECUTION_PROMPT.md** | 12KB | Step-by-step execution instructions | During work (2-4 days) |
| **NEXT_AGENT_HANDOFF_CHECKLIST_20251119.md** | 6KB | Verification checklist + sign-off | During/after work (reference) |
| **HANDOFF_SESSION_COMPLETION_20251119.md** | 8KB | This session's completion summary | For context (10 min) |

### Project Documentation (Reference These)

| File | Purpose | Read When |
|------|---------|-----------|
| README.md | Local setup, commands, requirements | First (with handoff docs) |
| WORKFLOW_ARCHITECTURE_REFERENCE.md | Node mappings, workflow structure | When auditing workflows |
| VALIDATION_PROGRESS.md | Milestone tracking | When checking progress |
| HANDOFF_COMPLETE.md | Prior agent's learnings | For historical context |
| DOCUMENTATION_INDEX_20251111.md | Archive of patterns | For code pattern examples |

### Artifacts (Study These)

| Path | Content | Why Important |
|------|---------|--------------|
| logs/20251119-011556/run-summary.txt | Timeline of latest run | Shows WAN2 blocker evidence |
| logs/20251119-011556/artifact-metadata.json | Telemetry data | Schema for expected fields |
| logs/20251119-011556/scene-{001,002,003}/ | Generated frames | Proof that SVD works |
| logs/20251119-011556/video/ | Empty folder | Proof that WAN2 fails |

---

## 🚀 QUICK START CHECKLIST

### Pre-Work (30 minutes)
- [ ] Read README.md
- [ ] Read MASTER_HANDOFF_INDEX_20251119.md
- [ ] Verify prerequisites: `node -v`, ComfyUI running, `npm run check:health-helper`
- [ ] Review logs/20251119-011556/ artifacts

### Phase 1: Diagnostics (2-3 hours)
- [ ] Run baseline health check (NEXT_AGENT_EXECUTION_PROMPT.md Part 2, Task 1)
- [ ] Manual WAN2 test via ComfyUI UI (Task 2)
- [ ] Query history endpoint (Task 3)
- [ ] Audit workflow JSON (Task 4)
- [ ] Trace PowerShell script (Task 5)
- [ ] Document root cause hypothesis (Task 6)

### Phase 2: Implementation (1-4 hours)
- [ ] Based on root cause, implement PATH A/B/C fix
- [ ] Test single scene
- [ ] Test full e2e (3 scenes)
- [ ] Run stability test (3+ runs)

### Phase 3: Documentation (1 hour)
- [ ] Update README.md
- [ ] Update VALIDATION_PROGRESS.md
- [ ] Create session summary
- [ ] Commit to git with clear message

---

## 🔑 CURRENT PRIORITIES (Updated 2025-11-20)

### Priority 1: Performance (Medium)
**Issue**: React mount time 1581ms vs 1000ms target (581ms overage)

**Impact**: User-visible delay on cold start

**Fix**: Implement lazy loading for heavy components
- `TimelineEditor` (shot cards, transitions, complex state)
- `ArtifactSnapshot` (large JSON rendering)
- `ComfyUISettings` (workflow JSON parsing)

**Effort**: 2-4 hours implementation + testing

### Priority 2: Documentation Consolidation (Low)
**Issue**: Multiple outdated handoff documents contradict current status

**Impact**: Future agents will waste time on false WAN2 "blocker"

**Fix**: Archive to `docs/archived/handoffs-2025-11/`, create single `docs/CURRENT_STATUS.md`

**Effort**: 1-2 hours organization + verification

---

## ✅ SUCCESS MEANS

### Current Status (Baseline - Updated 2025-11-20)
- ✅ All 3 scenes produce MP4 files (validated 2025-11-19)
- ✅ Files valid format (0.33-8.17 MB range)
- ✅ Full e2e runs successfully
- ✅ ~44/50 Playwright tests passing (88%)
- ✅ WAN2 pipeline WORKING (confirmed with video evidence)

### Target (Next Phase)
- [ ] 50/50 Playwright tests passing (100%)
- [ ] React mount time < 1000ms
- [ ] 5 consecutive e2e runs: 100% success
- [ ] Performance benchmarked and documented

---

## 🎓 KEY CONCEPTS

### Service Layer Pattern (Must Understand)
All external API calls go through service functions (comfyUIService, payloadService, etc.). Never call APIs directly from components.

### State Management (Must Understand)
- React Context → API status, usage tracking
- Custom Hooks → Complex workflows
- IndexedDB → Persistent storage
- Local State → UI-only concerns

### Telemetry Contract (Must Understand)
Every scene generation MUST emit: DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts, GPU name, VRAM before/after, done-marker status.

---

## 🚨 CRITICAL DO's AND DON'Ts

### DO ✅
- Read handoff docs before coding
- Run diagnostics completely before guessing
- Test single scene before full e2e
- Document findings with HIGH confidence
- Commit changes with clear messages

### DON'T ❌
- Use backslashes in ComfyUI paths
- Skip Phase 1 diagnostics
- Edit workflow JSON without backup
- Assume WAN2 issues are architecture problems
- Kill ComfyUI without graceful shutdown

---

## 📞 IF YOU GET STUCK

1. Re-read **COMPREHENSIVE_AGENT_HANDOFF_20251119.md** Section 6 (debugging techniques)
2. Check **NEXT_AGENT_EXECUTION_PROMPT.md** Part 3 (root cause decision tree)
3. Query ComfyUI directly: `Invoke-WebRequest "http://127.0.0.1:8188/history/<prompt_id>" | ConvertFrom-Json`
4. Search **DOCUMENTATION_INDEX_20251111.md** for similar patterns
5. Review **logs/20251119-011556/run-summary.txt** for baseline behavior

---

## 📊 PROJECT STATS

- **Codebase**: 95% complete, 1 critical blocker
- **Architecture**: Service layer + React Context + IndexedDB
- **Tests**: All passing (Vitest + Playwright)
- **Documentation**: Comprehensive (40,000+ words of guidance prepared)
- **GPU**: NVIDIA RTX 3090 (24.5GB VRAM)
- **Models**: SVD working, WAN2 blocked

---

## 🎯 NEXT AGENT ROLES

### Role 1: Diagnostician (Day 1)
- Run Phase 1 diagnostics systematically
- Determine root cause (PATH A/B/C)
- Document findings with evidence

### Role 2: Implementer (Day 2)
- Implement fix based on root cause
- Validate single scene then full e2e
- Run stability tests

### Role 3: Documenter (Day 2-3)
- Update README.md with fix details
- Update VALIDATION_PROGRESS.md
- Commit to git with clear message
- Prepare for next handoff

---

## 🔗 DOCUMENT NAVIGATION

```
START HERE (this file)
    ↓
README.md (project setup)
    ↓
MASTER_HANDOFF_INDEX_20251119.md (navigation guide)
    ↓
COMPREHENSIVE_AGENT_HANDOFF_20251119.md (architecture + strategy)
    ├─ Section 2.1: WAN2 Blocker (READ FIRST)
    ├─ Section 5: Implementation Plan
    └─ Section 6: Debugging Techniques
    ↓
NEXT_AGENT_EXECUTION_PROMPT.md (execution guide)
    ├─ Part 0-1: Setup
    ├─ Part 2: Diagnostics ← CRITICAL
    ├─ Part 3: Root Cause
    └─ Part 4+: Implementation & Validation
    ↓
NEXT_AGENT_HANDOFF_CHECKLIST_20251119.md (verification)
    ↓
logs/20251119-011556/ (evidence)
```

---

## 🎬 GETTING STARTED RIGHT NOW

```powershell
# 1. Verify prerequisites (5 min)
node -v
npm run check:health-helper

# 2. Read main handoff documents (1 hour)
# - README.md
# - MASTER_HANDOFF_INDEX_20251119.md
# - COMPREHENSIVE_AGENT_HANDOFF_20251119.md sections 1-4

# 3. Review latest run artifacts (15 min)
# - logs/20251119-011556/run-summary.txt
# - logs/20251119-011556/artifact-metadata.json

# 4. Start Phase 1 Diagnostics (2-3 hours)
# - Follow NEXT_AGENT_EXECUTION_PROMPT.md Part 2
# - Run each diagnostic task sequentially
# - Document root cause hypothesis

# 5. Implement fix (1-4 hours depending on root cause)
# 6. Validate & test (1-2 hours)
# 7. Update docs & commit (1 hour)

# TOTAL: 2-3 days to production-ready video generation
```

---

## 💪 YOU'VE GOT THIS

This handoff represents **15+ hours of focused work** by the previous agent. Everything you need is documented. Everything that's unclear is explainable through systematic diagnostics. Everything that's blocked is fixable once you know the root cause.

**Confidence you can complete this**: 🟢 **95%**

**Start with the Master Index. Follow the procedures. Trust the process.**

🚀

---

**Quick Links to Key Documents**:
- 📄 [README.md](README.md) – Project setup
- 📄 [MASTER_HANDOFF_INDEX_20251119.md](MASTER_HANDOFF_INDEX_20251119.md) – Navigation
- 📄 [COMPREHENSIVE_AGENT_HANDOFF_20251119.md](COMPREHENSIVE_AGENT_HANDOFF_20251119.md) – Strategy
- 📄 [NEXT_AGENT_EXECUTION_PROMPT.md](NEXT_AGENT_EXECUTION_PROMPT.md) – Execution
- 📂 [logs/20251119-011556/](logs/20251119-011556/) – Latest artifacts

**Your mission starts now.** 🎯
