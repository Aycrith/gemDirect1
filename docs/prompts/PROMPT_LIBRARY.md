# Prompt Library v1.0

## Overview

This directory contains genre-specific prompt templates for the gemDirect1 cinematic story generation pipeline. Each template defines:
- **Narrative structure**: Three-act scene organization (establish, develop, resolve)
- **Tone & pacing**: Genre-specific rhythm and emotional weight
- **Mandatory elements**: Must-have scene components (enforced by validators)
- **Character archetypes**: Role suggestions for narrative consistency
- **Prohibited elements**: Anti-patterns that break genre authenticity
- **Technical requirements**: Context length, token limits, quality thresholds

## Templates Available

### 1. **story-sci-fi.txt** — Science Fiction
**Best for**: Space exploration, AI narratives, dystopian futures, first-contact scenarios

**Key elements**:
- Advanced technology (AI, quantum computing, genetic engineering, VR)
- Non-human characters (androids, AI, uplifted beings)
- Futuristic architecture and alien environments
- Wonder or isolation as emotional beat
- 3+ mandatory elements per scene

**Visual style**: Cool blues, electric purples, metallic silvers  
**Character archetypes**: Weary spacefarer, brilliant researcher, rogue AI, alien contact, resistance fighter  
**Quality thresholds**: Coherence ≥4.0/5, entropy ≥2.0, similarity ≥0.75

---

### 2. **story-drama.txt** — Drama
**Best for**: Character-driven narratives, relationship conflicts, moral dilemmas, personal growth

**Key elements**:
- Internal conflict made visible through performance
- Relationship dynamics (tension, affection, estrangement)
- Physical space reflecting emotional state
- Dialogue revealing character, not just plot
- Moment of vulnerability per scene

**Visual style**: Warm naturals, muted earth tones, dramatic shadows  
**Character archetypes**: Protective caregiver, conflicted professional, seeker of redemption, generational bridge, truth-teller  
**Quality thresholds**: Coherence ≥4.0/5, entropy ≥2.0, similarity ≥0.75

---

### 3. **story-thriller.txt** — Thriller
**Best for**: High-stakes action, suspense narratives, cat-and-mouse games, moral traps

**Key elements**:
- Immediate threat; no safe setup
- Time pressure (countdown, deadline, window closing)
- Information asymmetry (audience knows more or less than character)
- Forced choice with bad consequences either way
- 4+ mandatory elements per scene

**Visual style**: Shadows and highlights, desaturated with color pops, asymmetric framing  
**Character archetypes**: Reluctant hero, moral avenger, protector, double agent, conspiracy target  
**Threat taxonomy**: Physical, psychological, social, informational, moral  
**Quality thresholds**: Coherence ≥4.0/5, entropy ≥2.0, similarity ≥0.75

---

## How to Use Templates in the Pipeline

### 1. **Template Selection**
When user specifies genre (via UI or API):
```json
{
  "project_id": "proj_123",
  "scenes": [
    {
      "scene_num": 1,
      "prompt": "...",
      "genre": "sci-fi"  // <- Triggers story-sci-fi.txt
    }
  ]
}
```

### 2. **Template Integration**
System applies template to scene prompt:
```typescript
// In sceneGenerationPipeline.ts
const template = loadTemplate(scene.genre);  // loads story-sci-fi.txt
const enhancedPrompt = template.apply(scene.prompt);
// Template injects tone, pacing, mandatory elements guidance
```

### 3. **Pre-Queue Validation**
Before queueing to ComfyUI, validate against mandatory elements:
```powershell
# In run-quality-checks.ps1
$template = Get-TemplateRequirements -genre "sci-fi"
$mandatoryElements = $template.MandatoryElements  # 3+ must be present
Invoke-MandatoryElementValidation -scene $scene -required $mandatoryElements
```

### 4. **Post-Generation Quality Checks**
After scene generation, run quality validators:
```powershell
# All 3 validators must pass
./coherence-check.py          # ≥4.0/5 narrative flow
./diversity-check.py          # ≥2.0 entropy of themes
./similarity-check.py         # ≥0.75 semantic alignment
```

---

## Extending Templates

### Adding a New Genre

1. **Create template file**: `story-{genre}.txt`
2. **Define required sections**:
   - TONE & PACING
   - SCENE STRUCTURE (establish/develop/resolve)
   - MANDATORY ELEMENTS (3-4 required, marked as checkboxes)
   - PROHIBITED ELEMENTS
   - CHARACTER ARCHETYPES (1-2 per scene)
   - DIALOGUE GUIDANCE
   - [GENRE-SPECIFIC] custom section(s)
   - USAGE IN PIPELINE

