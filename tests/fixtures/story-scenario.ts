/**
 * Story Scenario Fixtures for Phase 2 Validation
 * 
 * Provides helper functions to set up project state at various workflow stages.
 * These fixtures enable testing of mid-workflow scenarios without requiring
 * full story generation each time.
 * 
 * Usage Pattern:
 * ```typescript
 * test.beforeEach(async ({ page }) => {
 *   await page.goto('http://localhost:3000');
 *   await dismissWelcomeDialog(page);
 *   await setupKeyframeReady(page); // Sets up story with scenes ready for keyframe gen
 * });
 * ```
 */

import { Page } from '@playwright/test';
import { 
  dismissWelcomeDialog, 
  loadStateAndWaitForHydration
} from './test-helpers';
import { 
  mockStoryBible, 
  mockScenes, 
  mockDirectorsVision,
  mockGeneratedImages 
} from './mock-data';

/**
 * Setup Option 1: Minimal Story
 * Creates basic story bible only - ready for scene expansion
 * 
 * Use when: Testing story bible editing, scene planning UI
 * Enables: Scene generation buttons
 */
export async function setupMinimalStory(page: Page): Promise<boolean> {
  console.log('[Fixture] Setting up minimal story...');
  
  const state = {
    workflowStage: 'plan',
    storyBible: mockStoryBible,
    directorsVision: mockDirectorsVision,
    scenes: [],
    generatedImages: {},
    localGenStatus: {},
    timestamp: Date.now()
  };
  
  await loadStateAndWaitForHydration(page, state, {
    expectedKeys: ['storyBible', 'workflowStage']
  });
  
  console.log('[Fixture] ✅ Minimal story setup complete');
  return true;
}

/**
 * Setup Option 2: Story with Scenes (No Shots)
 * Creates story bible + scenes without detailed shot breakdowns
 * 
 * Use when: Testing shot generation, timeline creation
 * Enables: Generate shots/timeline buttons for each scene
 */
export async function setupSceneWithoutShots(page: Page, _sceneId?: string): Promise<boolean> {
  console.log('[Fixture] Setting up scenes without shots...');
  
  // Use scenes but remove shot details
  const scenesWithoutShots = mockScenes.map(scene => ({
    ...scene,
    timeline: {
      shots: [],
      shotEnhancers: {},
      transitions: [],
      negativePrompt: ''
    }
  }));
  
  const state = {
    workflowStage: 'plan',
    storyBible: mockStoryBible,
    directorsVision: mockDirectorsVision,
    scenes: scenesWithoutShots,
    generatedImages: {},
    localGenStatus: {},
    timestamp: Date.now()
  };
  
  await loadStateAndWaitForHydration(page, state, {
    expectedKeys: ['storyBible', 'scenes', 'workflowStage']
  });
  
  console.log('[Fixture] ✅ Scenes without shots setup complete');
  return true;
}

/**
 * Setup Option 3: Story with Scenes and Shots
 * Creates complete timeline structure without keyframes
 * 
 * Use when: Testing keyframe generation
 * Enables: Generate keyframe buttons for each scene
 */
export async function setupScenesWithShots(page: Page): Promise<boolean> {
  console.log('[Fixture] Setting up scenes with shots...');
  
  const state = {
    workflowStage: 'director',
    mode: 'director',
    activeSceneId: 'scene-001',
    storyBible: mockStoryBible,
    directorsVision: mockDirectorsVision,
    scenes: mockScenes, // Includes full shot breakdowns
    generatedImages: {},
    localGenStatus: {},
    timestamp: Date.now()
  };
  
  await loadStateAndWaitForHydration(page, state, {
    expectedKeys: ['storyBible', 'scenes', 'workflowStage'],
    expectedComponent: 'scene-navigator'
  });
  
  console.log('[Fixture] ✅ Scenes with shots setup complete');
  return true;
}

/**
 * Setup Option 4: Ready for Keyframe Generation
 * Complete story with scenes/shots - keyframe buttons enabled
 * 
 * Use when: Testing keyframe generation, ComfyUI T2I integration
 * Enables: Generate keyframe buttons (WAN T2I workflow)
 */
