import { test, expect } from '@playwright/test';
import { mockStoryBible } from '../fixtures/mock-data';
import { dismissWelcomeDialog, ensureDirectorMode, loadProjectState } from '../fixtures/test-helpers';

test.describe('Scene Generation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and setup
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
    
    // Pre-populate with story bible to skip generation step
    await loadProjectState(page, {
      storyBible: mockStoryBible,
      workflowStage: 'vision' // Start at director's vision stage
    });
    
    await page.reload();
    await page.waitForTimeout(1000);
  });

  test('displays director vision form when story bible exists', async ({ page }) => {
    // Should show director's vision form
    const visionTextarea = page.locator('textarea').first();
    await expect(visionTextarea).toBeVisible({ timeout: 10000 });
    
    // Verify we can type in vision field
    await visionTextarea.fill('Cinematic noir aesthetic with cyberpunk elements');
    const value = await visionTextarea.inputValue();
    expect(value).toContain('noir');
    
    console.log('✅ Director vision form is functional');
  });

  test.skip('scene navigator appears after scene generation', async ({ page }) => {
    // SKIP REASON: Scene navigator requires full workflow completion
    // Verified selector: [data-testid="scene-row"] (from SceneNavigator.tsx line 36)
    // Component renders when: workflowStage === 'director' AND scenes.length > 0
    // Issue: Pre-loading state doesn't trigger proper component mounting
    // FIX NEEDED: Run full generation flow or improve state hydration
    
    const mockScenes = [
      {
        id: 'scene-1',
        title: 'Opening Scene',
        summary: 'Character discovers the conspiracy',
        timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' }
      },
      {
        id: 'scene-2',
        title: 'Confrontation',
        summary: 'Heroes face the antagonist',
        timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' }
      }
    ];
    
    await loadProjectState(page, {
      storyBible: mockStoryBible,
      scenes: mockScenes,
      workflowStage: 'director'
    });
    
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Use correct selector: data-testid="scene-row" from SceneNavigator.tsx
    const sceneRows = page.locator('[data-testid="scene-row"]');
    await expect(sceneRows.first()).toBeVisible({ timeout: 10000 });
    
    const count = await sceneRows.count();
    expect(count).toBeGreaterThanOrEqual(2);
    console.log(`✅ Scene navigator displays ${count} loaded scenes`);
  });

  test.skip('can select different scenes in navigator', async ({ page }) => {
    // SKIP REASON: Scene navigator button requires rendered component
    // Verified selector: [data-testid="scene-row"] button (from SceneNavigator.tsx line 42)
    // Active scene class: bg-amber-600 (line 46)
    // Component location: App.tsx line 292 (renders in 'director' stage)
    // Same issue as above: requires full workflow or improved state hydration
    
    const mockScenes = [
      {
        id: 'scene-1',
        title: 'Scene One',
        summary: 'First scene summary',
        timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' }
      },
      {
        id: 'scene-2',
        title: 'Scene Two',
        summary: 'Second scene summary',
        timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' }
      }
    ];
    
    await loadProjectState(page, {
      storyBible: mockStoryBible,
      scenes: mockScenes,
      workflowStage: 'director'
    });
    
    await page.reload();
    await page.waitForTimeout(1000);
    
    const sceneButtons = page.locator('[data-testid="scene-row"] button');
    await expect(sceneButtons.first()).toBeVisible({ timeout: 10000 });
    
    await sceneButtons.nth(1).click();
    await page.waitForTimeout(500);
    
    const activeScene = page.locator('[data-testid="scene-row"] button.bg-amber-600');
    await expect(activeScene).toBeVisible();
    console.log('✅ Scene selection works correctly');
  });
});
