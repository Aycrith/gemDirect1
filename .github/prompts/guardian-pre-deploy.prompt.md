---
description: 'Pre-deployment readiness check'
agent: Guardian
---

Verify the project is ready for deployment:

## Critical Checks (Must Pass)

### 1. TypeScript Compilation
```bash
npx tsc --noEmit
```
**Requirement**: Zero errors

### 2. Unit Tests
```bash
npm test -- --run
```
**Requirement**: All tests pass

### 3. No Critical Issues
Read `agent/.state/issues.json` and check for:
- Critical severity: BLOCKER
- High severity: Should be addressed

## Recommended Checks

### 4. Playwright E2E (if time permits)
```bash
npx playwright test
```

### 5. ComfyUI Health (if using video generation)
```bash
npm run check:health-helper
```

## Deployment Decision

Report:
- ✅ READY TO DEPLOY - All critical checks pass
- ⚠️ DEPLOY WITH CAUTION - Minor issues present
- ❌ NOT READY - Critical blockers exist

List any issues that should be addressed before or after deployment.
