# Validation Suite Overview

This directory contains comprehensive validation commands for the gemDirect1 Cinematic Story Generator.

**Last Updated**: 2025-11-29  
**Project Phase**: 7-8 (Feature Completion + CI/CD Enforcement)  
**Test Coverage**: 1439+ unit tests, 117+ E2E tests

---

## 📁 Available Validation Files

### 1. `validate.md` - Detection Only
**Purpose**: Comprehensive testing and detection  
**Use Case**: Daily development, CI/CD pipelines, status checks  
**Duration**: ~10-15 minutes  
**Fixes**: None (detection only)

**What it does:**
- ✅ Detects all issues
- ✅ Reports status
- ✅ Validates production readiness
- ✅ Checks new infrastructure (HydrationContext, GenerationQueue, etc.)
- ❌ Does NOT fix issues automatically

**When to use:**
- Pre-deployment checks
- CI/CD pipeline validation
- Quick status verification
- When you want full control over fixes

---

### 2. `validate-with-remediation.md` - Detection + Auto-Fix
**Purpose**: Testing with automatic remediation where possible  
**Use Case**: First-time setup, troubleshooting, automated recovery  
**Duration**: ~15-20 minutes  
**Fixes**: ~70% of common issues

**What it does:**
- ✅ Detects all issues
- ✅ Attempts automatic fixes
- ✅ Provides remediation guidance for manual fixes
- ✅ Retries flaky operations
- ✅ Auto-starts services when possible
- ✅ Handles new infrastructure issues (lock files, LM Studio unload, etc.)

**When to use:**
- Initial project setup
- After major system changes
- Troubleshooting production issues
- When you want automated recovery

---

### 3. `ultimate_validate_command.md` - Generation Guide
**Purpose**: Documentation for creating validation suites  
**Use Case**: Reference, understanding validation philosophy  

---

### 4. `example-validate.md` - Template Reference
**Purpose**: Example validation structure for other projects  
**Use Case**: Template for adapting to different codebases  

---

## 🎯 Quick Decision Matrix

| Scenario | Use This File | Why |
|----------|--------------|-----|
| **Daily development check** | `validate.md` | Fast, detection-focused |
| **First-time setup** | `validate-with-remediation.md` | Auto-configures defaults |
| **Pre-deployment** | `validate.md` | Full verification without side effects |
| **CI/CD pipeline** | `validate.md` | Predictable, no auto-modifications |
| **Troubleshooting broken system** | `validate-with-remediation.md` | Attempts automatic recovery |
| **Production health check** | `validate.md` | Safe, read-only validation |
| **After system updates** | `validate-with-remediation.md` | Reconfigures and validates |
| **Multiple agents running** | `validate.md` | Lock file prevents conflicts |

---

## 📊 Validation Sub-Phase Reference

The validation suite now includes sub-phases for comprehensive infrastructure validation:

| Phase | Sub-Phase | Purpose |
|-------|-----------|---------|
| **3. Unit Tests** | 3.1 | New service layer (GenerationQueue, DataIntegrityValidator, LLMTransportAdapter) |
| | 3.2 | Error handling infrastructure (CSGError, logger, error codes) |
| | 3.3 | Workflow validation (API vs UI format, bookend payloads) |
| **4. Integration** | 4.1 | ComfyUI queue & VRAM monitoring |
| | 4.2 | LM Studio health & `lms` CLI verification |
| | 4.3 | Feature flags (23/23 implemented) |
| **5. E2E Tests** | 5.1 | HydrationContext gate testing |
| | 5.2 | Bug fixes verification (Nov 28) |
| | 5.3 | New infrastructure E2E (mock services, correlation IDs) |
| **6. Pipeline** | 6.1 | LM Studio auto-unload gate |
| | 6.2 | GenerationQueue integration |
| | 6.3 | Telemetry contract validation |

---

## 🔒 Playwright Lock File System

To prevent concurrent E2E test runs (common with multiple agents), the pipeline now uses a lock file:

**Location**: `.playwright-lock` (project root)

**How it works:**
1. Before starting, `run-comfyui-e2e.ps1` checks for existing lock
2. If lock exists, checks if owning process (PID) is still running
3. If process dead, removes stale lock
4. If process alive, waits up to 60 seconds
5. Acquires lock with current PID
6. Releases lock on completion or error (finally block)

