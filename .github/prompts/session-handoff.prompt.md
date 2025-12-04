---
description: 'Create a structured session handoff for continuity between sessions/agents'
agent: agent
---

# Session Handoff

Create a machine-readable handoff document preserving full context for the next session.

---

## Step 1: Gather Context (Automated)

Run these commands to collect session state:

```powershell
# Get modified files from git
git diff --name-only HEAD~1

# Verify current build state
npx tsc --noEmit 2>&1 | Select-Object -Last 3

# Get test results
npm test -- --run --reporter=dot 2>&1 | Select-Object -Last 5
```

Read existing state:
- `agent/.state/session-handoff.json` — Previous session context
- `agent/.state/issues.json` — Current issue tracking

---

## Step 2: Build Handoff Document

Create the handoff with ALL fields populated:

```json
{
  "timestamp": "2025-12-02T00:00:00.000Z",
  "agent": "Copilot|Guardian|Planner|Implementer|Reviewer",
  "sessionSummary": "1-2 sentences: what was accomplished and outcome",
  "filesModified": [
    "path/to/file1.ts",
    "path/to/file2.ts"
  ],
  "decisions": [
    {
      "decision": "What was decided",
      "rationale": "Why this choice was made",
      "alternatives": ["Options considered but rejected"]
    }
  ],
  "currentState": {
    "phase": "planning|implementing|reviewing|complete",
    "progress": "75%",
    "status": "Specific description of where work stands"
  },
  "nextSteps": [
    "1. First priority action (most important)",
    "2. Second priority action",
    "3. Third priority action"
  ],
  "blockers": [
    {
      "issue": "Description of what's blocking",
      "severity": "critical|high|medium|low",
      "suggestions": ["Possible workarounds or solutions"]
    }
  ],
  "openQuestions": [
    "Questions requiring user input or clarification"
  ],
  "relatedIssues": [
    "Links to GitHub issues, docs, or related files"
  ],
  "testMetrics": {
    "typescript": "0 errors OR list specific errors",
    "unitTests": "1522 passed, 1 skipped",
    "e2eTests": "Status if relevant"
  },
  "implementationDetails": {
    "newTypes": {},
    "newComponents": [],
    "keyPatterns": "Any patterns future agents should know"
  },
  "previousSession": {
    "summary": "What the prior session accomplished",
    "agent": "Which agent worked on it"
  }
}
```

---

## Step 3: Verify Before Saving

Before saving the handoff:

1. **Build passes**: `npx tsc --noEmit` returns no errors
2. **Tests pass**: `npm test -- --run` shows expected results
3. **No uncommitted critical changes**: `git status` checked
4. **NextSteps are actionable**: Each step can be started immediately

---

## Step 4: Save Handoff

Save to `agent/.state/session-handoff.json`:

```powershell
# The file should be valid JSON - verify with:
Get-Content agent/.state/session-handoff.json | ConvertFrom-Json
```

---

## Step 5: Update Human-Readable Handoff (If Major Work)

For significant sessions, also update `AGENT_HANDOFF_CURRENT.md`:

1. Update the **Last Updated** date
2. Add accomplishments to **What Was Completed** section  
3. Update **Files Modified** table
4. Update **Next Steps** section
5. Update verification command outputs

---

## Quality Checklist

Before considering handoff complete:

- [ ] `sessionSummary` clearly states what was done and outcome
- [ ] `filesModified` lists ALL changed files (use `git diff --name-only`)
- [ ] `decisions` explains WHY, not just WHAT
- [ ] `nextSteps` are ordered by priority, each is actionable
- [ ] `blockers` includes severity and workaround suggestions
- [ ] `testMetrics` reflects actual current state (run tests!)
- [ ] `implementationDetails` captures patterns future agents need

---

## Example: Well-Structured Handoff

```json
{
  "timestamp": "2025-12-02T06:25:00.000Z",
  "agent": "Copilot",
  "sessionSummary": "Fixed infinite loop in MediaGenerationProvider by stabilizing useMemo dependencies. All 1840 tests passing, zero console errors in browser.",
  "filesModified": [
    "contexts/MediaGenerationProviderContext.tsx",
    "components/ProviderHealthIndicator.tsx"
  ],
  "decisions": [
    {
      "decision": "Use useRef for unstable context values",
      "rationale": "React 18 StrictMode runs effects twice; refs prevent re-render loops",
      "alternatives": ["Zustand store (deferred - larger change)", "useMemo (still had dependency issues)"]
    }
  ],
  "currentState": {
    "phase": "complete",
    "progress": "100%",
    "status": "Bug fixed and verified. No regressions introduced."
  },
  "nextSteps": [
    "1. Monitor for any recurrence in next session",
    "2. Consider migrating remaining contexts to Zustand stores",
    "3. Add integration test for the fixed scenario"
  ],
  "blockers": [],
  "openQuestions": [],
  "testMetrics": {
    "typescript": "0 errors",
    "unitTests": "1840 passed, 1 skipped"
  }
}
```

---

## After Creating Handoff

- **To continue work**: Use **🔄 Continue Development** to return to Guardian
- **To close session**: Confirm handoff saved, then end session
- **To escalate blocker**: Note in `blockers` array with severity "critical"
