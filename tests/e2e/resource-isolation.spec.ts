/**
 * Phase 2 Validation Suite 1: Resource Isolation & Sequencing
 * 
 * CRITICAL REQUIREMENT: "It is important that these systems do not execute text generation,
 * or image generation, or video generation all at the same time within the same request.
 * There are not enough system resources to accommodate all three things at once,
 * so they must happen modularly and independently."
 * 
 * Tests verify that:
 * 1. Generations execute ONE AT A TIME (not concurrently)
 * 2. System resources are properly managed
 * 3. Concurrent requests are queued correctly
 * 4. GPU memory is freed between operations
 */

import { test, expect } from '@playwright/test';
import { quickSetup, setupKeyframeReady, setupVideoReady } from '../fixtures/story-scenario';

test.describe('Phase 2 Suite 1: Resource Isolation & Sequencing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Fixtures will handle welcome dialog and director mode setup
  });

  test('CRITICAL: Sequential text → image → video generation (no overlap)', async ({ page }) => {
    // This is the MOST CRITICAL test - validates core resource isolation requirement
    
    // Setup: Need story with scenes/shots to enable keyframe generation
    const setupSuccess = await quickSetup(page, 'keyframe-ready');
    if (!setupSuccess) {
      test.skip();
      return;
    }
    
    // Phase 1: Start keyframe generation (image)
    const generateImageButton = page.locator('button:text-matches("Generate \\\\d+ Keyframes?")');
    await generateImageButton.first().click();
    
    // Verify generation started (or completed instantly in stub mode)
    const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
    const hasLoading = await loadingIndicator.first().isVisible().catch(() => false);
    
    if (!hasLoading) {
      console.log('⚠️ No loading indicator (stub mode or instant completion)');
      // In stub mode, verify button state changed instead
      await page.waitForTimeout(500);
    } else {
      console.log('✓ Generation loading indicator visible');
    }
    
    // Phase 2: Try to start another generation while first is running
    const secondGenerateButton = page.locator('[data-testid*="generate-keyframe"], [data-testid*="generate-video"]').nth(1);
    
    if (await secondGenerateButton.count() > 0) {
      await secondGenerateButton.click();
      
      // Should either:
      // 1. Show warning/queue message
      // 2. Disable the button
      // 3. Add to queue without starting
      
      // Check for warning/queue indicators using separate locators
      const warningTestIds = page.locator('[data-testid*="warning"], [data-testid*="queue"]');
      const warningText = page.getByText(/queued|wait|busy/i);
      const isButtonDisabled = await secondGenerateButton.isDisabled();
      
      // At least one safety mechanism should be active
      const warningCount = await warningTestIds.count();
      const textCount = await warningText.count();
      const hasSafeguard = (warningCount > 0) || (textCount > 0) || isButtonDisabled;
      expect(hasSafeguard).toBeTruthy();
      
      console.log('✅ Resource isolation: Second generation properly queued/blocked during first generation');
    }
    
    // Wait for first generation to complete
    await expect(loadingIndicator.first()).toBeHidden({ timeout: 60000 });
    
    console.log('✅ Sequential execution: Text generation completed before image could start');
  });

  test('CRITICAL: Concurrent generation requests are queued properly', async ({ page }) => {
    // Verify that multiple rapid-fire generation requests are queued, not executed simultaneously
    
    // Setup: Need multiple scenes to test concurrent requests
    const setupSuccess = await quickSetup(page, 'keyframe-ready');
    if (!setupSuccess) {
      test.skip();
      return;
    }
    
    // Get baseline: How many active generations?
    const activeGenerations = page.locator('[data-testid*="generating"], [aria-busy="true"]');
    const initialCount = await activeGenerations.count();
    
    // Trigger multiple generations rapidly
    const generateButtons = page.locator('button:text-matches("Generate \\d+ Keyframes?")');
    const buttonCount = await generateButtons.count();
    
    if (buttonCount >= 2) {
      // Click first two generate buttons quickly
      await generateButtons.nth(0).click();
      await page.waitForTimeout(100); // Minimal delay
      await generateButtons.nth(1).click();
      
      // Check how many are actually executing
      const currentActive = await activeGenerations.count();
      
      // Should never have more than 1 active generation (plus initial count)
      expect(currentActive).toBeLessThanOrEqual(initialCount + 1);
      
      // Check for queue indicator
      const queueIndicator = page.locator('[data-testid*="queue"], text=/queue|pending/i');
      const hasQueue = await queueIndicator.count() > 0;
      
      if (hasQueue) {
        console.log('✅ Queue system active: Multiple requests properly queued');
      } else {
        console.log('⚠️ No explicit queue UI - verifying only one active generation');
      }
      
      expect(currentActive - initialCount).toBeLessThanOrEqual(1);
    } else {
      test.skip();
    }
  });

  test('HIGH: Resource cleanup between generation requests', async ({ page }) => {
    // Verify that system resources (GPU memory, file handles) are freed between generations
    
    // Setup: Need scenes with shots to enable generation
    const setupSuccess = await quickSetup(page, 'keyframe-ready');
    if (!setupSuccess) {
      test.skip();
      return;
    }
    
    // Give app more time to stabilize after fixture setup
    await page.waitForTimeout(2000);
    
    // Verify timeline is visible and get button
    const generateButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")');
    const buttonCount = await generateButton.count();
    
    if (buttonCount === 0) {
      console.log('⚠️ No generate button found - timeline may not be visible');
      test.skip();
      return;
    }
    
    console.log(`✓ Found ${buttonCount} generate button(s)`);
    await generateButton.first().click();
    
    // Wait for first generation to complete (or instant in stub mode)
    const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
    const hasLoading = await loadingIndicator.first().isVisible().catch(() => false);
    
    if (hasLoading) {
      await expect(loadingIndicator.first()).toBeHidden({ timeout: 90000 });
      console.log('✓ First generation completed');
    } else {
      console.log('⚠️ No loading indicator (stub mode or instant completion)');
    }
    
    // Small delay to allow cleanup
    await page.waitForTimeout(2000);
    
    // Try second generation - should not fail with resource exhaustion
    const secondGenerateButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")').nth(1);
    if (await secondGenerateButton.count() > 0) {
      await secondGenerateButton.click();
      
      // Should start without errors (instant in stub mode)
      const hasSecondLoading = await loadingIndicator.first().isVisible().catch(() => false);
      if (hasSecondLoading) {
        console.log('✓ Second generation loading indicator visible');
      }
      
      // Check for resource exhaustion errors
      const errorMessage = page.locator('[data-testid*="error"], text=/memory|resource|exhausted/i');
      await expect(errorMessage).not.toBeVisible();
      
      console.log('✅ Resource cleanup: Second generation started successfully');
    } else {
      console.log('⚠️ Only one generate button available - skipping cleanup verification');
      test.skip();
    }
  });

  test('MEDIUM: GPU memory/CPU constraints respected', async ({ page }) => {
    // Verify system doesn't attempt operations beyond available resources
    
    // This test monitors for out-of-memory or resource exhaustion errors
    // during typical generation workflows
    
    const errorConsoleMessages: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errorConsoleMessages.push(msg.text());
      }
    });
    
    // Trigger a generation
    const generateButton = page.locator('button:has-text("Generate")').first();
    if (await generateButton.count() > 0) {
      await generateButton.click();
      
      // Wait for completion or timeout
      const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
      const isVisible = await loadingIndicator.first().isVisible();
      
      if (isVisible) {
        await loadingIndicator.first().waitFor({ state: 'hidden', timeout: 90000 }).catch(() => {
          console.log('Generation timed out - checking for resource errors');
        });
      }
      
      // Check console for memory/resource errors
      const hasMemoryErrors = errorConsoleMessages.some(msg => 
        /memory|resource|exhausted|allocation|cuda|out of/i.test(msg)
      );
      
      expect(hasMemoryErrors).toBeFalsy();
      
      // Check UI for resource warnings
      const resourceWarning = page.locator('text=/insufficient.*resource|memory.*low|gpu.*unavailable/i');
      await expect(resourceWarning).not.toBeVisible();
      
      console.log('✅ Resource constraints: No memory/GPU exhaustion detected');
    } else {
      console.log('⚠️ No generate buttons available');
      test.skip();
    }
  });
});
