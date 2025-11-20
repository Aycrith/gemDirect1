/**
 * Test Setup Helpers
 * Provides deterministic test environment initialization per AI_AGENT_PROMPT.md
 */

import { Page } from '@playwright/test';

/**
 * Dismisses welcome modal if present
 * Uses multiple strategies to ensure reliability across test scenarios
 * Force-dismisses regardless of env flags to avoid blocking
 */
export async function dismissWelcomeModal(page: Page): Promise<void> {
  try {
    // Wait a moment for modal to render if it's going to
    await page.waitForTimeout(1000);

    // Strategy 1: Look for modal by role=dialog and force dismiss
    const modalDialog = page.locator('[role="dialog"][aria-labelledby*="welcome"]');
    const dialogVisible = await modalDialog.isVisible({ timeout: 2000 }).catch(() => false);
    
    if (dialogVisible) {
      console.log('[Test Setup] Welcome dialog detected, force-dismissing...');
      
      // Try clicking the dismiss button
      const dismissButton = page.getByTestId('btn-welcome-dismiss');
      const buttonVisible = await dismissButton.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (buttonVisible) {
        await dismissButton.click({ force: true });
        console.log('[Test Setup] Welcome dialog dismissed via button');
      } else {
        // Fallback: press Escape key to close modal
        await page.keyboard.press('Escape');
        console.log('[Test Setup] Welcome dialog dismissed via Escape');
      }
      
      // CRITICAL: Wait for dialog to actually detach from DOM (not just hide)
      await modalDialog.waitFor({ state: 'detached', timeout: 3000 }).catch(async () => {
        console.log('[!] Dialog still attached after 3s, forcing removal');
        // Last resort: physically remove from DOM
        await page.evaluate(() => {
          const dialogs = document.querySelectorAll('[role="dialog"]');
          dialogs.forEach(d => {
            if (d.getAttribute('aria-labelledby')?.includes('welcome')) {
              d.remove(); // Remove node, not just hide
            }
          });
        });
      });
      
      // Verify modal is completely gone
      const stillPresent = await modalDialog.count().then(c => c > 0).catch(() => false);
      if (stillPresent) {
        console.log('[!] Warning: Dialog still in DOM after removal');
      } else {
        console.log('[OK] Dialog confirmed removed');
      }
      
      return;
    }

    // Strategy 2: Check for any [role="dialog"] that might be blocking
    const anyDialog = page.locator('[role="dialog"]').first();
    const anyDialogVisible = await anyDialog.isVisible({ timeout: 1000 }).catch(() => false);
    
    if (anyDialogVisible) {
      console.log('[Test Setup] Generic dialog detected, attempting dismiss...');
      // Try common dismiss button patterns
      const dismissBtn = page.locator('[role="dialog"] button').filter({ 
        hasText: /get started|close|continue|dismiss/i 
      }).first();
      
      const btnVisible = await dismissBtn.isVisible({ timeout: 500 }).catch(() => false);
      if (btnVisible) {
        await dismissBtn.click({ force: true });
        await page.waitForTimeout(500);
        console.log('[Test Setup] Dialog dismissed');
      }
    }
    
    console.log('[Test Setup] No blocking modals detected');
  } catch (error) {
    console.log('[Test Setup] Modal dismissal error:', error instanceof Error ? error.message : 'unknown');
  }
}

/**
 * Waits for app to be fully hydrated and ready for interaction
 * Ensures IndexedDB loaded and React rendered
 */
export async function waitForAppReady(page: Page, timeout = 10000): Promise<void> {
  await page.waitForSelector('h1:has-text("Cinematic Story Generator")', { timeout });
  
  // Wait for IndexedDB hydration marker (if using test helpers)
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const checkReady = () => {
        const marker = document.querySelector('[data-hydration-complete]');
        if (marker || document.readyState === 'complete') {
          resolve();
        } else {
          requestAnimationFrame(checkReady);
        }
      };
      checkReady();
    });
  });
}

/**
 * Standard test initialization sequence
 * Call at beginning of each test that needs clean state
 */
export async function initializeTest(page: Page): Promise<void> {
  await page.goto('/');
  await dismissWelcomeModal(page);
  await waitForAppReady(page);
}

/**
 * Clears all test data and resets to initial state
 */
export async function resetTestData(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Clear IndexedDB
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('cinematic-story-db');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn('IndexedDB deletion blocked - may need manual cleanup');
        resolve();
      };
    });
  });
  
  // Clear localStorage
  await page.evaluate(() => localStorage.clear());
  
  // Reload page to pick up clean state
  await page.reload();
  await dismissWelcomeModal(page);
}
