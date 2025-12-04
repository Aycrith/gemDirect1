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
                
                // Handle corrupted data - if data is the string "[object Object]", it's corrupted
                if (typeof data === 'string') {
                    if (data === '[object Object]') {
                        console.warn(`[ZustandIndexedDB] Corrupted data detected for ${fullKey}: "[object Object]" string. Returning null.`);
                        return null;
                    }
                    // Already a valid string (should be JSON), return as-is
                    log(`Retrieved string data for: ${fullKey}, size: ${data.length} chars`);
                    return data;
                }
                
                // Data is an object, need to stringify it for Zustand
                try {
                    const result = JSON.stringify(data);
                    log(`Retrieved and stringified data for: ${fullKey}, size: ${result.length} chars`);
                    return result;
                } catch (stringifyError) {
                    console.error(`[ZustandIndexedDB] Failed to stringify data for ${fullKey}:`, stringifyError);
                    return null;
                }
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
         * 
         * NOTE: Zustand persist middleware may pass either a string (JSON) or an object
         * depending on version and configuration. We handle both cases.
         */
        setItem: async (name: string, value: string | object): Promise<void> => {
            const fullKey = getFullKey(name);
            
            // DIAGNOSTIC: Log the type and value preview for debugging serialization issues
            const valueType = typeof value;
            const isString = typeof value === 'string';
            const valuePreview = isString 
                ? (value as string).substring(0, 100)
                : (value === null ? 'null' : value === undefined ? 'undefined' : `[object ${value?.constructor?.name ?? 'Unknown'}]`);
            
            log(`setItem called: ${fullKey}, type: ${valueType}, preview: ${valuePreview}`);
            
            // DIAGNOSTIC: Detect where [object Object] is coming from
            if (isString && (value as string) === '[object Object]') {
                console.error('[ZustandIndexedDB] SERIALIZATION BUG DETECTED: Received literal "[object Object]" string.');
                console.error('[ZustandIndexedDB] This means somewhere upstream called .toString() on an object instead of JSON.stringify()');
                console.error('[ZustandIndexedDB] Stack trace for debugging:');
                console.trace();
                return;
            }
            
            // Handle case where value is passed as object instead of string
            // This can happen with certain Zustand versions or configurations
            let stringValue: string;
            let parsedValue: unknown;
            
            if (typeof value === 'object' && value !== null) {
                // Value is already an object, stringify it for logging and store directly
                try {
                    stringValue = JSON.stringify(value);
                    parsedValue = value;
                    log(`Setting item (object): ${fullKey}, size: ${stringValue.length} chars`);
                } catch (stringifyError) {
                    console.error(`[ZustandIndexedDB] Failed to stringify object for ${fullKey}:`, stringifyError);
                    return;
                }
            } else if (typeof value === 'string') {
                stringValue = value;
                log(`Setting item (string): ${fullKey}, size: ${value.length} chars`);
                
                // Defensive check: Reject obviously invalid string values
                if (value === '[object Object]' || 
                    value.startsWith('[object ') || 
                    value === 'undefined' ||
                    value === 'null' ||
                    (value.length < 50 && value.includes('[object'))) {
                    console.error(`[ZustandIndexedDB] Refusing to save corrupted value for ${fullKey}: "${value.substring(0, 100)}". This indicates a serialization bug upstream.`);
                    return;
                }
                
                // Parse the JSON string
                try {
                    parsedValue = JSON.parse(value);
                } catch (parseError) {
                    console.error(`[ZustandIndexedDB] Error parsing JSON for ${fullKey}: ${parseError}. Value preview: "${value.substring(0, 200)}..."`);
                    return;
                }
            } else {
                console.error(`[ZustandIndexedDB] Unexpected value type for ${fullKey}: ${typeof value}`);
                return;
            }
            
            try {
                await saveData(fullKey, parsedValue);
                log(`Saved data for: ${fullKey}`);
                
                // Also save to localStorage as backup (always use stringValue for localStorage)
                if (opts.fallbackToLocalStorage) {
                    try {
                        localStorage.setItem(fullKey, stringValue);
                    } catch {
                        // localStorage quota exceeded, continue without backup
                    }
                }
            } catch (error) {
                console.error(`[ZustandIndexedDB] Error setting item ${fullKey}:`, error);
                
                // Try localStorage fallback
                if (opts.fallbackToLocalStorage) {
                    try {
                        localStorage.setItem(fullKey, stringValue);
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
