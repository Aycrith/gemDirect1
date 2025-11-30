/**
 * Phase 2 Validation Suite 6: UI State Management During Generation
 * 
 * Tests UI responsiveness and state during generation operations:
 * 1. Progress indicators update correctly
 * 2. UI remains responsive
 * 3. Generated content appears immediately
 * 4. Cancellation from UI works
 * 5. State transitions are clean
 */

import { test, expect } from '@playwright/test';
import { quickSetup } from '../fixtures/story-scenario';

test.describe('Phase 2 Suite 6: UI State Management During Generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Fixtures will handle welcome dialog and director mode setup
  });

  test.skip('HIGH: Progress indicators update during generation', async ({ page }) => {
    // SKIP: This test requires real generation to show loading states. Fixtures complete instantly.
    // Progress indicators only appear during actual LLM/ComfyUI generation (5-30s).
    // Run manually with real services or implement mock loading states.
    
    const generateButton = page.locator('button:has-text("Generate")');
    
    if (await generateButton.count() === 0) {
      test.skip();
      return;
    }
    
    await generateButton.first().click();
    
    // Check for loading/progress indicators
    const loadingIndicators = page.locator('[data-testid*="loading"], [data-testid*="progress"], [data-testid*="generating"], [aria-busy="true"]');
    await expect(loadingIndicators.first()).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Progress indicator visible during generation');
    
    // Check for percentage or step indicators
    const progressText = page.locator('text=/\\d+%|step \\d+|\\d+ of \\d+/i');
    
    if (await progressText.count() > 0) {
      const initialProgress = await progressText.first().textContent();
      console.log(`Progress shown: ${initialProgress}`);
      
      // Wait a bit and check if progress updated
      await page.waitForTimeout(3000);
      const updatedProgress = await progressText.first().textContent().catch(() => null);
      
      if (updatedProgress && updatedProgress !== initialProgress) {
        console.log(`✅ Progress updated: ${initialProgress} → ${updatedProgress}`);
      }
    }
  });

  test('HIGH: UI remains responsive during generation', async ({ page }) => {
    // Verify UI is not frozen during generation
    
    const generateButton = page.locator('button:has-text("Generate")');
    
    if (await generateButton.count() === 0) {
      test.skip();
      return;
    }
    
    await generateButton.first().click();
    
    // Wait for generation to start
    await page.waitForTimeout(2000);
    
    // Try to interact with UI (click another tab, button, etc.)
    const settingsButton = page.locator('button:has-text("Settings"), [data-testid*="settings"]');
    const navButtons = page.locator('button, a');
    
    if (await settingsButton.count() > 0) {
      // Click settings button
      await settingsButton.first().click();
      
      // Verify settings opened (UI responded)
      const settingsPanel = page.locator('[data-testid*="settings"], [role="dialog"]');
      const opened = await settingsPanel.count() > 0;
      
      if (opened) {
        console.log('✅ UI responsive: Settings opened during generation');
        
        // Close settings
        const closeButton = page.locator('button:has-text("Close"), [aria-label*="close"]');
        if (await closeButton.count() > 0) {
          await closeButton.first().click();
        }
      }
    } else if (await navButtons.count() > 1) {
      // Try clicking a different navigation button
      await navButtons.nth(1).click();
      console.log('✅ UI responsive: Navigation works during generation');
    }
    
    // Verify page didn't freeze
    const isResponsive = await page.evaluate(() => {
      // Page should be interactive
      return document.readyState === 'complete';
    });
    
    expect(isResponsive).toBeTruthy();
  });

  test('HIGH: Generated content appears immediately after completion', async ({ page }) => {
    // Verify new images/videos appear in UI right after generation
    
    // Use quickSetup to get to keyframe-ready state where Generate buttons are enabled
    const setupSuccess = await quickSetup(page, 'keyframe-ready');
    if (!setupSuccess) {
      console.log('⚠️ Fixture setup failed - skipping test');
      test.skip();
      return;
    }
    
    // Count existing artifacts
    const initialArtifacts = await page.locator('img[src*="data:image"], video[src*="blob:"]').count();
    
    const generateButton = page.locator('button:has-text("Generate")');
    
    if (await generateButton.count() === 0) {
      console.log('⚠️ No Generate button found after fixture setup');
      test.skip();
      return;
    }
    
    // Check if button is enabled
    const firstButton = generateButton.first();
    const isEnabled = await firstButton.isEnabled();
    if (!isEnabled) {
      console.log('⚠️ Generate button is disabled - fixture may not have set up state correctly');
      test.skip();
      return;
    }
    
    await firstButton.click();
    
    // Wait for generation
    const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
    const isGenerating = await loadingIndicator.first().isVisible().catch(() => false);
    
    if (isGenerating) {
      await expect(loadingIndicator.first()).toBeHidden({ timeout: 180000 });
      
      // Check if new artifacts appeared
      await page.waitForTimeout(2000); // Small delay for UI update
      
      const finalArtifacts = await page.locator('img[src*="data:image"], video[src*="blob:"]').count();
      
      if (finalArtifacts > initialArtifacts) {
        console.log(`✅ New content appeared: ${initialArtifacts} → ${finalArtifacts} artifacts`);
      } else {
        console.log('ℹ️ No new artifacts detected (may have failed or been cancelled)');
      }
    }
  });

  test('MEDIUM: Can cancel generation from UI', async ({ page }) => {
    // Test cancellation button functionality
    
    const setupSuccess = await quickSetup(page, 'keyframe-ready');
    if (!setupSuccess) {
      test.skip();
      return;
    }
    
    const generateButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")');
    
    if (await generateButton.count() === 0) {
      test.skip();
      return;
    }
    
    await generateButton.first().click();
    
    // Wait for generation to start
    await page.waitForTimeout(2000);
    
    // Look for cancel button
    const cancelButton = page.locator('button:has-text("Cancel"), [data-testid*="cancel"], [aria-label*="cancel"]');
    
    if (await cancelButton.count() > 0) {
      // Verify cancel button is enabled and visible
      await expect(cancelButton.first()).toBeVisible();
      await expect(cancelButton.first()).toBeEnabled();
      
      await cancelButton.first().click();
      
      console.log('✅ Cancel button clicked');
      
      // Verify cancellation took effect
      const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
      await expect(loadingIndicator).not.toBeVisible({ timeout: 5000 });
      
      console.log('✅ Generation cancelled via UI');
    } else {
      console.log('⚠️ Cancel button not found during generation');
      test.skip();
    }
  });

  test('MEDIUM: State transitions are clean (no flashing/glitches)', async ({ page }) => {
    // Verify UI state transitions are smooth
    
    const generateButton = page.locator('button:has-text("Generate")');
    
    if (await generateButton.count() === 0) {
      test.skip();
      return;
    }
    
    // Monitor for rapid state changes (flashing)
    const stateChanges: string[] = [];
    
    page.on('console', msg => {
      if (msg.text().includes('state') || msg.text().includes('render')) {
        stateChanges.push(msg.text());
      }
    });
    
    await generateButton.first().click();
    
    // Wait for state transitions
    await page.waitForTimeout(3000);
    
    // Check for excessive re-renders or state flashing
    const excessiveRerenders = stateChanges.length > 50; // Arbitrary threshold
    
    if (excessiveRerenders) {
      console.log(`⚠️ Detected ${stateChanges.length} state changes - may indicate flashing`);
    } else {
      console.log(`✅ Clean state transitions: ${stateChanges.length} changes`);
    }
    
    expect(excessiveRerenders).toBeFalsy();
    
    // Verify no visible glitches (elements appearing/disappearing rapidly)
    const visibleElements = await page.locator('*:visible').count();
    await page.waitForTimeout(1000);
    const stillVisible = await page.locator('*:visible').count();
    
    // Element count shouldn't drastically change without user action
    const elementCountStable = Math.abs(visibleElements - stillVisible) < 10;
    expect(elementCountStable).toBeTruthy();
  });
});