**Manual removal** (if needed):
```powershell
Remove-Item .playwright-lock -Force
```

---

## 🔄 LM Studio Auto-Unload System

The pipeline automatically unloads LM Studio models between LLM and ComfyUI phases to free VRAM:

**How it works:**
1. After story generation (Step 1), pipeline calls `Unload-LMStudioModels`
2. Primary method: `lms unload --all` (LM Studio CLI)
3. Fallback: REST API state monitoring (`/api/v0/models`)
4. Verification: Polls until `loadedCount == 0` or timeout
5. VRAM wait: 10-second pause for memory release

**Requirements:**
- LM Studio CLI (`lms`) in PATH (preferred)
- Or: LM Studio REST API accessible at `http://192.168.50.192:1234`
- Or: Manual unload via LM Studio UI

**CLI Installation:**
```powershell
# LM Studio CLI should be auto-installed with LM Studio
# Default location: C:\Users\<user>\.lmstudio\bin\lms.exe
# Add to PATH or use full path
```

---

## 🔧 What Gets Fixed Automatically (validate-with-remediation.md)

### ✅ Automatic Fixes (No Manual Intervention)
1. **Missing Dependencies**: Runs `npm install` if `node_modules/` missing
2. **Missing Directories**: Creates `logs/`, `artifacts/`, `test-results/`, `dist/`
3. **Environment Variables**: Sets defaults for current session
4. **Port Conflicts**: Kills stale dev servers blocking port 3000
5. **Stale Builds**: Cleans old `dist/` directory before rebuild
6. **ComfyUI Startup**: Attempts auto-start if installation detected
7. **Test Retries**: Retries flaky tests (network timing issues)
8. **Service Health**: Probes services and guides manual fixes

### ⚠️ Semi-Automatic (Guided Manual Steps)
1. **LM Studio Configuration**: Provides exact commands to load model
2. **Workflow Mappings**: Shows UI steps to configure wan-t2i/wan-i2v
3. **VRAM Issues**: Suggests settings adjustments
4. **ComfyUI Queue**: Commands to clear stuck jobs

### ❌ Requires Manual Intervention
1. **Node.js Upgrade**: Must manually install Node 22.19.0+
2. **TypeScript Errors**: Must fix code logic issues
3. **Test Failures**: Must debug and fix failing tests
4. **Missing Workflow Files**: Must add JSON files to `workflows/`
5. **Quality Threshold Failures**: Must tune prompts/models
6. **Hardware Limitations**: Must adjust settings or upgrade GPU

---

## 📊 Validation Coverage

### What Gets Validated

#### ✅ Type Safety
- TypeScript strict mode (zero errors)
- Interface consistency
- Type annotations

#### ✅ Build Quality
- Production bundle generation
- Bundle size optimization (<500 KB target)
- Asset verification

#### ✅ Unit Tests (1439+ tests)
- Service layer logic (geminiService, comfyUIService, payloadService, localStoryService)
- New infrastructure (GenerationQueue, DataIntegrityValidator, LLMTransportAdapter)
- Error handling system (CSGError, error codes, retry logic)
- Workflow patchers and mapping validators
- Story generation helpers
- Telemetry contract validation
- Frame stability algorithms
- Done marker sentinels
- Quality checks (coherence gate)

#### ✅ Integration Tests
- ComfyUI connectivity & VRAM monitoring
- LM Studio connectivity & model state
- LM Studio CLI (`lms`) availability
- Workflow configuration
- VRAM telemetry
- Feature flags (23/23)

#### ✅ E2E Tests (Browser) - 117+ tests
- App loading & HydrationContext gate
- IndexedDB initialization
- Mode switching (Quick Generate ↔ Director Mode)
- Welcome dialog skip
- Story generation workflow
- Scene/timeline editing
- Video generation pipeline
- Data persistence
- Error handling & toast notifications
- Performance metrics

#### ✅ Full Pipeline Test
- Story generation (LM Studio)
- **LM Studio model auto-unload** (NEW - frees VRAM)
- Keyframe generation (ComfyUI WAN T2I)
- Video generation (ComfyUI WAN I2V)
- Telemetry collection
- Quality validation
- GenerationQueue integration
- Playwright lock file management

#### ✅ Quality Gates
- Coherence check (narrative flow)
- Diversity check (thematic richness)
- Similarity check (prompt alignment)