3. **Register in system**:
   ```typescript
   // In services/payloadService.ts
   const GENRE_TEMPLATES = {
     "sci-fi": loadTemplate("story-sci-fi.txt"),
     "drama": loadTemplate("story-drama.txt"),
     "thriller": loadTemplate("story-thriller.txt"),
     "horror": loadTemplate("story-horror.txt"),  // NEW
   };
   ```

4. **Update validators** if new quality metrics needed:
   - coherence-check.py: Ensure entity/pronoun tracking works for new genre
   - diversity-check.py: Verify theme extraction captures new genre themes
   - similarity-check.py: BERT model generalizes; no changes needed

---

## Quality Thresholds by Template

All templates enforce the same quality baselines:

| Metric | Threshold | Validator | Consequence |
|--------|-----------|-----------|-------------|
| **Coherence** | ≥4.0/5 | coherence-check.py | Scene archived; narrative flow validated |
| **Diversity (entropy)** | ≥2.0 | diversity-check.py | Scene thematic richness confirmed |
| **Similarity (alignment)** | ≥0.75 | similarity-check.py | Generated scene matches prompt intent |
| **Telemetry completeness** | 100% | run-quality-checks.ps1 | All 50+ fields logged |
| **Frame count** | ≥25 | run-quality-checks.ps1 | Minimum visual density met |
| **Done-marker reliability** | ≥95% | run-quality-checks.ps1 | Output captured without race condition |
| **GPU VRAM delta** | ≤18 GB | run-quality-checks.ps1 | Resource usage within bounds |

---

## Troubleshooting

### Scene fails coherence check (pronoun resolution <4.0/5)
- Issue: Characters introduced but pronouns aren't resolved to antecedents
- Fix: Template text should explicitly link pronouns to character names
- Example: "Dr. Chen works at the station. She discovers..." (not "She discovers...")

### Scene fails diversity check (entropy <2.0)
- Issue: Scene covers only one theme (e.g., only action, no dialogue/exposition)
- Fix: Template mandates 3-4 different elements per scene; re-generate with richer prompt
- Verify: diversity-check-report.json shows `"themes": ["action"]` (single theme); should be mixed

### Scene fails similarity check (semantic alignment <0.75)
- Issue: Generated scene doesn't match input prompt intent
- Fix: Template guidance wasn't applied or Mistral model misinterpreted prompt
- Debug: Compare similarity-check-report.json prompt_preview vs. description_preview

### "Mandatory elements" validation fails
- Issue: Scene missing required element (e.g., sci-fi scene without any advanced tech)
- Fix: Regenerate with stricter prompt enforcement
- Check: run-quality-checks.ps1 telemetry check flags missing required field

---

## Integration Points

### 1. **useProjectData Hook** (`utils/hooks.ts`)
```typescript
const result = useProjectData((project) => ({
  genre: project.selectedGenre,  // <- Determines template
  scenes: project.scenes
}));
```

### 2. **Gemini API Call** (`services/geminiService.ts`)
```typescript
const template = GENRE_TEMPLATES[genre];
const systemPrompt = `${template.basePrompt}\n\nMANDATORY: ${template.mandatoryElements.join(', ')}`;

const response = await withRetry(
  () => api.generateContent({ contents, systemPrompt, ... }),
  `scene-gen-${genre}`,
  model,
  logApiCall
);
```

### 3. **ComfyUI Queue** (`services/comfyUIService.ts`)
```typescript
// Pre-queue validation
validateWorkflowAndMappings({
  workflow,
  scene,
  genre,
  templateRequirements: GENRE_TEMPLATES[genre].mandatory
});
```

### 4. **Post-Execution** (`scripts/run-comfyui-e2e.ps1`)
```powershell
# After frames written to artifacts/
& ./scripts/quality-checks/run-quality-checks.ps1 -RunDir $runDir
& ./scripts/quality-checks/coherence-check.py $runDir/artifact-metadata.json
& ./scripts/quality-checks/diversity-check.py $runDir/artifact-metadata.json
& ./scripts/quality-checks/similarity-check.py $runDir/artifact-metadata.json
```

---

## Version History

- **v1.0** (2025-11-13):
  - Initial release with sci-fi, drama, thriller templates
  - Coherence, diversity, similarity quality metrics
  - 3 Python validators + PowerShell orchestrator
  - Telemetry contract enforcement

---

## References

- **Quality Metrics**: See `QUALITY_METRICS.md` in project root for baseline definitions
- **Telemetry Contract**: `TELEMETRY_CONTRACT.md` for required fields
- **Pipeline Architecture**: `INTEGRATED_PIPELINE_IMPLEMENTATION_ROADMAP.md` Phase 1
- **Monitoring**: `MONITORING_GUIDE.md` for incident response on validator failures
