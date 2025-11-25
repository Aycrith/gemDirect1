# LLM Communication Optimization Plan

**Last Updated**: 2025-11-22  
**Status**: 📋 Planning Phase  
**Owner**: AI Agent

---

## Executive Summary

This document outlines a comprehensive optimization plan for the LLM communication layer in gemDirect1. The system currently exhibits inefficient context passing, redundant data transmission, and a critical blocking bug in the scene generation workflow. This plan addresses all identified issues with actionable solutions.

---

## Problem Statement

### Current Issues

#### 1. **Excessive Context Passing to LLMs**
**Severity**: High  
**Impact**: Increased token costs, slower response times, potential quota exhaustion

**Problem Details**:
- When users enhance Story Bible fields (Logline, Setting), the system passes the **entire** story context (all sections) to the LLM
- Each field refinement request includes:
  - Full `plotOutline` (potentially 500+ words)
  - Complete `characters` section (100-300 words)
  - Entire `setting` description (100-200 words)
  - Original field content
- **Example**: Enhancing a 140-character Logline sends 800+ words of irrelevant context

**Root Cause**:
- `StoryBibleEditor.tsx` handlers (`handleEnhanceField`, `handleSuggestField`) pass entire `editableBible` object to service layer
- `geminiService.ts` `refineStoryBibleSection` receives full `storyContext` parameter and includes all fields in prompt construction

#### 2. **Non-Targeted Section Refinement**
**Severity**: Medium  
**Impact**: Poor LLM output quality, repetitive content across sections

**Problem Details**:
- LLM prompts lack explicit instructions to **extract only relevant elements** from user's story idea
- Current behavior:
  - Logline often repeats the full story idea verbatim
  - Characters section duplicates plot elements
  - Setting includes character descriptions
  - Plot Outline mirrors the Logline
- **Example from user**: "Logline, Characters, Setting, and Plot Outline all contained identical or near-identical summaries, resulting in bloated, repetitive Story Bible data."

**Root Cause**:
- `generateStoryBible` prompt in `geminiService.ts` (line 208) lacks explicit anti-repetition guidance
- Prompt instructs to "analyze the user's idea" but doesn't emphasize **progressive, complementary content** per section
- No validation logic to detect and reject repetitive output

#### 3. **Blocking Bug: Scene Generation Button Unresponsive**
**Severity**: Critical  
**Impact**: Complete workflow blockage at Director's Vision stage

**Problem Details**:
- User clicks "Set Vision and Generate Scenes" button in `DirectorsVisionForm`
- **Expected**: Scene list appears with titles/summaries
- **Actual**: Page scrolls to top, no UI change, no error message, infinite loop state
- User cannot progress beyond Director's Vision stage

**Root Cause** (Suspected):
- Asynchronous chain in `handleGenerateScenes` (hooks.ts:217-247) fails silently
- Potential issues:
  1. Missing `await` or improper error handling in `planActions.generateSceneList`
  2. `setWorkflowStage('director')` not triggering UI update
  3. Race condition between `setScenes` and workflow stage transition
  4. Silent exception in scene generation logic

---

## Technical Analysis

### Current Architecture

```
User Input → Component (StoryBibleEditor/DirectorsVisionForm)
           ↓
         useProjectData Hook (App.tsx)
           ↓
         planActions (PlanExpansionStrategyContext)
           ↓
         geminiService/localStoryService
           ↓
         Google Gemini API / LM Studio
```

### Data Flow for Story Bible Generation

1. **Initial Generation** (`StoryIdeaForm` → `generateStoryBible`):
   - Input: User's story idea (1-3 sentences), genre
   - Output: Complete StoryBible object (4 sections)
   - **Issue**: Prompt doesn't enforce section uniqueness

2. **Section Refinement** (`StoryBibleEditor` → `refineStoryBibleSection`):
   - Input: Section name, current content, **full storyContext object**
   - Output: Refined markdown text
   - **Issue**: Passes 800+ words of context for refining a 50-word field