#### ✅ Performance
- First Contentful Paint: ~188ms (target: < 1500ms)
- Build time: <3s
- Time to interactive: <2s
- Bundle size monitoring

#### ✅ New Infrastructure
- HydrationContext (state coordination)
- GenerationQueue (VRAM-safe serial queue)
- DataIntegrityValidator (runtime validation)
- LLMTransportAdapter (transport abstraction)
- CSGError (structured error system)
- Playwright lock file (concurrent run protection)

---

## 🚀 Running Validation

### Option 1: Detection Only (Recommended for Daily Use)
```powershell
# Navigate to project root
cd C:\Dev\gemDirect1

# Run validation
# Copy commands from validation/validate.md and execute

# Or use Claude with execute permissions:
# "Run the validation suite from validate.md"
```

### Option 2: With Auto-Remediation (First-Time Setup)
```powershell
# Navigate to project root
cd C:\Dev\gemDirect1

# Run validation with remediation
# Copy commands from validation/validate-with-remediation.md and execute

# Or use Claude:
# "Run the validation suite with remediation from validate-with-remediation.md"
```

### Option 3: Individual Phases
You can run phases independently:

```powershell
# Just type checking
npx tsc --noEmit

# Just unit tests
npm test

# Just E2E tests
npx playwright test

# Just health check
npm run check:health-helper

# Just pipeline test
pwsh -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration
```

---

## 📈 Interpreting Results

### Success Criteria
- **Type Check**: 0 errors
- **Build**: Completes in <3s, generates dist/
- **Unit Tests**: 1439+/1439+ passing (100%)
- **E2E Tests**: 117+/117+ passing (100%)
- **Pipeline**: 3 MP4 files generated
- **Quality Checks**: All thresholds met
- **Lock File**: Released after run
- **LM Studio Unload**: Models ejected before ComfyUI phase

### Warning Signs (Not Critical)
- E2E tests: 110-117/117+ passing (94-100%)
  - Some fixture hydration timing issues (known, not functional bugs)
- Bundle size: 300-500 KB
  - Consider optimization if trending upward
- Pipeline: 2-3/3 videos generated
  - One scene failure acceptable with retry
- HydrationContext timeout warnings
  - May indicate slow IndexedDB

### Failure Indicators (Requires Fix)
- TypeScript errors > 0
- Build fails
- Unit tests < 1400 passing
- E2E tests < 100 passing
- Pipeline: 0 videos generated
- Quality checks fail thresholds
- Playwright lock stuck (stale PID)
- LM Studio model not unloading (VRAM contention)

---

## 🔄 Validation Workflow in Development

### Daily Development
1. Run `validate.md` before committing
2. Fix any failing tests
3. Commit only if validation passes

### Before Deployment
1. Run `validate.md` on clean environment
2. Review all test results
3. Check performance metrics
4. Verify full pipeline completes
5. Archive validation results

### After Major Changes
1. Run `validate-with-remediation.md`
2. Let auto-fixes apply
3. Review remediation log
4. Apply manual fixes as needed
5. Re-run `validate.md` to confirm

### Troubleshooting
1. Run `validate-with-remediation.md`
2. Follow remediation guidance
3. Check logs/ for error details
4. Review artifacts/ for previous runs
5. Compare with last successful run

---

## 💾 Output Artifacts

After validation, you'll find:

```
logs/
  └── <timestamp>/
      ├── run-summary.txt          # Complete telemetry log
      ├── artifact-metadata.json   # Structured metadata
      ├── story/
      │   └── story.json          # Generated story
      ├── <sceneId>/
      │   ├── keyframe.png        # Scene keyframe
      │   └── generated-frames/   # Video frames
      └── video/
          └── <sceneId>/
              └── <sceneId>.mp4   # Generated video

artifacts/
  └── validation-run-<timestamp>.zip  # Archived run

test-results/
  ├── comfyui-status/     # Health check results
  └── vitest/             # Unit test results

playwright-report/        # E2E test HTML report
```

---

## 🎓 Understanding the User Workflow

The validation suite mirrors the actual user workflow:

1. **Story Creation** (Modular)
   - User enters story idea
   - LM Studio generates Story Bible
   - User curates and refines text
   - ✅ **Validated by**: Story generation tests, quality checks

