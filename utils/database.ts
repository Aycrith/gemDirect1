import { openDB, DBSchema } from 'idb';
import { StoryBible, Scene } from '../types';

const DB_NAME = 'cinematic-story-db';
const DB_VERSION = 1;
const STORY_BIBLE_STORE = 'storyBible';
const SCENES_STORE = 'scenes';
const MISC_STORE = 'misc'; // For storing vision, prompts, etc.

interface MyDB extends DBSchema {
  [STORY_BIBLE_STORE]: {
    key: 'current';
    value: StoryBible;
  };
  [SCENES_STORE]: {
    key: string;
    value: Scene;
    indexes: { 'by-order': number };
  };
  [MISC_STORE]: {
    key: string;
    value: any;
  }
}

// In-memory fallback cache when IndexedDB is blocked
const inMemoryCache = new Map<string, any>();
let dbAccessBlocked = false;
let dbBlockedWarningShown = false;

const logDbWarning = (message: string) => {
  if (!dbBlockedWarningShown) {
    console.warn(`[Database] ${message}. Using in-memory fallback. Data will not persist between sessions.`);
    dbBlockedWarningShown = true;
  }
};

// P2.6 Optimization (2025-11-20): Defer IndexedDB initialization until first use
// Instead of creating dbPromise at module load (which blocks initial render),
// use lazy initialization pattern that creates the connection on first access
let dbPromise: ReturnType<typeof openDB<MyDB>> | null = null;

const getDB = async () => {
  if (dbAccessBlocked) {
    throw new Error('DB_ACCESS_BLOCKED');
  }
  
  if (!dbPromise) {
    try {
      dbPromise = openDB<MyDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore(STORY_BIBLE_STORE);
          const sceneStore = db.createObjectStore(SCENES_STORE, { keyPath: 'id' });
          sceneStore.createIndex('by-order', 'order');
          db.createObjectStore(MISC_STORE);
        },
      });
      await dbPromise; // Test access
    } catch (error) {
      // Browser is blocking IndexedDB (privacy mode, third-party cookies disabled, etc.)
      dbAccessBlocked = true;
      logDbWarning('IndexedDB access denied by browser');
      throw new Error('DB_ACCESS_BLOCKED');
    }
  }
  return dbPromise;
};

// Story Bible
export const saveStoryBible = async (bible: StoryBible) => {
  try {
    return await (await getDB()).put(STORY_BIBLE_STORE, bible, 'current');
  } catch (error) {
    if ((error as Error).message === 'DB_ACCESS_BLOCKED') {
      inMemoryCache.set('storyBible_current', bible);
      return;
    }
    throw error;
  }
};

export const getStoryBible = async () => {
  try {
    return await (await getDB()).get(STORY_BIBLE_STORE, 'current');
  } catch (error) {
    if ((error as Error).message === 'DB_ACCESS_BLOCKED') {
      return inMemoryCache.get('storyBible_current');
    }
    throw error;
  }
};

// Scenes
export const saveScenes = async (scenes: Scene[]) => {
  try {
    const tx = (await getDB()).transaction(SCENES_STORE, 'readwrite');
    await Promise.all([
      ...scenes.map((scene, index) => tx.store.put({ ...scene, order: index })),
      tx.done
    ]);
  } catch (error) {
    if ((error as Error).message === 'DB_ACCESS_BLOCKED') {
      inMemoryCache.set('scenes_all', scenes.map((scene, index) => ({ ...scene, order: index })));
      return;
    }
    throw error;
  }
};

export const getAllScenes = async () => {
  try {
    return await (await getDB()).getAllFromIndex(SCENES_STORE, 'by-order');
  } catch (error) {
    if ((error as Error).message === 'DB_ACCESS_BLOCKED') {
      return inMemoryCache.get('scenes_all') || [];
    }
    throw error;
  }
};

// Misc Data (Director's Vision, Generated Images/Prompts)
export const saveData = async (key: string, data: any) => {
  try {
    return await (await getDB()).put(MISC_STORE, data, key);
  } catch (error) {
    const err = error as Error;
    if (err.message === 'DB_ACCESS_BLOCKED') {
      inMemoryCache.set(`misc_${key}`, data);
      // For critical settings, also try localStorage as secondary fallback
      if (key === 'localGenSettings') {
        try {
          localStorage.setItem(`gemDirect_${key}`, JSON.stringify(data));
          console.warn(`[Database] IndexedDB blocked, saved "${key}" to localStorage instead`);
        } catch (lsError) {
          console.error(`[Database] Both IndexedDB and localStorage failed for "${key}"`, lsError);
        }
      }
      return;
    }
    // Handle quota exceeded errors (common with large base64 images)
    if (err.name === 'QuotaExceededError' || err.message.includes('quota')) {
      console.error(`[Database] Storage quota exceeded for key "${key}". Data size: ${JSON.stringify(data).length} chars.`);
      inMemoryCache.set(`misc_${key}`, data);
      // For critical settings, try localStorage as fallback (it has separate quota)
      if (key === 'localGenSettings') {
        try {
          localStorage.setItem(`gemDirect_${key}`, JSON.stringify(data));
          console.warn(`[Database] Saved "${key}" to localStorage due to IndexedDB quota`);
        } catch (lsError) {
          console.error(`[Database] localStorage also exceeded quota for "${key}"`, lsError);
        }
      }
      return;
    }
    console.error(`[Database] Failed to save data for key "${key}":`, err);
    throw error;
  }
};

export const getData = async (key: string) => {
  try {
    const data = await (await getDB()).get(MISC_STORE, key);
    // If data is in IndexedDB, return it
    if (data !== undefined && data !== null) {
      return data;
    }
    // If not in IndexedDB but key is critical settings, check localStorage fallback
    if (key === 'localGenSettings') {
      try {
        const lsData = localStorage.getItem(`gemDirect_${key}`);
        if (lsData) {
          console.info(`[Database] Loaded "${key}" from localStorage fallback`);
          return JSON.parse(lsData);
        }
      } catch (lsError) {
        console.warn(`[Database] Failed to parse localStorage fallback for "${key}"`, lsError);
      }
    }
    return data;
  } catch (error) {
    if ((error as Error).message === 'DB_ACCESS_BLOCKED') {
      const memData = inMemoryCache.get(`misc_${key}`);
      if (memData) return memData;
      // Also check localStorage for critical settings
      if (key === 'localGenSettings') {
        try {
          const lsData = localStorage.getItem(`gemDirect_${key}`);
          if (lsData) {
            console.info(`[Database] Loaded "${key}" from localStorage (IndexedDB blocked)`);
            return JSON.parse(lsData);
          }
        } catch (lsError) {
          console.warn(`[Database] Failed to parse localStorage for "${key}"`, lsError);
        }
      }
      return memData;
    }
    throw error;
  }
};

// Clear All Data
export const clearProjectData = async () => {
  try {
    const db = await getDB();
    await Promise.all([
      db.clear(STORY_BIBLE_STORE),
      db.clear(SCENES_STORE),
      db.clear(MISC_STORE)
    ]);
  } catch (error) {
    if ((error as Error).message === 'DB_ACCESS_BLOCKED') {
      inMemoryCache.clear();
      return;
    }
    throw error;
  }
};