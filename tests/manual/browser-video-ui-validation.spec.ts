/**
 * Manual Browser UI Validation for Video Generation
 * 
 * This test guides manual validation of the React UI's video generation workflow.
 * It runs in HEADED mode to allow human observation of UI state updates.
 * 
 * Resource Constraints:
 * - LLM and ComfyUI cannot run simultaneously (compute/VRAM limits)
 * - Use pre-generated story/scenes from exported-project.json
 * - Generate keyframes first (ComfyUI only, no LLM needed)
 * - Then test video generation UI
 * 
 * Focus Areas:
 * 1. UI state updates for ALL scenes (not just first/last)
 * 2. Batch operation state management
 * 3. Error handling and user feedback
 * 4. Data persistence across reloads
 */

import { test, expect } from '@playwright/test';
import * as _fs from 'fs';
import * as _path from 'path';

test.describe('Manual Browser UI Validation - Video Generation', () => {
  test.use({ 
    headless: false, // MUST run in headed mode for manual observation
    viewport: { width: 1920, height: 1080 }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Clear existing data to start fresh
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('Step 1: Import test project with story and scenes', async ({ page }) => {
    console.log('📋 MANUAL STEP 1: Import Project');
    console.log('================================');
    console.log('');
    console.log('Actions:');
    console.log('1. Look for "Import Project" or "Load Project" button in UI');
    console.log('2. Click it and select: exported-project.json');
    console.log('3. Verify scenes appear in Scene Navigator');
    console.log('');
    console.log('Expected Result:');
    console.log('- 5 scenes visible in UI');
    console.log('- Scene titles match exported project');
    console.log('- No keyframes or videos yet (empty thumbnails)');
    console.log('');
    
    // Wait for user to complete this step
    await page.pause();
    
    // Validation
    const sceneCards = await page.locator('[data-testid*="scene-"], .scene-card, .scene-item').count();
    console.log(`✓ Found ${sceneCards} scene cards in UI`);
    
    expect(sceneCards).toBeGreaterThan(0);
  });

  test('Step 2: Verify workflow profiles are configured', async ({ page }) => {
    console.log('⚙️ MANUAL STEP 2: Check Workflow Configuration');
    console.log('============================================');
    console.log('');
    console.log('Actions:');
    console.log('1. Open Settings (⚙️ gear icon)');
    console.log('2. Navigate to "ComfyUI Settings" tab');
    console.log('3. Check "Workflow Profiles" section');
    console.log('');
    console.log('Expected Result:');
    console.log('- WAN T2I profile shows "✓ Ready" (for keyframes)');
    console.log('- WAN I2V profile shows "✓ Ready" (for videos)');
    console.log('- If not ready: Click "Import from File" → localGenSettings.json');
    console.log('');
    
    await page.pause();
    
    // Look for Settings button
    const settingsButton = page.locator('button:has-text("Settings"), button[aria-label*="Settings"], [data-testid="settings-button"]').first();
    
    if (await settingsButton.isVisible()) {
      console.log('✓ Settings button found');
    } else {
      console.log('⚠️ Settings button not immediately visible - may be in menu');
    }
  });

  test('Step 3: Generate keyframe for first scene', async ({ page }) => {
    console.log('🖼️ MANUAL STEP 3: Generate Single Keyframe');
    console.log('==========================================');
    console.log('');
    console.log('⚠️ IMPORTANT: ComfyUI must be running and idle');
    console.log('⚠️ LLM can be offline - we only need image generation');
    console.log('');
    console.log('Actions:');
    console.log('1. Select first scene in Scene Navigator');
    console.log('2. Look for "Generate Keyframe" button');
    console.log('3. Click it and observe console logs');
    console.log('4. Wait for keyframe to appear (~1-2 minutes)');
    console.log('');
    console.log('Console Logs to Watch For:');
    console.log('- [Prompt Guardrails] ✓ Validation passed');
    console.log('- [generateSceneKeyframeLocally] ✓ Queued promptId=...');
    console.log('- [ComfyUI WebSocket] Progress updates');
    console.log('- [SceneNavigator] Image added to state');
    console.log('');
    console.log('Expected Result:');
    console.log('- Progress indicator appears during generation');
    console.log('- Keyframe image appears in scene thumbnail');
    console.log('- Console shows no errors');
    console.log('- Scene shows checkmark or "Ready" status');
    console.log('');
    
    await page.pause();
    
    // Check if keyframe appeared
    const sceneWithImage = page.locator('[data-testid*="scene-"] img, .scene-card img, .scene-thumbnail img').first();
    
    if (await sceneWithImage.isVisible()) {
      console.log('✓ Keyframe image detected in UI');
    } else {
      console.log('⚠️ No keyframe image visible yet - generation may still be in progress');
    }
  });

  test('Step 4: PRIMARY TEST - Generate video from keyframe', async ({ page }) => {
    console.log('🎬 MANUAL STEP 4: Video Generation UI Workflow');
    console.log('=============================================');
    console.log('');
    console.log('⚠️ CRITICAL TEST: This validates the main UI issue');
    console.log('');
    console.log('Prerequisites:');
    console.log('- At least 1 scene has a keyframe image');
    console.log('- ComfyUI is running and idle');
    console.log('- Browser DevTools Console is open (F12)');
    console.log('');
    console.log('Actions:');
    console.log('1. Look for "Generate Video" button for the scene with keyframe');
    console.log('2. Click it and START MONITORING CONSOLE IMMEDIATELY');
    console.log('3. Watch for these critical logs:');
    console.log('   - [Video Generation] Starting...');
    console.log('   - [comfyUIService] Validating workflow and mappings for profile: wan-i2v');
    console.log('   - [queueComfyUIPrompt] Queuing prompt with profile wan-i2v');
    console.log('   - [SceneNavigator] Re-render #N: Videos changed from X to Y');
    console.log('   - 📊 State transition: X → Y videos');
    console.log('4. Wait for video generation to complete (3-5 minutes)');
    console.log('');
    console.log('CRITICAL VALIDATION POINTS:');
    console.log('');
    console.log('✅ UI Update Timing:');
    console.log('   - Does the scene thumbnail update IMMEDIATELY after video completes?');
    console.log('   - Or is there a delay?');
    console.log('   - Look for "State transition" log in console');
    console.log('');
    console.log('✅ Status Indicators:');
    console.log('   - Does loading spinner appear during generation?');
    console.log('   - Does it change to checkmark when complete?');
    console.log('   - Or does it get stuck in loading state?');
    console.log('');
    console.log('✅ Video Playback:');
    console.log('   - Can you click the video thumbnail?');
    console.log('   - Does video play in browser?');
    console.log('   - Is file size reasonable (0.5-10 MB)?');
    console.log('');
    console.log('✅ Error Handling:');
    console.log('   - If generation fails, is error message clear?');
    console.log('   - Is there a retry button?');
    console.log('   - Does UI remain functional after error?');
    console.log('');
    console.log('❌ KNOWN ISSUE TO TEST:');
    console.log('   - Original bug report: Only first/last scenes update in batch operations');
    console.log('   - This test validates single scene generation first');
    console.log('   - Batch testing comes in next step');
    console.log('');
    
    await page.pause();
    
    // Check if video appeared
    const videoElement = page.locator('video, [data-testid*="video"], .video-player').first();
    
    if (await videoElement.isVisible()) {
      console.log('✓ Video element detected in UI');
    } else {
      console.log('⚠️ No video element visible yet');
    }
  });

  test('Step 5: Test batch video generation (if possible)', async ({ page }) => {
    console.log('🎞️ MANUAL STEP 5: Batch Video Generation');
    console.log('========================================');
    console.log('');
    console.log('⚠️ THIS IS THE CRITICAL BUG TEST');
    console.log('');
    console.log('Prerequisites:');
    console.log('- Multiple scenes (2-3) have keyframes');
    console.log('- ComfyUI is running and idle');
    console.log('- Console is open and ready to log');
    console.log('');
    console.log('Actions:');
    console.log('1. Look for "Generate All Videos" or batch generation button');
    console.log('2. Click it to start batch generation');
    console.log('3. WATCH CONSOLE FOR STATE UPDATES FOR EACH SCENE');
    console.log('');
    console.log('CRITICAL VALIDATION:');
    console.log('');
    console.log('For EACH scene that completes:');
    console.log('  1. Check console for: [SceneNavigator] Re-render #N: Videos changed');
    console.log('  2. Check UI: Does thumbnail update IMMEDIATELY?');
    console.log('  3. Check status: Does loading spinner → checkmark?');
    console.log('');
    console.log('❌ BUG SYMPTOMS (if present):');
    console.log('   - Scene 1 updates ✓');
    console.log('   - Scene 2 DOES NOT update (stuck in loading)');
    console.log('   - Scene 3 DOES NOT update');
    console.log('   - But console logs show "State transition" for all scenes');
    console.log('   - After page reload, ALL videos appear (data was saved)');
    console.log('');
    console.log('✅ EXPECTED BEHAVIOR (if fixed):');
    console.log('   - Scene 1 updates ✓');
    console.log('   - Scene 2 updates ✓ (within 500ms of completion)');
    console.log('   - Scene 3 updates ✓ (within 500ms of completion)');
    console.log('   - No page reload needed to see all videos');
    console.log('');
    
    await page.pause();
  });

  test('Step 6: Test data persistence', async ({ page }) => {
    console.log('💾 MANUAL STEP 6: Data Persistence Validation');
    console.log('============================================');
    console.log('');
    console.log('Actions:');
    console.log('1. After videos are generated, press F5 to reload page');
    console.log('2. Wait for page to load completely');
    console.log('3. Check if all data reappears:');
    console.log('   - Story bible');
    console.log('   - All scenes');
    console.log('   - All keyframes');
    console.log('   - All videos');
    console.log('');
    console.log('Expected Result:');
    console.log('- Zero data loss');
    console.log('- All images/videos visible immediately');
    console.log('- No re-generation needed');
    console.log('');
    
    await page.pause();
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const sceneCards = await page.locator('[data-testid*="scene-"], .scene-card').count();
    console.log(`✓ Found ${sceneCards} scene cards after reload`);
  });

  test('Step 7: Test HMR state preservation', async ({ page }) => {
    console.log('🔄 MANUAL STEP 7: HMR State Preservation');
    console.log('========================================');
    console.log('');
    console.log('Prerequisites:');
    console.log('- Project has generated keyframes/videos');
    console.log('- Dev server is running (npm run dev)');
    console.log('');
    console.log('Actions:');
    console.log('1. With browser open, edit any React component file');
    console.log('   - Example: components/SceneNavigator.tsx');
    console.log('   - Add a comment: // Test HMR');
    console.log('2. Save the file');
    console.log('3. Watch browser - Vite will trigger HMR');
    console.log('4. Check if keyframes/videos remain visible');
    console.log('');
    console.log('Expected Result:');
    console.log('- Page "flashes" as HMR applies update');
    console.log('- All data remains visible (no "flash of empty state")');
    console.log('- Console shows: [vite] hot updated:');
    console.log('- sessionStorage preserves state across HMR');
    console.log('');
    console.log('❌ BUG SYMPTOMS (if present):');
    console.log('   - Images disappear after HMR');
    console.log('   - Must reload page to see them again');
    console.log('   - sessionStorage not being used');
    console.log('');
    
    await page.pause();
  });
});

test.describe('Browser Testing - Error Scenarios', () => {
  test.use({ headless: false });

  test('Error Test 1: ComfyUI offline during generation', async ({ page }) => {
    console.log('❌ ERROR TEST 1: ComfyUI Offline');
    console.log('================================');
    console.log('');
    console.log('Actions:');
    console.log('1. Stop ComfyUI server');
    console.log('2. Try to generate keyframe or video');
    console.log('3. Observe error handling');
    console.log('');
    console.log('Expected Result:');
    console.log('- Clear error message: "ComfyUI server not reachable"');
    console.log('- Generation button disabled or shows error state');
    console.log('- No silent failures');
    console.log('- Retry option available after server restarts');
    console.log('');
    
    await page.goto('/');
    await page.pause();
  });

  test('Error Test 2: Missing keyframe for video generation', async ({ page }) => {
    console.log('❌ ERROR TEST 2: Missing Keyframe');
    console.log('=================================');
    console.log('');
    console.log('Actions:');
    console.log('1. Select a scene WITHOUT a keyframe');
    console.log('2. Try to generate video');
    console.log('');
    console.log('Expected Result:');
    console.log('- Error toast: "Generate keyframe first before creating video"');
    console.log('- Video generation button disabled');
    console.log('- Clear guidance on next steps');
    console.log('');
    
    await page.goto('/');
    await page.pause();
  });
});
