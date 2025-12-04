# E2E Quality & Coherence Audit Agent Instructions

## Overview

The E2E Quality & Coherence Audit is a repeatable workflow for auditing and improving the Cinematic Story Generator (CSG) pipeline. This agent examines the entire data flow from user inputs on the React front-end to LLM calls and ComfyUI image/video generation.

## Quick Start

```powershell
# Run the E2E audit
npm run guardian:e2e-audit

# Or using the guardian command directly
npm run guardian -- --e2e-audit
```

## What the Audit Checks

### 1. Data Flow Verification
- Traces the user journey through all 7 pipeline stages
- Verifies required files exist for each stage
- Checks service layer integration points
- Validates error handling and retry logic

**Pipeline Stages:**
```
Story Idea → Story Bible → Director Vision → Scenes → Shots → Keyframes → Videos → Artifacts
```

### 2. Validation & Guardrails
- Form validation patterns in components
- Input sanitization and constraints
- Error message display
- Prompt validation service

### 3. Prompt Construction Quality
- Checks for negative phrasing (anti-pattern)
- Validates cinematic grammar usage
- Verifies context pruning for token efficiency
- Targets 100-180 word prompts

### 4. Bookend Workflows (HIGH PRIORITY)
- Start/end image workflow validation
- Aspect ratio consistency checks
- Transition description verification
- I2V workflow availability

### 5. Narrative Coherence
- Character/location state tracking
- Temporal continuity
- Plot thread management
- Outline-first generation patterns

### 6. Feature Flags
- Inventories all feature flags
- Checks documentation
- Verifies toggle effects

## Generated Reports

After running the audit, reports are saved to `agent/reports/e2e-audit/`:

| Report | Description |
|--------|-------------|
| `data-flow-latest.md` | Pipeline stages and data transformations |
| `validation-latest.md` | Form validation audit results |
| `bookends-latest.md` | Start/end image workflow status |
| `coherence-latest.md` | Prompt and story coherence guidelines |
| `test-matrix-latest.md` | Test coverage and quality metrics |
| `summary-latest.md` | Full audit summary with all issues |

## Agent Workflow

### For Subsequent Agents

1. **Read previous audit results:**
   ```powershell
   Get-Content "agent/reports/e2e-audit/summary-latest.md"
   ```

2. **Run a fresh audit:**
   ```powershell
   npm run guardian:e2e-audit
   ```

3. **Address issues by priority:**
   - 🚨 Critical: Immediate attention required
   - ⚠️ High: Should be addressed soon
   - 📝 Medium: Improve when possible
   - ℹ️ Low: Nice to have

4. **Generate fix prompts for issues:**
   ```powershell
   npm run guardian -- -g
   ```

5. **Use interactive mode for guided fixes:**
   ```powershell
   npm run guardian -- -i
   ```

6. **Re-run audit to verify fixes:**
   ```powershell
   npm run guardian:e2e-audit
   ```

### Iteration Cycle

```
┌─────────────────┐
│  Run E2E Audit  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Review Reports │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Prioritize Fixes│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Implement Fixes │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Verify Changes │
└────────┬────────┘
         │
         └────────────► (repeat)
```

## Issue Categories

The audit categorizes issues under `e2e-quality` with these sub-types:

- **Data Flow**: Missing files, broken integrations
- **Validation**: Missing form validation, unclear errors
- **Prompt Quality**: Negative phrasing, missing cinematic grammar
- **Bookends**: Start/end workflow issues
- **Coherence**: Narrative consistency problems
- **Feature Flags**: Undocumented or dead flags

## Best Practices

### Prompt Quality Guidelines

**DO:**
- Use 100-180 words per prompt
- Include cinematic grammar (shot types, camera movements)
- Use positive phrasing
- Include subject, action, setting, mood, camera, lighting

**DON'T:**
- Use negative instructions ("don't", "avoid", "never")
- Overload prompts with extraneous detail
- Skip camera/lighting specifications

### Bookend Workflow Requirements

1. **High-quality images**: Clear, detailed start/end frames
2. **Consistent aspect ratios**: Both images must match
3. **Explicit transitions**: Describe the change between frames
4. **Locked endpoints**: Both start and end frames are fixed

### Narrative Coherence

1. Track characters, locations, temporal state
2. Use outline-first generation for plot consistency
3. Maintain consistent terminology across prompts
4. Validate outputs for coreference errors

## Integration with Guardian

The E2E audit integrates with the existing Guardian agent system:

- Issues are stored in `agent/.state/issues.json`
- Can generate Copilot-ready prompts for fixes
- Works with interactive mode for guided fixes
- Reports integrate with existing report infrastructure

## Command Reference

| Command | Description |
|---------|-------------|
| `npm run guardian:e2e-audit` | Run the full E2E audit |
| `npm run guardian -- -g` | Generate fix prompts for all issues |
| `npm run guardian -- -i` | Interactive mode |
| `npm run guardian:status` | Show current guardian status |
| `npm run guardian:report` | Generate standard report |

## Related Files

- `agent/watchers/E2EQualityWatcher.ts` - Main audit logic
- `agent/tasks/E2EAuditTaskRunner.ts` - Report generation
- `agent/core/types.ts` - Issue type definitions
- `agent/index.ts` - CLI command registration

## Deliverables Checklist

When completing an audit iteration, ensure you have:

- [ ] Data flow documentation (diagram or written summary)
- [ ] Validation & guardrail audit report
- [ ] Bookend workflow report with test evidence
- [ ] Prompt & story coherence guidelines
- [ ] Test matrix with results
- [ ] Code commits for any fixes implemented

## Session Handoff

After completing an audit, update the session handoff:

```json
{
  "timestamp": "2025-11-30T12:00:00Z",
  "agent": "E2E-Audit",
  "sessionSummary": "Ran E2E quality audit, found X issues...",
  "filesModified": [
    "agent/reports/e2e-audit/summary-latest.md"
  ],
  "nextSteps": [
    "Address critical issues in bookend workflow",
    "Add validation to StoryIdeaForm",
    "Re-run audit after fixes"
  ]
}
```

Save to `agent/.state/session-handoff.json` for the next agent.
