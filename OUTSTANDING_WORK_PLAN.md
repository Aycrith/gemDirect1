# Outstanding Work Plan

**Created**: 2025-11-29
**Status**: Active

## Current State Summary

### ✅ Verified Working
- **Unit Tests**: 1,488/1,489 passing (1 intentionally skipped - PreflightCheck mock)
- **Build**: Succeeds with zero errors
- **E2E Tests**: Pass when run in isolation; failures are environment-dependent (require LM Studio + ComfyUI)

### 🔧 Recent Bug Fixes (This Session)
1. **`useIpAdapter` undefined** - Fixed in `comfyUIService.ts:2415`
2. **FastVideo undefined response** - Fixed in `fastVideoService.ts:53,175`
3. **JSX syntax error** - Fixed in `StoryIdeaForm.tsx:246`

---

## 📋 Outstanding Tasks by Priority

### 🔴 P1: Critical / High Priority

#### 1. Full Workflow Test (UI Integration)
**Effort**: 1-2 hours  
**Dependencies**: LM Studio running, ComfyUI running, workflow profiles imported

Test complete story-to-video workflow in React UI:
- [ ] Configure LLM (Gemini API key OR LM Studio at 192.168.50.192:1234)
- [ ] Import workflow profiles via Settings → ComfyUI Settings → Import
- [ ] Generate: story → scenes → timeline → keyframe → video
- [ ] Validate progress updates and error handling
- [ ] Monitor for split-screen artifacts

#### 2. TypeScript Strict Mode Cleanup
**Effort**: 1-2 weeks (incremental)  
**Files with `any` types**:
| File | Count | Priority |
|------|-------|----------|
| `services/comfyUIService.ts` | 30 | HIGH |
| `utils/migrations.ts` | 14 | MEDIUM |
| `scripts/mapping-utils.ts` | 11 | LOW |
| `components/LocalGenerationSettingsModal.tsx` | 8 | MEDIUM |
| `scripts/diagnose-comfyui-images.ts` | 7 | LOW |

**Patterns to fix**:
- `catch (error: any)` → Use `unknown` + type guards
- `(e: any)` event handlers → Define proper event types
- `JSON.parse() as any` → Validate with Zod or type guards

---

### 🟡 P2: Medium Priority

#### 3. E2E Test Environment Stabilization
**Effort**: 4-6 hours  
**Issue**: E2E tests require external services (LM Studio, ComfyUI)

**Options**:
1. **Add environment detection** - Skip tests when services unavailable
2. **Create docker-compose** - Spin up mock services
3. **Enhance mocking** - Use service-mocks.ts (created this session)

**Skipped Tests Analysis**:
- ~79 tests skipped in Playwright (environment-gated)
- Most are in `user-testing-fixes.spec.ts` and `ui-state-generation.spec.ts`
- Many have dynamic skip logic based on scene count

#### 4. Performance Optimization
**Effort**: 4-8 hours  
**Goal**: Reduce React mount time from 1236ms to <900ms

- [ ] Implement additional lazy loading (CoDirector, ExportDialog)
- [ ] Optimize context providers with memoization
- [ ] Defer non-critical initialization to useEffect
- [ ] Measure and document results

#### 5. IndexedDB Test Mocking
**Effort**: 2-4 hours  
**Location**: `hooks/__tests__/useSceneStore.test.ts`

```typescript
// TODO: These tests require proper IndexedDB mocking in the test environment
// TODO: These tests also require proper IndexedDB mocking
// TODO: Fix useSceneStore hook to use stable selectors
```

---

### 🟢 P3: Low Priority / Nice to Have

#### 6. Documentation Screenshot Updates
**Effort**: 1 hour  
**File**: `Documentation/Guides/WORKFLOW_LOADING_GUIDE.md`

- [ ] Add screenshots of Settings modal with import button
- [ ] Add screenshots of file picker dialog
- [ ] Add screenshots of success toast notifications
- [ ] Add screenshots of profile status badges

#### 7. Workflow Import Enhancements
**Effort**: 2-4 hours  

- [ ] Add import preview with diff view before applying
- [ ] Auto-detect `localGenSettings.json` in project root
- [ ] Add export current profiles to file feature

#### 8. CI Artifact Validation
**Effort**: 2 hours  

- [ ] Extend CI workflow to download and validate `comfyui-e2e-logs` artifact
- [ ] Document manual review steps for reviewers

---

## 📊 Skipped/Deferred Test Analysis

### Unit Tests
| Test File | Skipped | Reason |
|-----------|---------|--------|
| `PreflightCheck.test.tsx` | 1 | Mock limitation (intentional) |
| **Total** | 1 | |

### E2E Tests (Playwright)
| Category | Count | Reason |
|----------|-------|--------|
| Environment-gated | ~50 | Require LM Studio/ComfyUI |
| Dynamic skips | ~25 | Depend on scene count |
| Feature incomplete | ~4 | WAN full journey, raw workflow import |
| **Total** | ~79 | |

### Key Skipped E2E Tests
1. `wan-full-journey.spec.ts` - Full WAN pipeline test
2. `user-testing-fixes.spec.ts` - Scene-dependent UI tests
3. `ui-state-generation.spec.ts` - Progress indicator tests

---

## 📁 TODOs in Codebase

### Active TODOs (Code)
| Location | Description |
|----------|-------------|
| `tests/e2e/full-pipeline.spec.ts:134` | Refactor to use mocked LLM responses |
| `tests/e2e/comfyui-integration.spec.ts:406-407` | Route mocking not triggering |
| `hooks/__tests__/useSceneStore.test.ts:222-230` | IndexedDB mocking needed |
| `scripts/baseline_metrics_capture.ipynb` | 3 TODOs for style/character services |

### Historical TODOs (Documentation - can be ignored)
- `SESSION_COMPLETION_NOTE_20251112.md` - 9 telemetry TODOs (from old session)
- `SESSION_BASELINE_20251120.md` - 25 tracked tasks (old list)

---

## 🎯 Recommended Execution Order

### Week 1 (Immediate)
1. **Full Workflow Test** (P1) - Validate UI end-to-end
2. **comfyUIService.ts cleanup** - Fix 30 `any` types

### Week 2
3. **migrations.ts cleanup** - Fix 14 `any` types
4. **LocalGenerationSettingsModal.tsx cleanup** - Fix 8 `any` types

### Week 3
5. **E2E environment stabilization** - Add service detection
6. **Performance optimization** - Lazy loading improvements

### Week 4
7. **IndexedDB test mocking** - Enable useSceneStore tests
8. **Documentation updates** - Screenshots and guides

---

## 📝 Test Infrastructure Created (This Session)

### `tests/fixtures/service-mocks.ts`
Ready-to-use mock utilities for:
- `setupLLMRoutes(page)` - Mock LLM API responses
- `setupComfyUIRoutes(page)` - Mock ComfyUI endpoints
- `mockStoryBibleResponse` - Sample story bible JSON
- `mockLLMSuccessResponse(text)` - LLM response wrapper
- `mockComfyUISystemStats` - System stats response

---

## 🔄 Environment Requirements

### For Full E2E Testing
1. **LM Studio**: `http://192.168.50.192:1234` with `mistralai/mistral-7b-instruct-v0.3`
2. **ComfyUI**: `http://127.0.0.1:8188` with WAN workflows
3. **Workflow Profiles**: Import via Settings → ComfyUI Settings → Import from File

### For Unit Testing Only
```powershell
npm test -- --run  # No external dependencies
```

### For Build Validation
```powershell
npm run build      # No external dependencies
```