2. **Image Generation** (Independent, Sequential)
   - User clicks "Generate Image" for each shot
   - ComfyUI WAN T2I generates keyframes individually
   - Images saved locally and displayed in UI
   - ✅ **Validated by**: Keyframe generation tests, workflow mapping checks

3. **Video Generation** (Independent, Sequential)
   - User clicks "Generate Video" for each scene
   - ComfyUI WAN I2V uses keyframes to generate videos
   - Videos saved locally and displayed in UI
   - ✅ **Validated by**: Full pipeline test, telemetry validation

4. **Continuity Review** (Quality Control)
   - AI analyzes coherence, diversity, similarity
   - User reviews generations against descriptions
   - Ratings and scores tracked
   - ✅ **Validated by**: Quality gate checks (coherence, diversity, similarity)

**Key Principle**: Each generation type (text/image/video) happens **independently** to avoid resource conflicts. Validation ensures this separation works correctly.

---

## 🛡️ Production Readiness Guarantee

When validation passes with 100% success rate:

✅ **TypeScript**: Zero type errors (strict mode)
✅ **Build**: Production bundle builds successfully
✅ **Tests**: All unit and E2E tests passing (1439+ unit, 117+ E2E)
✅ **Services**: LM Studio and ComfyUI responding
✅ **Workflows**: WAN T2I and WAN I2V configured
✅ **Pipeline**: Complete story-to-video flow works
✅ **VRAM Management**: LM Studio auto-unload functioning
✅ **Quality**: Coherence, diversity, similarity thresholds met
✅ **Performance**: FCP ~188ms (target < 1500ms), build <3s
✅ **Artifacts**: Videos generated with full telemetry
✅ **Infrastructure**: HydrationContext, GenerationQueue, error system validated
✅ **Concurrency**: Playwright lock prevents multi-agent conflicts

**Confidence Level**: 95%+ production readiness

When validation shows warnings but mostly passes (90-99% success):

⚠️ **Acceptable for production** with monitoring
⚠️ Review warnings and plan fixes
⚠️ Document known issues
⚠️ Monitor metrics closely after deployment

When validation fails (<90% success):

❌ **NOT production ready**
❌ Critical issues must be fixed
❌ Follow remediation guidance
❌ Re-run validation after fixes

---

## 🔗 Related Documentation

- `README.md` - Project overview, quick start
- `Documentation/PROJECT_STATUS_CONSOLIDATED.md` - Single source of truth
- `START_HERE.md` - 5-minute context summary
- `Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md` - Testing protocols
- `.github/copilot-instructions.md` - AI agent guidelines
- `scripts/run-comfyui-e2e.ps1` - Pipeline script with lock file & auto-unload

---

## ❓ FAQ

**Q: How long does validation take?**  
A: 10-15 minutes (detection only), 15-20 minutes (with remediation)

**Q: Can I run validation in CI/CD?**  
A: Yes, use `validate.md` (no auto-modifications). Ensure LM Studio and ComfyUI are available.

**Q: What if validation fails?**  
A: Use `validate-with-remediation.md` for automatic fixes, then follow manual remediation steps.

**Q: Do I need to run full validation every time?**  
A: No. Run individual phases for quick checks. Full validation before deployment only.

**Q: Can validation fix code bugs?**  
A: No. It detects bugs and provides guidance, but you must fix code logic issues manually.

**Q: What if ComfyUI or LM Studio are offline?**  
A: Validation will fail integration/E2E phases. Follow remediation steps to start services.

**Q: Is validation safe for production?**  
A: Yes. `validate.md` is read-only. `validate-with-remediation.md` only fixes config/environment.

**Q: What if multiple agents try to run E2E tests simultaneously?**  
A: The Playwright lock file (`.playwright-lock`) prevents concurrent runs. Agents wait up to 60 seconds, then fail if lock not acquired.

**Q: How do I install the LM Studio CLI?**  
A: LM Studio CLI (`lms`) ships with LM Studio. Add `~/.lmstudio/bin` to PATH. See https://lmstudio.ai/docs/cli

**Q: What if LM Studio won't unload models?**  
A: Use `lms unload --all` or manually click "Eject" in LM Studio UI. The pipeline will wait and verify via REST API.

---

**Last Updated**: 2025-11-29  
**Version**: 2.0.0 (major update with sub-phases, lock file, auto-unload)
