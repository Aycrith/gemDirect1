---
description: 'Continue quality improvements using SWE-bench iteration pattern'
agent: QualityDirector
---

# Continue Quality Improvements

Resume quality work from the previous session using the **evaluator-optimizer loop**.

## The Iteration Pattern

```
READ STATE → VERIFY CLEAN → PICK NEXT ISSUE → FIX → VERIFY → UPDATE STATE
     │            │              │             │       │           │
     │            │              │             │       │           └── Save progress
     │            │              │             │       │
     │            │              │             │       └── tsc + tests must pass
     │            │              │             │
     │            │              │             └── Minimal targeted change
     │            │              │
     │            │              └── Highest priority remaining
     │            │
     │            └── tsc must pass before starting new work
     │
     └── agent/.state/session-handoff.json + quality-audit.md
```

---

## Step 1: Load Previous State

Read these files to understand where we left off:

1. `agent/.state/session-handoff.json` - Session context
2. `agent/reports/quality-audit.md` - Issue tracking scratchpad

Extract:
- What was completed last session
- What issues remain (in priority order)
- What verification results were

---

## Step 2: Verify Clean State

Before starting new work:

```bash
npx tsc --noEmit
```

If there are TypeScript errors:
1. **Fix them first** - Don't start quality work on a broken codebase
2. Run tests: `npm test -- --run`
3. Then proceed

---

## Step 3: Pick Next Issue

From `issuesRemaining` in the handoff, take the **highest priority** issue:

```
Priority order: CRITICAL > HIGH > MEDIUM > LOW
```

Read the affected file(s) completely before making changes.

---

## Step 4: Implement Fix

Follow the SWE-bench pattern:

1. **Plan the exact change** - Write it out first
2. **Make minimal change** - Don't refactor everything
3. **Run tsc immediately** - After every change
4. **Self-correct if needed** - Try different approaches

```bash
# After EVERY change
npx tsc --noEmit
```

---

## Step 5: Verify Fix

```bash
# Must pass
npx tsc --noEmit

# Must pass  
npm test -- --run
```

Re-read the modified file to confirm the change is correct.

---

## Step 6: Update State

Update `agent/reports/quality-audit.md`:
- Check off the fixed issue
- Note any new issues discovered

Update `agent/.state/session-handoff.json`:
- Add to `issuesFixed`
- Remove from `issuesRemaining`
- Update verification results

---

## Step 7: Loop or Complete

If more issues remain and time allows:
- Go back to Step 3
- Pick next highest priority issue

If stopping:
- Ensure state files are updated
- Present summary to user

---

## Progress Tracking

Track improvements across sessions:

| Area | Initial | After Session 1 | After Session 2 |
|------|---------|-----------------|-----------------|
| Prompts | 3/10 | 6/10 | 8/10 |
| Coherence | 4/10 | 5/10 | 7/10 |
| Validation | 5/10 | 7/10 | 8/10 |

---

## Summary Template

When complete, present:

```
## Session Summary

### Previous Work
- [What was done in prior sessions]

### This Session  
- Fixed: Q4 (bookend validation), Q5 (error messages)
- Verification: TypeScript ✅, Tests ✅ (1562/1562)

### Remaining
- Q6: Add character tracking tests
- Q7: Improve coherence gate logging

### Overall Progress
- 7 of 10 issues resolved (70%)
- Quality score: 7/10 (was 4/10)
```