3. **Field Enhancement** (`StoryBibleEditor` → `handleEnhanceField`):
   - Input: Field name, current value, **entire editableBible**
   - Output: Enhanced text
   - **Issue**: Custom context prompt but still includes full bible in closure

### Data Flow for Scene Generation

1. **Director's Vision Submission** (`DirectorsVisionForm` → `handleGenerateScenes`):
   - Input: Director's vision string, Story Bible
   - Expected: Scene list array with titles/summaries
   - **Issue**: Workflow stage doesn't update, scenes don't render

2. **Scene List Generation** (`hooks.ts` → `planActions.generateSceneList`):
   - Input: Plot outline, Director's vision
   - Output: Array of `{ title, summary }` objects
   - **Issue**: Unclear if this completes successfully

---

## Optimization Strategy

### Phase 1: Context Minimization (Token Reduction)

#### 1.1 Story Bible Section Isolation

**Goal**: Reduce context passed to LLM by 60-80% for section refinement operations

**Implementation**:

**A. Create Specialized Context Pruning Functions** (`geminiService.ts`)

```typescript
/**
 * Extracts minimal context for enhancing a Logline.
 * Context: Only character names + genre hint (50 words max)
 */
export const getPrunedContextForLogline = (
  storyBible: StoryBible
): string => {
  const characters = storyBible.characters
    .split('\n')
    .filter(line => line.includes('**'))
    .map(line => line.match(/\*\*(.*?)\*\*/)?.[1])
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  
  return `Characters: ${characters}. Setting: ${storyBible.setting.slice(0, 100)}...`;
};

/**
 * Extracts minimal context for enhancing Setting.
 * Context: Logline + character roles (75 words max)
 */
export const getPrunedContextForSetting = (
  storyBible: StoryBible
): string => {
  return `Story: ${storyBible.logline}. Key themes: ${extractThemes(storyBible.plotOutline)}`;
};
```

**B. Update Refinement Handlers** (`StoryBibleEditor.tsx`)

```typescript
// Before (passes 800+ words):
const enhanced = await planActions.refineStoryBibleSection(
  'characters',
  contextPrompt,
  { logline: editableBible.logline }, // Still passes full object
  onApiLog,
  onApiStateChange
);

// After (passes 50-75 words):
const prunedContext = field === 'logline'
  ? getPrunedContextForLogline(editableBible)
  : getPrunedContextForSetting(editableBible);

const enhanced = await planActions.refineFieldWithContext(
  field,
  currentContent,
  prunedContext, // Only essential context
  onApiLog,
  onApiStateChange
);
```

**C. Refactor `refineStoryBibleSection` Signature**

```typescript
// New signature with explicit context string instead of full object
export const refineStoryBibleSection = async (
  section: 'characters' | 'plotOutline',
  content: string,
  prunedContext: string, // Changed from storyContext: StoryBible
  logApiCall: ApiLogCallback,
  onStateChange?: ApiStateChangeCallback
): Promise<string> => {
  const prompt = `${instruction}

**Minimal Context:**
${prunedContext}

**Content to Refine:**
---
${content}
---`;
  // ...rest of implementation
};
```

#### 1.2 Story Bible Generation Prompt Enhancement

**Goal**: Eliminate repetitive content across Story Bible sections

**Implementation**:

**A. Enhanced Prompt with Anti-Repetition Rules** (`geminiService.ts:generateStoryBible`)

```typescript
const prompt = `You are a master storyteller and screenwriter. Your task is to analyze a user's idea and generate a "Story Bible" using the most fitting narrative framework.

