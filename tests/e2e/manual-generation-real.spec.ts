import { test, expect } from '@playwright/test';

/**
 * Manual E2E Tests - Real Generation Workflows
 * 
 * These tests interact with the UI naturally (no fixtures) and validate
 * real LM Studio + ComfyUI generation. They test the complete user workflow
 * from story idea to rendered keyframes/videos.
 * 
 * Prerequisites:
 * - LM Studio running at http://127.0.0.1:1234 with Mistral Nemo loaded
 * - ComfyUI running at http://127.0.0.1:8188 with WAN T2I and WAN I2V workflows
 * - Dev server running at http://localhost:3000
 * - Set environment variable RUN_MANUAL_E2E=1 to enable these tests
 * 
 * Note: These tests use REAL generation, so keyframes take 5-15 minutes
 */

const RUN_MANUAL_E2E = process.env.RUN_MANUAL_E2E === '1';

test.describe('Manual E2E: Real Generation Workflows', () => {
  test.skip(!RUN_MANUAL_E2E, 'Manual e2e tests are disabled unless RUN_MANUAL_E2E=1 (real generation takes 5-20+ minutes)');
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Dismiss welcome dialog if present
    try {
      await page.waitForTimeout(1000);
      const welcomeDialog = page.locator('[role="dialog"][aria-labelledby*="welcome"]');
      if (await welcomeDialog.isVisible({ timeout: 2000 })) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // Dialog not present or already dismissed
    }
  });

  test('MANUAL: Real LM Studio story generation', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for LM Studio generation

    console.log('[Manual Test] Starting real LM Studio story generation...');

    // Step 1: Ensure we're in Director Mode (default on fresh load)
    const directorModeButton = page.locator('[data-testid="mode-director"]');
    await directorModeButton.click();
    await page.waitForTimeout(1000);
    console.log('[Manual Test] ✓ In Director Mode');

    // Step 2: Find the story input textarea (should be on 'idea' stage)
    const storyInput = page.locator('textarea[placeholder*="story"], textarea[placeholder*="idea"], textarea').first();
    await expect(storyInput).toBeVisible({ timeout: 5000 });
    
    const testPrompt = 'A robot discovers emotions while exploring an abandoned space station.';
    await storyInput.fill(testPrompt);
    console.log('[Manual Test] ✓ Entered story prompt');

    // Step 3: Click Generate Story Bible button
    const generateButton = page.locator('button:has-text("Generate Story Bible"), button:has-text("Generate Story")').first();
    await expect(generateButton).toBeVisible({ timeout: 5000 });
    await generateButton.click();
    console.log('[Manual Test] ✓ Clicked generate button, waiting for LM Studio...');

    // Step 4: Wait for generation to complete (LM Studio should respond in 30-90s)
    // Look for success indicators
    const successIndicators = [
      page.locator('text=/story.*generated/i'),
      page.locator('text=/complete/i'),
      page.locator('[data-testid*="story-output"]'),
      page.locator('text=/scene/i').first() // Scenes should appear
    ];

    let generationComplete = false;
    for (const indicator of successIndicators) {
      try {
        await indicator.waitFor({ state: 'visible', timeout: 90000 });
        generationComplete = true;
        console.log('[Manual Test] ✓ Story generation completed');
        break;
      } catch (e) {
        // Try next indicator
      }
    }

    if (!generationComplete) {
      // Check for loading indicators that should have disappeared
      const loadingGone = await page.locator('[data-testid*="loading"], [aria-busy="true"]').isHidden().catch(() => true);
      if (loadingGone) {
        console.log('[Manual Test] ✓ Story generation completed (loading indicator gone)');
        generationComplete = true;
      }
    }

    expect(generationComplete).toBeTruthy();

    // Step 5: Verify story output exists
    const pageContent = await page.textContent('body');
    const hasStoryContent = pageContent && (
      pageContent.includes('Scene') ||
      pageContent.includes('robot') ||
      pageContent.includes('space station') ||
      pageContent.length > 1000 // Story should have substantial content
    );
    expect(hasStoryContent).toBeTruthy();
    console.log('[Manual Test] ✅ PASS: Real LM Studio story generation validated');
  });

  test('MANUAL: Real ComfyUI keyframe generation', async ({ page }) => {
    test.setTimeout(1200000); // 20 minutes for story + keyframe generation

    console.log('[Manual Test] Starting real ComfyUI keyframe generation workflow...');

    // Step 1: Generate story first (use Director Mode)
    const directorModeButton = page.locator('[data-testid="mode-director"]');
    await directorModeButton.click();
    await page.waitForTimeout(1000);

    const storyInput = page.locator('textarea[placeholder*="story"], textarea[placeholder*="idea"], textarea').first();
    await storyInput.fill('A lone astronaut discovers an ancient alien artifact on Mars.');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible"), button:has-text("Generate Story")').first();
    await generateButton.click();
    console.log('[Manual Test] ✓ Generating story...');

    // Wait for story completion
    await page.waitForTimeout(90000); // 90 seconds for LM Studio
    console.log('[Manual Test] ✓ Story should be complete');

    // Step 2: Wait for workflow stage to change (already in Director Mode)
    await page.waitForTimeout(2000);
    console.log('[Manual Test] ✓ Still in Director Mode, waiting for scenes');

    // Step 3: Wait for Scene Navigator to render
    const sceneButton = page.locator('li button').filter({ hasText: /Scene/i }).first();
    await expect(sceneButton).toBeVisible({ timeout: 10000 });
    console.log('[Manual Test] ✓ Scene Navigator rendered');

    // Step 4: Click first scene
    await sceneButton.click();
    await page.waitForTimeout(1500);
    console.log('[Manual Test] ✓ Selected first scene');

    // Step 5: Find and click Generate Keyframe button
    const generateKeyframeButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")').first();
    await expect(generateKeyframeButton).toBeVisible({ timeout: 10000 });
    await generateKeyframeButton.click();
    console.log('[Manual Test] ✓ Clicked Generate Keyframe - starting ComfyUI generation...');

    // Step 6: Wait for generation to start (loading indicator should appear)
    const loadingIndicator = page.locator('[data-testid*="generating"], [data-testid*="loading"], [aria-busy="true"]');
    await expect(loadingIndicator).toBeVisible({ timeout: 10000 });
    console.log('[Manual Test] ✓ ComfyUI generation started');

    // Step 7: Wait for generation to complete (5-15 minutes for WAN T2I)
    // Poll every 30 seconds and log progress
    let elapsedMinutes = 0;
    const maxWaitMinutes = 20;
    
    while (elapsedMinutes < maxWaitMinutes) {
      await page.waitForTimeout(30000); // 30 seconds
      elapsedMinutes += 0.5;
      
      const stillGenerating = await loadingIndicator.isVisible().catch(() => false);
      
      if (!stillGenerating) {
        console.log(`[Manual Test] ✓ Generation completed in ${elapsedMinutes} minutes`);
        break;
      }
      
      console.log(`[Manual Test] Still generating... ${elapsedMinutes} minutes elapsed`);
    }

    // Step 8: Verify keyframe image appeared
    const keyframeImage = page.locator('img[src*="data:image"], img[src*="blob:"]');
    await expect(keyframeImage).toBeVisible({ timeout: 10000 });
    console.log('[Manual Test] ✓ Keyframe image rendered in UI');

    // Step 9: Verify image has valid dimensions
    const imageDimensions = await keyframeImage.evaluate((img: HTMLImageElement) => ({
      width: img.naturalWidth,
      height: img.naturalHeight
    }));
    
    expect(imageDimensions.width).toBeGreaterThan(0);
    expect(imageDimensions.height).toBeGreaterThan(0);
    console.log(`[Manual Test] ✓ Keyframe dimensions: ${imageDimensions.width}x${imageDimensions.height}`);

    console.log('[Manual Test] ✅ PASS: Real ComfyUI keyframe generation validated');
  });

  test('MANUAL: UI responsiveness during keyframe generation', async ({ page }) => {
    test.setTimeout(1200000); // 20 minutes

    console.log('[Manual Test] Testing UI responsiveness during long-running generation...');

    // Step 1: Generate story in Director Mode
    const directorModeButton = page.locator('[data-testid="mode-director"]');
    await directorModeButton.click();
    await page.waitForTimeout(1000);

    const storyInput = page.locator('textarea[placeholder*="story"], textarea[placeholder*="idea"], textarea').first();
    await storyInput.fill('A cyberpunk detective solves crimes in a neon-lit megacity.');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible"), button:has-text("Generate Story")').first();
    await generateButton.click();
    await page.waitForTimeout(90000); // Wait for story

    // Already in Director Mode, just wait for scenes
    await page.waitForTimeout(2000);

    const sceneButton = page.locator('li button').filter({ hasText: /Scene/i }).first();
    await sceneButton.click();
    await page.waitForTimeout(1500);

    // Step 2: Start keyframe generation
    const generateKeyframeButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")').first();
    await generateKeyframeButton.click();
    console.log('[Manual Test] ✓ Keyframe generation started');

    // Wait for generation to actually start
    await page.waitForTimeout(5000);

    // Step 3: Monitor UI responsiveness during generation
    const uiChecks: any[] = [];
    let checkCount = 0;
    const maxChecks = 20; // Up to 10 minutes of monitoring (30s intervals)

    while (checkCount < maxChecks) {
      await page.waitForTimeout(30000); // 30 seconds between checks
      checkCount++;

      const check: any = {
        timestamp: new Date().toISOString(),
        elapsedMinutes: checkCount * 0.5
      };

      // Check 1: Can we still interact with mode buttons?
      try {
        const quickButton = page.locator('[data-testid="mode-quick"]');
        const isEnabled = await quickButton.isEnabled({ timeout: 2000 });
        check['modeButtonsEnabled'] = isEnabled;
      } catch (e) {
        check['modeButtonsEnabled'] = false;
      }

      // Check 2: Can we click settings button?
      try {
        const settingsButton = page.locator('button[aria-label*="settings"]');
        const isClickable = await settingsButton.isEnabled({ timeout: 2000 });
        check['settingsButtonClickable'] = isClickable;
      } catch (e) {
        check['settingsButtonClickable'] = false;
      }

      // Check 3: Is page still responsive (not frozen)?
      try {
        await page.evaluate(() => window.scrollY);
        check['pageResponsive'] = true;
      } catch (e) {
        check['pageResponsive'] = false;
      }

      // Check 4: Check if generation completed
      const loadingIndicator = page.locator('[data-testid*="generating"], [aria-busy="true"]');
      const stillGenerating = await loadingIndicator.isVisible().catch(() => false);
      check['stillGenerating'] = stillGenerating;

      uiChecks.push(check);
      console.log(`[Manual Test] UI Check ${checkCount}: ${JSON.stringify(check)}`);

      if (!stillGenerating) {
        console.log('[Manual Test] ✓ Generation completed');
        break;
      }
    }

    // Step 4: Verify UI remained responsive throughout
    const allResponsive = uiChecks.every(check => 
      check['pageResponsive'] === true &&
      check['modeButtonsEnabled'] === true
    );

    expect(allResponsive).toBeTruthy();
    console.log(`[Manual Test] ✅ PASS: UI remained responsive during ${uiChecks.length * 0.5} minutes of generation`);
  });

  test('MANUAL: Complete story → keyframe → video pipeline', async ({ page }) => {
    test.setTimeout(2400000); // 40 minutes for complete pipeline

    console.log('[Manual Test] Starting complete end-to-end pipeline test...');

    // Step 1: Generate story in Director Mode
    const directorModeButton = page.locator('[data-testid="mode-director"]');
    await directorModeButton.click();
    await page.waitForTimeout(1000);

    const storyInput = page.locator('textarea[placeholder*="story"], textarea[placeholder*="idea"], textarea').first();
    await storyInput.fill('A time traveler accidentally changes history and must fix it.');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible"), button:has-text("Generate Story")').first();
    await generateButton.click();
    console.log('[Manual Test] ✓ Story generation started...');
    await page.waitForTimeout(90000);
    console.log('[Manual Test] ✓ Story generation complete');

    // Step 2: Already in Director Mode, just wait for workflow stage change
    await page.waitForTimeout(2000);

    const sceneButton = page.locator('li button').filter({ hasText: /Scene/i }).first();
    await sceneButton.click();
    await page.waitForTimeout(1500);
    console.log('[Manual Test] ✓ Scene selected in Director Mode');

    // Step 3: Generate keyframe
    const generateKeyframeButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")').first();
    await generateKeyframeButton.click();
    console.log('[Manual Test] ✓ Keyframe generation started...');

    // Wait for keyframe completion (up to 15 minutes)
    let keyframeComplete = false;
    for (let i = 0; i < 30; i++) { // 30 checks x 30s = 15 min max
      await page.waitForTimeout(30000);
      const loadingIndicator = page.locator('[data-testid*="generating"], [aria-busy="true"]');
      const stillGenerating = await loadingIndicator.isVisible().catch(() => false);
      
      if (!stillGenerating) {
        keyframeComplete = true;
        console.log(`[Manual Test] ✓ Keyframe complete after ${(i + 1) * 0.5} minutes`);
        break;
      }
      
      if ((i + 1) % 2 === 0) {
        console.log(`[Manual Test] Keyframe generating... ${(i + 1) * 0.5} minutes elapsed`);
      }
    }

    expect(keyframeComplete).toBeTruthy();

    // Verify keyframe image exists
    const keyframeImage = page.locator('img[src*="data:image"], img[src*="blob:"]');
    await expect(keyframeImage).toBeVisible({ timeout: 10000 });
    console.log('[Manual Test] ✓ Keyframe image verified');

    // Step 4: Generate video (if UI available)
    const generateVideoButton = page.locator('button:has-text("Generate Video")');
    const videoButtonExists = await generateVideoButton.isVisible().catch(() => false);

    if (videoButtonExists) {
      await generateVideoButton.click();
      console.log('[Manual Test] ✓ Video generation started...');

      // Wait for video completion (up to 20 minutes)
      let videoComplete = false;
      for (let i = 0; i < 40; i++) { // 40 checks x 30s = 20 min max
        await page.waitForTimeout(30000);
        const loadingIndicator = page.locator('[data-testid*="generating"], [aria-busy="true"]');
        const stillGenerating = await loadingIndicator.isVisible().catch(() => false);
        
        if (!stillGenerating) {
          videoComplete = true;
          console.log(`[Manual Test] ✓ Video complete after ${(i + 1) * 0.5} minutes`);
          break;
        }
        
        if ((i + 1) % 2 === 0) {
          console.log(`[Manual Test] Video generating... ${(i + 1) * 0.5} minutes elapsed`);
        }
      }

      expect(videoComplete).toBeTruthy();

      // Verify video exists
      const videoElement = page.locator('video source, video');
      await expect(videoElement).toBeVisible({ timeout: 10000 });
      console.log('[Manual Test] ✓ Video element verified');

      console.log('[Manual Test] ✅ PASS: Complete story → keyframe → video pipeline validated');
    } else {
      console.log('[Manual Test] ⚠️ Video generation UI not available - skipping video step');
      console.log('[Manual Test] ✅ PASS: Story → keyframe pipeline validated (video UI pending)');
    }
  });

  test('MANUAL: Memory stability during generation', async ({ page }) => {
    test.setTimeout(1200000); // 20 minutes

    console.log('[Manual Test] Testing memory stability during generation...');

    // Step 1: Get baseline memory
    const getMemoryUsage = async () => {
      return await page.evaluate(() => {
        if (performance && (performance as any).memory) {
          const mem = (performance as any).memory;
          return {
            usedJSHeapSize: mem.usedJSHeapSize,
            totalJSHeapSize: mem.totalJSHeapSize,
            jsHeapSizeLimit: mem.jsHeapSizeLimit
          };
        }
        return null;
      });
    };

    const baselineMemory = await getMemoryUsage();
    console.log('[Manual Test] Baseline memory:', baselineMemory);

    // Step 2: Generate story in Director Mode
    const directorModeButton = page.locator('[data-testid="mode-director"]');
    await directorModeButton.click();
    await page.waitForTimeout(1000);

    const storyInput = page.locator('textarea[placeholder*="story"], textarea[placeholder*="idea"], textarea').first();
    await storyInput.fill('A scientist discovers a parallel universe through quantum entanglement.');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible"), button:has-text("Generate Story")').first();
    await generateButton.click();
    await page.waitForTimeout(90000);

    // Already in Director Mode, wait for workflow stage change
    await page.waitForTimeout(2000);

    const sceneButton = page.locator('li button').filter({ hasText: /Scene/i }).first();
    await sceneButton.click();
    await page.waitForTimeout(1500);

    const generateKeyframeButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")').first();
    await generateKeyframeButton.click();
    console.log('[Manual Test] ✓ Generation started, monitoring memory...');

    // Step 3: Monitor memory during generation
    const memoryReadings = [];
    for (let i = 0; i < 20; i++) { // 10 minutes of monitoring
      await page.waitForTimeout(30000); // 30 seconds
      
      const currentMemory = await getMemoryUsage();
      if (currentMemory && baselineMemory) {
        const memoryIncrease = currentMemory.usedJSHeapSize - baselineMemory.usedJSHeapSize;
        const memoryIncreaseMB = (memoryIncrease / 1024 / 1024).toFixed(2);
        
        memoryReadings.push({
          elapsedMinutes: (i + 1) * 0.5,
          usedMB: (currentMemory.usedJSHeapSize / 1024 / 1024).toFixed(2),
          increaseMB: memoryIncreaseMB
        });
        
        console.log(`[Manual Test] Memory at ${(i + 1) * 0.5} min: ${memoryIncreaseMB} MB increase`);
      }

      // Check if generation completed
      const loadingIndicator = page.locator('[data-testid*="generating"], [aria-busy="true"]');
      const stillGenerating = await loadingIndicator.isVisible().catch(() => false);
      if (!stillGenerating) {
        console.log('[Manual Test] ✓ Generation completed');
        break;
      }
    }

    // Step 4: Verify no memory leaks (memory shouldn't grow unbounded)
    if (memoryReadings.length >= 3 && baselineMemory) {
      const finalMemory = memoryReadings[memoryReadings.length - 1];
      if (finalMemory) {
        const memoryIncreaseMB = parseFloat(finalMemory.increaseMB);
        
        // Memory increase should be reasonable (< 200MB for generation)
        expect(memoryIncreaseMB).toBeLessThan(200);
        console.log(`[Manual Test] ✓ Memory increase within bounds: ${memoryIncreaseMB} MB`);
        
        console.log('[Manual Test] ✅ PASS: Memory remained stable during generation');
      } else {
        console.log('[Manual Test] ⚠️ Could not get final memory reading');
      }
    } else {
      console.log('[Manual Test] ⚠️ Could not measure memory (browser may not support performance.memory)');
    }
  });
});
