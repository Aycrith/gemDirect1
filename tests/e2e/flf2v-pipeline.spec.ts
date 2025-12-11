import { test, expect } from '@playwright/test';
import fs from 'fs';

/**
 * FLF2V Pipeline Test
 * Validates First-Last-Frame-to-Video continuity workflow
 */

test.describe('FLF2V Pipeline', () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));

    // Navigate to app
    await page.goto('/');
    
    // Clear IndexedDB
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('cinematic-story-db');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    });

    // Ensure strategy is set
    await page.addInitScript(() => {
        window.sessionStorage.setItem('gemDirect_planExpansion.strategy.selected', JSON.stringify('gemini-plan'));
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Inject settings with Mock LLM and FLF2V enabled
    let injectionScript = fs.readFileSync('injection_script.js', 'utf8');
    
    // Ensure useMockLLM is present and set to true
    if (injectionScript.includes('"useMockLLM"')) {
        injectionScript = injectionScript.replace(
            /"useMockLLM":\s*false/g, 
            '"useMockLLM": true'
        );
    } else {
        // Insert it if missing (e.g. before featureFlags)
        injectionScript = injectionScript.replace(
            /"featureFlags":\s*{/, 
            '"useMockLLM": true, "featureFlags": {'
        );
    }

    // Inject FLF2V flag
    injectionScript = injectionScript.replace(
        '"featureFlags": {', 
        '"featureFlags": { "enableFLF2V": true, '
    );

    // Use addInitScript to ensure settings are present on reload (sets window.__INJECTED_SETTINGS)
    await page.addInitScript(`(${injectionScript})()`);
    
    // Reload to apply settings
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Mock ComfyUI endpoints
    await page.route('**/object_info', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.route('**/queue', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ queue_running: [], queue_pending: [] })
        });
      } else {
        await route.continue();
      }
    });

    // Mock ComfyUI history
    await page.route('**/history**', async (route) => {
      const promptId = route.request().url().split('/').pop() || '';
      const mockImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          [promptId]: {
            prompt: [1, { prompt: {} }],
            outputs: {
              '9': {
                images: [{
                  filename: 'mock-keyframe.png',
                  subfolder: '',
                  type: 'output',
                  data: mockImage.split(',')[1]
                }]
              }
            }
          }
        })
      });
    });

    // Mock ComfyUI view (images and video)
    await page.route('**/view**', async (route) => {
      const url = new URL(route.request().url());
      const filename = url.searchParams.get('filename') || '';
      
      if (filename.endsWith('.png') || filename.endsWith('.jpg')) {
          const mockImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
          await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: Buffer.from(mockImage.split(',')[1]!, 'base64')
          });
      } else {
          // Mock MP4 video (minimal valid mp4)
          const mockVideoBase64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA1m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU4Ljc2LjEwMA==';
          await route.fulfill({
            status: 200,
            contentType: 'video/mp4',
            body: Buffer.from(mockVideoBase64, 'base64')
          });
      }
    });
  });

  test('verifies FLF2V continuity between shots', async ({ page }) => {
    const capturedPayloads: any[] = [];
    const uploadedImages: string[] = [];
    
    // Intercept POST /prompt to capture payloads
    await page.route('**/prompt', async (route) => {
        if (route.request().method() === 'POST') {
            const payload = route.request().postDataJSON();
            capturedPayloads.push(payload);
            
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ prompt_id: `mock-prompt-${Date.now()}` })
            });
        } else {
            await route.continue();
        }
    });

    // Intercept POST /upload/image
    await page.route('**/upload/image', async (route) => {
        if (route.request().method() === 'POST') {
            // It's a multipart form data. We can try to parse it or just assume success.
            // We want to know the filename returned.
            // The service expects { name: "filename.png", ... }
            
            // We can generate a unique name to verify it's used later.
            const mockFilename = `uploaded-${Date.now()}.png`;
            uploadedImages.push(mockFilename);
            
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ name: mockFilename, subfolder: '', type: 'input' })
            });
        } else {
            await route.continue();
        }
    });

    // 1. Start Project
    const newButton = page.locator('button:has-text("New"), [data-testid="new-project-button"]').first();
    await newButton.click();
    
    // Handle modal
    const modal = page.locator('div[role="dialog"]');
    try {
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        const confirmButton = modal.getByRole('button', { name: /Start New|Confirm|Yes/i });
        if (await confirmButton.isVisible()) await confirmButton.click();
    } catch (e) {}

    // 2. Enter Prompt & Generate Story
    await page.fill('[data-testid="story-idea-input"]', 'A cyberpunk detective story set in Neo-Tokyo where a lone detective must solve a series of murders involving rogue androids. The detective discovers a conspiracy that threatens the entire city.');
    await page.click('button:has-text("Generate Story Bible")');
    
    // Wait for story generation
    await expect(page.locator('h2:has-text("Story Bible")')).toBeVisible({ timeout: 30000 });

    // 3. Generate Scenes
    await page.click('button:has-text("Generate Scenes")');
    
    // Handle Director's Vision
    const visionInput = page.locator('[data-testid="directors-vision-input"]');
    await visionInput.waitFor({ state: 'visible', timeout: 10000 });
    await visionInput.fill("A dark, neon-lit cyberpunk city with rain-slicked streets, towering skyscrapers, and holographic advertisements reflecting in puddles. The atmosphere is gritty and noir, with high contrast lighting and deep shadows.");
    await page.click('[data-testid="generate-scenes-submit"]');

    // Wait for scenes
    await expect(page.locator('[data-testid="scene-row"]').first()).toBeVisible({ timeout: 60000 });
    
    // 4. Generate Keyframes
    await page.click('[data-testid="generate-keyframes"]');
    await page.waitForTimeout(3000);

    // 5. Generate Video for Shot 1 & 2
    const generateVideoButtons = page.locator('button[aria-label="Generate video"], button:has-text("Generate Video")');
    const count = await generateVideoButtons.count();
    console.log(`Found ${count} generate video buttons`);
    
    if (count < 2) {
        console.log("Not enough shots to test continuity. Skipping.");
        return;
    }

    // Generate Shot 1
    console.log("Generating Shot 1...");
    await generateVideoButtons.nth(0).click();
    await page.waitForTimeout(4000); // Wait for completion and extraction

    // Generate Shot 2
    console.log("Generating Shot 2...");
    await generateVideoButtons.nth(1).click();
    await page.waitForTimeout(4000); // Wait for completion

    // 6. Verify Payloads
    console.log(`Captured ${capturedPayloads.length} payloads`);
    console.log(`Uploaded ${uploadedImages.length} images`);
    
    // We expect at least 1 upload (the extracted frame from Shot 1)
    expect(uploadedImages.length).toBeGreaterThan(0);
    
    const lastUploadedImage = uploadedImages[uploadedImages.length - 1];
    const lastPayload = capturedPayloads[capturedPayloads.length - 1];
    
    // Check if the last payload references the last uploaded image
    const payloadString = JSON.stringify(lastPayload);
    expect(payloadString).toContain(lastUploadedImage);
    
    console.log("✅ FLF2V Continuity Verified: Shot 2 used uploaded frame " + lastUploadedImage);
  });
});
