# Agent Handoff: Manifests & Replay (P4.3)

**Date**: 2025-12-09
**Status**: ✅ P4.3 Completed

## Accomplishments

1.  **Manifest Persistence**:
    - Updated `utils/database.ts` to version 2.
    - Added `manifests` object store to IndexedDB.
    - Updated `services/comfyUIService.ts` to persist generation manifests automatically upon completion.

2.  **Replay Infrastructure**:
    - Created `services/manifestReplayCore.ts`: Pure functional core for parsing manifests and reconstructing settings.
    - Created `services/browserReplayService.ts`: Browser-compatible service to execute replays using `queueComfyUIPromptSafe`.

3.  **Refactoring**:
    - Extracted replay logic to be isomorphic (shared between Node/CLI and Browser).

## Technical Details

### Database Schema (v2)
```typescript
interface MyDB extends DBSchema {
  // ... existing stores ...
  manifests: {
    key: string;
    value: GenerationManifest;
    indexes: { 'by-timestamp': string };
  };
}
```

### Replay Flow
1.  **Load**: `browserReplayService.replayManifestInBrowser(manifest, settings, image)`
2.  **Plan**: `manifestReplayCore.createReplayPlan` resolves workflow profile and flags.
3.  **Build**: `manifestReplayCore.buildSettingsFromPlan` constructs `LocalGenerationSettings`.
4.  **Execute**: `videoGenerationService.queueComfyUIPromptSafe` handles the actual generation.

## Next Steps

1.  **UI Integration**:
    - Create a "History" or "Manifests" view in the UI.
    - Add a "Replay" button to generation results.
    - Use `getAllManifestsFromDB` to populate the list.

2.  **CLI Update**:
    - Update `services/manifestReplayService.ts` (Node version) to use `manifestReplayCore.ts` to avoid logic duplication.

3.  **Phase 4.4**: Proceed to Pipeline Orchestration.
