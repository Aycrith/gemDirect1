import { describe, it, expect } from 'vitest';
import { getVisualContextForScene, getVisualContextForShot, getCharacterContextForShot } from '../visualBiblePromptHelpers';
import { VisualBible } from '../../types';

describe('visualBiblePromptHelpers', () => {
  const mockVisualBible: VisualBible = {
    characters: [
      {
        id: 'char1',
        name: 'Courier-001',
        description: 'The protagonist',
        imageRefs: ['charImg1'],
        role: 'protagonist',
        visualTraits: ['short hair', 'red jacket', 'tattoo'],
        identityTags: ['Courier-001', 'Mirror-Self']
      },
      {
        id: 'char2',
        name: 'Antagonist',
        description: 'The villain',
        imageRefs: ['charImg2'],
        role: 'antagonist',
        visualTraits: ['long coat', 'scar'],
        identityTags: ['Villain']
      }
    ],
    styleBoards: [
      {
        id: 'board1',
        title: 'Neon Noir',
        description: 'Dark city vibes',
        imageRefs: ['img1', 'img2'],
        tags: ['dark', 'urban']
      },
      {
        id: 'board2',
        title: 'Bright Fantasy',
        description: 'Magical world',
        imageRefs: ['img3'],
        tags: ['bright', 'magical']
      }
    ],
    sceneKeyframes: {
      'scene1': ['img1', 'img4']
    },
    shotReferences: {
      'shot1': ['img2']
    },
    sceneCharacters: {
      'scene1': ['char1'],
      'scene2': ['char2']
    },
    shotCharacters: {
      'shot1': ['char1']
    }
  };

  describe('getVisualContextForScene', () => {
    it('returns empty context when no visualBible', () => {
      const result = getVisualContextForScene(null, 'scene1');
      expect(result).toEqual({
        styleBoardTitles: [],
        styleBoardTags: [],
        characterNames: []
      });
    });

    it('returns empty context when no sceneId', () => {
      const result = getVisualContextForScene(mockVisualBible, '');
      expect(result).toEqual({
        styleBoardTitles: [],
        styleBoardTags: [],
        characterNames: []
      });
    });

    it('returns linked style boards for scene', () => {
      const result = getVisualContextForScene(mockVisualBible, 'scene1');
      expect(result.styleBoardTitles).toEqual(['Neon Noir']);
      expect(result.styleBoardTags).toEqual(['dark', 'urban']);
    });

    it('falls back to global boards when no links', () => {
      const result = getVisualContextForScene(mockVisualBible, 'scene2');
      expect(result.styleBoardTitles).toHaveLength(2); // first 2 global
      expect(result.styleBoardTitles).toContain('Neon Noir');
      expect(result.styleBoardTitles).toContain('Bright Fantasy');
    });
  });

  describe('getVisualContextForShot', () => {
    it('prefers shot-specific references', () => {
      const result = getVisualContextForShot(mockVisualBible, 'scene1', 'shot1');
      expect(result.styleBoardTitles).toEqual(['Neon Noir']);
      expect(result.styleBoardTags).toEqual(['dark', 'urban']);
    });

    it('falls back to scene context when no shot refs', () => {
      const result = getVisualContextForShot(mockVisualBible, 'scene1', 'shot2');
      expect(result.styleBoardTitles).toEqual(['Neon Noir']);
      expect(result.styleBoardTags).toEqual(['dark', 'urban']);
    });
  });

  describe('getCharacterContextForShot', () => {
    it('returns empty context when no visualBible', () => {
      const result = getCharacterContextForShot(null, 'scene1', 'shot1');
      expect(result).toEqual({
        characterNames: [],
        identityTags: [],
        visualTraits: []
      });
    });

    it('returns empty context when no shotId', () => {
      const result = getCharacterContextForShot(mockVisualBible, 'scene1', '');
      expect(result).toEqual({
        characterNames: [],
        identityTags: [],
        visualTraits: []
      });
    });

    it('uses shotCharacters when available', () => {
      const result = getCharacterContextForShot(mockVisualBible, 'scene1', 'shot1');
      expect(result.characterNames).toEqual(['Courier-001']);
      expect(result.identityTags).toEqual(['Courier-001']);
      expect(result.visualTraits).toEqual(['short hair', 'red jacket', 'tattoo']);
    });

    it('falls back to sceneCharacters when no shotCharacters', () => {
      const result = getCharacterContextForShot(mockVisualBible, 'scene2', 'shot2');
      expect(result.characterNames).toEqual(['Antagonist']);
      expect(result.identityTags).toEqual(['Villain']);
      expect(result.visualTraits).toEqual(['long coat', 'scar']);
    });

    it('limits to 2 characters', () => {
      const largeVB: VisualBible = {
        ...mockVisualBible,
        shotCharacters: {
          'shot3': ['char1', 'char2', 'char1'] // duplicate
        }
      };
      const result = getCharacterContextForShot(largeVB, 'scene1', 'shot3');
      expect(result.characterNames).toHaveLength(2);
      expect(result.characterNames).toContain('Courier-001');
      expect(result.characterNames).toContain('Antagonist');
    });
  });
});