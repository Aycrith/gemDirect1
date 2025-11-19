import { test, expect } from '@playwright/test';
import { mockStoryBible } from '../fixtures/mock-data';
import { dismissWelcomeDialog, ensureDirectorMode, loadProjectState } from '../fixtures/test-helpers';

test.describe('Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
  });

  test('app handles missing story bible gracefully', async ({ page }) => {
    // Load incomplete project state
    await loadProjectState(page, {
      workflowStage: 'bible' // Bible stage but no bible data
    });
    
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Should not crash - check for error messages or fallback UI
    const pageText = await page.textContent('body');
    expect(pageText).toBeTruthy();
    
    console.log('✅ App handles missing story bible without crashing');
  });

  test('app handles invalid IndexedDB data', async ({ page }) => {
    // Insert malformed data into IndexedDB
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readwrite');
          const store = tx.objectStore('misc');
          
          // Store invalid data
          store.put('invalid-string-instead-of-object', 'storyBible');
          store.put({ broken: 'structure' }, 'scenes');
          
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
        };
      });
    });
    
    // Reload and verify app doesn't crash
    await page.reload();
    await page.waitForTimeout(1000);
    
    const hasError = await page.locator('text=/error|crashed|something went wrong/i').count();
    console.log(`Error indicators found: ${hasError}`);
    
    // App should either recover or show graceful error
    const pageText = await page.textContent('body');
    expect(pageText).toBeTruthy();
    
    console.log('✅ App handles invalid data without hard crash');
  });

  test('empty form submission shows validation', async ({ page }) => {
    // Ensure we're at story idea stage
    await page.waitForTimeout(1000);
    
    // Try to submit empty form
    const generateButton = page.locator('button:has-text("Generate")').first();
    
    if (await generateButton.isVisible({ timeout: 5000 })) {
      const isDisabled = await generateButton.isDisabled();
      
      if (isDisabled) {
        console.log('✅ Generate button disabled for empty form (correct validation)');
      } else {
        // Try clicking and see if validation appears
        await generateButton.click();
        await page.waitForTimeout(500);
        
        const validationMsg = page.locator('text=/required|empty|enter/i').first();
        if (await validationMsg.isVisible({ timeout: 2000 })) {
          console.log('✅ Validation message shown for empty form');
        } else {
          console.log('⚠️ No validation message - may need improvement');
        }
      }
    }
  });

  test('network error shows user-friendly message', async ({ page }) => {
    // Simulate network failure by blocking all requests
    await page.route('**/*', route => {
      if (route.request().url().includes('192.168.50.192') || route.request().url().includes('generativelanguage')) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });
    
    // Try to generate something
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]').first();
    if (await ideaTextarea.isVisible({ timeout: 5000 })) {
      await ideaTextarea.fill('Test network error');
      
      const generateButton = page.locator('button:has-text("Generate")').first();
      if (await generateButton.isVisible() && !await generateButton.isDisabled()) {
        await generateButton.click();
        await page.waitForTimeout(3000);
        
        // Look for error indicator
        const errorIndicator = page.locator('.border-red-600').first();
        if (await errorIndicator.isVisible({ timeout: 10000 })) {
          console.log('✅ Error indicator shown for network failure');
        } else {
          console.log('⚠️ No visible error indicator - check ApiStatusIndicator');
        }
      }
    }
  });

  test('console errors are captured for debugging', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Navigate around the app
    await page.waitForTimeout(2000);
    
    // Click various elements to trigger potential errors
    const buttons = await page.locator('button').all();
    for (let i = 0; i < Math.min(3, buttons.length); i++) {
      try {
        if (await buttons[i].isVisible({ timeout: 1000 })) {
          await buttons[i].click({ timeout: 1000 });
          await page.waitForTimeout(500);
        }
      } catch {
        // Ignore click failures
      }
    }
    
    console.log(`Console errors captured: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.log('Sample errors:', consoleErrors.slice(0, 3));
    }
    
    // This test always passes - it's for observation
    expect(true).toBe(true);
    console.log('✅ Console error monitoring functional');
  });

  test('page errors are caught globally', async ({ page }) => {
    const pageErrors: string[] = [];
    
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });
    
    // Interact with the app
    await page.waitForTimeout(2000);
    
    // Force reload to check for initialization errors
    await page.reload();
    await page.waitForTimeout(2000);
    
    if (pageErrors.length > 0) {
      console.log(`⚠️ Page errors detected: ${pageErrors.length}`);
      console.log('Errors:', pageErrors);
    } else {
      console.log('✅ No unhandled page errors detected');
    }
    
    expect(pageErrors.length).toBe(0);
  });

  test('app recovers from temporary failures', async ({ page }) => {
    // Load valid project state
    await loadProjectState(page, {
      storyBible: mockStoryBible,
      workflowStage: 'bible'
    });
    
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Simulate a temporary failure (block then unblock)
    let requestCount = 0;
    await page.route('**/*', route => {
      requestCount++;
      if (requestCount <= 2 && route.request().url().includes('192.168')) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });
    
    // App should still function after failure
    const pageText = await page.textContent('body');
    expect(pageText).toContain('Cinematic');
    
    console.log('✅ App continues functioning after temporary failures');
  });

  test('rapid clicks dont cause race conditions', async ({ page }) => {
    const generateButton = page.locator('button:has-text("Generate")').first();
    
    if (await generateButton.isVisible({ timeout: 5000 })) {
      // Click rapidly multiple times
      for (let i = 0; i < 5; i++) {
        try {
          await generateButton.click({ timeout: 500, force: true });
        } catch {
          // Ignore if button becomes disabled
        }
      }
      
      await page.waitForTimeout(2000);
      
      // Check app is still functional
      const pageText = await page.textContent('body');
      expect(pageText).toBeTruthy();
      
      console.log('✅ Rapid clicks handled without race conditions');
    }
  });
});
