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
        
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
      };
    });
  }, state);
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
