---
description: 'Full autonomous quality audit using SWE-bench winning patterns'
agent: QualityDirector
---

# Full Quality Audit Workflow

You are an autonomous coding agent. This workflow follows the **SWE-bench winning pattern** that achieved 49% on the benchmark - state of the art.

## The Winning Pattern

```
EXPLORE → REPRODUCE → PLAN → IMPLEMENT → VERIFY → ITERATE
```

**CRITICAL**: Do not skip steps. Do not jump to coding. The pattern works because of discipline.

---

## PHASE 1: EXPLORE (No Code Changes)

**Goal**: Understand before fixing. Read files completely.

### Required Reading (in order)
1. `services/payloadService.ts` - Prompt construction (MOST CRITICAL)
2. `services/geminiService.ts` - LLM integration, retry logic
3. `services/comfyUIService.ts` - Image/video generation
4. `services/planExpansionService.ts` - Story expansion
5. `services/narrativeCoherenceService.ts` - State tracking

### What to Look For

**Prompt Quality Issues:**
- Word count (optimal: 100-180 words per prompt)
- Negative language ("avoid", "don't", "never") - should be positive
- Missing cinematic grammar (shot type, camera, lighting)
- Incomplete scene structure (who, what, where, when, mood)

**Service Quality Issues:**
- Missing retry logic or error handling
- No input validation before LLM calls
- No output verification after generation
- Missing state tracking for coherence

**DO NOT write any code yet.**

---

## PHASE 2: CREATE WORKING SCRATCHPAD

Before fixing ANYTHING, create `agent/reports/quality-audit.md` as your working document:

```markdown
# Quality Audit - [timestamp]

## Issues Found
| ID | Severity | File | Line | Issue | Root Cause |
|----|----------|------|------|-------|------------|
| Q1 | CRITICAL | payloadService.ts | 45 | Prompt 38 words | No scene structure |
| Q2 | HIGH | coherenceService.ts | 120 | No char tracking | State not saved |

## Verification Checklist
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test -- --run` passes

## Fix Progress
- [ ] Q1: Expand to 120 words with Subject→Action→Setting→Mood→Camera→Light
- [ ] Q2: Add CharacterState interface
```

**This is your source of truth. Update it as you work.**

---

## PHASE 3: PLAN (Think Hard Before Coding)

For each CRITICAL/HIGH issue, write out THE EXACT CHANGE:

```
Issue Q1: Prompt too short (38 words)
├── File: services/payloadService.ts
├── Function: buildScenePrompt()
├── Current: "A ${character} in ${location}. ${action}."
├── Change: Expand to include all 6 elements
├── New: "${shotType} of ${character} with ${appearance}, ${clothing}, 
│         in ${location}. ${action}. ${mood} atmosphere. 
│         ${cameraAngle} ${cameraMovement}. ${lightingType} lighting."
├── Edge cases: Handle missing fields gracefully
└── Verify: Word count > 100, tsc passes
```

**Only proceed when you have a clear plan.**

---

## PHASE 4: IMPLEMENT (One Fix at a Time)

### The SWE-bench Pattern for Fixes

1. **Make the minimal change needed** - Don't refactor everything
2. **Run `npx tsc --noEmit` IMMEDIATELY** - After EVERY change
3. **If TypeScript fails, fix before continuing** - Never accumulate errors
4. **Update your scratchpad** - Check off completed items

```bash
# After EVERY change
npx tsc --noEmit
```

### Self-Correction

If your fix doesn't work:
1. Read the error message carefully
2. Try a different approach
3. The SWE-bench agent often tried 3-4 approaches before succeeding

---

## PHASE 5: VERIFY (Ground Truth)

After ALL fixes complete:

```bash
# TypeScript - MUST pass with zero errors
npx tsc --noEmit

# Tests - MUST pass
npm test -- --run
```

Then **re-read each modified file** to confirm:
- Changes are correct
- No unintended side effects
- Code follows project conventions

---

## PHASE 6: DOCUMENT STATE

Update `agent/.state/session-handoff.json`:

```json
{
  "timestamp": "2025-11-30T12:00:00Z",
  "agent": "QualityDirector",
  "sessionSummary": "Fixed 3 prompt quality issues, added coherence tracking",
  "filesModified": [
    "services/payloadService.ts",
    "services/narrativeCoherenceService.ts"
  ],
  "issuesFixed": ["Q1", "Q2", "Q3"],
  "issuesRemaining": ["Q4", "Q5"],
  "verificationResults": {
    "typescript": "PASS - 0 errors",
    "tests": "PASS - 1562/1562"
  },
  "nextSteps": [
    "Fix Q4: Add bookend validation",
    "Fix Q5: Improve error messages"
  ]
}
```

---

## COMPLETION CHECKLIST

Before finishing, verify:

- [ ] All CRITICAL/HIGH issues fixed
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test -- --run` passes
- [ ] `agent/reports/quality-audit.md` updated
- [ ] `agent/.state/session-handoff.json` updated

Present summary:
1. **Issues Found**: Count by severity
2. **Issues Fixed**: This session
3. **Verification**: TypeScript + test results
4. **Remaining**: For next session

---

## Quick Reference: Quality Standards

**Prompt Word Count**: 100-180 words

**Positive Language**:
- ❌ "Avoid busy backgrounds" → ✅ "Clean minimal background"
- ❌ "Don't show violence" → ✅ "Peaceful interaction"

**Scene Structure**: Subject → Action → Setting → Mood → Camera → Lighting

**Cinematic Grammar**:
- Shots: wide, medium, close-up, extreme close-up
- Camera: dolly, pan, tilt, crane, handheld
- Lighting: key, fill, rim, practical, natural
