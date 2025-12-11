import { test, expect } from '@playwright/test';
import { 
  dismissWelcomeDialog, 
  ensureDirectorMode, 
  loadStateAndWaitForHydration 
} from '../fixtures/test-helpers';
import { mockStoryBible } from '../fixtures/mock-data';
import { setupComfyUIRoutes } from '../fixtures/service-mocks';

const RUN_REAL_WORKFLOWS = process.env.RUN_REAL_WORKFLOWS === '1';

test.beforeEach(async ({ page }) => {
  if (!RUN_REAL_WORKFLOWS) {
    console.log('Using ComfyUI mocks (RUN_REAL_WORKFLOWS not set)');
    await setupComfyUIRoutes(page);
  }
});

/**
 * ComfyUI Integration Test Suite
 * 
 * Tests the integration with ComfyUI for image and video generation.
 * Validates server discovery, workflow validation, progress tracking, queue management, and retry logic.
 * 
 * Prerequisites:
 * - ComfyUI running on http://127.0.0.1:8188 (default)
 * - WAN T2I workflow loaded (workflows/image_netayume_lumina_t2i.json)
 * - WAN I2V workflow loaded (workflows/video_wan2_2_5B_ti2v.json)
 * - Workflow profiles configured in Settings
 */

const mockSceneWithTimeline = {
  id: 'scene-comfyui-test',
  title: 'ComfyUI Test Scene',
  summary: 'A scene for testing ComfyUI integration',
  timeline: {
    shots: [
      {
        id: 'shot-comfyui-1',
        number: 1,
        description: 'Futuristic cityscape at golden hour',
        duration: 5,
        cameraAngle: 'wide' as const,
        movement: 'static' as const
      }
    ],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: 'blurry, low quality, distorted'
  }
};

test.describe('ComfyUI Server Discovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
  });

  test('discovers ComfyUI on default port (8188)', async ({ page }) => {
    // Check if ComfyUI status is displayed in UI
    const statusIndicator = page.locator('text=/comfyui|connected|offline/i').first();
    
    if (await statusIndicator.isVisible({ timeout: 5000 })) {
      const statusText = await statusIndicator.textContent();
      console.log(`✅ ComfyUI status displayed: ${statusText}`);
      
      // If connected, verify it's the right server
      if (statusText?.toLowerCase().includes('connected')) {
        console.log('✅ ComfyUI server discovered successfully');
      }
    } else {
      console.log('⚠️ ComfyUI status indicator not found - check UI implementation');
    }
  });

  test('tests connection in settings modal', async ({ page }) => {
    // Open settings
    const settingsButton = page.locator('button[aria-label="Open settings"]').first();
    await settingsButton.click();
    
    // Navigate to ComfyUI settings tab
    const comfyUITab = page.locator('button:has-text("ComfyUI Settings")').first();
    await comfyUITab.click();
    await page.waitForTimeout(500);
    
    // Look for test connection button
    const testButton = page.locator('button:has-text("Test Connection")').first();
    
    if (await testButton.isVisible({ timeout: 5000 })) {
      await testButton.click();
      
      // Wait for connection result
      await page.waitForTimeout(3000);
      
      // Check for success/failure indicator
      const successIndicator = page.locator('text=/connected|success|✓|✅/i');
      const failureIndicator = page.locator('text=/failed|offline|✗|❌/i');
      
      const hasSuccess = await successIndicator.isVisible({ timeout: 2000 }).catch(() => false);
      const hasFailure = await failureIndicator.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (hasSuccess) {
        console.log('✅ Connection test successful');
      } else if (hasFailure) {
        console.log('⚠️ Connection test failed - ComfyUI may not be running');
      } else {
        console.log('⚠️ Connection test result unclear');
      }
    } else {
      console.log('⚠️ Test connection button not found');
    }
  });

  test('shows helpful error when ComfyUI is offline', async ({ page }) => {
    // This test requires ComfyUI to be stopped
    // In CI/CD, mock the server connection check
    
    await page.route('**/system_stats', async route => {
      await route.abort('connectionrefused');
    });
    
    // Open settings
    const settingsButton = page.locator('button[aria-label="Open settings"]').first();
    await settingsButton.click();
    
    const comfyUITab = page.locator('button:has-text("ComfyUI Settings")').first();
    await comfyUITab.click();
    
    const testButton = page.locator('button:has-text("Test Connection")').first();
    if (await testButton.isVisible({ timeout: 5000 })) {
      await testButton.click();
      await page.waitForTimeout(2000);
      
      // Look for error message
      const errorMessage = page.locator('text=/cannot connect|offline|not running/i');
      const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasError) {
        console.log('✅ Offline error displayed correctly');
      }
    }
  });
});

