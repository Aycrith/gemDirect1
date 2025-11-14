/**
 * Run History Service
 * 
 * Manages persistent storage of telemetry data across runs using IndexedDB.
 * Enables historical analysis, trend detection, and performance comparison.
 */

export interface HistoricalSceneMetrics {
  sceneId: string;
  sceneName?: string;
  duration: number;
  attempts: number;
  gpuVramFree: number;
  gpuVramUsed?: number;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  exitReason?: string;
  timestamp: number;
}

export interface HistoricalRunMetadata {
  runId: string;
  timestamp: number;
  storyId?: string;
  sceneCount: number;
  totalDuration: number;
  averageDuration: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  gpuAverageFree: number;
  gpuPeakUsage: number;
  fallbackCount: number;
  archived: boolean;
}

export interface HistoricalRun {
  runId: string;
  timestamp: number;
  storyId?: string;
  storyTitle?: string;
  scenes: HistoricalSceneMetrics[];
  metadata: HistoricalRunMetadata;
  notes?: string;
}

export interface RunComparison {
  currentRun: HistoricalRun;
  historicalRuns: HistoricalRun[];
  deltas: {
    durationDelta: number; // ms, negative = faster
    durationPercentage: number; // % change
    successRateDelta: number; // % change
    gpuPerformanceDelta: number; // % change
    trend: 'improving' | 'degrading' | 'stable';
    trendConfidence: number; // 0-100%
  };
  statistics: {
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    stdDevDuration: number;
    avgSuccessRate: number;
    avgGpuUsage: number;
  };
}

export interface RunFilterCriteria {
  dateFrom?: number;
  dateTo?: number;
  status?: 'success' | 'failed' | 'timeout' | 'skipped' | 'all';
  gpuModel?: string;
  successRateMin?: number;
  durationMax?: number;
  storyIdMatch?: string;
  archived?: boolean;
}

export interface StoredRecommendation {
  id: string;
  runId: string;
  type: 'timeout' | 'memory' | 'performance' | 'gpu' | 'retry';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestedAction?: string;
  confidence: number; // 0-100
  timestamp: number;
  dismissed: boolean;
}

/**
 * IndexedDB Schema
 * 
 * Stores:
 * - runs: Historical run data with full telemetry
 * - scenes: Per-scene metrics for quick lookup
 * - recommendations: Generated recommendations
 * - filterPresets: Saved filter configurations
 */
export class RunHistoryDatabase {
  private dbName = 'gemDirect1_telemetry';
  private version = 1;
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create runs store
        if (!db.objectStoreNames.contains('runs')) {
          const runsStore = db.createObjectStore('runs', { keyPath: 'runId' });
          runsStore.createIndex('timestamp', 'timestamp', { unique: false });
          runsStore.createIndex('storyId', 'storyId', { unique: false });
          runsStore.createIndex('successRate', 'metadata.successRate', { unique: false });
        }

