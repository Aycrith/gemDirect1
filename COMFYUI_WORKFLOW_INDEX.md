# ComfyUI Workflow Documentation Index

## 📚 Complete Guide Collection for Video Generation Integration

---

## Quick Start

**New to this?** Start here:

1. **[WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md)** ← READ THIS FIRST
   - Executive summary of the entire recommendation
   - 5-minute read
   - Covers what to do and why

2. **[WORKFLOW_SETUP_QUICK_GUIDE.md](WORKFLOW_SETUP_QUICK_GUIDE.md)** ← THEN DO THIS
   - Step-by-step setup (15 minutes)
   - Ready-to-follow instructions
   - Testing checklist

3. **Test it out!** See Part 4 in Summary for success criteria

---

## Complete Documentation Map

### 📋 Strategic Documents

| Document | Purpose | Audience | Time |
|----------|---------|----------|------|
| **[WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md)** | High-level strategy & rationale | Leads, developers | 5 min |
| **[WORKFLOW_STRATEGY_RECOMMENDATION.md](WORKFLOW_STRATEGY_RECOMMENDATION.md)** | Complete technical architecture | Developers, architects | 20 min |
| **[WORKFLOW_ARCHITECTURE_REFERENCE.md](WORKFLOW_ARCHITECTURE_REFERENCE.md)** | Diagrams, data flows, configuration | Technical reference | 10 min |

### 🛠️ Implementation Guides

| Document | Purpose | Audience | Time |
|----------|---------|----------|------|
| **[WORKFLOW_SETUP_QUICK_GUIDE.md](WORKFLOW_SETUP_QUICK_GUIDE.md)** | Step-by-step setup (15 min) | Everyone | 15 min |
| **[COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md)** | Command reference & tips | Users, operators | 5 min |
| **[COMFYUI_MODEL_DOWNLOAD_GUIDE.md](COMFYUI_MODEL_DOWNLOAD_GUIDE.md)** | Model installation guide | Everyone | 10 min |

### 📖 Reference Materials

| Document | Purpose | Audience | Time |
|----------|---------|----------|------|
| **[COMFYUI_CLEAN_INSTALL.md](COMFYUI_CLEAN_INSTALL.md)** | Installation reference | Ops, troubleshooting | 5 min |
| **[SETUP_COMPLETE_SUMMARY.md](SETUP_COMPLETE_SUMMARY.md)** | Installation summary | Reference | 3 min |
| **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** | Full project architecture | Reference | 20 min |
| **[.github/copilot-instructions.md](.github/copilot-instructions.md)** | Development guidelines | Developers | 10 min |

---

## Reading Paths by Role

### 👨‍💼 Project Manager / Lead
**Goal**: Understand the plan and timeline

1. Read: [WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md) (5 min)
2. Review: Investment Summary & Success Criteria
3. Review: Implementation Path (phases)
4. **Decision**: Approve or request modifications

### 👨‍💻 Developer (Implementation)
**Goal**: Implement the workflow

1. Read: [WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md) (5 min)
2. Study: [WORKFLOW_STRATEGY_RECOMMENDATION.md](WORKFLOW_STRATEGY_RECOMMENDATION.md) (20 min)
3. Reference: [WORKFLOW_ARCHITECTURE_REFERENCE.md](WORKFLOW_ARCHITECTURE_REFERENCE.md)
4. Execute: [WORKFLOW_SETUP_QUICK_GUIDE.md](WORKFLOW_SETUP_QUICK_GUIDE.md) (15 min)
5. Test: Checklist in setup guide
6. Integrate: Update `comfyUIService.ts` and mapping configuration

### 👨‍🔧 Operations / DevOps
**Goal**: Keep systems running

1. Skim: [WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md)
2. Reference: [COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md)
3. Bookmark: [scripts/check-status.ps1](scripts/check-status.ps1)
4. Store: Model management procedures

### 👨‍🎨 User / Designer
**Goal**: Use the workflow for content

1. Skim: [WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md) (summary section)
2. Learn: [COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md)
3. Reference: [COMFYUI_MODEL_DOWNLOAD_GUIDE.md](COMFYUI_MODEL_DOWNLOAD_GUIDE.md)
4. Create: Use gemDirect1 app normally (workflow is transparent)

---

## Document Hierarchy

