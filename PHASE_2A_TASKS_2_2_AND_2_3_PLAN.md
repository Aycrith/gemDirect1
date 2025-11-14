# Phase 2A Implementation Roadmap: Tasks 2.2 & 2.3

**Status**: Task 2.1 ✅ Complete | Tasks 2.2 & 2.3 📋 Ready to Begin  
**Estimated Duration**: 2-3 hours combined  
**Priority**: High - Completes React UI integration phase  

---

## Task 2.2: Scene Watchers (Reactive Generation Status)

### Objective
Implement reactive watchers for scene generation status with real-time progress feedback to users.

### Current State
- Scene generation happens in `handleGenerateScenes` via `planActions.generateSceneList()`
- Progress bar exists in UI but only tracks keyframe generation
- No per-scene generation status tracking

### Implementation Plan

#### 1. Add Scene Status Type (`types.ts`)
```typescript
export type SceneGenerationStatus = 'pending' | 'generating' | 'complete' | 'failed';

export interface SceneStatus {
  sceneId: string;
  title: string;
  status: SceneGenerationStatus;
  progress: number; // 0-100
  error?: string;
  startTime?: number;
  endTime?: number;
}
```

#### 2. Create Custom Hook (`utils/hooks.ts`)
```typescript
export function useSceneGenerationWatcher(scenes: Scene[]) {
  const [sceneStatuses, setSceneStatuses] = useState<Record<string, SceneStatus>>({});
  
  // Track scene generation lifecycle
  const updateSceneStatus = useCallback((sceneId: string, status: SceneGenerationStatus, progress?: number, error?: string) => {
    setSceneStatuses(prev => ({
      ...prev,
      [sceneId]: {
        ...prev[sceneId],
        status,
        progress: progress ?? prev[sceneId]?.progress ?? 0,
        error
      }
    }));
  }, []);
  
  return { sceneStatuses, updateSceneStatus };
}
```

#### 3. Integrate into Scene Generation Flow
In `useProjectData` hook, wrap scene generation with status updates:

```typescript
// Before generation
sceneStatuses.forEach(scene => updateSceneStatus(scene.id, 'pending'));

// During keyframe generation
for (let i = 0; i < newScenes.length; i++) {
  updateSceneStatus(newScenes[i].id, 'generating', (i / newScenes.length) * 100);
  // ... generate keyframe
  updateSceneStatus(newScenes[i].id, 'complete', 100);
}
```

#### 4. Create Scene Status Component (`components/SceneStatusIndicator.tsx`)
```tsx
interface SceneStatusIndicatorProps {
  status: SceneGenerationStatus;
  progress?: number;
  error?: string;
}

const SceneStatusIndicator: React.FC<SceneStatusIndicatorProps> = ({ status, progress, error }) => {
  return (
    <div className="flex items-center gap-2">
      {status === 'generating' && <Spinner />}
      {status === 'complete' && <CheckIcon />}
      {status === 'failed' && <ErrorIcon />}
      {progress !== undefined && <ProgressBar progress={progress} />}
    </div>
  );
};
```

#### 5. Update SceneNavigator Component
Display status indicators next to each scene in the navigator sidebar.

### Acceptance Criteria
- [ ] Scene status updates display in real-time during generation
- [ ] Progress bars show per-scene generation progress
- [ ] Failed scenes display error messages
- [ ] Status persists in localStorage via `usePersistentState`
- [ ] No blocking of UI during generation

---

## Task 2.3: Story-to-Scene Mapping (Template Checklist & Guidance)

### Objective
Implement bidirectional scene/story mapping with mandatory elements checklist and template guidance display.

### Current State
- Template metadata loaded but not displayed to user
- No visualization of which mandatory elements are covered by scenes
- No template guidance visible in scene editor

### Implementation Plan

#### 1. Create Template Context for UI (`contexts/TemplateContext.tsx`)
```typescript
interface TemplateContextValue {
  selectedTemplate: Template | null;
  mandatoryElements: string[];
  coveredElements: Set<string>; // Elements mentioned in generated scenes
  elementCoverage: Record<string, boolean>; // Per-element coverage map
  setSelectedTemplate: (template: Template) => void;
  updateCoveredElements: (sceneContent: string) => void;
}
```

#### 2. Create Mandatory Elements Checker
Analyze scene summaries to identify which template mandatory elements are present:

```typescript
// Extract keywords from scene content
// Match against template mandatory elements list
// Return coverage map: { "advanced tech": true, "alien contact": false, ... }
```

#### 3. Create Template Guidance Component (`components/TemplateGuidancePanel.tsx`)
```tsx
interface TemplateGuidancePanelProps {
  template: Template;
  coveredElements: Set<string>;
  onClose: () => void;
}

// Display:
// - Genre & tone
// - Visual density guidance
// - Mandatory elements checklist (with coverage status)
// - Character archetypes
// - Color palette reference
```

#### 4. Create Element Coverage Checklist (`components/MandatoryElementsChecklist.tsx`)
```tsx
interface MandatoryElementsChecklistProps {
  elements: string[];
  covered: Set<string>;
  onElementClick: (element: string) => void; // Highlight in scenes
}

// Display as collapsible list:
// ✓ Advanced technology
// ✗ Sentient AI antagonist
// ✓ Futuristic setting
```