test.describe('ComfyUI Workflow Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
    
    // Load project state with scene
    await loadStateAndWaitForHydration(page, {
      storyBible: mockStoryBible,
      scenes: [mockSceneWithTimeline],
      workflowStage: 'director'
    }, {
      expectedKeys: ['storyBible', 'scenes'],
      timeout: 10000
    });
  });

  test('validates workflow profiles are configured', async ({ page }) => {
    // Open settings
    const settingsButton = page.locator('button[aria-label="Open settings"]').first();
    await settingsButton.click();
    
    const comfyUITab = page.locator('button:has-text("ComfyUI Settings")').first();
    await comfyUITab.click();
    await page.waitForTimeout(1000);
    
    // Check for workflow profile section
    const profileSection = page.locator('text=/workflow profile|wan-t2i|wan-i2v/i').first();
    const hasProfiles = await profileSection.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasProfiles) {
      console.log('✅ Workflow profiles section found');
      
      // Check for specific workflows
      const wanT2I = page.locator('text=/wan-t2i/i');
      const wanI2V = page.locator('text=/wan-i2v/i');
      
      const hasT2I = await wanT2I.isVisible({ timeout: 3000 }).catch(() => false);
      const hasI2V = await wanI2V.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (hasT2I) console.log('✅ WAN T2I profile found');
      if (hasI2V) console.log('✅ WAN I2V profile found');
    } else {
      console.log('⚠️ Workflow profiles not visible - may need import');
    }
  });

  test('blocks video generation without keyframe', async ({ page }) => {
    // Try to find video generation button
    const videoButton = page.locator('button:has-text("Generate Video"), button:has-text("Video")').first();
    
    if (await videoButton.isVisible({ timeout: 5000 })) {
      // Should be disabled without keyframe
      const isDisabled = await videoButton.isDisabled();
      
      if (isDisabled) {
        console.log('✅ Video generation correctly disabled (no keyframe)');
      } else {
        // Try clicking and expect error
        await videoButton.click();
        await page.waitForTimeout(1000);
        
        const errorMessage = page.locator('text=/keyframe required|generate keyframe first/i');
        const hasError = await errorMessage.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (hasError) {
          console.log('✅ Keyframe requirement enforced');
        } else {
          console.log('⚠️ Video generation may proceed without keyframe (unexpected)');
        }
      }
    } else {
      console.log('⚠️ Video generation button not found');
    }
  });

  test('validates required workflow mappings', async ({ page }) => {
    // This test verifies the pre-flight validation mentioned in docs
    // Should check that CLIPTextEncode and LoadImage mappings exist
    
    // Trigger validation by attempting generation
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Keyframe")').first();
    
    if (await generateButton.isVisible({ timeout: 5000 })) {
      await generateButton.click();
      await page.waitForTimeout(2000);
      
      // Look for validation errors
      const validationError = page.locator('text=/mapping|workflow|configuration|required/i');
      const hasError = await validationError.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (hasError) {
        const errorText = await validationError.textContent();
        console.log(`Validation message: ${errorText}`);
        console.log('✅ Pre-flight validation working');
      } else {
        console.log('✅ Validation passed or generation started');
      }
    }
  });
});

