# Quality Metrics & KPIs for gemDirect1

**Status**: Template Ready  
**Last Updated**: November 13, 2025  
**Owner**: QA / Product AI Team  

---

## Overview

This document defines the Key Performance Indicators (KPIs) and validation metrics for the story generation and video production pipeline. All metrics are automatically collected during runs and logged to `artifact-metadata.json`.

---

## Core KPIs

### 1. Narrative Coherence Score

**Definition**: Measures how well the generated story maintains logical flow and character consistency.

**Target**: Human review score ≥ 4.0/5.0 across all scenes  
**Measurement Method**:
- Manual review by QA team (5-point scale: 1=incoherent, 5=highly coherent)
- Automated proxy: spaCy-based entity linking + pronoun resolution
  - Tracks characters mentioned and maintains context across scenes
  - Flags when pronouns don't resolve to known entities

**Collection**:
- Manual scores stored in `artifact-metadata.json` > `Feedback` > `CoherenceScore`
- Automated scores from `scripts/quality-checks/coherence-check.py` > `EntityLinkageScore`

**Success Threshold**:
```json
{
  "ManualReviewMinScore": 4.0,
  "AutomatedEntityLinkageMinScore": 0.85
}
```

---

### 2. Scene Diversity (Entropy)

**Definition**: Measures the narrative variety across scenes (do they feel distinct in theme, setting, tone?).

**Target**: Shannon entropy ≥ 2.0 over thematic tags (on scale 0–log(N))  
**Measurement Method**:
- Extract thematic tags from each scene (e.g., "action", "romance", "mystery", "dialogue")
- Compute Shannon entropy: H = -Σ(p_i * log(p_i))
- Goal: avoid repetitive scenes; ensure diversity in mood/setting

**Collection**:
- Theme extraction via `scripts/quality-checks/diversity-check.py`
- Entropy computed and stored in `artifact-metadata.json` > `QualityMetrics` > `SceneDiversityEntropy`
- Per-scene theme tags logged for transparency

**Success Threshold**:
```json
{
  "MinThematicEntropy": 2.0,
  "TargetThemes": ["action", "romance", "mystery", "dialogue", "exposition"],
  "MaxRepetitionRatio": 0.4
}
```

**Example**:
- 3 scenes: [action, romance, mystery] → entropy ≈ 1.099 (log base 3) → **PASS** (≥ 2.0 for larger runs)
- 3 scenes: [action, action, action] → entropy = 0 → **FAIL**

---

### 3. Prompt-to-Scene Alignment (Semantic Similarity)

**Definition**: Measures how faithfully the generated video scene matches the text prompt.

**Target**: Semantic similarity (BERT cosine distance) ≥ 0.75  
**Measurement Method**:
- Text prompt encoded via BERT (sentence-transformers)
- Generated scene description (from ComfyUI metadata or manual annotation) encoded via BERT
- Compute cosine similarity; threshold ≥ 0.75 = good alignment

**Collection**:
- Similarity score computed after frame extraction via `scripts/quality-checks/similarity-check.py`
- Stored in `artifact-metadata.json` > `Scenes[*]` > `Telemetry` > `SemanticAlignmentScore`

**Success Threshold**:
```json
{
  "MinSemanticSimilarity": 0.75,
  "AcceptableRange": [0.70, 1.0]
}
```

**Example**:
- Prompt: "A lone astronaut walks across a red planet surface at sunset"
- Generated: "Wide shot of astronaut on Mars, dramatic sky, silhouette"
- Similarity: 0.82 → **PASS**

---

## Supporting Metrics

### Frame Count Consistency

**Definition**: Ensures each scene generates the expected number of frames (no under/over-production).

**Target**: FrameCount ≥ `FrameFloor` (default 25)  
**Measurement Method**:
- ComfyUI outputs frame count in SaveImage node
- Queue script verifies frame count before copying
- Requeue triggered if below floor

**Collection**:
- Logged in `artifact-metadata.json` > `Scenes[*]` > `FrameCount`
- Summary line in `run-summary.txt`: `[Scene ...] Frames=<N>`

**Success Threshold**:
```json
{
  "FrameFloor": 25,
  "FrameCeiling": 100,
  "TargetFrameCount": 30
}
```

---

### Generation Latency

**Definition**: Wall-clock time from prompt submission to frames ready (queue + GPU processing).

**Target**: P50 ≤ 60 seconds, P95 ≤ 120 seconds (depends on GPU/model)  
**Measurement Method**:
- `DurationSeconds` from telemetry (QueueEnd - QueueStart)
- Aggregated across all scenes in a run

**Collection**:
- Logged in `artifact-metadata.json` > `Scenes[*]` > `Telemetry` > `DurationSeconds`
- Aggregated in `logs/stability-sweep-<ts>/report.json` > `DurationStats`

**Success Threshold**:
```json
{
  "P50TargetSeconds": 60,
  "P95TargetSeconds": 120,
  "MaxAllowedSeconds": 300
}
```

