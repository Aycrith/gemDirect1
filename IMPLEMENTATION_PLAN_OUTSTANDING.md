# Implementation Plan: Outstanding Tasks & Deferred Items

**Generated**: 2025-11-29  
**Status**: Ready for execution  
**Total Effort**: ~25-40 hours across 7 items

---

## Validation Status (Session 2025-11-29)

| Test Suite | Status |
|------------|--------|
| Unit Tests | ✅ 1488/1489 passed (1 skipped) |
| app-loading.spec.ts | ✅ 4/4 passed |
| landing-page-visibility.spec.ts | ⚠️ 1/3 passed (2 failures: ComfyUI not running) |
| TypeScript Errors | ✅ 0 errors |

---

## Priority Execution Order

### Phase 1: Production Readiness (HIGH PRIORITY)

#### 1.1 GenerationQueue ComfyUI Integration
**Effort**: 4-6 hours | **Risk**: Medium | **Impact**: High

**Why First**: Prevents GPU OOM in production. Queue infrastructure already exists.

**Steps**:
1. Create `queueComfyUIPromptWithQueue` wrapper in `videoGenerationService.ts`
2. Add integration tests for queue wrapper
3. Update `generateTimelineVideos` to use queue wrapper
4. Add GenerationQueuePanel to UI (Settings → ComfyUI tab)
5. Update documentation

**Files to Modify**:
- `services/videoGenerationService.ts`
- `components/LocalGenerationSettingsModal.tsx`
- `services/__tests__/videoGenerationService.test.ts`

**Validation**:
```powershell
npm test -- --run services/__tests__/videoGenerationService
npx playwright test tests/e2e/video-generation.spec.ts
```

---

#### 1.2 AbortController Cancellation Pattern
**Effort**: 4-8 hours | **Risk**: Medium | **Impact**: High

**Why After Queue**: AbortController builds on queue infrastructure.

**Steps**:
1. Add `AbortController` to `GenerationTask` interface
2. Update `GenerationQueue.cancel()` to abort running tasks
3. Thread `AbortSignal` through `queueComfyUIPrompt`
4. Add cancel button to GenerationQueuePanel
5. Handle WebSocket cleanup on abort

**Files to Modify**:
- `services/generationQueue.ts`
- `services/videoGenerationService.ts`
- `services/comfyUIService.ts`
- `components/GenerationQueuePanel.tsx` (new)

**Validation**:
```powershell
npm test -- --run services/__tests__/generationQueue
# Manual test: Start generation, cancel, verify VRAM freed
```

---

### Phase 2: Test Reliability (MEDIUM-HIGH PRIORITY)

#### 2.1 E2E Hydration Migration
**Effort**: 2-3 hours | **Risk**: Low | **Impact**: Medium

**Why**: Reduces flaky tests in CI.

**Steps**:
1. Audit all E2E tests for `waitForTimeout` patterns
2. Replace with `waitForHydrationGate` or `initializeApp`
3. Update tests using `waitForLoadState('networkidle')`
4. Add hydration timing to test reports

**Files to Check**:
```powershell
grep -r "waitForTimeout" tests/e2e/ | wc -l  # Count patterns
grep -r "waitForLoadState" tests/e2e/ | wc -l
```

**Target Files** (highest impact):
- `tests/e2e/comprehensive-walkthrough.spec.ts`
- `tests/e2e/full-pipeline.spec.ts`
- `tests/e2e/user-testing-fixes.spec.ts`

---

#### 2.2 LLM Transport Integration (Incremental)
**Effort**: 8-16 hours (phased) | **Risk**: High | **Impact**: High for testing

**Why**: Enables deterministic LLM tests without real API calls.

**Phase 2a (2-3 hours)**: Greenfield functions
1. Create `geminiService.adapter.ts` with new functions using transport
2. Add feature flag `useLLMTransport` 
3. Implement `generateWithTransport()` utility

**Phase 2b (4-6 hours)**: Critical path migration
1. Migrate `generateDetailedShot` to use transport
2. Migrate `refineStoryBible` to use transport
3. Update corresponding tests to use `MockLLMTransport`

**Phase 2c (2-4 hours)**: Full migration
1. Migrate remaining 40+ functions
2. Deprecate direct SDK calls
3. Remove feature flag

**Recommended**: Start with Phase 2a only, defer rest.

---

### Phase 3: Architecture Improvements (MEDIUM PRIORITY)

#### 3.1 Unified Loading State Context
**Effort**: 6-10 hours | **Risk**: Medium | **Impact**: Medium

**Why**: Prevents conflicting loading states as features grow.

**Steps**:
1. Create `contexts/LoadingStateContext.tsx`
2. Add `LoadingStateProvider` to App.tsx
3. Migrate `useProjectData.isLoading` to context
4. Migrate `sceneImageStatuses` to context
5. Add global loading indicator to header
6. Update tests

**Dependencies**: HydrationContext pattern (already complete)

---

#### 3.2 WebSocket Connection Pooling
**Effort**: 3-5 hours | **Risk**: Low | **Impact**: Low

**Why**: Nice-to-have for connection efficiency.

**Steps**:
1. Consolidate WebSocket usage in `comfyEventManager`
2. Remove per-prompt WebSocket creation in `trackPromptExecution`
3. Add connection state indicator to UI
4. Update tests

**Can Defer**: Current polling fallback works fine.

---

### Phase 4: Low Priority / Opportunistic

#### 4.1 Parallel Validation Mode
**Effort**: 4-6 hours | **Risk**: Low | **Impact**: Low

Move store validation to Web Worker for performance.

#### 4.2 Error Boundary Granularity  
**Effort**: 3-5 hours | **Risk**: Low | **Impact**: Low

Add per-component error boundaries.

---

## Execution Timeline

```
Week 1: GenerationQueue Integration (Phase 1.1)
        └── 4-6 hours

Week 2: AbortController Pattern (Phase 1.2)
        └── 4-8 hours
        
Week 3: E2E Hydration Migration (Phase 2.1)
        └── 2-3 hours
        
Week 4+: LLM Transport Phase 2a (Phase 2.2a)
         └── 2-3 hours (others deferred)
```

---

## Quick Reference

### Commands to Validate Changes

```powershell
# Unit tests
npm test -- --run

# Specific test file
npm test -- --run services/__tests__/generationQueue

# E2E tests (requires dev server)
npm run dev  # Terminal 1
npx playwright test tests/e2e/app-loading.spec.ts --project=chromium  # Terminal 2

# TypeScript check
npx tsc --noEmit

# Full validation
npm test -- --run && npx playwright test --project=chromium
```

### Key Files

| Item | Primary File |
|------|--------------|
| GenerationQueue | `services/generationQueue.ts` |
| Video Generation | `services/videoGenerationService.ts` |
| LLM Transport | `services/llmTransportAdapter.ts` |
| Hydration | `contexts/HydrationContext.tsx` |
| Test Helpers | `tests/fixtures/test-helpers.ts` |
| Tracking | `KNOWN_ISSUES.md` |

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Queue wrapper deployed and used by `generateTimelineVideos`
- [ ] AbortController cancels running generations
- [ ] No GPU OOM in multi-scene workflows

### Phase 2 Complete When:
- [ ] 0 flaky E2E tests from hydration timing
- [ ] At least 5 LLM functions use transport adapter
- [ ] MockLLMTransport enables deterministic tests

### Phase 3 Complete When:
- [ ] Single `useLoadingState()` hook for all loading states
- [ ] Global loading indicator in header

---

*Last Updated: 2025-11-29*
