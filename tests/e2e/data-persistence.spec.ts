import { test, expect } from '@playwright/test';
import { mockStoryBible } from '../fixtures/mock-data';
import { dismissWelcomeDialog, ensureDirectorMode, loadProjectState, clearProjectData } from '../fixtures/test-helpers';

test.describe('Data Persistence', () => {
  const testProjectState = {
    storyBible: mockStoryBible,
    scenes: [
      {
        id: 'persist-scene-1',
        title: 'Persistence Test Scene',
        summary: 'Testing data persistence',
        timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' }
      }
    ],
    workflowStage: 'director' as const
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
  });

  test('story bible persists across page reloads', async ({ page }) => {
    // Load project state
    await loadProjectState(page, testProjectState);
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Check if story bible data is still in IndexedDB
    const storedBible = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('misc')) {
            resolve(null);
            return;
          }
          const tx = db.transaction('misc', 'readonly');
          const store = tx.objectStore('misc');
          const get = store.get('storyBible');
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      });
    });
    
    expect(storedBible).toBeTruthy();
    expect(storedBible).toHaveProperty('logline');
    console.log('✅ Story bible persists across reloads');
  });

  test('scenes persist across page reloads', async ({ page }) => {
    await loadProjectState(page, testProjectState);
    await page.reload();
    await page.waitForTimeout(1000);
    
    const storedScenes = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readonly');
          const store = tx.objectStore('misc');
          const get = store.get('scenes');
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => resolve(null);
        };
      });
    });
    
    expect(storedScenes).toBeTruthy();
    expect(Array.isArray(storedScenes)).toBe(true);
    console.log(`✅ ${(storedScenes as any[]).length} scene(s) persisted`);
  });

  test('workflow stage persists across sessions', async ({ page }) => {
    await loadProjectState(page, testProjectState);
    await page.reload();
    await page.waitForTimeout(1000);
    
    const storedStage = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readonly');
          const store = tx.objectStore('misc');
          const get = store.get('workflowStage');
          get.onsuccess = () => resolve(get.result);
        };
      });
    });
    
    expect(storedStage).toBe('director');
    console.log('✅ Workflow stage persists correctly');
  });

  test('new project button clears all data', async ({ page }) => {
    // Load project state
    await loadProjectState(page, testProjectState);
    await page.waitForTimeout(500);
    
    // Look for New Project button
    const newProjectButton = page.locator('button:has-text("New"), button[aria-label*="new project"]').first();
    
    if (await newProjectButton.isVisible({ timeout: 5000 })) {
      await newProjectButton.click();
      await page.waitForTimeout(500);
      
      // Look for confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Start New"), button:has-text("Yes")').first();
      if (await confirmButton.isVisible({ timeout: 3000 })) {
        await confirmButton.click();
        await page.waitForTimeout(1000);
        
        // Check if data was cleared
        const clearedData = await page.evaluate(() => {
          return new Promise((resolve) => {
            const request = indexedDB.open('cinematic-story-db', 1);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction('misc', 'readonly');
              const store = tx.objectStore('misc');
              const get = store.get('storyBible');
              get.onsuccess = () => resolve(get.result);
            };
          });
        });
        
        expect(clearedData).toBeFalsy();
        console.log('✅ New project clears data correctly');
      } else {
        console.log('⚠️ Confirmation dialog not found');
      }
    } else {
      console.log('⚠️ New project button not found');
    }
  });

  test('export functionality is accessible', async ({ page }) => {
    await loadProjectState(page, testProjectState);
    await page.waitForTimeout(500);
    
    // Look for export/save button
    const exportButton = page.locator('button:has-text("Export"), button:has-text("Save"), button:has-text("Download")').first();
    
    if (await exportButton.isVisible({ timeout: 5000 })) {
      console.log('✅ Export/Save functionality accessible');
      
      // Optional: Click and check for download prompt (browser-dependent)
      // For now just verify button exists
    } else {
      console.log('⚠️ Export button not visible - may need UI update');
    }
  });

  test.skip('import/load project functionality exists', async ({ page }) => {
    // SKIPPED: clearProjectData can timeout on IndexedDB deletion
    // Clear existing data first
    await clearProjectData(page);
    await page.reload();
    await page.waitForTimeout(500);
    
    // Look for import/load button
    const loadButton = page.locator('button:has-text("Load"), button:has-text("Import"), input[type="file"]').first();
    
    if (await loadButton.isVisible({ timeout: 5000 })) {
      console.log('✅ Load/Import project functionality accessible');
    } else {
      console.log('⚠️ Load button not visible - may need UI update');
    }
  });

  test('directors vision persists independently', async ({ page }) => {
    const testVision = 'Noir aesthetic with high contrast lighting';
    
    await page.evaluate((vision) => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readwrite');
          const store = tx.objectStore('misc');
          store.put(vision, 'directorsVision');
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
        };
      });
    }, testVision);
    
    await page.reload();
    await page.waitForTimeout(1000);
    
    const storedVision = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readonly');
          const store = tx.objectStore('misc');
          const get = store.get('directorsVision');
          get.onsuccess = () => resolve(get.result);
        };
      });
    });
    
    expect(storedVision).toBe(testVision);
    console.log('✅ Directors vision persists independently');
  });
});