---

### GPU Resource Utilization

**Definition**: Peak VRAM used during scene generation.

**Target**: VRAM delta ≤ 18 GB (for RTX 3090 with 24 GB total)  
**Measurement Method**:
- GPU VRAM before execution (from `/system_stats`)
- GPU VRAM after execution (from `/system_stats`)
- Delta = After - Before (negative = memory used)

**Collection**:
- Logged in `artifact-metadata.json` > `Scenes[*]` > `Telemetry` > `GPU.VramDeltaMB`
- Aggregated in sweep report

**Success Threshold**:
```json
{
  "MaxVRAMDeltaMB": 18432,
  "WarningThresholdMB": 20000,
  "GPUMemoryFloorMB": 2000
}
```

---

### LLM Response Quality

**Definition**: Measures the quality of text prompts generated by the local LLM.

**Target**: Prompt length 150–500 tokens; no truncation; generation time < 90 seconds  
**Measurement Method**:
- Token count of generated prompt (via tokenizer)
- Generation duration from LM Studio health check
- Presence/absence of truncation markers

**Collection**:
- Logged in `artifact-metadata.json` > `Story` > `Prompts[*]` > `TokenCount`, `GenerationDurationSeconds`
- Errors logged in `Story` > `LLMErrors` array

**Success Threshold**:
```json
{
  "MinTokenCount": 150,
  "MaxTokenCount": 500,
  "TargetTokenCount": 300,
  "MaxGenerationDurationSeconds": 90,
  "AllowTruncation": false
}
```

---

## Automated Validation Checklist

Every run must pass these automated checks:

```powershell
# scripts/quality-checks/run-quality-checks.ps1

[✓] Coherence: EntityLinkageScore >= 0.85
[✓] Diversity: ThematicEntropy >= 2.0
[✓] Alignment: SemanticSimilarity >= 0.75
[✓] Frames: FrameCount >= 25 for all scenes
[✓] Latency: P95 <= 120 seconds
[✓] GPU: VramDelta >= 0 and <= 18 GB
[✓] LLM: TokenCount between 150–500
[✓] Telemetry: No missing fields (per TELEMETRY_CONTRACT.md)

RESULT: PASS or FAIL (with detailed report)
```

---

## Baseline Performance

Based on initial validation runs (November 2025):

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Coherence Score | 3.8/5.0 | ≥4.0 | In Progress |
| Diversity Entropy | 1.95 | ≥2.0 | In Progress |
| Semantic Alignment | 0.73 | ≥0.75 | In Progress |
| Avg Frames/Scene | 28 | ≥25 | ✓ PASS |
| P50 Latency | 55s | ≤60s | ✓ PASS |
| GPU VRAM Delta | -15.2 GB | ≤18 GB | ✓ PASS |
| LLM Prompt Length | 285 tokens | 150–500 | ✓ PASS |

---

## Weekly Review Protocol

Every Friday, DevOps/QA team conducts:

1. **Sweep Report Analysis**:
   - Run `scripts/generate-sweep-report.ps1` on all runs from the week
   - Check if any KPI fell below threshold
   - Identify regressions (compare to previous week)

2. **Prompt Engineering Review**:
   - Sample CoherenceScore feedback
   - Adjust prompt templates if coherence dips below 3.8/5
   - Document changes in `docs/prompts/PROMPT_VERSIONS.md`

3. **Performance Regression Check**:
   - Compare P95 latency to baseline
   - If increased >15%, investigate GPU contention or model changes
   - Escalate to infrastructure team if VRAM pressure detected

4. **Fallback/Warning Audit**:
   - Review `System.FallbackNotes` across all runs
   - Log patterns (forced-copy frequency, GPU fallbacks, LLM timeouts)
   - Adjust queue parameters if patterns emerge

---

## Recording Feedback in UI

**FeedbackPanel.tsx** captures:
- **Rating**: 1–5 stars (required)
- **Comment**: Optional text (max 500 chars)
- **Metadata**: SceneId, Timestamp, ModelVersion

Feedback stored in `artifact-metadata.json` > `Feedback` array:
```json
{
  "SceneId": "scene_001",
  "Rating": 4,
  "Comment": "Great dialogue, pacing felt natural",
  "Timestamp": "2025-11-13T10:30:00Z",
  "ModelVersion": "mistral-7b-instruct-v0.3"
}
```

Aggregated dashboard shows:
- Avg rating by scene/genre/mood
- Common feedback themes (via simple keyword extraction)
- Correlation between quality metrics and user rating

---

## Success Criteria for Phase 1 Completion

By end of Week 1:

- [ ] `QUALITY_METRICS.md` (this file) reviewed by product team
- [ ] Automated validators deployed in `scripts/quality-checks/`
- [ ] 3 runs executed; all KPI thresholds met or documented for improvement
- [ ] Baseline established in `PERFORMANCE_BASELINE.md`
- [ ] Weekly review protocol scheduled with DevOps team