export async function setupKeyframeReady(page: Page): Promise<boolean> {
  console.log('[Fixture] Setting up keyframe-ready state...');
  
  const state = {
    workflowStage: 'director',
    mode: 'director',
    activeSceneId: 'scene-001', // Pre-select first scene
    storyBible: mockStoryBible,
    directorsVision: mockDirectorsVision,
    scenes: mockScenes,
    generatedImages: {}, // No keyframes yet
    localGenStatus: {},
    timestamp: Date.now()
  };
  
  await loadStateAndWaitForHydration(page, state);
  
  console.log('[Fixture] ✅ Keyframe-ready state setup complete');
  console.log(`[Fixture]    Scenes: ${mockScenes.length}`);
  console.log(`[Fixture]    Total shots: ${mockScenes.reduce((sum, s) => sum + s.timeline.shots.length, 0)}`);
  return true;
}

/**
 * Setup Option 5: Ready for Video Generation
 * Complete story with keyframes - video generation enabled
 * 
 * Use when: Testing video generation, ComfyUI I2V integration
 * Enables: Generate video buttons (WAN I2V workflow)
 */
export async function setupVideoReady(page: Page): Promise<boolean> {
  console.log('[Fixture] Setting up video-ready state...');
  
  const state = {
    workflowStage: 'director',
    mode: 'director',
    activeSceneId: 'scene-001',
    storyBible: mockStoryBible,
    directorsVision: mockDirectorsVision,
    scenes: mockScenes,
    generatedImages: mockGeneratedImages,
    localGenStatus: {},
    timestamp: Date.now()
  };
  
  await loadStateAndWaitForHydration(page, state);
  
  console.log('[Fixture] ✅ Video-ready state setup complete');
  console.log(`[Fixture]    Keyframes loaded: ${Object.keys(mockGeneratedImages).length}`);
  return true;
}

/**
 * Setup Option 6: Single Scene Ready
 * Sets up only one scene for focused testing
 * 
 * Use when: Testing individual scene operations, faster test execution
 * Enables: Scene-specific generation without full project overhead
 */
export async function setupSingleScene(page: Page, sceneIndex: number = 0): Promise<boolean> {
  console.log(`[Fixture] Setting up single scene (index ${sceneIndex})...`);
  
  if (sceneIndex >= mockScenes.length) {
    console.log(`[Fixture] ⚠️ Invalid scene index: ${sceneIndex} (max: ${mockScenes.length - 1})`);
    return false;
  }
  
  const singleScene = [mockScenes[sceneIndex]!];
  const singleKeyframe = { [singleScene[0]!.id]: mockGeneratedImages[singleScene[0]!.id] };
  
  const state = {
    workflowStage: 'timeline',
    storyBible: mockStoryBible,
    directorsVision: mockDirectorsVision,
    scenes: singleScene,
    generatedImages: singleKeyframe,
    localGenStatus: {},
    timestamp: Date.now()
  };
  
  await loadStateAndWaitForHydration(page, state);
  
  console.log('[Fixture] ✅ Single scene setup complete');
  console.log(`[Fixture]    Scene: ${singleScene[0]?.title ?? 'Unknown'}`);
  console.log(`[Fixture]    Shots: ${singleScene[0]?.timeline.shots.length ?? 0}`);
  return true;
}

/**
 * Setup Option 7: Batch Generation Ready
 * Sets up multiple scenes ready for batch keyframe/video generation
 * 
 * Use when: Testing batch operations, queue management
 * Enables: Batch generation buttons with multiple targets
 */
export async function setupBatchReady(page: Page, withKeyframes: boolean = false): Promise<boolean> {
  console.log('[Fixture] Setting up batch-ready state...');
  
  const state = {
    workflowStage: 'director',
    mode: 'director',
    storyBible: mockStoryBible,
    directorsVision: mockDirectorsVision,
    scenes: mockScenes, // All 3 scenes
    generatedImages: withKeyframes ? mockGeneratedImages : {},
    localGenStatus: {},
    timestamp: Date.now()
  };
  
  await loadStateAndWaitForHydration(page, state);
  
  console.log('[Fixture] ✅ Batch-ready state setup complete');
  console.log(`[Fixture]    Scenes: ${mockScenes.length}`);
  console.log(`[Fixture]    Keyframes: ${withKeyframes ? Object.keys(mockGeneratedImages).length : 0}`);
  console.log(`[Fixture]    Ready for: ${withKeyframes ? 'Batch video generation' : 'Batch keyframe generation'}`);
  return true;
}