**CRITICAL RULES FOR SECTION UNIQUENESS:**
1. **Logline**: Extract ONLY the core concept, protagonist goal, and conflict. Max 140 characters. DO NOT repeat the full story idea.
2. **Characters**: Focus ONLY on roles, motivations, and relationships. DO NOT include plot events or setting descriptions.
3. **Setting**: Describe ONLY the world, time period, and atmosphere. DO NOT mention character names or plot points.
4. **Plot Outline**: Structure the narrative beats. DO NOT rehash the logline or character descriptions.

Each section must contain NEW, complementary information that builds on previous sections WITHOUT repetition.

**User Idea:** "${idea}"
${templateGuidance}

**Your Task:**
Analyze the idea and extract TARGETED elements for each section:
- Logline: The story's essence in ONE compelling sentence
- Characters: 2-3 key players with DISTINCT roles and motivations
- Setting: The world's visual/atmospheric identity
- Plot Outline: The narrative arc divided into THREE acts

**Example of GOOD section differentiation:**
Logline: "A retired detective is forced back for one last case that exposes his darkest secret."
Characters: 
- **Detective Marlowe**: Haunted by a past mistake, seeks redemption through justice.
- **The Architect**: A cunning mastermind who knows Marlowe's secret.
Setting: "Rain-soaked neo-noir metropolis, 2049. Neon lights reflect off puddles..."
Plot: Act I - The reluctant return... [NEW story beats NOT in logline]

**Example of BAD repetition (AVOID THIS):**
Logline: "A retired detective is forced back for one last case..."
Characters: "The detective is forced back for a case..." ❌ REPETITION
Setting: "In a city where a detective is forced back..." ❌ REPETITION
`;
```

**B. Post-Processing Validation**

```typescript
// Add validation logic after LLM response
const validateStoryBible = (bible: StoryBible): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];
  
  // Check for verbatim repetition
  const loglineWords = new Set(bible.logline.toLowerCase().split(' '));
  const charWords = bible.characters.toLowerCase().split(' ');
  const matchCount = charWords.filter(w => loglineWords.has(w)).length;
  
  if (matchCount > bible.logline.split(' ').length * 0.6) {
    issues.push('Characters section repeats 60%+ of Logline');
  }
  
  // Check section lengths (Setting should be substantial)
  if (bible.setting.length < 100) {
    issues.push('Setting section too brief (< 100 chars)');
  }
  
  return { valid: issues.length === 0, issues };
};

// In generateStoryBible:
const result = JSON.parse(text.trim()) as StoryBible;
const validation = validateStoryBible(result);

if (!validation.valid) {
  console.warn('[Story Bible Validation]', validation.issues);
  // Option 1: Retry with stricter prompt
  // Option 2: Return with warning to user
}
```

### Phase 2: Fix Scene Generation Blocker

#### 2.1 Debug Scene Generation Flow

**Goal**: Identify and fix the infinite loop/unresponsive state

**Implementation Steps**:

**A. Add Comprehensive Logging** (`hooks.ts:handleGenerateScenes`)

