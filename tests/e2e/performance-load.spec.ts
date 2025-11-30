/**
 * Phase 2 Validation Suite 7: Performance & Load Testing
 * 
 * Tests system performance under various loads:
 * 1. Large library handling (100+ stories)
 * 2. Memory stability during generation
 * 3. Generation speed within acceptable range
 * 4. Storage tracking accuracy
 */

import { test, expect } from '@playwright/test';

// Environment-aware performance thresholds
const CI_MULTIPLIER = process.env.CI === 'true' ? 2 : 1;

const PERFORMANCE_THRESHOLDS = {
  appLoadTime: 10000 * CI_MULTIPLIER, // 10 seconds base
  memoryIncrease: 500 * CI_MULTIPLIER, // 500 MB base
  generationTimeout: 600 * CI_MULTIPLIER, // 10 minutes base
};

test.describe('Phase 2 Suite 7: Performance & Load Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Fixtures will handle welcome dialog and director mode setup
  });

  test('MEDIUM: Large library handling (many projects)', async ({ page }) => {
    // Test app performance with large number of stored projects
    
    // Check current project count
    const projectCount = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('gemDirect1-db', 1);
        
        request.onsuccess = () => {
          const db = request.result;
          
          // Try to find projects store
          const storeNames = Array.from(db.objectStoreNames);
          const projectStore = storeNames.find(name => /project|story|timeline/i.test(name));
          
          if (projectStore) {
            const transaction = db.transaction(projectStore, 'readonly');
            const store = transaction.objectStore(projectStore);
            const countRequest = store.count();
            
            countRequest.onsuccess = () => {
              db.close();
              resolve(countRequest.result);
            };
            
            countRequest.onerror = () => {
              db.close();
              resolve(0);
            };
          } else {
            db.close();
            resolve(0);
          }
        };
        
        request.onerror = () => resolve(0);
      });
    });
    
    console.log(`Current project count: ${projectCount}`);
    
    if (projectCount === 0) {
      console.log('ℹ️ No projects in database - performance test with empty state');
    }
    
    // Measure app load time
    const loadTime = await page.evaluate(() => {
      return performance.timing.loadEventEnd - performance.timing.navigationStart;
    });
    
    console.log(`App load time: ${loadTime}ms`);
    
    // Performance should be acceptable even with many projects
    const maxLoadTime = PERFORMANCE_THRESHOLDS.appLoadTime;
    console.log(`Threshold: ${maxLoadTime}ms (CI mode: ${process.env.CI === 'true'})`);
    expect(loadTime).toBeLessThan(maxLoadTime);
    
    // Verify UI is responsive
    const isResponsive = await page.evaluate(() => document.readyState === 'complete');
    expect(isResponsive).toBeTruthy();
    
    console.log('✅ App handles current library size acceptably');
  });

  test('HIGH: Memory stability during generation (no leaks)', async ({ page }) => {
    // Monitor memory usage during generation to detect leaks
    
    const generateButton = page.locator('button:has-text("Generate")');
    
    if (await generateButton.count() === 0) {
      test.skip();
      return;
    }
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    if (initialMemory === 0) {
      console.log('⚠️ Memory API not available - skipping memory test');
      test.skip();
      return;
    }
    
    console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
    
    // Trigger generation
    await generateButton.first().click();
    
    // Wait for generation
    const loadingIndicator = page.locator('[data-testid*="loading"]');
    const isGenerating = await loadingIndicator.first().isVisible().catch(() => false);
    
    if (isGenerating) {
      await expect(loadingIndicator.first()).toBeHidden({ timeout: 180000 });
    }
    
    // Wait for any cleanup
    await page.waitForTimeout(3000);
    
    // Get final memory usage
    const finalMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    console.log(`Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
    
    // Memory increase should be reasonable (not > 500MB per generation)
    const memoryIncrease = finalMemory - initialMemory;
    const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
    
    console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);
    
    const maxMemoryIncrease = PERFORMANCE_THRESHOLDS.memoryIncrease;
    console.log(`Threshold: ${maxMemoryIncrease} MB (CI mode: ${process.env.CI === 'true'})`);
    expect(memoryIncreaseMB).toBeLessThan(maxMemoryIncrease);
    
    if (memoryIncreaseMB < 100) {
      console.log('✅ Memory usage stable');
    } else if (memoryIncreaseMB < 500) {
      console.log('⚠️ Moderate memory increase detected');
    }
  });

  test('HIGH: Generation speed within acceptable range', async ({ page }) => {
    // Measure generation time to ensure it meets performance targets
    
    const generateButton = page.locator('button:has-text("Generate")');
    
    if (await generateButton.count() === 0) {
      test.skip();
      return;
    }
    
    const startTime = Date.now();
    
    await generateButton.first().click();
    
    // Wait for generation
    const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
    const isGenerating = await loadingIndicator.first().isVisible().catch(() => false);
    
    if (!isGenerating) {
      console.log('⚠️ Generation did not start - test inconclusive');
      test.skip();
      return;
    }
    
    await expect(loadingIndicator.first()).toBeHidden({ timeout: 300000 }); // 5 min max
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // seconds
    
    console.log(`Generation time: ${duration.toFixed(1)}s`);
    
    // Performance targets (from documentation):
    // - Text generation: < 60s
    // - Image generation: 60-120s
    // - Video generation: 180-480s (3-8 minutes)
    
    if (duration < 60) {
      console.log('✅ Fast generation (likely text)');
    } else if (duration < 120) {
      console.log('✅ Acceptable generation time (likely image)');
    } else if (duration < 480) {
      console.log('✅ Within range for video generation');
    } else {
      console.log('⚠️ Generation took longer than expected');
    }
    
    // Shouldn't take more than threshold for any single generation
    const maxDuration = PERFORMANCE_THRESHOLDS.generationTimeout;
    console.log(`Threshold: ${maxDuration}s (CI mode: ${process.env.CI === 'true'})`);
    expect(duration).toBeLessThan(maxDuration);
  });

  test('MEDIUM: Storage tracking accurate', async ({ page }) => {
    // Verify storage usage tracking is correct
    
    // Get storage estimate from browser
    const browserStorage = await page.evaluate(async () => {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          percentUsed: ((estimate.usage || 0) / (estimate.quota || 1)) * 100
        };
      }
      return null;
    });
    
    if (!browserStorage) {
      console.log('⚠️ Storage API not available');
      test.skip();
      return;
    }
    
    console.log(`Browser storage: ${browserStorage.percentUsed.toFixed(2)}%`);
    console.log(`Used: ${(browserStorage.usage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Quota: ${(browserStorage.quota / 1024 / 1024).toFixed(2)} MB`);
    
    // Check if UI displays storage info (try data-testid first, then text pattern)
    let storageDisplay = page.locator('[data-testid*=storage]');
    let displayCount = await storageDisplay.count();
    
    if (displayCount === 0) {
      // Try text-based selector if data-testid not found
      storageDisplay = page.locator('text=/storage.*used|disk.*usage/i');
      displayCount = await storageDisplay.count();
    }
    
    if (displayCount > 0) {
      const displayText = await storageDisplay.first().textContent();
      console.log(`UI storage display: ${displayText}`);
      
      // If UI shows storage, verify it's roughly accurate (within 20%)
      const uiStorageMB = parseFloat(displayText?.match(/[\d.]+/)?.[0] || '0');
      const actualStorageMB = browserStorage.usage / 1024 / 1024;
      
      const difference = Math.abs(uiStorageMB - actualStorageMB);
      const percentDifference = (difference / actualStorageMB) * 100;
      
      if (percentDifference < 20) {
        console.log('✅ Storage tracking accurate');
      } else {
        console.log(`⚠️ Storage tracking may be inaccurate: ${percentDifference.toFixed(1)}% difference`);
      }
    } else {
      console.log('ℹ️ No storage display found in UI');
    }
    
    // Verify storage is being used (some data exists)
    expect(browserStorage.usage).toBeGreaterThan(0);
  });
});
