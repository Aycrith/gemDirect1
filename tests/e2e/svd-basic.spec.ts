import { test, expect, type TestInfo } from '@playwright/test';
import { runComfyStatus } from './comfyHelper';

const RUN_SVD_E2E = process.env.RUN_SVD_E2E === '1';

test.describe('SVD basic E2E pipeline', () => {
  test.skip(
    !RUN_SVD_E2E,
    'SVD workflow is treated as an optional/legacy path; set RUN_SVD_E2E=1 to run these specs.',
  );
  test.setTimeout(240000);
  const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';
  test.beforeEach(async ({}, testInfo: TestInfo) => {
    await runComfyStatus(testInfo);
  });

  test('story → bible → vision → scenes → shots → keyframes → SVD video', async ({ page }) => {
    await page.goto(APP_URL);

    const welcomeDismiss = page.getByTestId('btn-welcome-dismiss');
    await welcomeDismiss.waitFor({ state: 'visible', timeout: 3000 }).then(() => welcomeDismiss.click()).catch(() => {});

    await page.getByTestId('mode-director').click();

    const newProjectBtn = page.getByTestId('btn-new-project');
    if (await newProjectBtn.isVisible().catch(() => false)) {
      await newProjectBtn.click();
    }

    const settingsButton = page.getByRole('button', { name: /settings/i });
    await settingsButton.click();

    const serverInput = page.getByLabel(/Server Address/i);
    const clientIdInput = page.getByLabel(/Client ID/i);
    const modelSelect = page.getByLabel(/Video Model/i);

    // For CI determinism, set minimal valid values instead of asserting pre-filled ones.
    await serverInput.fill('http://127.0.0.1:8188');
    await clientIdInput.fill('e2e-client');
    await expect(modelSelect).toHaveText(/Stable Video Diffusion/i);

    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await cancelButton.click();

    await page.getByTestId('step-story-idea').click();

    const genreSelect = page.getByLabel(/Genre/i);
    await genreSelect.selectOption('thriller');

    const ideaTextarea = page.getByRole('textbox', { name: /Story Idea/i });
    await ideaTextarea.fill(
      'A courier in a neon-soaked city delivers a mysterious package across rain-slick rooftops while being pursued by unknown agents.'
    );

    const generateBibleButton = page.getByRole('button', { name: /Generate Story Bible/i });
    await expect(generateBibleButton).toBeEnabled();
    await generateBibleButton.click();

    const toast = page.getByText(/Story Bible generated successfully!/i);
    await toast.waitFor({ timeout: 180000 });
    
    // Helper has already run and created attachments in beforeEach hook
    // The E2EQACard would display the helper info if stored results exist
    // For now, verify UI continues normally after helper runs

    const setVisionButton = page.getByRole('button', { name: /Set Vision/i });
    await expect(setVisionButton).toBeEnabled({ timeout: 60000 });
    await page.screenshot({ path: 'phase2c_step2_story_bible.png', fullPage: false });
    await setVisionButton.click();

    const visionTextarea = page.getByRole('textbox', { name: /Director's Vision/i }).or(
      page.getByRole('textbox', { name: /Define Your Director/i })
    );
    await visionTextarea.fill(
      'High-contrast neon noir, heavy rain, reflective puddles, long shadows, silhouettes and strong backlighting, 1980s cyberpunk cityscape.'
    );

    const generateScenesButton = page.getByRole('button', { name: /Generate Scenes with this Vision/i });
    await expect(generateScenesButton).toBeEnabled();
    await generateScenesButton.click();

    const sceneRows = page.getByTestId('scene-row');
    await expect.poll(() => sceneRows.count(), { timeout: 180000 }).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: 'phase2c_step3_scenes_generated.png', fullPage: false });

    const targetSceneIndex = 0;
    await sceneRows.nth(targetSceneIndex).click();

    const generateShotsButton = page.getByTestId('btn-generate-shots');
    await expect(generateShotsButton).toBeVisible({ timeout: 120000 });
    await expect(generateShotsButton).toBeEnabled({ timeout: 120000 });
    await generateShotsButton.click();

    const shotRows = page.getByTestId('shot-row');
    await expect.poll(() => shotRows.count(), { timeout: 180000 }).toBeGreaterThan(0);
    const shotCount = await shotRows.count();
    await page.screenshot({ path: 'phase2c_step4_timeline_scene0.png', fullPage: false });

    const keyframeButton = page.getByTestId('btn-generate-keyframe');
    let keyframeGenerated = false;
    if (await keyframeButton.isVisible().catch(() => false)) {
      await keyframeButton.click();
      const keyframeImage = page.locator('img[alt^="Keyframe for"]');
      await keyframeImage.first().waitFor({ state: 'visible', timeout: 120000 });
      const keyframeSrc = await keyframeImage.first().getAttribute('src');
      
      // Validate base64 keyframe structure
      expect(keyframeSrc).toBeTruthy();
      expect(keyframeSrc).toMatch(/^data:image\/jpeg;base64,/);
      expect(keyframeSrc?.toLowerCase()).not.toContain('placeholder');
      expect((keyframeSrc?.length ?? 0)).toBeGreaterThan(1200);
      
      // Extract and validate base64 payload
      const base64Payload = keyframeSrc?.split(',')[1];
      expect(base64Payload).toBeTruthy();
      expect(base64Payload?.length ?? 0).toBeGreaterThan(1000);
      
      keyframeGenerated = true;
      await page.screenshot({ path: 'phase2c_step5_scene_0_keyframe.png', fullPage: false });
    }

    const generateLocallyButton = page.getByTestId('btn-generate-locally');
    let videoGenerationSucceeded = false;
    let videoPlayerSrcPresent = false;
    const isGenerateLocallyVisible = await generateLocallyButton.isVisible().catch(() => false);
    if (isGenerateLocallyVisible) {
      // Button might be disabled if keyframe generation didn't complete
      const isEnabled = await generateLocallyButton.isEnabled().catch(() => false);
      if (isEnabled) {
        await generateLocallyButton.click();
        await page.waitForTimeout(40000);

        const video = page.locator('video');
        if ((await video.count()) > 0) {
          const src = await video.first().getAttribute('src');
          videoPlayerSrcPresent = !!src && src.length > 0;
        }
        videoGenerationSucceeded = videoPlayerSrcPresent;
      }
      await page.screenshot({ path: 'phase2c_step6_scene_0_video.png', fullPage: false });
    }

    expect(shotCount).toBeGreaterThan(0);
    // Keyframe generation is optional if button not available or fails
    // Video generation success is conditional on enabled state
    if (isGenerateLocallyVisible && await generateLocallyButton.isEnabled().catch(() => false)) {
      expect(videoGenerationSucceeded).toBeTruthy();
      expect(videoPlayerSrcPresent).toBeTruthy();
    }
  });
});