/**
 * Setup Option 8: In-Progress Generation State
 * Simulates active generation with queue/progress
 * 
 * Use when: Testing UI during generation, progress tracking
 * Enables: Cancel buttons, progress indicators
 */
export async function setupGenerationInProgress(page: Page, generationType: 'keyframe' | 'video'): Promise<boolean> {
  console.log(`[Fixture] Setting up ${generationType} generation in progress...`);
  
  const inProgressStatus = {
    'scene-001': {
      status: 'running' as const,
      message: generationType === 'keyframe' ? 'Generating keyframe...' : 'Processing frame 3/8',
      progress: generationType === 'keyframe' ? 50 : 38,
      queue_position: undefined
    }
  };
  
  const state = {
    workflowStage: 'generate',
    storyBible: mockStoryBible,
    directorsVision: mockDirectorsVision,
    scenes: mockScenes,
    generatedImages: generationType === 'video' ? mockGeneratedImages : {},
    localGenStatus: inProgressStatus,
    timestamp: Date.now()
  };
  
  await loadStateAndWaitForHydration(page, state);
  
  console.log('[Fixture] ✅ In-progress generation state setup complete');
  console.log(`[Fixture]    Type: ${generationType}`);
  console.log(`[Fixture]    Scene: ${mockScenes[0]?.title ?? 'Unknown'} (${inProgressStatus['scene-001'].progress}%)`);
  return true;
}

/**
 * Helper: Navigate to first scene in timeline
 * Clicks Director Mode button and selects first scene to show TimelineEditor
 * 
 * Use after: Setting up fixtures to navigate to the timeline editor view
 */