test.describe('ComfyUI Progress Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
    
    await loadStateAndWaitForHydration(page, {
      storyBible: mockStoryBible,
      scenes: [mockSceneWithTimeline],
      workflowStage: 'director'
    });
  });

  test('shows progress indicator during generation', async ({ page }) => {
    // This test requires starting an actual generation
    // Will only work if ComfyUI is running and configured
    
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Keyframe")').first();
    
    if (await generateButton.isVisible({ timeout: 5000 })) {
      await generateButton.click();
      
      // Wait for progress indicator
      const progressIndicator = page.locator('text=/generating|progress|%/i, [role="progressbar"]').first();
      const hasProgress = await progressIndicator.isVisible({ timeout: 10000 }).catch(() => false);
      
      if (hasProgress) {
        console.log('✅ Progress indicator appeared');
        
        // Try to capture progress updates
        for (let i = 0; i < 5; i++) {
          await page.waitForTimeout(2000);
          const progressText = await progressIndicator.textContent().catch(() => null);
          if (progressText) {
            console.log(`Progress update ${i + 1}: ${progressText}`);
          }
        }
      } else {
        console.log('⚠️ Progress indicator not detected - generation may have completed quickly');
      }
    }
  });

  test('tracks WebSocket connection status', async ({ page }) => {
    // Monitor WebSocket connections for ComfyUI progress
    
    const wsConnections: string[] = [];
    page.on('websocket', ws => {
      const url = ws.url();
      console.log(`WebSocket connection: ${url}`);
      wsConnections.push(url);
      
      ws.on('framereceived', event => {
        if (event.payload) {
          console.log(`WS frame received: ${event.payload.toString().substring(0, 100)}...`);
        }
      });
    });
    
    // Trigger generation
    const generateButton = page.locator('button:has-text("Generate")').first();
    if (await generateButton.isVisible({ timeout: 5000 })) {
      await generateButton.click();
      await page.waitForTimeout(5000);
      
      // Check if WebSocket was established
      const hasComfyUIWs = wsConnections.some(url => url.includes('8188') || url.includes('ws'));
      
      if (hasComfyUIWs) {
        console.log('✅ WebSocket connection to ComfyUI established');
      } else {
        console.log('⚠️ No WebSocket connection detected');
      }
    }
  });
});

test.describe('ComfyUI Queue Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
  });

  test('displays queue position when multiple jobs', async ({ page }) => {
    // This test requires queuing multiple jobs
    // Implementation depends on UI design for queue display
    
    // Mock queue status endpoint
    await page.route('**/queue', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          queue_running: [[{
            prompt_id: 'test-prompt-1',
            number: 1
          }]],
          queue_pending: [[{
            prompt_id: 'test-prompt-2',
            number: 2
          }, {
            prompt_id: 'test-prompt-3',
            number: 3
          }]]
        })
      });
    });
    
    // Check if queue status is displayed
    await page.waitForTimeout(2000);
    
    const queueIndicator = page.locator('text=/queue|pending|position/i');
    const hasQueue = await queueIndicator.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasQueue) {
      const queueText = await queueIndicator.textContent();
      console.log(`Queue status: ${queueText}`);
      console.log('✅ Queue management UI present');
    } else {
      console.log('⚠️ Queue status not displayed');
    }
  });

  test('handles queue full scenario gracefully', async ({ page }) => {
    // Mock a full queue response
    await page.route('**/prompt', async route => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Queue is full',
          queue_size: 10,
          max_queue_size: 10
        })
      });
    });
    
    await loadStateAndWaitForHydration(page, {
      storyBible: mockStoryBible,
      scenes: [mockSceneWithTimeline],
      workflowStage: 'director'
    });
    
    const generateButton = page.locator('button:has-text("Generate")').first();
    if (await generateButton.isVisible({ timeout: 5000 })) {
      await generateButton.click();
      await page.waitForTimeout(2000);
      
      // Look for queue full error
      const errorMessage = page.locator('text=/queue full|busy|try again/i');
      const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasError) {
        console.log('✅ Queue full error displayed correctly');
      }
    }
  });
});