```
WORKFLOW_RECOMMENDATION_SUMMARY.md
├─→ Executive Overview
├─→ Key Findings
├─→ Recommended Solution
├─→ Implementation Path
└─→ Next Actions

    │
    ├── WORKFLOW_STRATEGY_RECOMMENDATION.md
    │   ├─→ Part 1: Understanding gemDirect1 Outputs
    │   ├─→ Part 2: Recommended ComfyUI Architecture
    │   ├─→ Part 3: Main Workflow (Detailed)
    │   ├─→ Part 4: Data Flow
    │   ├─→ Part 5: Implementation Roadmap
    │   ├─→ Part 6: Models to Install
    │   ├─→ Part 7: Workflow Configuration Strategy
    │   ├─→ Part 8: Testing Checklist
    │   ├─→ Part 9: Configuration Template
    │   └─→ Part 10: Summary & Next Steps
    │
    ├── WORKFLOW_ARCHITECTURE_REFERENCE.md
    │   ├─→ Complete Data Flow Diagram
    │   ├─→ Workflow Node Connections (Detailed)
    │   ├─→ Model Dependencies & Pipeline
    │   ├─→ Processing Timeline
    │   ├─→ Quality Settings Reference
    │   ├─→ Recommended Presets
    │   ├─→ Mapping Configuration Example
    │   └─→ Error Handling & Recovery
    │
    └── WORKFLOW_SETUP_QUICK_GUIDE.md
        ├─→ Step 1: Download Models (5 min)
        ├─→ Step 2: Create Workflow (5 min)
        ├─→ Step 3: Save Workflow (1 min)
        ├─→ Step 4: Test Workflow (4 min)
        ├─→ Step 5: Export Workflow (no time limit)
        ├─→ Step 6: Configure gemDirect1 (varies)
        ├─→ Step 7: Test End-to-End (5 min)
        └─→ Troubleshooting & Checklist
```

---

## Content by Topic

### Installation & Setup
- [COMFYUI_CLEAN_INSTALL.md](COMFYUI_CLEAN_INSTALL.md) - Original installation
- [SETUP_COMPLETE_SUMMARY.md](SETUP_COMPLETE_SUMMARY.md) - Installation summary
- [COMFYUI_MODEL_DOWNLOAD_GUIDE.md](COMFYUI_MODEL_DOWNLOAD_GUIDE.md) - Model installation
- [WORKFLOW_SETUP_QUICK_GUIDE.md](WORKFLOW_SETUP_QUICK_GUIDE.md) - Workflow creation

### Architecture & Design
- [WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md) - High-level design
- [WORKFLOW_STRATEGY_RECOMMENDATION.md](WORKFLOW_STRATEGY_RECOMMENDATION.md) - Detailed strategy
- [WORKFLOW_ARCHITECTURE_REFERENCE.md](WORKFLOW_ARCHITECTURE_REFERENCE.md) - Technical reference
- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - Full project architecture

### Quick Reference
- [COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md) - Commands & tips
- [scripts/check-status.ps1](scripts/check-status.ps1) - Status checker
- [scripts/setup-comfyui.ps1](scripts/setup-comfyui.ps1) - Installation script

### Development
- [.github/copilot-instructions.md](.github/copilot-instructions.md) - Dev guidelines
- [services/comfyUIService.ts](services/comfyUIService.ts) - Service implementation
- [services/payloadService.ts](services/payloadService.ts) - Prompt building

---

## Key Sections Quick Finder

### "How do I...?"

**...install ComfyUI?**
→ [COMFYUI_CLEAN_INSTALL.md](COMFYUI_CLEAN_INSTALL.md)

**...download models?**
→ [COMFYUI_MODEL_DOWNLOAD_GUIDE.md](COMFYUI_MODEL_DOWNLOAD_GUIDE.md)

**...create the workflow?**
→ [WORKFLOW_SETUP_QUICK_GUIDE.md](WORKFLOW_SETUP_QUICK_GUIDE.md)

**...understand the architecture?**
→ [WORKFLOW_STRATEGY_RECOMMENDATION.md](WORKFLOW_STRATEGY_RECOMMENDATION.md)

