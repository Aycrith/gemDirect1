---
description: 'Guidelines for preserving context between sessions and agent handoffs'
applyTo: '**/*'
---

# Session Handoff Guidelines

When ending a session or handing off work, always capture context to ensure continuity.

## Required Context Capture

Before ending any significant work session:

1. **Summarize Accomplishments**: List what was completed
2. **Document Decisions**: Record choices made and their rationale
3. **Note Current State**: Describe where the work stands
4. **List Next Steps**: Outline what should happen next
5. **Flag Blockers**: Identify any issues preventing progress

## Handoff Format

Save session context to `agent/.state/session-handoff.json`:

```json
{
  "timestamp": "2025-11-30T12:00:00Z",
  "agent": "Guardian|Planner|Implementer|Reviewer",
  "sessionSummary": "Brief description of what was accomplished",
  "filesModified": [
    "path/to/file1.ts",
    "path/to/file2.ts"
  ],
  "decisions": [
    {
      "decision": "What was decided",
      "rationale": "Why this choice was made",
      "alternatives": ["Other options considered"]
    }
  ],
  "currentState": {
    "phase": "planning|implementing|reviewing|complete",
    "progress": "50%",
    "status": "Description of current state"
  },
  "nextSteps": [
    "First thing to do next",
    "Second thing to do next"
  ],
  "blockers": [
    {
      "issue": "Description of blocker",
      "suggestions": ["Possible solutions"]
    }
  ],
  "openQuestions": [
    "Questions that need answers"
  ],
  "relatedIssues": [
    "Links to relevant issues or docs"
  ]
}
```

## When to Create Handoffs

Create a handoff document when:

- Ending a work session
- Switching between agents (Plan → Implement → Review)
- Encountering a significant blocker
- Completing a major milestone
- Needing input from the user

## Reading Previous Handoffs

At the start of each session:

1. Check `agent/.state/session-handoff.json` for prior context
2. Review `agent/.state/issues.json` for current project state
3. Read any referenced files or documentation
4. Confirm understanding before proceeding

## Project-Specific Files

Key state files for this project:

| File | Purpose |
|------|---------|
| `agent/.state/session-handoff.json` | Latest session context |
| `agent/.state/issues.json` | Current project issues |
| `agent/.state/agent-state.json` | Guardian running state |
| `Documentation/PROJECT_STATUS_CONSOLIDATED.md` | Project overview |