```typescript
const handleGenerateScenes = useCallback(async (
  vision: string,
  addToast: (message: string, type: ToastMessage['type']) => void,
  setGeneratedImages: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  updateSceneStatus?: (sceneId: string, status: SceneGenerationStatus, progress?: number, error?: string) => void
) => {
  console.log('[handleGenerateScenes] START - Vision:', vision.slice(0, 50));
  console.log('[handleGenerateScenes] Story Bible:', storyBible ? 'Present' : 'MISSING');
  
  if (!storyBible) {
    console.error('[handleGenerateScenes] ABORT - No story bible');
    return;
  }

  setIsLoading(true);
  setDirectorsVision(vision);
  
  try {
    console.log('[handleGenerateScenes] Calling generateSceneList...');
    const sceneList = await planActions.generateSceneList(
      storyBible.plotOutline,
      vision,
      logApiCall,
      updateApiStatus
    );
    console.log('[handleGenerateScenes] Scene list received:', sceneList.length, 'scenes');
    
    const newScenes: Scene[] = sceneList.map((s, idx) => {
      const scene = {
        id: `scene_${Date.now()}_${Math.random()}`,
        title: s.title,
        summary: s.summary,
        timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
      };
      console.log(`[handleGenerateScenes] Created scene ${idx + 1}:`, scene.title);
      return scene;
    });
    
    console.log('[handleGenerateScenes] Calling setScenes with', newScenes.length, 'scenes');
    setScenes(newScenes);
    
    console.log('[handleGenerateScenes] Calling setWorkflowStage("director")');
    setWorkflowStage('director');
    
    console.log('[handleGenerateScenes] Marking scenes as complete');
    newScenes.forEach(s => {
      updateSceneStatus?.(s.id, 'complete', 100);
    });
    
    console.log('[handleGenerateScenes] Showing success toast');
    addToast(`${newScenes.length} scenes generated! Review and refine them, then generate images when ready.`, 'success');
    
    console.log('[handleGenerateScenes] SUCCESS - Complete');
  } catch (e) {
    console.error('[handleGenerateScenes] ERROR:', e);
    console.error('[handleGenerateScenes] Error stack:', (e as Error).stack);
    addToast((e instanceof Error ? e.message : 'Failed to generate scenes.'), 'error');
  } finally {
    console.log('[handleGenerateScenes] FINALLY - Resetting loading state');
    setIsLoading(false);
    setGenerationProgress({ current: 0, total: 0, task: '' });
  }
}, [storyBible, logApiCall, updateApiStatus, setGenerationProgress, planActions]);
```

**B. Add Error Boundary** (`App.tsx`)

```typescript
// Wrap DirectorsVisionForm in error boundary
<ErrorBoundary
  FallbackComponent={({ error }) => (
    <div className="p-4 bg-red-900/20 border border-red-500 rounded-md">
      <h3 className="text-red-400 font-semibold">Scene Generation Error</h3>
      <p className="text-sm text-gray-300">{error.message}</p>
      <button
        onClick={() => setWorkflowStage('vision')}
        className="mt-2 px-4 py-2 bg-red-600 text-white rounded"
      >
        Return to Director's Vision
      </button>
    </div>
  )}
  onError={(error) => console.error('[Scene Generation Error Boundary]', error)}
>
  <DirectorsVisionForm
    onSubmit={(vision) => handleGenerateScenes(vision, addToast, setGeneratedImages, updateSceneStatus)}
    isLoading={isProjectLoading}
    storyBible={storyBible!}
    onApiStateChange={updateApiStatus}
    onApiLog={logApiCall}
  />
</ErrorBoundary>
```

**C. Validate Workflow Stage Transition** (`hooks.ts`)

```typescript
// Add useEffect to debug stage changes
useEffect(() => {
  console.log('[useProjectData] Workflow stage changed:', workflowStage);
  console.log('[useProjectData] Current scenes count:', scenes.length);
  console.log('[useProjectData] Story Bible present:', !!storyBible);
  console.log('[useProjectData] Directors Vision length:', directorsVision.length);
}, [workflowStage, scenes.length, storyBible, directorsVision]);

// Add validation in sync effect (line 178-192)
useEffect(() => {
  if (isLoading) {
    console.log('[useProjectData Sync] Skipping - still loading');
    return;
  }
  
  let expectedStage: WorkflowStage = 'idea';
  if (storyBible) {
    expectedStage = 'bible';
    if (directorsVision) {
      expectedStage = 'vision';
      if (scenes.length > 0) {
        expectedStage = 'director';
      }
    }
  }
  
  console.log('[useProjectData Sync] Expected stage:', expectedStage, 'Current:', workflowStage);
  
  if (workflowStage !== expectedStage) {
    console.log('[useProjectData Sync] Stage mismatch - updating to', expectedStage);
    setWorkflowStage(expectedStage);
  }
}, [isLoading, storyBible, directorsVision, scenes.length, workflowStage, setWorkflowStage]);
```

