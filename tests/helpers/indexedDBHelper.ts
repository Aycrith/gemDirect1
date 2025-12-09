/**
 * IndexedDB Test Helper (P2.5)
 * 
 * Provides utilities for managing IndexedDB in tests.
 * Works with fake-indexeddb which is auto-imported in vitest.setup.ts
 */

import { deleteDB, openDB } from 'idb';

// Known database names used by the application
const KNOWN_DB_NAMES = [
    'csg-settings',
    'csg-scenes', 
    'csg-generation-status',
    'cinematic-story-generator-db', // Main DB from database.ts
] as const;

/**
 * Clears all known test databases.
 * Call this in beforeEach to ensure test isolation.
 * 
 * @example
 * ```typescript
 * import { clearTestDatabases } from '../../tests/helpers/indexedDBHelper';
 * 
 * beforeEach(async () => {
 *     await clearTestDatabases();
 * });
 * ```
 */
export const clearTestDatabases = async (): Promise<void> => {
    const deletePromises = KNOWN_DB_NAMES.map(async (name) => {
        try {
            await deleteDB(name);
        } catch (e) {
            // Ignore errors - DB may not exist
            console.warn(`[indexedDBHelper] Failed to delete ${name}:`, e);
        }
    });
    
    await Promise.all(deletePromises);
};

/**
 * Clears a specific database by name.
 * 
 * @param name - The database name to clear
 */
export const clearDatabase = async (name: string): Promise<void> => {
    try {
        await deleteDB(name);
    } catch (e) {
        console.warn(`[indexedDBHelper] Failed to delete ${name}:`, e);
    }
};

/**
 * Seeds test data into a specific IndexedDB database.
 * Creates the database and object store if they don't exist.
 * 
 * @param dbName - Database name
 * @param storeName - Object store name  
 * @param data - Key-value pairs to insert
 * 
 * @example
 * ```typescript
 * await seedTestDatabase('csg-settings', 'settings', {
 *     'comfyui-url': 'http://localhost:8188',
 *     'theme': 'dark',
 * });
 * ```
 */
export const seedTestDatabase = async (
    dbName: string,
    storeName: string,
    data: Record<string, unknown>
): Promise<void> => {
    const db = await openDB(dbName, 1, {
        upgrade(database) {
            if (!database.objectStoreNames.contains(storeName)) {
                database.createObjectStore(storeName);
            }
        },
    });
    
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    for (const [key, value] of Object.entries(data)) {
        await store.put(value, key);
    }
    
    await tx.done;
    db.close();
};

/**
 * Reads all data from a specific object store.
 * Useful for assertions in tests.
 * 
 * @param dbName - Database name
 * @param storeName - Object store name
 * @returns All key-value pairs in the store
 */
export const readTestDatabase = async (
    dbName: string,
    storeName: string
): Promise<Record<string, unknown>> => {
    try {
        const db = await openDB(dbName, 1);
        
        if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            return {};
        }
        
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        
        const keys = await store.getAllKeys();
        const values = await store.getAll();
        
        db.close();
        
        const result: Record<string, unknown> = {};
        keys.forEach((key, index) => {
            result[String(key)] = values[index];
        });
        
        return result;
    } catch (e) {
        console.warn(`[indexedDBHelper] Failed to read ${dbName}/${storeName}:`, e);
        return {};
    }
};

/**
 * Checks if a database exists.
 * 
 * @param dbName - Database name to check
 * @returns true if database exists
 */
export const databaseExists = async (dbName: string): Promise<boolean> => {
    try {
        const databases = await indexedDB.databases();
        return databases.some(db => db.name === dbName);
    } catch {
        // indexedDB.databases() not supported, try opening
        try {
            const db = await openDB(dbName, undefined, {
                upgrade() {
                    // This callback runs if the database needs to be created
                    // If we get here, DB doesn't exist
                    throw new Error('DB does not exist');
                },
            });
            db.close();
            return true;
        } catch {
            return false;
        }
    }
};

/**
 * Creates a mock Zustand persist storage adapter that uses in-memory storage.
 * Useful for testing Zustand stores without IndexedDB.
 * 
 * @returns In-memory storage adapter compatible with Zustand persist
 */
export const createInMemoryStorage = () => {
    const storage = new Map<string, string>();
    
    return {
        getItem: (name: string): string | null => {
            return storage.get(name) ?? null;
        },
        setItem: (name: string, value: string): void => {
            storage.set(name, value);
        },
        removeItem: (name: string): void => {
            storage.delete(name);
        },
    };
};
