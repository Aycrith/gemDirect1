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

    // We can't easily parse/stringify the whole script as it's JS code, not JSON.
    // But we can inject a second script that updates the store AFTER the first one.
    
    await page.addInitScript(injectionScript);
    
    // Add a second script to explicitly set the profile and mappings if needed
    await page.addInitScript(() => {
        // Wait for the first script to run (it's usually immediate in addInitScript)
        // But we can also just override window.__INJECTED_SETTINGS if it exists
        if ((window as any).__INJECTED_SETTINGS) {
            const settings = (window as any).__INJECTED_SETTINGS;
            
            // Ensure wan-flf2v exists
            if (!settings.workflowProfiles['wan-flf2v']) {
                settings.workflowProfiles['wan-flf2v'] = {
                    id: 'wan-flf2v',
                    label: 'WAN First-Last-Frame->Video',
                    workflowJson: '{}', // Placeholder
                    mapping: {}
                };
            }
            
            // Force mappings
            settings.workflowProfiles['wan-flf2v'].mapping = {
                "5:text": "human_readable_prompt",
                "6:text": "negative_prompt",
                "10:image": "start_image",
                "11:image": "end_image"
            };
            
            // Ensure videoWorkflowProfile is set to a profile that uses start/end images
            // If we want to test FLF2V, we should use wan-flf2v
            // But the app defaults to wan-i2v or wan-fun-inpaint
            // Let's force it to wan-flf2v for this test
            settings.videoWorkflowProfile = 'wan-flf2v';
            
            console.log('[Test Setup] Forced wan-flf2v mappings and profile');
        }
    });
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

    // Mock ComfyUI system stats (required for connection check)
    await page.route('**/system_stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          system: { os: 'windows', python_version: '3.10' },
          devices: [{ name: 'NVIDIA GeForce RTX 3090', vram_total: 24576, vram_free: 20000 }]
        })
      });
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
            status: { status_str: 'success', completed: true },
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
    
    // 4. Generate Keyframes & Video for Each Scene
    // We need to navigate to each scene to generate its keyframes (Start/End) and then video
    // because the batch generator only generates single keyframes, but FLF2V requires bookends.
    
    const sceneCards = page.locator('[data-testid^="scene-card-"]');
    // Wait for scenes to be present
    await expect(sceneCards.first()).toBeVisible({ timeout: 10000 });
    const sceneCount = await sceneCards.count();
    console.log(`Found ${sceneCount} scenes`);

    if (sceneCount < 2) {
        throw new Error("Not enough scenes to test continuity. Expected at least 2.");
    }

    for (let i = 0; i < 2; i++) { // Process first 2 scenes
        console.log(`Processing Scene ${i + 1}...`);
        await sceneCards.nth(i).click();
        
        // Wait for TimelineEditor buttons
        const startKeyframeBtn = page.locator('[data-testid="generate-start-keyframe"]');
        const endKeyframeBtn = page.locator('[data-testid="generate-end-keyframe"]');
        const generateVideoBtn = page.locator('[data-testid="generate-videos"]');

        await expect(startKeyframeBtn).toBeVisible({ timeout: 10000 });

        // Generate Start Keyframe
        if (await startKeyframeBtn.innerText() !== '✓ Start Generated') {
             console.log(`Generating Start Keyframe for Scene ${i + 1}...`);
             await startKeyframeBtn.click();
             await expect(startKeyframeBtn).toHaveText('✓ Start Generated', { timeout: 15000 });
        }

        // Generate End Keyframe
        if (await endKeyframeBtn.innerText() !== '✓ End Generated') {
             console.log(`Generating End Keyframe for Scene ${i + 1}...`);
             await endKeyframeBtn.click();
             await expect(endKeyframeBtn).toHaveText('✓ End Generated', { timeout: 15000 });
        }

        // Generate Video
        console.log(`Generating Video for Scene ${i + 1}...`);
        await expect(generateVideoBtn).toBeVisible();
        await generateVideoBtn.click();
        
        // Wait for the generation to start (look for toast or status change)
        // We can wait for the button to show "Generating..." or similar, or just a small buffer
        await page.waitForTimeout(2000); 
    }

    // 5. Verify Payloads
    console.log(`Captured ${capturedPayloads.length} payloads`);
    console.log(`Uploaded ${uploadedImages.length} images`);
    
    // We expect at least 1 upload (the extracted frame from Shot 1)
    expect(uploadedImages.length).toBeGreaterThan(0);
    
    // Find the video generation payload
    const videoPayload = capturedPayloads.find(p => {
        const str = JSON.stringify(p);
        // Check for the specific node type used in FLF2V
        return str.includes('Wan22FirstLastFrameToVideoLatent');
    });

    if (videoPayload) {
        console.log("✅ Found video generation payload");
        const payloadString = JSON.stringify(videoPayload);
        
        // Verify that at least one uploaded image is used in the payload
        const usesUploadedImage = uploadedImages.some(filename => payloadString.includes(filename));
        
        if (usesUploadedImage) {
             console.log(`✅ Payload references uploaded image(s): ${uploadedImages.filter(f => payloadString.includes(f)).join(', ')}`);
        } else {
             console.warn("⚠️ Payload found but does not reference captured uploaded images. Checking for 'uploaded-' pattern...");
             // Fallback check if uploadedImages array missed it for some reason
             expect(payloadString).toContain('uploaded-');
        }
    } else {
        console.error("❌ Video payload NOT found. Dumping payload types:");
        capturedPayloads.forEach((p, idx) => {
            const str = JSON.stringify(p);
            let type = 'Unknown';
            if (str.includes('EmptySD3LatentImage')) type = 'Keyframe (FLUX)';
            if (str.includes('Wan22FirstLastFrameToVideoLatent')) type = 'Video (WAN FLF2V)';
            console.log(`Payload ${idx + 1}: ${type}`);
        });
        throw new Error("Video generation payload not found in captured requests");
    }
    console.log('✅ FLF2V Continuity Verified: Payload references uploaded frame.');
  });
});