#### 2.2 Add Progressive Feedback

**Goal**: Show user progress during scene generation to prevent perceived freeze

**Implementation**:

```typescript
// In handleGenerateScenes (hooks.ts)
try {
  updateApiStatus({ status: 'loading', message: 'Analyzing your Director\'s Vision...' });
  await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for UX
  
  updateApiStatus({ status: 'loading', message: 'Generating scene list from plot outline...' });
  const sceneList = await planActions.generateSceneList(
    storyBible.plotOutline,
    vision,
    logApiCall,
    updateApiStatus
  );
  
  updateApiStatus({ status: 'loading', message: `Creating ${sceneList.length} scenes...` });
  setGenerationProgress({ current: 0, total: sceneList.length, task: 'Creating scenes' });
  
  const newScenes: Scene[] = sceneList.map((s, idx) => {
    setGenerationProgress({ current: idx + 1, total: sceneList.length, task: `Scene: ${s.title}` });
    return {
      id: `scene_${Date.now()}_${Math.random()}`,
      title: s.title,
      summary: s.summary,
      timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
    };
  });
  
  updateApiStatus({ status: 'success', message: 'Scenes ready for review!' });
  // ... rest of logic
}
```

### Phase 3: Validation & Testing

**⚠️ COMPREHENSIVE TEST IMPACT ANALYSIS AVAILABLE**

See **`Documentation/Architecture/LLM_OPTIMIZATION_TEST_IMPACT.md`** for complete testing strategy including:
- **5 new test files** to create (~1,000 lines)
- **4 existing test files** to update (~200 lines)
- **CI/CD workflow** for automated validation
- **Test execution strategy** by implementation phase
- **Success metrics** and validation criteria
- **Regression prevention** strategy

This section provides implementation examples - refer to Test Impact document for full specifications.

#### 3.1 Unit Tests

**File**: `services/geminiService.test.ts`

```typescript
describe('Story Bible Context Optimization', () => {
  it('should generate unique content per section', async () => {
    const bible = await generateStoryBible('A detective story', 'noir');
    
    // Check no verbatim repetition
    expect(bible.characters).not.toContain(bible.logline);
    expect(bible.setting).not.toContain(bible.logline);
    
    // Check content diversity
    const loglineWords = new Set(bible.logline.toLowerCase().split(' '));
    const charWords = bible.characters.toLowerCase().split(' ');
    const matchCount = charWords.filter(w => loglineWords.has(w)).length;
    
    expect(matchCount).toBeLessThan(loglineWords.size * 0.4); // < 40% overlap
  });
  
  it('should reduce context tokens by >60% for field enhancement', async () => {
    const bible: StoryBible = {
      logline: 'A detective investigates a mystery.',
      characters: 'Detective Noir: Hardboiled investigator...',
      setting: 'Rain-soaked city streets at night...',
      plotOutline: 'Act I: ...\n\nAct II: ...\n\nAct III: ...' // 500 words
    };
    
    // Full context approach (OLD)
    const fullContext = JSON.stringify(bible);
    const fullTokens = fullContext.split(' ').length; // ~600
    
    // Pruned context approach (NEW)
    const prunedContext = getPrunedContextForLogline(bible);
    const prunedTokens = prunedContext.split(' ').length; // ~50
    
    const reduction = ((fullTokens - prunedTokens) / fullTokens) * 100;
    expect(reduction).toBeGreaterThan(60); // >60% reduction
  });
});
```

#### 3.2 E2E Tests

**File**: `tests/e2e/story-bible-optimization.spec.ts`

