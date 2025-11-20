import { Page } from '@playwright/test';

/**
 * Helper function to dismiss welcome dialog
 * Should be called at the start of most tests
 */
export async function dismissWelcomeDialog(page: Page) {
  try {
    // Wait a moment for dialog to appear
    await page.waitForTimeout(1000);
    
    const welcomeDialog = page.locator('[role="dialog"][aria-labelledby*="welcome"]');
    if (await welcomeDialog.isVisible({ timeout: 2000 })) {
      console.log('Welcome dialog detected, attempting to dismiss...');
      
      // Try pressing Escape key first
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      
      // If still visible, try clicking button
      if (await welcomeDialog.isVisible({ timeout: 1000 })) {
        const dialogButtons = welcomeDialog.locator('button');
        const buttonCount = await dialogButtons.count();
        
        if (buttonCount > 0) {
          // Try clicking each button until dialog dismisses
          for (let i = 0; i < buttonCount; i++) {
            try {
              await dialogButtons.nth(i).click({ force: true, timeout: 2000 });
              await page.waitForTimeout(500);
              
              // Check if dialog is gone
              if (!await welcomeDialog.isVisible({ timeout: 1000 })) {
                console.log(`Dialog dismissed by clicking button ${i}`);
                break;
              }
            } catch (e) {
              // Try next button
            }
          }
        }
      }
    }
  } catch (e) {
    // Dialog not present or already dismissed
    console.log('No welcome dialog to dismiss or already dismissed');
  }
}

/**
 * Helper to ensure we're in Director Mode
 */
export async function ensureDirectorMode(page: Page) {
  const directorButton = page.locator('[data-testid="mode-director"]');
  try {
    if (await directorButton.isVisible({ timeout: 3000 })) {
      // Check if button is not already active (has bg-amber class)
      const classes = await directorButton.getAttribute('class');
      if (!classes?.includes('bg-amber')) {
        await directorButton.click({ force: true });
        await page.waitForTimeout(500);
      }
    }
  } catch (e) {
    // Button not found or already in director mode
  }
}

/**
 * Helper to ensure we're in Quick Generate Mode
 */
export async function ensureQuickMode(page: Page) {
  const quickButton = page.locator('[data-testid="mode-quick"]');
  try {
    if (await quickButton.isVisible({ timeout: 3000 })) {
      const classes = await quickButton.getAttribute('class');
      if (!classes?.includes('bg-amber')) {
        await quickButton.click({ force: true });
        await page.waitForTimeout(500);
      }
    }
  } catch (e) {
    // Button not found or already in quick mode
  }
}

/**
 * Helper to load project state into IndexedDB
 * Enhanced version that properly hydrates state for component mounting
 */
export async function loadProjectState(page: Page, state: any) {
  await page.evaluate((projectState) => {
    return new Promise((resolve) => {
      const request = indexedDB.open('cinematic-story-db', 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as any).result;
        if (!db.objectStoreNames.contains('misc')) {
          db.createObjectStore('misc');
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('misc', 'readwrite');
        const store = tx.objectStore('misc');
        
        // Store each piece of state
        if (projectState.storyBible) {
          store.put(projectState.storyBible, 'storyBible');
        }
        if (projectState.directorsVision) {
          store.put(projectState.directorsVision, 'directorsVision');
        }
        if (projectState.scenes) {
          store.put(projectState.scenes, 'scenes');
        }
        if (projectState.workflowStage) {
          store.put(projectState.workflowStage, 'workflowStage');
        }
        if (projectState.generatedImages) {
          store.put(projectState.generatedImages, 'generatedImages');
        }
        if (projectState.localGenStatus) {
          store.put(projectState.localGenStatus, 'localGenStatus');
        }
        
        tx.oncomplete = () => {
          db.close();
          console.log('[Test Helper] IndexedDB state loaded successfully');
          resolve(true);
        };
      };
    });
  }, state);
}

/**
 * Wait for React components to mount and render scene/timeline data
 * This is necessary after page.reload() when state is hydrated from IndexedDB
 */
