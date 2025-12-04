---
description: 'Fix all TypeScript errors in the project'
agent: Guardian
---

Fix all TypeScript compilation errors:

1. Run `npx tsc --noEmit` to get current errors
2. Read `agent/.state/issues.json` for any cached TypeScript issues
3. Fix each error, starting with the most impactful
4. After each fix, verify with `npx tsc --noEmit`
5. Continue until all TypeScript errors are resolved