**...troubleshoot issues?**
→ [COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md#-troubleshooting)

**...check if everything's working?**
→ Run: `.\scripts\check-status.ps1`

**...integrate with gemDirect1?**
→ [WORKFLOW_SETUP_QUICK_GUIDE.md](WORKFLOW_SETUP_QUICK_GUIDE.md#step-6-configure-gemdirect1)

**...get quick commands?**
→ [COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md#-starting-comfyui)

---

## Implementation Timeline

```
TODAY (Nov 7)
├─ Read: WORKFLOW_RECOMMENDATION_SUMMARY.md
└─ Decision: Proceed? ✓

THIS WEEK
├─ Follow: WORKFLOW_SETUP_QUICK_GUIDE.md
├─ Install: Models via Manager (~6 min)
├─ Create: Workflow in ComfyUI (~10 min)
├─ Test: Standalone workflow (~5 min)
└─ Integrate: With gemDirect1 app (~30 min)

NEXT WEEK
├─ Optimize: Performance tuning
├─ Enhance: Add ControlNet workflows
└─ Document: Integration patterns

ONGOING
├─ Reference: COMFYUI_QUICK_REFERENCE.md
├─ Monitor: scripts/check-status.ps1
└─ Maintain: Model updates via Manager
```

---

## Automation Scripts
- Run `node scripts/preflight-mappings.ts --project ./exported-project.json --summary-dir test-results/comfyui-status` as Step 0 so the helper validates the wan-t2i/wan-i2v mappings and emits normalized summaries (or exits code 3 when keyframe mappings are missing).
- Use `scripts/generate-scene-videos-wan2.ps1 -RunDir logs/<ts> -ComfyUrl http://127.0.0.1:8188 -MaxWaitSeconds <n> -PollIntervalSeconds <s>` to upload each scene keyframe, inject it into the first `LoadImage`, set deterministic SaveVideo formatting/prefix, and poll for `logs/<ts>/video/<sceneId>/<sceneId>.mp4` while emitting run-summary telemetry for the validator.
- After `logs/<ts>` contains all MP4s, run `scripts/update-scene-video-metadata.ps1 -RunDir logs/<ts> -VideoSubDir video` so `artifact-metadata.json` gets forward-slash `Video.Path` records with optional `DurationSeconds` (via `ffprobe` when available), `Status`, `UpdatedAt`, and `Error` for each scene.

## File Organization in Repository

```
C:\Dev\gemDirect1\
├── WORKFLOW_RECOMMENDATION_SUMMARY.md ← START HERE
├── WORKFLOW_STRATEGY_RECOMMENDATION.md
├── WORKFLOW_ARCHITECTURE_REFERENCE.md
├── WORKFLOW_SETUP_QUICK_GUIDE.md
├── COMFYUI_QUICK_REFERENCE.md
├── COMFYUI_MODEL_DOWNLOAD_GUIDE.md
├── COMFYUI_CLEAN_INSTALL.md
├── SETUP_COMPLETE_SUMMARY.md
├── COMFYUI_WORKFLOW_INDEX.md (this file)
│
├── workflows/
│   ├── README.md
│   └── (workflow JSON files go here)
│
├── scripts/
│   ├── check-status.ps1
│   ├── setup-comfyui.ps1
│   └── diagnose.ps1
│
├── services/
│   ├── comfyUIService.ts (← Implement video generation)
│   ├── geminiService.ts
│   └── payloadService.ts
│
└── .github/
    └── copilot-instructions.md
```

---

## Common Questions

### Q: Where do I start?
**A**: [WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md) (5 min read)

### Q: How long does this take to set up?
**A**: ~30 minutes total
- Reading: 5 min
- Setup: 15 min
- Testing: 10 min

### Q: What GPU do I need?
**A**: Minimum 8GB VRAM, RTX 3090 (24GB) recommended

### Q: How long does video generation take?
**A**: 70-100 seconds per 1-second shot (~90 seconds per shot)

### Q: Can I use different models?
**A**: Yes! See [WORKFLOW_STRATEGY_RECOMMENDATION.md](WORKFLOW_STRATEGY_RECOMMENDATION.md) Part 2

### Q: Where can I get models?
**A**: [COMFYUI_MODEL_DOWNLOAD_GUIDE.md](COMFYUI_MODEL_DOWNLOAD_GUIDE.md)

### Q: What if something breaks?
**A**: [COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md#-troubleshooting)

### Q: Is this production-ready?
**A**: Yes! See "Success Criteria" in [WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md)

---

## Document Status

| Document | Status | Last Updated | Completeness |
|----------|--------|--------------|-------------|
| WORKFLOW_RECOMMENDATION_SUMMARY.md | ✅ Complete | Nov 7, 2025 | 100% |
| WORKFLOW_STRATEGY_RECOMMENDATION.md | ✅ Complete | Nov 7, 2025 | 100% |
| WORKFLOW_ARCHITECTURE_REFERENCE.md | ✅ Complete | Nov 7, 2025 | 100% |
| WORKFLOW_SETUP_QUICK_GUIDE.md | ✅ Complete | Nov 7, 2025 | 100% |
| COMFYUI_QUICK_REFERENCE.md | ✅ Complete | Nov 7, 2025 | 100% |
| COMFYUI_MODEL_DOWNLOAD_GUIDE.md | ✅ Complete | Nov 7, 2025 | 100% |

---

## Navigation Tips

### If you're a PDF reader:
Each document is self-contained. You can read in any order.

### If you're exploring on GitHub:
Click on the document names above to navigate.

### If you're in VS Code:
Press `Ctrl+K` then `Ctrl+0` to show breadcrumb
Or use Ctrl+P to search for document names

### If you need to find something specific:
Use Ctrl+F to search within documents
Or Ctrl+Shift+F to search across all documents

---

## Support & Troubleshooting

**Quick Issues?**
→ [COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md#-troubleshooting)

**Setup Problems?**
→ [WORKFLOW_SETUP_QUICK_GUIDE.md](WORKFLOW_SETUP_QUICK_GUIDE.md#troubleshooting)

**Architecture Questions?**
→ [WORKFLOW_STRATEGY_RECOMMENDATION.md](WORKFLOW_STRATEGY_RECOMMENDATION.md)

**System Check?**
→ Run: `.\scripts\check-status.ps1`

**Need Help?**
→ Check [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for full context

---

## Next Steps

1. **Read**: [WORKFLOW_RECOMMENDATION_SUMMARY.md](WORKFLOW_RECOMMENDATION_SUMMARY.md) ← You are here
2. **Follow**: [WORKFLOW_SETUP_QUICK_GUIDE.md](WORKFLOW_SETUP_QUICK_GUIDE.md)
3. **Reference**: Bookmark [COMFYUI_QUICK_REFERENCE.md](COMFYUI_QUICK_REFERENCE.md)
4. **Monitor**: Run `.\scripts\check-status.ps1` regularly

---

**Welcome to ComfyUI Video Generation! 🎬**

All the tools you need are documented here. Start with the summary, follow the setup guide, and you'll have production-ready video generation in 30 minutes.

Good luck! 🚀
## Canonical Workflows (2025-11)

- Keyframes: `workflows/image_netayume_lumina_t2i.json` (WAN T2I)
- Video: `workflows/video_wan2_2_5B_ti2v.json` (WAN 2.2 5B ti2v)

Decisions & Rationale (2025-11)
- WAN 5B ti2v is canonical for video; 14B references are deprecated here.
- WAN T2I generates keyframes and does not require a `keyframe_image` mapping.
- WAN I2V consumes keyframes and requires a `LoadImage` node mapped to `keyframe_image`.
- Guardrails tightened: `SINGLE_FRAME_PROMPT` prefixed to every still-image prompt and `NEGATIVE_GUIDANCE` appended to all negative prompts so the generator never drifts toward collaged or UI-heavy outputs. Dedicated Vitest coverage (`services/__tests__/comfyGuardrails.test.ts`) asserts these strings and the helper metadata logs them per shot.
- Scripts `scripts/generate-scene-videos-wan2.ps1` (HttpClient multipart upload + queue) and `scripts/update-scene-video-metadata.ps1` (normalized paths + mp4 links) formalize WAN 5B automation for Director Mode while keeping telemetry (queue ids, durations, warnings) in sync with `comfyui-status.ts`.
## Helper Scripts & Telemetry

- **Step 0 Mapping Preflight**: Run `scripts/preflight-mappings.ts` before queuing scenes (pass `--project ./exported-project.json --summary-dir logs/<ts>/test-results/comfyui-status`). It validates that the wan-i2v workflow still exposes `CLIPTextEncode.text` + `LoadImage.image`, infers inline mappings, writes normalized JSON plus a `unit/comfyui-status.json` mirror, and exits with code `3` when the keyframe wiring is missing. The artifact metadata now exposes a `HelperSummaries` object (mapping preflight + ComfyUI status paths) so the Artifact Snapshot UI and Playwright cards can link back to the exact JSON telemetry that QA references.
- **ComfyUI Status Telemetry**: `scripts/comfyui-status.ts` probes `/system_stats` and `/queue`, records the QueueConfig/HistoryConfig knobs, VRAM before/after/delta, history exit reasons, and mapping status, and writes both a summary JSON and a log (`comfyui-status.log`). Those files are referenced via `HelperSummaries.ComfyUIStatus` so the UI, validator, and Playwright tests always read the same telemetry the helper produced.
- **WAN Video Automation**: `scripts/generate-scene-videos-wan2.ps1` uploads the first keyframe, injects it into the wan-i2v workflow, forces deterministic `SaveVideo`/`mp4` settings, and polls for `logs/<ts>/video/<sceneId>/<sceneId>.mp4`. Follow it with `scripts/update-scene-video-metadata.ps1 -RunDir logs/<ts> -VideoSubDir video` to normalize forward-slash `Video.Path`, `DurationSeconds`, `Status`, `UpdatedAt`, and `Error` for every scene (ffprobe optional) so the Artifact Snapshot and Timeline panels surface the renders consistently.
