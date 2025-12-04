# Bookend QA Golden Review

**Purpose**: Capture human visual feedback for each golden sample to guide future hardening passes.

Golden samples represent the bar for "acceptable PASS" quality. Visible issues documented here will be considered normalized for production quality assessment.

> **Note**: Human review is advisory and used to tune thresholds; CI still gates purely on metrics.
> When you decide a golden's visual flaws are acceptable or unacceptable, you may update
> `data/bookend-golden-samples/vision-thresholds.json` humanReview data and adjust thresholds
> accordingly in a future calibration session.

## Current Metrics Summary (Updated 2025-12-04)

| Sample | Scenario | Pixel Avg | Overall | Focus | Artifacts | ObjConsist | Human Notes |
|--------|----------|-----------|---------|-------|-----------|------------|-------------|
| 001-geometric | Spinning top | 49.0% | 100% | 100 | 0 | 100 | *(to be filled)* |
| 002-character | Character head/body motion | 51.4% | 100% | 100 | 0 | 100 | *(to be filled)* |
| 003-environment | Environment/camera pan | 54.2% | 87% | 80 | 5 | 92 | *(to be filled)* |
| 004-motion | Person walking | 50.0% | 100% | 100 | 0 | 100 | *(to be filled)* |
| 005-complex | Kitchen time-lapse | 49.3% | 78% | 80 | 30 | 85 | known-artifacts (lens flare) |
| 006-multichar | Coffee + barista depth | 57.1% | 94% | 95 | 5 | 95 | user-reported (hardened) |
| 007-occlusion | Person + lamppost | 51.5% | 91% | 90 | 5 | 95 | *(to be filled)* |
| 008-lighting | Lighting transition | 53.2% | 92% | 95 | 5 | 95 | user-reported (hardened) |

**Legend:**
- Focus = focusStability (0-100, higher = better)
- Artifacts = artifactSeverity (0-100, **lower = better**)
- ObjConsist = objectConsistency (0-100, higher = better)

---

## Per-Sample Visual Review

### sample-001-geometric

**Known strengths (VLM analysis):**
- Clean rotation motion with natural motion blur
- Consistent color rendering
- Simple, uncluttered composition
- Perfect focus stability and object consistency

**Coherence notes (VLM):**
> "No artifacts, focus remains on the top throughout, object consistency is maintained, and motion is seamless from start to end."

**Human review notes:**
*(Leave blank for human reviewer to fill in)*

---

### sample-002-character

**Known strengths (VLM analysis):**
- Perfect identity consistency (same hair, eyes, freckles)
- Smooth, natural head turn motion
- Consistent clothing throughout
- No artifacts or focus issues

**Coherence notes (VLM):**
> "No artifacts or focus issues observed; motion is smooth and natural, with perfect adherence to the prompt."

**Human review notes:**
*(Leave blank for human reviewer to fill in)*

---

### sample-003-environment

**Known strengths (VLM analysis):**
- Smooth horizontal camera pan
- Consistent brick wall texture throughout
- Warm, cozy lighting maintained

**Known weaknesses (VLM analysis):**
- Focus stability slightly lower (80%) due to camera pan
- Minor chair placement differences during pan
- Some perspective shifts in table arrangement
- Slight color toning differences between frames

**Coherence notes (VLM):**
> "The camera pan is smooth with no noticeable jumps or flickers. The leather armchair moves from left to right as expected, and all key objects remain consistent. Slight color toning differences between frames are minor and do not affect coherence."

**Human review notes:**
*(Leave blank for human reviewer to fill in)*

---

### sample-004-motion

**Known strengths (VLM analysis):**
- Seamless walking motion from left to right
- Consistent character appearance (red sweater, dark jeans)
- Stable background throughout
- Perfect coherence metrics

**Coherence notes (VLM):**
> "No artifacts or coherence issues observed. The motion is seamless and the subject maintains focus and consistent appearance."

**Human review notes:**
*(Leave blank for human reviewer to fill in)*

---

### sample-005-complex

**Known strengths (VLM analysis):**
- Smooth lighting transition from morning to afternoon
- Correct fruit slicing progression
- Objects maintain positions

**Known weaknesses (VLM analysis):**
- **Highest artifact severity (30%)** - lens flare artifacts during transition
- Soft focus in end frame slightly reduces clarity
- Minor object shifts
- Motion slightly unnatural in time-lapse sections

**Coherence notes (VLM):**
> "Minor lens flare and soft focus in the end frame slightly reduce clarity. The refrigerator's reflection and the plant's position are consistent, but the end frame shows some visual artifacts like lens flare that break immersion slightly."