#### 5. Update TimelineEditor Component
- Add template guidance panel toggle in scene editor
- Show mandatory elements checklist as sidebar
- Allow users to expand elements to see coverage details
- Add visual indicators (✓/✗/⚠) for coverage status

#### 6. Add Bidirectional Mapping Logic
When user modifies scene:
1. Re-analyze scene content for mandatory elements
2. Update coverage checklist in real-time
3. Suggest missing elements for next scene
4. Display coverage percentage (e.g., "75% of mandatory elements covered")

### Integration with Phase 1 Quality Validators

Leverage existing validators:
- **Coherence Check**: Verifies mandatory elements are logically integrated
- **Diversity Check**: Ensures theme variety matches template archetypes
- **Similarity Check**: Validates element descriptions match intent

```typescript
// After scene generation, run quality checks:
const coherenceReport = await runQualityChecks(scenes);
if (coherenceReport.coherence_score < 4.0) {
  suggestions.add("Consider adding more narrative cohesion");
}
```

### Acceptance Criteria
- [ ] Template guidance panel displays in scene editor
- [ ] Mandatory elements checklist shows coverage status
- [ ] Coverage updates in real-time as scenes are modified
- [ ] Users can click elements to highlight related scenes
- [ ] Coverage percentage displayed (e.g., "4/6 elements covered")
- [ ] Graceful degradation if no template selected
- [ ] No performance degradation with multiple scenes

---

## Data Flow for Tasks 2.2 & 2.3

```
Story Generation Complete
    ↓
Task 2.2: Scene Watchers Track Status
    └─ pending → generating → complete/failed
    └─ Progress: 0% → 50% → 100%
    
    ↓
Scene Content Available
    ↓
Task 2.3: Analyze for Mandatory Elements
    └─ Extract keywords from summaries
    └─ Match against template.mandatory_elements
    └─ Calculate coverage percentage
    
    ↓
Update UI
    ├─ SceneStatusIndicator (Task 2.2)
    ├─ TemplateGuidancePanel (Task 2.3)
    ├─ MandatoryElementsChecklist (Task 2.3)
    └─ TimelineEditor (integrated)
```

---

## Implementation Sequence

### Phase 2.2 First (2-3 hours)
1. Add types to `types.ts`
2. Create `useSceneGenerationWatcher` hook
3. Create `SceneStatusIndicator` component
4. Integrate into `handleGenerateScenes`
5. Test with scene generation
6. Update UI components

### Then Phase 2.3 (2-3 hours)
1. Create `TemplateContext`
2. Create element coverage analyzer
3. Create `TemplateGuidancePanel` component
4. Create `MandatoryElementsChecklist` component
5. Integrate into `TimelineEditor`
6. Add real-time updates on scene modification
7. Display coverage percentage

---

## Testing Strategy

### Unit Tests
- Element extraction logic (accuracy >90%)
- Coverage calculation (correct coverage %)
- Status update callbacks

### Integration Tests
- Scene generation workflow with status updates
- Element coverage analysis accuracy
- UI updates during generation
- Persistence of coverage data

### E2E Tests
- Full story → scenes → checklist flow
- Real-time updates during generation
- Checklist accuracy across all 3 templates

---

## Success Metrics

**Task 2.2**:
- ✓ All 4 status transitions work (pending → generating → complete/failed)
- ✓ Progress tracking accurate to within 5%
- ✓ No UI blocking during generation
- ✓ Status persists across sessions

**Task 2.3**:
- ✓ Coverage detection accuracy >85%
- ✓ All 6 mandatory elements detected when present in scenes
- ✓ UI updates within 200ms of scene modification
- ✓ Works for all 3 template genres

---

## Files to Create/Modify

### Task 2.2
| File | Type | Purpose |
|------|------|---------|
| `types.ts` | Modified | Add SceneStatus types |
| `utils/hooks.ts` | Modified | Add useSceneGenerationWatcher |
| `components/SceneStatusIndicator.tsx` | New | Status display component |
| `SceneNavigator.tsx` | Modified | Integrate status indicators |

### Task 2.3
| File | Type | Purpose |
|------|------|---------|
| `contexts/TemplateContext.tsx` | New | Template context provider |
| `components/TemplateGuidancePanel.tsx` | New | Guidance display |
| `components/MandatoryElementsChecklist.tsx` | New | Coverage checklist |
| `utils/elementCoverageAnalyzer.ts` | New | Element extraction logic |
| `TimelineEditor.tsx` | Modified | Integrate template UI |

---

## Rollout Plan

1. **Task 2.2 Implementation** (2 hours) → Test → Merge
2. **Task 2.3 Implementation** (2 hours) → Test → Merge
3. **Phase 2A Summary** → Document all changes
4. **Proceed to Phase 2B** (ComfyUI Telemetry)

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Element extraction too broad | False positives | Keyword whitelisting + minimum word distance |
| Performance with many scenes | UI lag | Debounce updates, use React.memo |
| Template context not loaded | Crashes | Graceful degradation, fallback defaults |
| Coverage calculation mismatch | User confusion | Unit tests with known good data |

---

**Next Action**: Begin Task 2.2 implementation after Task 2.1 validation completes.
