---
description: 'Triage and prioritize current issues'
agent: Guardian
---

Analyze and prioritize current issues for fixing:

## Step 1: Gather Issues
Read `agent/.state/issues.json` and categorize all issues.

## Step 2: Triage by Impact

### Critical (Fix Immediately)
- Build-breaking TypeScript errors
- Security vulnerabilities
- Tests blocking CI/CD

### High (Fix Soon)
- TypeScript errors in core services
- Failing integration tests
- Service-layer violations in key components

### Medium (Fix When Convenient)
- TypeScript errors in test files
- Minor service-layer issues
- Documentation gaps

### Low (Backlog)
- Style/lint issues
- Performance optimizations
- Nice-to-have improvements

## Step 3: Recommended Fix Order

Based on the analysis, provide:
1. Top 3 issues to fix first (with reasoning)
2. Estimated effort for each (quick/medium/complex)
3. Dependencies between issues (fix A before B)

## Step 4: Quick Wins

List any issues that can be auto-fixed or fixed in < 5 minutes.