**Human review notes:**
*(Leave blank for human reviewer to fill in)*

---

### sample-006-multichar (FOCUS CASE: Mug+Barista)

**User-reported issues:**
- "Barista's pour vessel changes (silver flask vs coffee pot)"
- "Main cup focus confused; extra cup appears"

**Known strengths (VLM analysis):**
- Perfect foreground coffee cup stability
- Natural steam animation
- Smooth barista motion in background
- Excellent focus stability (95%)

**Coherence notes (VLM):**
> "The foreground cup remains perfectly still and in focus throughout. The barista's motion is smooth and natural, transitioning from working at the espresso machine to reaching for a cup. No artifacts or object inconsistencies are present."

**VLM vs User observations:**
- VLM reports no object inconsistencies (95%), but user reports vessel changes
- This suggests either: (a) the current video is improved from what user saw, or (b) VLM is not catching subtle pour vessel changes
- Recommend human review to validate

**Human review notes:**
*(Leave blank for human reviewer to fill in)*

---

### sample-007-occlusion

**Known strengths (VLM analysis):**
- Identity preserved through lamppost occlusion
- Natural walking motion
- Consistent appearance before/after

**Known weaknesses (VLM analysis):**
- Occlusion moment not fully visible in some frames
- Minor artifacts in final frame
- Slight shift in background framing between frames

**Coherence notes (VLM):**
> "The subject remains clearly focused and identifiable throughout. The motion is smooth with no flickering or morphing. The only minor issue is a slight shift in background framing between frames, but it does not break immersion."

**Human review notes:**
*(Leave blank for human reviewer to fill in)*

---

### sample-008-lighting (FOCUS CASE: Office+Laptop)

**User-reported issues:**
- "Main subject occasionally loses focus due to chopping/flicker"
- "Some frames show black/distorted artifacts (Ring-style flashes)"

**Known strengths (VLM analysis):**
- Smooth daylight-to-lamplight transition
- Subject position maintained throughout
- Natural lighting color shift
- Excellent focus stability (95%)

**Known weaknesses (VLM analysis):**
- Minor object placement inconsistencies (lamp base, succulent)
- Lamp design slightly varies between frames
- Slight variations in window framing

**Coherence notes (VLM):**
> "Minor inconsistencies in object positioning (e.g., lamp base and succulent placement) and slight variations in window framing between frames, but no major artifacts or focus issues."

**VLM vs User observations:**
- VLM reports only 5% artifact severity, but user reports "Ring-style flashes"
- VLM says 95% focus stability, but user reports "chopping/flicker"
- This discrepancy suggests either: (a) the current video is improved, or (b) VLM is missing subtle frame-level artifacts
- Recommend human review with frame-by-frame inspection

**Human review notes:**
*(Leave blank for human reviewer to fill in)*

---

## Coherence Metrics Summary

| Sample | FocusStability | ArtifactSeverity | ObjectConsistency | Notes |
|--------|----------------|------------------|-------------------|-------|
| 001-geometric | 100 | 0 | 100 | Perfect |
| 002-character | 100 | 0 | 100 | Perfect |
| 003-environment | 80 | 5 | 92 | Camera pan causes focus drift |
| 004-motion | 100 | 0 | 100 | Perfect |
| 005-complex | 85 | 30 | 85 | **Worst artifacts** (lens flare) |
| 006-multichar | 95 | 5 | 95 | User reports differ from VLM |
| 007-occlusion | 90 | 5 | 95 | Minor background shift |
| 008-lighting | 95 | 5 | 90 | User reports differ from VLM |

**Priority for hardening (based on metrics + user reports):**
1. **sample-005-complex**: Highest artifact severity (30%), lowest overall (82%)
2. **sample-006-multichar**: User reports object inconsistencies not detected by VLM
3. **sample-008-lighting**: User reports artifacts not detected by VLM

---

## Next Steps

Future hardening sessions should:
1. **Human review** - Watch each sample video, especially 006 and 008 for user-reported issues
2. **Compare VLM vs human observations** - VLM may be missing subtle artifacts
3. **Update prompts** to address specific weaknesses identified
4. **Re-run regression + vision QA** to validate improvements
5. **Update baselines** if metrics improve without pixel regression beyond 10%

## Last Updated

- **Date**: December 3, 2025 23:40 PST
- **Baselines Version**: v2.0.0
- **Samples**: 8 (001-008)
- **Coherence Metrics**: Added focusStability, artifactSeverity, objectConsistency