export async function navigateToFirstScene(page: Page): Promise<boolean> {
  console.log('[Fixture] Navigating to first scene...');
  
  // CRITICAL FIX: Force Director Mode in IndexedDB first
  // The app loads 'mode' from IndexedDB on mount, so we need to set it there
  console.log('[Fixture] Setting mode to director in IndexedDB...');
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const request = indexedDB.open('cinematic-story-db', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('misc', 'readwrite');
        const store = tx.objectStore('misc');
        store.put('director', 'mode');
        tx.oncomplete = () => {
          console.log('[Fixture] ✅ Mode set to director in IndexedDB');
          resolve();
        };
      };
    });
  });
  
  // Wait for React to detect the mode change and re-render
  await page.waitForTimeout(2000);
  
  // DEBUG: Check what workflowStage the app actually loaded
  const appWorkflowStage = await page.evaluate(() => {
    // Look for WorkflowTracker or any element that shows the stage
    const trackerButtons = Array.from(document.querySelectorAll('[data-testid*="stage"], [data-testid*="workflow"] button'));
    if (trackerButtons.length > 0) {
      const activeButton = trackerButtons.find(btn => btn.classList.contains('bg-amber') || btn.classList.contains('border-amber'));
      return activeButton?.textContent?.trim() || 'unknown';
    }
    // Fallback: check if we see scene navigator with CSS-only selector
    const sceneButtons = Array.from(document.querySelectorAll('li button span'));
    const hasScenes = sceneButtons.some(span => span.textContent?.includes('Scene'));
    return hasScenes ? 'director (has scenes)' : 'unknown (no scenes)';
  });
  console.log(`[Fixture] App workflowStage appears to be: ${appWorkflowStage}`);
  
  // Click Director Mode button if not already active (belt and suspenders)
  const directorButton = page.locator('[data-testid="mode-director"]');
  try {
    if (await directorButton.isVisible({ timeout: 5000 })) {
      const classes = await directorButton.getAttribute('class');
      if (!classes?.includes('bg-amber')) {
        await directorButton.click();
        await page.waitForTimeout(1500);
        console.log('[Fixture] ✅ Clicked Director Mode button');
      } else {
        console.log('[Fixture] ✅ Already in Director Mode');
      }
    }
  } catch (e) {
    console.log('[Fixture] ⚠️ Director Mode button not found, relying on IndexedDB mode');
  }
  
  // CRITICAL: Wait for React to hydrate scenes from IndexedDB and render SceneNavigator
  // The usePersistentState hook loads scenes async, so we need to poll for scene elements
  console.log('[Fixture] Waiting for scenes to render in SceneNavigator...');
  try {
    await page.waitForFunction(() => {
      // Check for any scene elements in the navigator using CSS-only selectors
      const sceneButtons = Array.from(document.querySelectorAll('li button span'));
      return sceneButtons.some(span => span.textContent?.includes('Scene'));
    }, { timeout: 15000, polling: 500 });
    console.log('[Fixture] ✅ Scenes detected in DOM');
  } catch (e) {
    console.log('[Fixture] ⚠️ Timeout waiting for scenes to render');
    // Try a page reload to force hydration
    console.log('[Fixture] Attempting page reload to force React hydration...');
    await page.reload();
    await page.waitForTimeout(3000);
    
    // Check again after reload
    const sceneCount = await page.locator('li button').filter({ hasText: /Scene/ }).count();
    if (sceneCount === 0) {
      console.log('[Fixture] ❌ Failed to render scenes even after reload');
      return false;
    }
    console.log('[Fixture] ✅ Scenes rendered after reload');
  }
  
  // Additional wait for React rendering to stabilize
  await page.waitForTimeout(1000);
  
  // Click first scene in SceneNavigator
  // Try multiple selector strategies - use simpler locator
  const firstScene = page.locator('li button').filter({ hasText: 'Scene 1' }).first();
  try {
    await firstScene.waitFor({ state: 'visible', timeout: 5000 });
    await firstScene.click();
    await page.waitForTimeout(1500);
    console.log('[Fixture] ✅ First scene selected');
    
    // Verify TimelineEditor rendered by checking for shot rows
    // Wait longer for React to auto-select first scene and render timeline
    await page.waitForTimeout(2000);
    const shotRows = page.locator('[data-testid="shot-row"]');
    const shotCount = await shotRows.count();
    if (shotCount > 0) {
      console.log(`[Fixture] ✅ TimelineEditor rendered with ${shotCount} shots`);
    } else {
      console.log('[Fixture] ⚠️ TimelineEditor not visible (no shots found)');
    }
    
    return true;
  } catch (e) {
    console.log('[Fixture] ⚠️ Failed to click first scene:', e);
    return false;
  }
}

/**
 * Helper: Wait for generation to complete
 * Polls until localGenStatus shows 'complete' for specified scene
 * 
 * Use when: Waiting for real ComfyUI generation to finish
 */
export async function waitForGenerationComplete(
  page: Page, 
  sceneId: string, 
  options?: { timeout?: number, pollInterval?: number }
): Promise<boolean> {
  const timeout = options?.timeout || 600000; // 10 minutes default
  const pollInterval = options?.pollInterval || 2000; // 2 seconds
  const startTime = Date.now();
  
  console.log(`[Fixture] Waiting for generation to complete: ${sceneId}`);
  
  while (Date.now() - startTime < timeout) {
    const status = await page.evaluate((id) => {
      return new Promise<any>((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readonly');
          const store = tx.objectStore('misc');
          const getRequest = store.get('localGenStatus');
          
          getRequest.onsuccess = () => {
            const allStatus = getRequest.result || {};
            db.close();
            resolve(allStatus[id]);
          };
          getRequest.onerror = () => {
            db.close();
            resolve(null);
          };
        };
        request.onerror = () => resolve(null);
      });
    }, sceneId);
    
    if (status && status.status === 'complete') {
      console.log(`[Fixture] ✅ Generation complete for ${sceneId}`);
      return true;
    }
    
    if (status && status.status === 'error') {
      console.log(`[Fixture] ❌ Generation failed for ${sceneId}: ${status.message}`);
      return false;
    }
    
    // Log progress
    if (status && status.progress !== undefined) {
      console.log(`[Fixture]    Progress: ${status.progress}% - ${status.message || 'Processing...'}`);
    }
    
    await page.waitForTimeout(pollInterval);
  }
  
  console.log(`[Fixture] ⏱️ Timeout waiting for generation: ${sceneId}`);
  return false;
}