        // Create scenes store
        if (!db.objectStoreNames.contains('scenes')) {
          const scenesStore = db.createObjectStore('scenes', { keyPath: ['runId', 'sceneId'] });
          scenesStore.createIndex('status', 'status', { unique: false });
          scenesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create recommendations store
        if (!db.objectStoreNames.contains('recommendations')) {
          const recsStore = db.createObjectStore('recommendations', { keyPath: 'id' });
          recsStore.createIndex('runId', 'runId', { unique: false });
          recsStore.createIndex('timestamp', 'timestamp', { unique: false });
          recsStore.createIndex('severity', 'severity', { unique: false });
        }

        // Create filter presets store
        if (!db.objectStoreNames.contains('filterPresets')) {
          db.createObjectStore('filterPresets', { keyPath: 'name' });
        }
      };
    });
  }

  async saveRun(run: HistoricalRun): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['runs', 'scenes'], 'readwrite');
      
      // Save run metadata
      const runsStore = transaction.objectStore('runs');
      const runRequest = runsStore.put(run);

      // Save scene metrics
      const scenesStore = transaction.objectStore('scenes');
      run.scenes.forEach(scene => {
        scenesStore.put({
          runId: run.runId,
          ...scene
        });
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Failed to save run: ${transaction.error}`));
    });
  }

  async getRun(runId: string): Promise<HistoricalRun | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const request = this.db!.transaction('runs').objectStore('runs').get(runId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Failed to get run: ${request.error}`));
    });
  }

  async queryRuns(criteria: RunFilterCriteria, limit = 100): Promise<HistoricalRun[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('runs', 'readonly');
      const store = transaction.objectStore('runs');
      const results: HistoricalRun[] = [];
      let count = 0;

      // Start with all runs, sorted by timestamp descending
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev');

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        
        if (!cursor || count >= limit) {
          resolve(results);
          return;
        }

        const run: HistoricalRun = cursor.value;

        // Apply filters
        if (this.matchesFilterCriteria(run, criteria)) {
          results.push(run);
          count++;
        }

        cursor.continue();
      };

      request.onerror = () => reject(new Error(`Failed to query runs: ${request.error}`));
    });
  }

  private matchesFilterCriteria(run: HistoricalRun, criteria: RunFilterCriteria): boolean {
    // Date range filter
    if (criteria.dateFrom && run.timestamp < criteria.dateFrom) return false;
    if (criteria.dateTo && run.timestamp > criteria.dateTo) return false;

    // Success rate filter
    if (criteria.successRateMin !== undefined) {
      if (run.metadata.successRate < criteria.successRateMin) return false;
    }

    // Duration filter
    if (criteria.durationMax !== undefined) {
      if (run.metadata.totalDuration > criteria.durationMax) return false;
    }

    // Story ID filter
    if (criteria.storyIdMatch && run.storyId !== criteria.storyIdMatch) return false;

    // Archived filter
    if (criteria.archived !== undefined) {
      if (run.metadata.archived !== criteria.archived) return false;
    }

    return true;
  }

  async deleteRun(runId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['runs', 'scenes', 'recommendations'], 'readwrite');
      
      // Delete run
      transaction.objectStore('runs').delete(runId);
      
      // Delete scenes for this run
      const scenesStore = transaction.objectStore('scenes');
      const scenesIndex = scenesStore.index('runId');
      const scenesRequest = scenesIndex.openCursor(IDBKeyRange.only(runId));
      scenesRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete recommendations for this run
      const recsStore = transaction.objectStore('recommendations');
      const recsIndex = recsStore.index('runId');
      const recsRequest = recsIndex.openCursor(IDBKeyRange.only(runId));
      recsRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Failed to delete run: ${transaction.error}`));
    });
  }

  async saveRecommendation(rec: StoredRecommendation): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const request = this.db!.transaction('recommendations', 'readwrite')
        .objectStore('recommendations')
        .put(rec);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to save recommendation: ${request.error}`));
    });
  }

  async getRecommendations(runId: string): Promise<StoredRecommendation[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const results: StoredRecommendation[] = [];
      const request = this.db!.transaction('recommendations')
        .objectStore('recommendations')
        .index('runId')
        .openCursor(IDBKeyRange.only(runId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(new Error(`Failed to get recommendations: ${request.error}`));
    });
  }

  async clearOldRuns(maxAgeDays: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    return new Promise((resolve, reject) => {
      const request = this.db!.transaction('runs')
        .objectStore('runs')
        .index('timestamp')
        .openCursor(IDBKeyRange.upperBound(cutoffTime));

      request.onsuccess = async (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const run: HistoricalRun = cursor.value;
          await this.deleteRun(run.runId);
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(new Error(`Failed to clear old runs: ${request.error}`));
    });
  }

  async getStatistics(): Promise<{
    totalRuns: number;
    totalScenes: number;
    avgDuration: number;
    avgSuccessRate: number;
    oldestRun: number;
    newestRun: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction('runs', 'readonly');
      const store = transaction.objectStore('runs');
      const request = store.getAll();

      request.onsuccess = () => {
        const runs: HistoricalRun[] = request.result;
        
        if (runs.length === 0) {
          resolve({
            totalRuns: 0,
            totalScenes: 0,
            avgDuration: 0,
            avgSuccessRate: 0,
            oldestRun: 0,
            newestRun: 0
          });
          return;
        }

        const totalScenes = runs.reduce((sum, r) => sum + r.scenes.length, 0);
        const avgDuration = runs.reduce((sum, r) => sum + r.metadata.totalDuration, 0) / runs.length;
        const avgSuccessRate = runs.reduce((sum, r) => sum + r.metadata.successRate, 0) / runs.length;
        const timestamps = runs.map(r => r.timestamp).sort();

        resolve({
          totalRuns: runs.length,
          totalScenes,
          avgDuration,
          avgSuccessRate,
          oldestRun: timestamps[0],
          newestRun: timestamps[timestamps.length - 1]
        });
      };

      request.onerror = () => reject(new Error(`Failed to get statistics: ${request.error}`));
    });
  }
}

// Singleton instance
let dbInstance: RunHistoryDatabase | null = null;

export async function initializeRunHistoryDB(): Promise<RunHistoryDatabase> {
  if (!dbInstance) {
    dbInstance = new RunHistoryDatabase();
    await dbInstance.initialize();
  }
  return dbInstance;
}

export function getRunHistoryDB(): RunHistoryDatabase {
  if (!dbInstance) {
    throw new Error('Run history database not initialized. Call initializeRunHistoryDB() first.');
  }
  return dbInstance;
}

export async function resetRunHistoryDB(): Promise<void> {
  dbInstance = null;
  // In a real app, you'd also delete the IndexedDB entirely
  return new Promise((resolve) => {
    const deleteRequest = indexedDB.deleteDatabase('gemDirect1_telemetry');
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => resolve(); // Ignore errors on delete
  });
}