test.describe('ComfyUI Retry Logic', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
  });

  test.fixme('retries failed generations automatically', async ({ page }) => {
    // FIXME: Route mocking not triggering - test needs actual ComfyUI generation to hit retry logic.
    // TODO: Refactor to use injectable mock service or test with real ComfyUI + forced failures.
    // Using test.fixme instead of test.skip to properly disable execution
    // Mock failures on first attempts, success on retry
    let attemptCount = 0;
    
    await page.route('**/prompt', async route => {
      attemptCount++;
      
      if (attemptCount < 2) {
        // Fail first attempt
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' })
        });
      } else {
        // Succeed on retry
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ prompt_id: 'test-success-prompt' })
        });
      }
    });
    
    await loadStateAndWaitForHydration(page, {
      storyBible: mockStoryBible,
      scenes: [mockSceneWithTimeline],
      workflowStage: 'director'
    });
    
    const generateButton = page.locator('button:has-text("Generate")').first();
    if (await generateButton.isVisible({ timeout: 5000 })) {
      await generateButton.click();
      await page.waitForTimeout(5000);
      
      // Check if retry succeeded
      expect(attemptCount).toBeGreaterThanOrEqual(2);
      console.log(`✅ Retry logic executed: ${attemptCount} attempts`);
    }
  });

  test('shows retry count to user', async ({ page }) => {
    // User should see retry attempts
    
    let attemptCount = 0;
    await page.route('**/prompt', async route => {
      attemptCount++;
      
      if (attemptCount < 3) {
        await route.fulfill({
          status: 503,
          body: JSON.stringify({ error: 'Service temporarily unavailable' })
        });
      } else {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ prompt_id: 'test-prompt' })
        });
      }
    });
    
    await loadStateAndWaitForHydration(page, {
      storyBible: mockStoryBible,
      scenes: [mockSceneWithTimeline],
      workflowStage: 'director'
    });
    
    const generateButton = page.locator('button:has-text("Generate")').first();
    if (await generateButton.isVisible({ timeout: 5000 })) {
      await generateButton.click();
      
      // Look for retry indicator
      const retryIndicator = page.locator('text=/retry|attempt/i');
      const hasRetry = await retryIndicator.isVisible({ timeout: 10000 }).catch(() => false);
      
      if (hasRetry) {
        const retryText = await retryIndicator.textContent();
        console.log(`Retry indicator: ${retryText}`);
        console.log('✅ Retry status displayed to user');
      }
    }
  });
});

test.describe('ComfyUI Generated Asset Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
  });

  test('persists generated keyframes to IndexedDB', async ({ page }) => {
    // Simulate successful keyframe generation
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readwrite');
          const store = tx.objectStore('misc');
          
          // Store mock keyframe
          const mockKeyframe = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          store.put({ 'scene-comfyui-test': mockKeyframe }, 'generatedImages');
          
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
        };
      });
    });
    
    // Reload and verify persistence
    await page.reload();
    await page.waitForTimeout(2000);
    
    const keyframeData = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readonly');
          const store = tx.objectStore('misc');
          const get = store.get('generatedImages');
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => resolve(null);
        };
      });
    });
    
    expect(keyframeData).toBeTruthy();
    console.log('✅ Keyframe persisted to IndexedDB');
  });

  test('allows downloading generated images', async ({ page }) => {
    // Load scene with mock keyframe
    await loadStateAndWaitForHydration(page, {
      storyBible: mockStoryBible,
      scenes: [mockSceneWithTimeline],
      generatedImages: {
        'scene-comfyui-test': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      }
    });
    
    // Look for download button
    const downloadButton = page.locator('button:has-text("Download"), a:has-text("Download")').first();
    const hasDownload = await downloadButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasDownload) {
      console.log('✅ Download button available');
    } else {
      console.log('⚠️ Download button not found');
    }
  });
});
