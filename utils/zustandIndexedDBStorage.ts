/**
 * Zustand IndexedDB Storage Adapter
 * 
 * Provides a custom storage adapter for Zustand's persist middleware
 * that uses IndexedDB for persistent storage with fallback to localStorage.
 * 
 * This leverages the existing database.ts utilities for consistent
 * storage behavior across the application.
 * 
 * @module utils/zustandIndexedDBStorage
 */

import { StateStorage } from 'zustand/middleware';
import { saveData, getData } from './database';

/**
 * Configuration options for the IndexedDB storage adapter
 */
export interface IndexedDBStorageOptions {
    /**
     * Prefix for storage keys to avoid collisions
     * @default 'zustand_'
     */
    keyPrefix?: string;
    
    /**
     * Whether to enable debug logging
     * @default false
     */
    debug?: boolean;
    
    /**
     * Fallback to localStorage when IndexedDB fails
     * @default true
     */
    fallbackToLocalStorage?: boolean;
}

const DEFAULT_OPTIONS: Required<IndexedDBStorageOptions> = {
    keyPrefix: 'zustand_',
    debug: false,
    fallbackToLocalStorage: true,
};

/**
 * Creates a Zustand-compatible storage adapter for IndexedDB.
 * 
 * Uses the existing database.ts utilities which handle:
 * - IndexedDB blocked scenarios (privacy mode, etc.)
 * - Quota exceeded errors
 * - In-memory fallback
 * - localStorage fallback for critical data
 * 
 * @param options - Configuration options
 * @returns StateStorage compatible adapter for Zustand persist middleware
 * 
 * @example
 * ```typescript
 * import { create } from 'zustand';
 * import { persist } from 'zustand/middleware';
 * import { createIndexedDBStorage } from './utils/zustandIndexedDBStorage';
 * 
 * const useStore = create(
 *   persist(
 *     (set, get) => ({ ... }),
 *     {
 *       name: 'my-store',
 *       storage: createIndexedDBStorage(),
 *     }
 *   )
 * );
 * ```
 */
export function createIndexedDBStorage(
    options: IndexedDBStorageOptions = {}
): StateStorage {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    const log = (message: string, ...args: unknown[]) => {
        if (opts.debug) {
            console.log(`[ZustandIndexedDB] ${message}`, ...args);
        }
    };
    
    const getFullKey = (name: string) => `${opts.keyPrefix}${name}`;
    
    return {
        /**
         * Get item from IndexedDB storage
         */
        getItem: async (name: string): Promise<string | null> => {
            const fullKey = getFullKey(name);
            log(`Getting item: ${fullKey}`);
            
            try {
                const data = await getData(fullKey);
                
                if (data === undefined || data === null) {
                    log(`No data found for: ${fullKey}`);
                    
                    // Try localStorage fallback if enabled
                    if (opts.fallbackToLocalStorage) {
                        try {
                            const lsData = localStorage.getItem(fullKey);
                            if (lsData) {
                                log(`Found data in localStorage fallback: ${fullKey}`);
                                return lsData;
                            }
                        } catch {
                            // localStorage also failed, return null
                        }
                    }
                    
                    return null;
                }
                
                // Data may be stored as object or string
                const result = typeof data === 'string' ? data : JSON.stringify(data);
                log(`Retrieved data for: ${fullKey}, size: ${result.length} chars`);
                return result;
            } catch (error) {
                console.error(`[ZustandIndexedDB] Error getting item ${fullKey}:`, error);
                
                // Try localStorage fallback
                if (opts.fallbackToLocalStorage) {
                    try {
                        const lsData = localStorage.getItem(fullKey);
                        if (lsData) {
                            log(`Retrieved from localStorage after IndexedDB error: ${fullKey}`);
                            return lsData;
                        }
                    } catch {
                        // All storage failed
                    }
                }
                
                return null;
            }
        },
        
        /**
         * Set item in IndexedDB storage
         */
        setItem: async (name: string, value: string): Promise<void> => {
            const fullKey = getFullKey(name);
            log(`Setting item: ${fullKey}, size: ${value.length} chars`);
            
            try {
                // Store as parsed JSON for better IndexedDB compatibility
                const parsedValue = JSON.parse(value);
                await saveData(fullKey, parsedValue);
                log(`Saved data for: ${fullKey}`);
                
                // Also save to localStorage as backup
                if (opts.fallbackToLocalStorage) {
                    try {
                        localStorage.setItem(fullKey, value);
                    } catch {
                        // localStorage quota exceeded, continue without backup
                    }
                }
            } catch (error) {
                console.error(`[ZustandIndexedDB] Error setting item ${fullKey}:`, error);
                
                // Try localStorage fallback
                if (opts.fallbackToLocalStorage) {
                    try {
                        localStorage.setItem(fullKey, value);
                        log(`Saved to localStorage after IndexedDB error: ${fullKey}`);
                    } catch (lsError) {
                        console.error(`[ZustandIndexedDB] localStorage fallback also failed for ${fullKey}:`, lsError);
                        throw error; // Re-throw original error
                    }
                }
            }
        },
        
        /**
         * Remove item from IndexedDB storage
         */
        removeItem: async (name: string): Promise<void> => {
            const fullKey = getFullKey(name);
            log(`Removing item: ${fullKey}`);
            
            try {
                // Set to undefined to remove from IndexedDB
                // (saveData doesn't have a delete method, so we save undefined)
                await saveData(fullKey, undefined);
                log(`Removed data for: ${fullKey}`);
            } catch (error) {
                console.error(`[ZustandIndexedDB] Error removing item ${fullKey}:`, error);
            }
            
            // Also remove from localStorage
            if (opts.fallbackToLocalStorage) {
                try {
                    localStorage.removeItem(fullKey);
                } catch {
                    // Ignore localStorage errors on remove
                }
            }
        },
    };
}

/**
 * Default IndexedDB storage instance with standard options
 */
export const indexedDBStorage = createIndexedDBStorage();

/**
 * Debug-enabled IndexedDB storage instance
 */
export const indexedDBStorageDebug = createIndexedDBStorage({ debug: true });
