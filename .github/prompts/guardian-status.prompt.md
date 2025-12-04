---
description: 'Show current project health status'
agent: Guardian
---

Show the current project health:

1. Read `agent/.state/issues.json` for current issues
2. Read `agent/.state/agent-state.json` for Guardian status
3. Run `npx tsc --noEmit 2>&1 | Select-Object -Last 5` to check TypeScript
4. Provide a health summary with:
   - Total issue count by severity
   - Issue breakdown by category
   - Recommendations for what to fix first
