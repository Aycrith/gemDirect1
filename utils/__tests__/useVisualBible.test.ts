/**
 * Tests for useVisualBible hook
 * 
 * Phase 6: Visual Bible UI - Hook testing
 * Tests character sync, provenance tracking, and resync functionality
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVisualBible, VisualBibleSyncToast } from '../hooks';
import type { StoryBible, StoryBibleV2, VisualBible, VisualBibleCharacter, CharacterProfile } from '../../types';

// Mock the database module
vi.mock('../database', () => ({
  getData: vi.fn().mockResolvedValue(undefined),
  saveData: vi.fn().mockResolvedValue(undefined),
}));

// Mock syncCharacterDescriptors from promptPipeline
vi.mock('../../services/promptPipeline', () => ({
  syncCharacterDescriptors: vi.fn((storyBible, characters) => {
    // Simple mock implementation
    const descriptors = new Map<string, string>();
    const synchronized: string[] = [];
    const missing: string[] = [];
    const skippedUserEdits: string[] = [];
    
    for (const char of characters) {
      // Skip user edits
      if (char.descriptorSource === 'userEdit') {
        skippedUserEdits.push(char.name);
        continue;
      }
      
      // Check if story bible has character profiles (V2)
      if ((storyBible as StoryBibleV2).characterProfiles) {
        const profile = (storyBible as StoryBibleV2).characterProfiles?.find(
          p => p.id === char.storyBibleCharacterId || p.name.toLowerCase() === char.name.toLowerCase()
        );
        if (profile?.visualDescriptor) {
          descriptors.set(char.id, profile.visualDescriptor);
          synchronized.push(char.name);
        } else {
          missing.push(char.name);
        }
      } else {
        missing.push(char.name);
      }
    }
    
    return { descriptors, synchronized, missing, skippedUserEdits };
  }),
}));

// Mock sessionStorage
const mockSessionStorage = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => mockSessionStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockSessionStorage.set(key, value),
  removeItem: (key: string) => mockSessionStorage.delete(key),
  clear: () => mockSessionStorage.clear(),
});

// Helper to create a V2 story bible
function createV2Bible(characters: CharacterProfile[]): StoryBibleV2 {
  return {
    version: 2,
    title: 'Test Story',
    logline: 'A test story',
    genre: 'Test',
    setting: 'Test setting',
    tone: 'neutral',
    themes: ['test'],
    characterProfiles: characters,
    acts: [],
    narrativeArcs: [],
    keyPlotPoints: [],
    worldBuildingElements: [],
    symbolism: [],
    storyEngine: { type: 'basic' },
  };
}

// Helper to create visual bible characters
function createVisualCharacter(
  id: string, 
  name: string, 
  storyBibleCharacterId?: string,
  descriptorSource?: 'storyBible' | 'userEdit'
): VisualBibleCharacter {
  return {
    id,
    name,
    storyBibleCharacterId,
    descriptorSource,
    visualTraits: [],
  };
}

describe('useVisualBible', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should return empty visual bible by default', () => {
      const { result } = renderHook(() => useVisualBible());
      
      expect(result.current.visualBible).toEqual({
        characters: [],
        styleBoards: [],
      });
    });

    it('should return all expected functions', () => {
      const { result } = renderHook(() => useVisualBible());
      
      expect(result.current.setVisualBible).toBeDefined();
      expect(result.current.handleStoryBibleSave).toBeDefined();
      expect(result.current.handleResyncAll).toBeDefined();
      expect(result.current.clearSyncToast).toBeDefined();
      expect(result.current.getCharacterSyncStatus).toBeDefined();
    });

    it('should have null syncToast initially', () => {
      const { result } = renderHook(() => useVisualBible());
      
      expect(result.current.syncToast).toBeNull();
    });
  });

  describe('getCharacterSyncStatus', () => {
    it('should return unlinked for non-existent character', () => {
      const { result } = renderHook(() => useVisualBible());
      
      expect(result.current.getCharacterSyncStatus('non-existent')).toBe('unlinked');
    });

    it('should return unlinked for character without storyBibleCharacterId', () => {
      const { result } = renderHook(() => useVisualBible());
      
      act(() => {
        result.current.setVisualBible({
          characters: [createVisualCharacter('char1', 'Alice')],
          styleBoards: [],
        });
      });
      
      expect(result.current.getCharacterSyncStatus('char1')).toBe('unlinked');
    });

    it('should return storyBible for linked character with default source', () => {
      const { result } = renderHook(() => useVisualBible());
      
      act(() => {
        result.current.setVisualBible({
          characters: [createVisualCharacter('char1', 'Alice', 'profile1')],
          styleBoards: [],
        });
      });
      
      expect(result.current.getCharacterSyncStatus('char1')).toBe('storyBible');
    });

    it('should return userEdit for manually edited character', () => {
      const { result } = renderHook(() => useVisualBible());
      
      act(() => {
        result.current.setVisualBible({
          characters: [createVisualCharacter('char1', 'Alice', 'profile1', 'userEdit')],
          styleBoards: [],
        });
      });
      
      expect(result.current.getCharacterSyncStatus('char1')).toBe('userEdit');
    });
  });

  describe('handleStoryBibleSave', () => {
    it('should do nothing without story bible', () => {
      const { result } = renderHook(() => useVisualBible());
      
      act(() => {
        result.current.setVisualBible({
          characters: [createVisualCharacter('char1', 'Alice', 'profile1')],
          styleBoards: [],
        });
      });
      
      act(() => {
        result.current.handleStoryBibleSave();
      });
      
      // Should not show toast since no story bible
      expect(result.current.syncToast).toBeNull();
    });

    it('should do nothing without characters', () => {
      const storyBible = createV2Bible([
        { id: 'profile1', name: 'Alice', role: 'protagonist', visualDescriptor: 'blonde hair' },
      ]);
      
      const { result } = renderHook(() => useVisualBible(storyBible));
      
      act(() => {
        result.current.handleStoryBibleSave();
      });
      
      // Should not show toast since no characters
      expect(result.current.syncToast).toBeNull();
    });

    it('should sync characters and show toast', async () => {
      const storyBible = createV2Bible([
        { id: 'profile1', name: 'Alice', role: 'protagonist', visualDescriptor: 'blonde hair, blue eyes' },
      ]);
      
      const { result } = renderHook(() => useVisualBible(storyBible));
      
      act(() => {
        result.current.setVisualBible({
          characters: [createVisualCharacter('char1', 'Alice', 'profile1', 'storyBible')],
          styleBoards: [],
        });
      });
      
      act(() => {
        result.current.handleStoryBibleSave();
      });
      
      expect(result.current.syncToast).not.toBeNull();
      expect(result.current.syncToast?.synced).toBe(1);
      expect(result.current.syncToast?.skipped).toBe(0);
    });

    it('should skip user-edited characters', async () => {
      const storyBible = createV2Bible([
        { id: 'profile1', name: 'Alice', role: 'protagonist', visualDescriptor: 'blonde hair' },
        { id: 'profile2', name: 'Bob', role: 'supporting', visualDescriptor: 'dark hair' },
      ]);
      
      const { result } = renderHook(() => useVisualBible(storyBible));
      
      act(() => {
        result.current.setVisualBible({
          characters: [
            createVisualCharacter('char1', 'Alice', 'profile1', 'storyBible'),
            createVisualCharacter('char2', 'Bob', 'profile2', 'userEdit'), // User edited
          ],
          styleBoards: [],
        });
      });
      
      act(() => {
        result.current.handleStoryBibleSave();
      });
      
      expect(result.current.syncToast?.synced).toBe(1);
      expect(result.current.syncToast?.skipped).toBe(1);
      expect(result.current.syncToast?.showResyncAll).toBe(true);
    });
  });

  describe('handleResyncAll', () => {
    it('should reset all characters to storyBible source', async () => {
      const storyBible = createV2Bible([
        { id: 'profile1', name: 'Alice', role: 'protagonist', visualDescriptor: 'blonde hair' },
        { id: 'profile2', name: 'Bob', role: 'supporting', visualDescriptor: 'dark hair' },
      ]);
      
      const { result } = renderHook(() => useVisualBible(storyBible));
      
      act(() => {
        result.current.setVisualBible({
          characters: [
            createVisualCharacter('char1', 'Alice', 'profile1', 'userEdit'), // User edited
            createVisualCharacter('char2', 'Bob', 'profile2', 'userEdit'), // User edited
          ],
          styleBoards: [],
        });
      });
      
      act(() => {
        result.current.handleResyncAll();
      });
      
      // All should be synced
      expect(result.current.syncToast?.synced).toBe(2);
      expect(result.current.syncToast?.skipped).toBe(0);
      expect(result.current.syncToast?.showResyncAll).toBe(false);
    });
  });

  describe('clearSyncToast', () => {
    it('should clear the sync toast', async () => {
      const storyBible = createV2Bible([
        { id: 'profile1', name: 'Alice', role: 'protagonist', visualDescriptor: 'blonde hair' },
      ]);
      
      const { result } = renderHook(() => useVisualBible(storyBible));
      
      act(() => {
        result.current.setVisualBible({
          characters: [createVisualCharacter('char1', 'Alice', 'profile1', 'storyBible')],
          styleBoards: [],
        });
      });
      
      act(() => {
        result.current.handleStoryBibleSave();
      });
      
      expect(result.current.syncToast).not.toBeNull();
      
      act(() => {
        result.current.clearSyncToast();
      });
      
      expect(result.current.syncToast).toBeNull();
    });
  });
});
