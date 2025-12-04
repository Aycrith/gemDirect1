# Bug Remediation Plan - 2025-11-30

## Testing Session Summary

**Method**: Playwright MCP browser testing  
**Duration**: ~5 minutes of observation  
**Result**: 3 critical P0/P1 bugs identified that prevent normal operation

---

## Bug #1: MediaGenerationProvider Infinite Loop (P0 - CRITICAL)

### Symptoms
- Console flooded with `[MediaGenerationProvider] Local ComfyUI configured - preferring local generation` (100+ per second)
- `Maximum update depth exceeded` React error appears repeatedly
- High CPU usage, UI becomes sluggish

### Evidence
```
[LOG] [MediaGenerationProvider] Local ComfyUI configured - preferring local generation
[LOG] [MediaGenerationProvider] Local ComfyUI configured - preferring local generation
... (repeated 100+ times)
[ERROR] Maximum update depth exceeded. This can happen when a component calls setState inside useEffect...
```

### Root Cause Analysis

The `fallbackProvider` useMemo in `contexts/MediaGenerationProviderContext.tsx` has this code:

```typescript
const fallbackProvider = useMemo(() => {
    // ...
    if (isComfyUIConfigured) {
        const localProvider = providers.find(provider => provider.id === 'comfyui-local');
        if (localProvider && localProvider.isAvailable) {
            console.log('[MediaGenerationProvider] Local ComfyUI configured - preferring local generation');
            return localProvider;
        }
    }
    // ...
}, [providers, localGenerationSettings]);  // <-- PROBLEM: localGenerationSettings
```

**The issue**: `localGenerationSettings` is an object from context. Even if the VALUES are the same, the **object reference changes on every render** because `useLocalGenerationSettings()` likely returns a new object each time.

### Previous Fix Attempt (FAILED)

I added `hasAutoSwitchedRef` to the useEffect, but this doesn't help because:
1. The infinite loop is caused by the useMemo, not the useEffect
2. The console.log inside useMemo fires on every recalculation
3. This causes component re-renders which trigger more useMemo recalculations

### Correct Fix

**Option A**: Move console.log outside useMemo with a ref to track if already logged:

```typescript
const fallbackProvider = useMemo(() => {
    const hasDirectWorkflow = Boolean(localGenerationSettings?.workflowJson);
    // ... calculation logic WITHOUT console.log
    return computedProvider;
}, [providers, localGenerationSettings?.comfyUIUrl, localGenerationSettings?.workflowJson, /* specific fields only */]);

// Log AFTER the useMemo, with ref to prevent spam
const hasLoggedRef = useRef(false);
useEffect(() => {
    if (fallbackProvider?.id === 'comfyui-local' && !hasLoggedRef.current) {
        hasLoggedRef.current = true;
        console.log('[MediaGenerationProvider] Local ComfyUI configured - preferring local generation');
    }
}, [fallbackProvider?.id]);
```

**Option B**: Extract individual primitive values from `localGenerationSettings`:

```typescript
// Extract stable primitives
const comfyUIUrl = localGenerationSettings?.comfyUIUrl;
const workflowJson = localGenerationSettings?.workflowJson;
const workflowProfileKeys = localGenerationSettings?.workflowProfiles 
    ? Object.keys(localGenerationSettings.workflowProfiles).join(',') 
    : '';

const fallbackProvider = useMemo(() => {
    // Use extracted values, not the whole object
}, [providers, comfyUIUrl, workflowJson, workflowProfileKeys]);
```

### Files to Change
- `contexts/MediaGenerationProviderContext.tsx` - Fix useMemo dependencies

---

## Bug #2: Toast Spam (P1)

### Symptoms
- Multiple "ComfyUI is ready" toasts stacking up
- Toast counter goes from 1 to 19+ in seconds
- UI cluttered with redundant notifications

### Evidence
```
[LOG] [Toast] Adding toast 1: ComfyUI is ready...
[LOG] [Toast] Adding toast 2: ComfyUI is ready...
...
[LOG] [Toast] Adding toast 19: ComfyUI is ready...
```

### Root Cause
ComfyUI queue polling (every 5 seconds) triggers a toast on every successful poll. There's no deduplication logic for toasts with the same message.

### Fix

Add toast deduplication by message content:

```typescript
// In App.tsx or wherever toasts are managed
const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    // Check if a toast with same message already exists
    const existingToast = toasts.find(t => t.message === message && Date.now() - t.timestamp < 5000);
    if (existingToast) {
        return; // Don't add duplicate
    }
    // Add new toast
}, [toasts]);
```

### Files to Change
- `App.tsx` or toast utility - Add deduplication logic

---

## Bug #3: Zustand IndexedDB Serialization (P0)

### Symptoms
- `[ZustandIndexedDB] Error setting item gemDirect-scene-store: SyntaxError: "[object Object]"` appears
- Data may not persist correctly

### Evidence
```
[ERROR] [ZustandIndexedDB] Error setting item gemDirect-scene-store: SyntaxError: "[object Object]" is not valid JSON
    at JSON.parse (<anonymous>)
    at Object.setItem (zustandIndexedDBStorage.ts:63:34)
```

### Root Cause
The `setItem` function receives `"[object Object]"` string instead of valid JSON. This means somewhere upstream, an object was converted to string via `.toString()` instead of `JSON.stringify()`.

### Investigation Needed

1. Check `services/sceneStateStore.ts` persist configuration
2. Check if there's a custom serializer/deserializer
3. The issue may be in the Zustand persist middleware configuration

### Potential Fix

In `services/sceneStateStore.ts`, ensure proper serialization:

```typescript
persist(
    (set, get) => ({ ... }),
    {
        name: SCENE_STORE_NAME,
        storage: createIndexedDBStorage(),
        // Ensure proper serialization
        serialize: (state) => JSON.stringify(state),
        deserialize: (str) => JSON.parse(str),
    }
)
```

### Files to Change
- `services/sceneStateStore.ts` - Check persist configuration
- `utils/zustandIndexedDBStorage.ts` - Already has defensive check, may need more

---

## Implementation Priority

1. **Bug #1 (Infinite Loop)** - MUST fix first, blocks all testing
2. **Bug #3 (Serialization)** - Fix to ensure data persistence
3. **Bug #2 (Toast Spam)** - Fix for UX improvement

## Testing Not Completed

Due to the infinite loop bug, I could not complete:
- Fresh story generation flow
- Keyframe generation
- Video generation
- Full E2E user journey

These tests should be resumed after Bug #1 is fixed.
