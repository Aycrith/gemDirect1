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

const dbPromise = openDB<MyDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore(STORY_BIBLE_STORE);
    const sceneStore = db.createObjectStore(SCENES_STORE, { keyPath: 'id' });
    sceneStore.createIndex('by-order', 'order');
    db.createObjectStore(MISC_STORE);
  },
});

// Story Bible
export const saveStoryBible = async (bible: StoryBible) => (await dbPromise).put(STORY_BIBLE_STORE, bible, 'current');
export const getStoryBible = async () => (await dbPromise).get(STORY_BIBLE_STORE, 'current');

// Scenes
export const saveScenes = async (scenes: Scene[]) => {
    const tx = (await dbPromise).transaction(SCENES_STORE, 'readwrite');
    await Promise.all([
        ...scenes.map((scene, index) => tx.store.put({ ...scene, order: index })),
        tx.done
    ]);
};
export const getAllScenes = async () => (await dbPromise).getAllFromIndex(SCENES_STORE, 'by-order');

// Misc Data (Director's Vision, Generated Images/Prompts)
export const saveData = async (key: string, data: any) => (await dbPromise).put(MISC_STORE, data, key);
export const getData = async (key: string) => (await dbPromise).get(MISC_STORE, key);


// Clear All Data
export const clearProjectData = async () => {
    const db = await dbPromise;
    await Promise.all([
        db.clear(STORY_BIBLE_STORE),
        db.clear(SCENES_STORE),
        db.clear(MISC_STORE)
    ]);
};