/**
 * Helper: Verify buttons are in expected state
 * Useful for confirming fixture setup worked correctly
 */
export async function verifyButtonStates(
  page: Page, 
  expected: {
    storyGeneration?: 'enabled' | 'disabled',
    keyframeGeneration?: 'enabled' | 'disabled',
    videoGeneration?: 'enabled' | 'disabled'
  }
): Promise<boolean> {
  console.log('[Fixture] Verifying button states...');
  
  let allCorrect = true;
  
  if (expected.storyGeneration) {
    const storyButton = page.locator('[data-testid*="generate-story"]').first();
    const isDisabled = await storyButton.isDisabled().catch(() => true);
    const actualState = isDisabled ? 'disabled' : 'enabled';
    
    if (actualState !== expected.storyGeneration) {
      console.log(`[Fixture] ⚠️ Story generation button: expected ${expected.storyGeneration}, got ${actualState}`);
      allCorrect = false;
    } else {
      console.log(`[Fixture] ✅ Story generation button: ${actualState}`);
    }
  }
  
  if (expected.keyframeGeneration) {
    const keyframeButton = page.locator('[data-testid*="generate-keyframe"], [data-testid*="generate-image"]').first();
    const isDisabled = await keyframeButton.isDisabled().catch(() => true);
    const actualState = isDisabled ? 'disabled' : 'enabled';
    
    if (actualState !== expected.keyframeGeneration) {
      console.log(`[Fixture] ⚠️ Keyframe generation button: expected ${expected.keyframeGeneration}, got ${actualState}`);
      allCorrect = false;
    } else {
      console.log(`[Fixture] ✅ Keyframe generation button: ${actualState}`);
    }
  }
  
  if (expected.videoGeneration) {
    const videoButton = page.locator('[data-testid*="generate-video"]').first();
    const isDisabled = await videoButton.isDisabled().catch(() => true);
    const actualState = isDisabled ? 'disabled' : 'enabled';
    
    if (actualState !== expected.videoGeneration) {
      console.log(`[Fixture] ⚠️ Video generation button: expected ${expected.videoGeneration}, got ${actualState}`);
      allCorrect = false;
    } else {
      console.log(`[Fixture] ✅ Video generation button: ${actualState}`);
    }
  }
  
  return allCorrect;
}

/**
 * Quick setup helper combining common operations
 * Use this for most tests unless you need custom state
 */
export async function quickSetup(
  page: Page,
  stage: 'minimal' | 'scenes' | 'timeline' | 'keyframe-ready' | 'video-ready' | 'batch-keyframe' | 'batch-video'
): Promise<boolean> {
  await dismissWelcomeDialog(page);
  
  let setupResult = false;
  
  switch (stage) {
    case 'minimal':
      setupResult = await setupMinimalStory(page);
      break;
    case 'scenes':
      setupResult = await setupSceneWithoutShots(page);
      break;
    case 'timeline':
      setupResult = await setupScenesWithShots(page);
      break;
    case 'keyframe-ready':
      setupResult = await setupKeyframeReady(page);
      break;
    case 'video-ready':
      setupResult = await setupVideoReady(page);
      break;
    case 'batch-keyframe':
      setupResult = await setupBatchReady(page, false);
      break;
    case 'batch-video':
      setupResult = await setupBatchReady(page, true);
      break;
    default:
      console.log(`[Fixture] ⚠️ Unknown stage: ${stage}`);
      return false;
  }
  
  // If setup succeeded and stage has scenes, navigate to first scene
  if (setupResult && ['scenes', 'timeline', 'keyframe-ready', 'video-ready', 'batch-keyframe', 'batch-video'].includes(stage)) {
    await navigateToFirstScene(page);
  }
  
  return setupResult;
}