```typescript
test('Story Bible workflow with optimized context', async ({ page }) => {
  // 1. Generate Story Bible
  await page.goto('http://localhost:3000');
  await page.fill('[aria-label="Story idea"]', 'A space explorer discovers an alien artifact');
  await page.selectOption('[aria-label="Genre"]', 'sci-fi');
  await page.click('button:has-text("Generate Story Bible")');
  
  await page.waitForSelector('text=Your Story Bible', { timeout: 30000 });
  
  // 2. Verify section uniqueness
  const logline = await page.locator('[aria-label="Logline"] textarea').inputValue();
  const characters = await page.locator('[aria-label="Characters"] textarea').inputValue();
  const setting = await page.locator('[aria-label="Setting"] textarea').inputValue();
  
  // Check for repetition (logline shouldn't appear verbatim in other sections)
  expect(characters).not.toContain(logline);
  expect(setting).not.toContain(logline);
  
  // 3. Enhance Logline (should use minimal context)
  await page.click('button:has-text("Enhance"):near([aria-label="Logline"])');
  await page.waitForSelector('button:has-text("Enhance"):not([disabled])', { timeout: 15000 });
  
  const enhancedLogline = await page.locator('[aria-label="Logline"] textarea').inputValue();
  expect(enhancedLogline).not.toBe(logline); // Should be different
  expect(enhancedLogline.length).toBeLessThanOrEqual(140); // Respect character limit
  
  // 4. Save and proceed to Director's Vision
  await page.click('button:has-text("Save Changes")');
  await page.click('button:has-text("Set Vision & Generate Scenes")');
  
  // 5. Enter Director's Vision and generate scenes
  await page.fill('[aria-label="Director\'s Vision"]', 'Gritty, Blade Runner-inspired sci-fi aesthetic');
  await page.click('button:has-text("Generate Scenes with this Vision")');
  
  // 6. Verify scene list appears (NOT infinite loop)
  await page.waitForSelector('.scene-navigator', { timeout: 30000 });
  const sceneCount = await page.locator('.scene-card').count();
  expect(sceneCount).toBeGreaterThan(0);
  
  // 7. Verify workflow transitioned to 'director' stage
  const directorStage = await page.locator('.workflow-tracker [data-stage="director"]');
  await expect(directorStage).toHaveClass(/active/);
});
```

---

## Implementation Roadmap

### Sprint 1: Context Minimization (Week 1)
- [x] Audit current LLM communication patterns
- [ ] Implement `getPrunedContextForLogline` and `getPrunedContextForSetting`
- [ ] Refactor `refineStoryBibleSection` signature
- [ ] Update `StoryBibleEditor` handlers to use pruned context
- [ ] Add validation logic for Story Bible generation
- [ ] Write unit tests for context pruning

**Success Metrics**:
- Token reduction: 60-80% for field enhancement operations
- No functional regressions in Story Bible generation

### Sprint 2: Fix Scene Generation Blocker (Week 1)
- [ ] Add comprehensive logging to `handleGenerateScenes`
- [ ] Add error boundary around `DirectorsVisionForm`
- [ ] Debug workflow stage transition logic
- [ ] Implement progressive feedback for scene generation
- [ ] Add recovery mechanism (reset to 'vision' stage on error)
- [ ] Write E2E test for full workflow

**Success Metrics**:
- "Set Vision and Generate Scenes" button works 100% of the time
- Clear error messages if generation fails
- Smooth workflow transition from 'vision' to 'director'

### Sprint 3: Story Bible Quality (Week 2)
- [ ] Enhance `generateStoryBible` prompt with anti-repetition rules
- [ ] Implement post-processing validation
- [ ] Add retry logic for repetitive output
- [ ] Create documentation for LLM communication patterns
- [ ] Update PROJECT_STATUS with optimization details

**Success Metrics**:
- Story Bible sections contain <30% overlapping content
- User reports improved content quality
- Documentation complete and accurate

---

## Monitoring & Validation

### Token Usage Tracking

