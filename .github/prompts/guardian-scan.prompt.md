---
description: 'Scan project for issues and show summary'
agent: Guardian
---

Run a Guardian scan and summarize the results:

1. Run `npm run guardian -- --scan` to refresh issue data
2. Read `agent/.state/issues.json` 
3. Summarize issues by category (typescript, test, service-layer)
4. List the top 5 most important issues to fix
