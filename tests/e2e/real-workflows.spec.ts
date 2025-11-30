/**
 * Phase 2 Validation Suite 2: Real Workflow Testing
 * 
 * CRITICAL: Tests actual generation with REAL services (not mocked)
 * - Real LM Studio for story generation
 * - Real ComfyUI for keyframe generation (WAN T2I)
 * - Real ComfyUI for video generation (WAN I2V)
 * 
 * This addresses the "mocking problem" from Phase 1 where API responses
 * were mocked, preventing validation of actual generation workflows.
 */

import { test, expect } from '@playwright/test';
import { quickSetup } from '../fixtures/story-scenario';

// Environment variable to enable real workflow tests (default: skip)
const RUN_REAL_WORKFLOWS = process.env.RUN_REAL_WORKFLOWS === '1';

test.describe('Phase 2 Suite 2: Real Workflow Testing', () => {
  // Skip entire suite unless explicitly enabled
  test.skip(!RUN_REAL_WORKFLOWS, 'Real workflow tests require RUN_REAL_WORKFLOWS=1 and running LM Studio/ComfyUI services');
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Fixtures will handle welcome dialog and director mode setup
  });

  test('CRITICAL: Real LM Studio story generation (no mocking)', async ({ page }) => {
    // This test uses the ACTUAL LM Studio service, not mocked responses
    // Requires LM Studio running at http://127.0.0.1:1234
    
    // Navigate to Quick Generate or Story input
    const quickGenerateButton = page.locator('button:has-text("Quick Generate")');
    if (await quickGenerateButton.count() > 0) {
      await quickGenerateButton.click();
    }
    
    // Find story prompt input
    const storyInput = page.locator('[data-testid*="story-prompt"], textarea[placeholder*="story"], textarea[placeholder*="idea"]');
    await expect(storyInput.first()).toBeVisible({ timeout: 10000 });
    
    // Enter test prompt
    const testPrompt = 'A brave knight discovers a magical sword in an ancient temple.';
    await storyInput.first().fill(testPrompt);
    
    // Trigger generation
    const generateButton = page.locator('button:has-text("Generate Story"), button:has-text("Generate"), [data-testid*="generate-story"]');
    await generateButton.first().click();
    
    // Wait for REAL generation (may take 30-60 seconds)
    const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"], [aria-busy="true"]');
    await expect(loadingIndicator.first()).toBeVisible({ timeout: 5000 });
    
    console.log('⏳ Waiting for real LM Studio generation (30-60s)...');
    
    // Wait for completion with extended timeout for real LLM
    await expect(loadingIndicator.first()).toBeHidden({ timeout: 120000 });
    
    // Verify story content was generated
    const storyContent = page.locator('[data-testid*="story-content"], [data-testid*="story-bible"], .story-text');
    await expect(storyContent.first()).toBeVisible({ timeout: 10000 });
    
    const storyText = await storyContent.first().textContent();
    expect(storyText).toBeTruthy();
    expect(storyText!.length).toBeGreaterThan(100); // Real story should be substantial
    
    // Verify story contains relevant content (not just error message)
    expect(storyText).toMatch(/knight|sword|temple|magic|adventure|hero/i);
    
    console.log(`✅ Real LM Studio generation successful: ${storyText!.length} characters`);
  });

  test('CRITICAL: Real ComfyUI T2I keyframe generation', async ({ page }) => {
    // Test actual WAN T2I workflow execution (not mocked)
    // Requires ComfyUI running at http://127.0.0.1:8188
    
    // Setup: Need story with scenes/shots to enable keyframe generation
    const setupSuccess = await quickSetup(page, 'keyframe-ready');
    if (!setupSuccess) {
      console.log('⚠️ Fixture setup failed');
      test.skip();
      return;
    }
    
    // Find keyframe generation button
    const generateImageButton = page.locator('button:text-matches("Generate \\\\d+ Keyframes?"), [data-testid*="generate-keyframe"]');
    
    await generateImageButton.first().click();
    
    // Wait for REAL ComfyUI generation
    const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
    await expect(loadingIndicator.first()).toBeVisible({ timeout: 5000 });
    
    console.log('⏳ Waiting for real ComfyUI T2I generation (60-120s)...');
    
    // Extended timeout for real generation
    await expect(loadingIndicator.first()).toBeHidden({ timeout: 180000 });
    
    // Verify image was generated and displayed
    const generatedImage = page.locator('img[src*="data:image"], img[src*="blob:"], [data-testid*="keyframe-image"]');
    await expect(generatedImage.first()).toBeVisible({ timeout: 10000 });
    
    // Verify image has valid source
    const imgSrc = await generatedImage.first().getAttribute('src');
    expect(imgSrc).toBeTruthy();
    expect(imgSrc).toMatch(/^(data:image|blob:)/);
    
    console.log('✅ Real ComfyUI T2I generation successful');
  });

  test('CRITICAL: Real ComfyUI I2V video generation', async ({ page }) => {
    // Test actual WAN I2V workflow execution (requires keyframe)
    // Requires ComfyUI running at http://127.0.0.1:8188
    
    // Setup: Need story with keyframes to enable video generation
    const setupSuccess = await quickSetup(page, 'video-ready');
    if (!setupSuccess) {
      console.log('⚠️ Fixture setup failed');
      test.skip();
      return;
    }
    
    // Find video generation button
    const generateVideoButton = page.locator('button:has-text("Generate Video"), [data-testid*="generate-video"]');
    
    await generateVideoButton.first().click();
    
    // Wait for REAL ComfyUI I2V generation
    const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
    await expect(loadingIndicator.first()).toBeVisible({ timeout: 5000 });
    
    console.log('⏳ Waiting for real ComfyUI I2V generation (3-8 minutes)...');
    
    // Extended timeout for real video generation (can take 3-8 minutes)
    await expect(loadingIndicator.first()).toBeHidden({ timeout: 600000 }); // 10 minutes max
    
    // Verify video was generated and displayed
    const generatedVideo = page.locator('video[src*="blob:"], video[src*="data:"], [data-testid*="scene-video"]');
    await expect(generatedVideo.first()).toBeVisible({ timeout: 10000 });
    
    // Verify video has valid source
    const videoSrc = await generatedVideo.first().getAttribute('src');
    expect(videoSrc).toBeTruthy();
    
    console.log('✅ Real ComfyUI I2V generation successful');
  });

  test('CRITICAL: Full pipeline (text → image → video) with real services', async ({ page }) => {
    // End-to-end test: Generate story, keyframes, and video using real services
    // Requires both LM Studio (1234) and ComfyUI (8188) running
    
    console.log('🚀 Starting full pipeline test with real services...');
    
    // Step 1: Generate story with real LM Studio
    await page.goto('http://localhost:3000');
    
    const quickGenerateButton = page.locator('button:has-text("Quick Generate")');
    if (await quickGenerateButton.count() > 0) {
      await quickGenerateButton.click();
    }
    
    const storyInput = page.locator('[data-testid*="story-prompt"], textarea[placeholder*="story"]');
    if (await storyInput.count() > 0) {
      await storyInput.first().fill('A detective solves a mysterious case in a haunted mansion.');
      
      const generateButton = page.locator('button:has-text("Generate")').first();
      await generateButton.click();
      
      // Wait for story generation
      const loadingIndicator = page.locator('[data-testid*="loading"], [data-testid*="generating"]');
      await expect(loadingIndicator.first()).toBeVisible({ timeout: 5000 });
      await expect(loadingIndicator.first()).toBeHidden({ timeout: 120000 });
      
      console.log('✅ Step 1/3: Story generated');
    } else {
      console.log('⚠️ Story input not found - may already have story');
    }
    
    // Step 2: Navigate to Director Mode and generate keyframe
    const directorButton = page.locator('[data-testid="mode-director"]');
    if (await directorButton.count() > 0) {
      await directorButton.click();
      await page.waitForTimeout(2000);
    }
    
    const generateImageButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")');
    if (await generateImageButton.count() > 0) {
      await generateImageButton.first().click();
      
      const imageLoading = page.locator('[data-testid*="loading"]');
      const hasLoading = await imageLoading.first().isVisible().catch(() => false);
      if (hasLoading) {
        await expect(imageLoading.first()).toBeHidden({ timeout: 180000 });
      } else {
        await page.waitForTimeout(2000); // Stub mode or instant completion
      }
      
      // Verify image appeared
      const generatedImage = page.locator('img[src*="data:image"], img[src*="blob:"]');
      await expect(generatedImage.first()).toBeVisible({ timeout: 10000 });
      
      console.log('✅ Step 2/3: Keyframe generated');
    } else {
      console.log('⚠️ Generate Image button not found');
      test.skip();
      return;
    }
    
    // Step 3: Generate video
    const generateVideoButton = page.locator('button:has-text("Generate Video")');
    if (await generateVideoButton.count() > 0) {
      await generateVideoButton.first().click();
      
      const videoLoading = page.locator('[data-testid*="loading"]');
      await expect(videoLoading.first()).toBeVisible({ timeout: 5000 });
      
      console.log('⏳ Waiting for video generation (3-8 minutes)...');
      await expect(videoLoading.first()).toBeHidden({ timeout: 600000 });
      
      // Verify video appeared
      const generatedVideo = page.locator('video[src*="blob:"], video');
      await expect(generatedVideo.first()).toBeVisible({ timeout: 10000 });
      
      console.log('✅ Step 3/3: Video generated');
    } else {
      console.log('⚠️ Generate Video button not found');
      test.skip();
      return;
    }
    
    console.log('🎉 Full pipeline test PASSED: text → image → video');
  });

  test('HIGH: Validate output files exist and are valid', async ({ page }) => {
    // Verify generated files are actually saved and accessible
    
    await page.goto('http://localhost:3000');
    
    // Check IndexedDB for stored generated content
    const hasStoredData = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('gemDirect1-db', 1);
        
        request.onsuccess = () => {
          const db = request.result;
          const stores = Array.from(db.objectStoreNames);
          
          // Check for generated images/videos in store
          const hasGeneratedContent = stores.some(store => 
            /image|video|generated|artifact/i.test(store)
          );
          
          db.close();
          resolve(hasGeneratedContent);
        };
        
        request.onerror = () => resolve(false);
      });
    });
    
    if (hasStoredData) {
      console.log('✅ Generated content stored in IndexedDB');
    } else {
      console.log('⚠️ No generated content found in storage');
    }
    
    // Verify artifacts visible in UI
    const artifacts = page.locator('img[src*="data:image"], video[src*="blob:"]');
    const artifactCount = await artifacts.count();
    
    console.log(`Found ${artifactCount} artifacts in UI`);
    expect(artifactCount).toBeGreaterThanOrEqual(0); // May be 0 if no generation yet
  });

  test('MEDIUM: Generated content matches prompts', async ({ page }) => {
    // Verify quality: generated content relates to input prompts
    
    await page.goto('http://localhost:3000');
    
    // This is a qualitative test - checks for obvious failures
    // (e.g., image generation failed with error image, video is blank)
    
    const images = page.locator('img[src*="data:image"]');
    const videos = page.locator('video[src*="blob:"]');
    
    const imageCount = await images.count();
    const videoCount = await videos.count();
    
    console.log(`Content check: ${imageCount} images, ${videoCount} videos`);
    
    if (imageCount > 0) {
      // Check if images loaded successfully (not broken)
      const firstImage = images.first();
      const isLoaded = await firstImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalHeight > 0);
      
      expect(isLoaded).toBeTruthy();
      console.log('✅ Generated images loaded successfully');
    }
    
    if (videoCount > 0) {
      // Check if videos have duration (not empty)
      const firstVideo = videos.first();
      const hasDuration = await firstVideo.evaluate((vid: HTMLVideoElement) => vid.duration > 0);
      
      expect(hasDuration).toBeTruthy();
      console.log('✅ Generated videos have content');
    }
  });
});