export async function waitForSceneComponentsToLoad(page: Page, options?: { timeout?: number }) {
  const timeout = options?.timeout || 5000;
  
  // Wait for scene navigator or timeline editor to appear
  try {
    await page.waitForFunction(
      () => {
        // Check if scenes have loaded in the DOM
        const sceneRows = document.querySelectorAll('[data-testid="scene-row"]');
        const shotRows = document.querySelectorAll('[data-testid="shot-row"]');
        return sceneRows.length > 0 || shotRows.length > 0;
      },
      { timeout }
    );
    console.log('[Test Helper] Scene components loaded successfully');
    return true;
  } catch (error) {
    console.log('[Test Helper] Timeout waiting for scene components - components may not have mounted');
    return false;
  }
}

/**
 * Wait for specific IndexedDB key to exist with data
 * More reliable than arbitrary timeouts for state hydration
 */
export async function waitForStateHydration(page: Page, key: string, options?: { timeout?: number }): Promise<boolean> {
  const timeout = options?.timeout || 10000;
  
  try {
    await page.waitForFunction(
      (storageKey) => {
        return new Promise<boolean>((resolve) => {
          const request = indexedDB.open('cinematic-story-db', 1);
          request.onsuccess = (event) => {
            const db = (event.target as any).result;
            if (!db.objectStoreNames.contains('misc')) {
              resolve(false);
              return;
            }
            
            const transaction = db.transaction(['misc'], 'readonly');
            const store = transaction.objectStore('misc');
            const getRequest = store.get(storageKey);
            
            getRequest.onsuccess = () => {
              const value = getRequest.result;
              db.close();
              resolve(value !== undefined && value !== null);
            };
            getRequest.onerror = () => {
              db.close();
              resolve(false);
            };
          };
          request.onerror = () => resolve(false);
        });
      },
      key,
      { timeout, polling: 500 }
    );
    console.log(`[Test Helper] ✅ State hydration confirmed for key: ${key}`);
    return true;
  } catch (error) {
    console.log(`[Test Helper] ⚠️ State hydration timeout for key: ${key}`);
    return false;
  }
}

/**
 * Wait for component to render with specific data-testid
 * Useful for ensuring lazy-loaded components have mounted
 */
export async function waitForComponentMount(page: Page, testId: string, options?: { timeout?: number }): Promise<boolean> {
  const timeout = options?.timeout || 5000;
  
  try {
    await page.waitForSelector(`[data-testid="${testId}"]`, {
      state: 'visible',
      timeout
    });
    console.log(`[Test Helper] ✅ Component mounted: ${testId}`);
    return true;
  } catch (error) {
    console.log(`[Test Helper] ⚠️ Component mount timeout: ${testId}`);
    return false;
  }
}

/**
 * Combined helper: Load state, reload page, wait for hydration and component mount
 * This is the recommended pattern for fixture-based tests
 */
export async function loadStateAndWaitForHydration(
  page: Page, 
  state: any, 
  options?: { 
    expectedKeys?: string[],
    expectedComponent?: string,
    timeout?: number 
  }
): Promise<boolean> {
  // Load state into IndexedDB
  await loadProjectState(page, state);
  
  // Reload to trigger React hydration
  await page.reload();
  
  // Wait for state hydration
  const keys = options?.expectedKeys || ['storyBible', 'scenes'];
  for (const key of keys) {
    const hydrated = await waitForStateHydration(page, key, { timeout: options?.timeout });
    if (!hydrated) {
      console.log(`[Test Helper] ⚠️ Failed to hydrate key: ${key}`);
      return false;
    }
  }
  
  // Wait for component mount if specified
  if (options?.expectedComponent) {
    const mounted = await waitForComponentMount(page, options.expectedComponent, { timeout: options?.timeout });
    if (!mounted) {
      console.log(`[Test Helper] ⚠️ Failed to mount component: ${options.expectedComponent}`);
      return false;
    }
  }
  
  // Additional wait for React rendering
  await page.waitForTimeout(1000);
  
  console.log('[Test Helper] ✅ State hydration and component mount complete');
  return true;
}

/**
 * Helper to clear all project data from IndexedDB
 */
export async function clearProjectData(page: Page) {
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const deleteRequest = indexedDB.deleteDatabase('cinematic-story-db');
      deleteRequest.onsuccess = () => resolve(true);
      deleteRequest.onerror = () => resolve(false);
    });
  });
}
