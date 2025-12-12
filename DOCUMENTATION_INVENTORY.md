# Documentation Inventory: Project GemDirect1

**Last Updated**: December 12, 2025 (Updated with E2E “effective results” runbook + artifact runner notes)
**Total Files**: 46 documentation files (inventory; may drift)
**Status**: Active

---

## 📋 Complete File Listing

### Core Documentation (Root)
1. **PROJECT_STATUS_CONSOLIDATED.md** (`Documentation/PROJECT_STATUS_CONSOLIDATED.md`)
   - Single source of truth for project status.
2. **CURRENT_STATUS.md** (`Documentation/CURRENT_STATUS.md`)
   - High-level current status summary.
3. **README.md** (`README.md`)
   - Project overview and entry point.
4. **START_HERE.md** (`START_HERE.md`)
   - Quick start guide.
5. **README_TESTING_STARTS_HERE.md** (`README_TESTING_STARTS_HERE.md`)
   - Entry point for testing and CI/CD status.
6. **TODO.md** (`TODO.md`)
    - High-level to-do list.
7. **plan.md** (`plan.md`)
    - Project plan / principles.
8. **MULTI_AGENT_STRATEGY.md** (`Documentation/MULTI_AGENT_STRATEGY.md`)
    - Strategy for multi-agent collaboration.
9. **PROMPT_OPTIMIZATION_IMPROVEMENT_PLAN.md** (`Documentation/PROMPT_OPTIMIZATION_IMPROVEMENT_PLAN.md`)
    - Plan for improving prompt optimization.
10. **PROMPT_ENGINEERING_FRAMEWORK_INTEGRATION_PLAN.md** (`Documentation/PROMPT_ENGINEERING_FRAMEWORK_INTEGRATION_PLAN.md`)
    - Integration plan for prompt engineering framework.

### Agents / Runbooks
- **Next-agent handoff runbook**: `Agents/Instructions/handoff-procedure.md`
- **Session notes (2025-12-12)**: `Development_History/Sessions/2025-12/SESSION_NOTES_2025-12-12_E2E_ARTIFACT_WIRING.md`

### Architecture (`Documentation/Architecture/`)
10. **TELEMETRY_CONTRACT.md**
    - Telemetry specification and enforcement. Updated Dec 11, 2025 with Video Processing Metrics.
11. **POLLING_FIX_ARCHITECTURE_DIAGRAM.md**
    - Diagram for polling fix architecture.
12. **LLM_OPTIMIZATION_PLAN.md**
    - Plan for LLM optimization.
13. **LLM_INTERFACE_OPTIMIZATION_STRATEGY.md**
    - Strategy for LLM interface optimization.
14. **BOOKEND_WORKFLOW_PROPOSAL.md**
    - Proposal for bookend workflow.
15. **VIDEO_PROCESSING_PIPELINE.md**
    - Architecture for FLF2V and Video Interpolation pipelines.

### Guides (`Documentation/Guides/`)
15. **RECIPES.md**
    - Common recipes and patterns.
16. **PRESETS_AND_VRAM.md**
    - Guide on presets and VRAM usage.
17. **PIPELINE_ORCHESTRATION.md**
    - Guide on pipeline orchestration.
18. **SETUP_AND_TROUBLESHOOTING.md**
    - Setup instructions and troubleshooting steps.
19. **PIPELINE_CONFIGS.md**
    - Configuration guide for pipelines. Updated Dec 11, 2025 with Post-Processing config.
20. **NARRATIVE_PIPELINE.md**
    - Guide for the narrative pipeline.
21. **GETTING_STARTED.md**
    - Getting started guide for new developers.
22. **CAMERA_PATH_VERIFICATION.md**
    - Verification guide for camera paths.
23. **VERSIONING_AND_MANIFESTS.md**
    - Guide on versioning and manifests.

### References (`Documentation/References/`)
24. **DOCUMENTATION_INVENTORY.md**
    - This file.
25. **INTEGRATED_PIPELINE_IMPLEMENTATION_ROADMAP.md**
    - Detailed implementation roadmap.
26. **QUALITY_METRICS.md**
    - Quality metrics and KPIs.
27. **DECISIONS_AND_RATIONALE.md**
    - Record of key decisions and rationale.
28. **CRITICAL_POLLING_LOOP_HANG_20251119.md**
    - Analysis of critical polling loop hang.
29. **CRITICAL_ISSUE_ROOT_CAUSE_ANALYSIS.md**
    - Root cause analysis for critical issues.
30. **CLEANUP_ACTION_PLAN.md**
    - Plan for cleanup actions.
31. **ACTION_PLAN_VAE_PERFORMANCE.md**
    - Action plan for VAE performance.
32. **ENVIRONMENT_SNAPSHOT_2025_11_10.md**
    - Snapshot of the environment on Nov 10.
33. **FRAME_OUTPUT_FIX_ANALYSIS.md**
    - Analysis of frame output fix.
34. **FIXES_APPLIED.md**
    - Log of fixes applied.
35. **FRAME_OUTPUT_FIX_APPLIED_2025-11-12.md**
    - Specific fix applied on Nov 12.
36. **INSTALL_MODELS.md**
    - Guide for installing models.
37. **POSTEXECUTION_AND_UI_FIX_20251112.md**
    - Post-execution and UI fix details.

### Additional Docs (`docs/`)
38. **AI_AGENT_PROMPT.md**
    - Prompt for AI agent.
39. **RESOURCE_MANAGEMENT.md**
    - Resource management documentation.
40. **bookend-quality-gate.md**
    - Quality gate for bookend.
41. **AI_AGENT_PROMPT_FASTVIDEO.md**
    - AI agent prompt for fast video.
42. **prompts/PROMPT_LIBRARY.md**
    - Library of prompts.

### Testing (`Testing/`)
43. **STORY_TO_VIDEO_TEST_CHECKLIST.md** (`Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md`)
    - Checklist for story-to-video testing.
44. **TESTING_COMMAND_REFERENCE.md**
    - Reference for testing commands.
45. **CI_WORKFLOWS.md** (Implicit in `.github/workflows/`)
    - `pr-validation.yml`: Main PR check (Unit, Build, Smoke, Telemetry).
    - `pr-vitest.yml`: Vitest specific checks.

### Other Important Files
43. **USAGE_WORKFLOW.md** (`USAGE_WORKFLOW.md`)
    - Workflow usage guide.
44. **TASK_SCHEMA.md** (`TASK_SCHEMA.md`)
    - Schema for tasks.
45. **REMEDIATION_PLAN.md** (`REMEDIATION_PLAN.md`)
    - Plan for remediation.

---

## 📊 Documentation Statistics

| Metric | Value |
|---|---|
| Total Files | 45 |
| Core Docs | 9 |
| Architecture Docs | 5 |
| Guides | 9 |
| References | 14 |
| Additional Docs | 5 |
| Other | 3 |