```typescript
// Add to UsageContext
interface TokenMetrics {
  totalTokens: number;
  byOperation: Record<string, number>;
  reductionPercentage: number;
}

const calculateReduction = (before: number, after: number) => 
  ((before - after) / before) * 100;

// Track before/after for each operation
const trackTokenUsage = (operation: string, tokens: number) => {
  const baseline = BASELINE_TOKENS[operation]; // Historical average
  const reduction = calculateReduction(baseline, tokens);
  
  console.log(`[Token Tracking] ${operation}: ${tokens} tokens (${reduction.toFixed(1)}% reduction)`);
};
```

### Quality Metrics

```typescript
// Add to story bible generation flow
interface QualityMetrics {
  sectionUniqueness: number; // 0-100
  contentDensity: number; // words per section
  repetitionScore: number; // 0-100 (lower is better)
}

const calculateQuality = (bible: StoryBible): QualityMetrics => {
  // Implementation details...
};
```

---

## Success Criteria

### Phase 1: Context Minimization
- ✅ 60-80% reduction in tokens for Story Bible field enhancement
- ✅ No increase in error rate or response time
- ✅ All existing tests pass
- ✅ New unit tests validate context pruning

### Phase 2: Scene Generation Fix
- ✅ "Set Vision and Generate Scenes" button successfully transitions to scene list 100% of the time
- ✅ Clear progress indicators during generation
- ✅ Graceful error handling with recovery options
- ✅ E2E test validates full workflow

### Phase 3: Content Quality
- ✅ Story Bible sections contain <30% overlapping content
- ✅ Each section serves a distinct narrative purpose
- ✅ Validation logic catches and reports repetitive output
- ✅ Documentation updated with new patterns

---

## Risk Analysis

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing Gemini API calls | Medium | High | Comprehensive unit tests, gradual rollout |
| Context pruning loses critical info | Low | Medium | Validation tests, user feedback loop |
| Scene generation fix introduces new bugs | Low | High | E2E tests, error boundary, logging |
| Token reduction not significant | Low | Low | Benchmark before/after, adjust thresholds |

### User Impact Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Story Bible quality degrades | Low | High | Quality metrics, A/B testing, rollback plan |
| Scene generation still fails in edge cases | Medium | High | Error recovery, clear user messaging |
| Workflow confusion during transition | Low | Medium | Progressive feedback, loading states |

---

## Appendix

### A. Current Token Usage Baseline

| Operation | Avg Tokens | Context Size (words) |
|-----------|------------|---------------------|
| `generateStoryBible` | 1,200 | 800 (user idea + template) |
| `refineStoryBibleSection` (characters) | 950 | 600 (full bible) |
| `refineStoryBibleSection` (plotOutline) | 1,100 | 700 (full bible) |
| `handleEnhanceField` (logline) | 800 | 550 (full bible + prompt) |
| `handleEnhanceField` (setting) | 850 | 580 (full bible + prompt) |

**Total per Story Bible creation flow**: ~4,900 tokens

### B. Target Token Usage (Post-Optimization)

| Operation | Target Tokens | Reduction | Context Size (words) |
|-----------|---------------|-----------|---------------------|
| `generateStoryBible` | 1,200 | 0% | 800 (unchanged) |
| `refineStoryBibleSection` (characters) | 380 | 60% | 200 (pruned) |
| `refineStoryBibleSection` (plotOutline) | 440 | 60% | 250 (pruned) |
| `handleEnhanceField` (logline) | 280 | 65% | 150 (pruned) |
| `handleEnhanceField` (setting) | 310 | 64% | 180 (pruned) |

**Total per Story Bible creation flow**: ~2,610 tokens (**47% reduction**)

---

## Related Documents

- `Documentation/PROJECT_STATUS_CONSOLIDATED.md` - Project status tracker
- `Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md` - System architecture
- `Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md` - Testing protocols
- `AGENT_HANDOFF_TEST_IMPROVEMENTS_20251122.md` - Latest handoff document

---

**End of LLM Optimization Plan**
