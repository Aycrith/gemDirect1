import { test, expect } from '@playwright/test';

test.describe('Pipeline Export Flow', () => {
  test.setTimeout(120000); // 2 minutes

  test.beforeEach(async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));

    // Clear localStorage to prevent stale state
    await page.addInitScript(() => {
      localStorage.clear();
    });

    // Mock the ComfyUI API
    await page.route('**/api/comfyui/system_stats', async (route) => {
      console.log('[Test] Intercepted /system_stats');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          system: { os: 'windows', python_version: '3.10.0', comfyui_version: '0.0.1' },
          devices: [{ name: 'Mock GPU', vram_total: 24 * 1024 * 1024 * 1024, vram_free: 20 * 1024 * 1024 * 1024, type: 'cuda' }]
        })
      });
    });

    await page.route('**/api/comfyui/prompt', async (route) => {
      console.log('[Test] Intercepted /prompt');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompt_id: `mock-prompt-id-${Date.now()}`, number: 1, node_errors: {} })
      });
    });

    await page.route('**/api/comfyui/queue', async (route) => {
      // console.log('[Test] Intercepted /queue');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queue_running: [], queue_pending: [] })
      });
    });

    // Match /history/xyz specifically
    await page.route('**/api/comfyui/history/*', async (route) => {
      const url = route.request().url();
      console.log(`[Test] Intercepted /history/ID: ${url}`);
      
      const promptId = url.split('/history/')[1]?.split('?')[0] || '';
      
      if (promptId) {
        console.log(`[Test] Returning success for promptId: ${promptId}`);
        const mockResponse = {
            [promptId]: {
                status: { status_str: 'success', completed: true, messages: [] },
                outputs: {
                    "9": {
                        images: [{ filename: "mock_output.png", subfolder: "", type: "output" }]
                    }
                }
            }
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockResponse)
        });
      } else {
        await route.continue();
      }
    });

    // Match /history (base)
    await page.route('**/api/comfyui/history', async (route) => {
      console.log(`[Test] Intercepted /history (base)`);
      await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({})
      });
    });

    // Mock /view to return a dummy image
    await page.route('**/api/comfyui/view?*', async (route) => {
        console.log('[Test] Intercepted /view');
        // Return a 1x1 transparent PNG
        const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: buffer
        });
    });

    // Mock WebSocket
    await page.route('**/ws?clientId=*', async (route) => {
        // console.log('[Test] Intercepted WebSocket connection');
        // We can't easily mock WebSocket frames with route(), but we can let it connect
        // or fail gracefully. The app handles connection failures.
        // For now, let's just abort to force polling fallback, which is easier to mock.
        // await route.abort();
        // Actually, let's continue so the app doesn't complain about connection error
        await route.continue();
    });
    
    // Inject settings and project data via window object/IndexedDB to avoid race conditions
    await page.addInitScript(() => {
        // 1. Inject Settings
        const mockSettings = {
            videoProvider: 'comfyui-local',
            comfyUIUrl: "http://127.0.0.1:8188",
            comfyUIClientId: "test-client-id",
            workflowProfiles: {
                "wan-t2i": {
                    id: "wan-t2i",
                    label: "WAN T2I",
                    workflowJson: JSON.stringify({
                        "3": { "inputs": { "seed": 0 }, "class_type": "KSampler" },
                        "6": { "inputs": { "text": "" }, "class_type": "CLIPTextEncode" },
                        "9": { "inputs": { "filename_prefix": "WAN" }, "class_type": "SaveImage" }
                    }),
                    mapping: {
                        "6:text": "human_readable_prompt"
                    }
                },
                "wan-i2v": {
                    id: "wan-i2v",
                    label: "WAN I2V",
                    workflowJson: JSON.stringify({
                        "3": { "inputs": { "seed": 0 }, "class_type": "KSampler" },
                        "6": { "inputs": { "text": "" }, "class_type": "CLIPTextEncode" },
                        "10": { "inputs": { "image": "" }, "class_type": "LoadImage" },
                        "9": { "inputs": { "filename_prefix": "WAN_VIDEO" }, "class_type": "SaveImage" }
                    }),
                    mapping: {
                        "6:text": "human_readable_prompt",
                        "10:image": "keyframe_image"
                    }
                }
            },
            keyframeMode: 'single',
            imageWorkflowProfile: "wan-t2i",
            videoWorkflowProfile: "wan-i2v",
            featureFlags: {
                useSettingsStore: true,
                useGenerationStatusStore: true,
                useUnifiedSceneStore: true
            }
        };
        (window as any).__INJECTED_SETTINGS = mockSettings;
        console.log('[Test] Injected settings into window.__INJECTED_SETTINGS');

        // 2. Inject Project Data (Story, Scenes, Vision, Images)
        const mockStoryBible = {
            title: "Pipeline Test",
            logline: "A test story.",
            synopsis: "Synopsis.",
            characters: "Hero: A brave tester.",
            setting: "Setting.",
            plotOutline: "Act I: Setup\nAct II: Conflict",
            styleGuide: "Style."
        };
        
        const mockScenes = [
            {
                id: "scene-1",
                number: 1,
                title: "Scene 1",
                summary: "Summary 1",
                location: "Location 1",
                timeOfDay: "Day",
                characters: [],
                plotPoint: "Plot 1",
                status: "draft",
                timeline: {
                    shots: [
                        {
                            id: "shot-1",
                            number: 1,
                            description: "Shot 1",
                            cameraMovement: "Static",
                            focalLength: "35mm",
                            duration: 2
                        }
                    ],
                    shotEnhancers: {},
                    transitions: [],
                    negativePrompt: ""
                }
            }
        ];

        const mockGeneratedImages = {
            "scene-1": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        };
        
        const DB_NAME = 'cinematic-story-db';
        const DB_VERSION = 2;
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (e) => {
            const db = (e.target as any).result;
            if (!db.objectStoreNames.contains('storyBible')) {
                db.createObjectStore('storyBible');
            }
            if (!db.objectStoreNames.contains('scenes')) {
                const store = db.createObjectStore('scenes', { keyPath: 'id' });
                store.createIndex('by-order', 'order');
            }
            if (!db.objectStoreNames.contains('misc')) {
                db.createObjectStore('misc');
            }
            if (!db.objectStoreNames.contains('manifests')) {
                const store = db.createObjectStore('manifests');
                store.createIndex('by-timestamp', 'timestamp');
            }
        };
        
        request.onsuccess = (e) => {
            const db = (e.target as any).result;
            const tx = db.transaction(['storyBible', 'scenes', 'misc'], 'readwrite');
            
            tx.objectStore('storyBible').put(mockStoryBible, 'current');
            
            const scenesStore = tx.objectStore('scenes');
            mockScenes.forEach((scene, index) => {
                scenesStore.put({ ...scene, order: index });
            });
            
            const miscStore = tx.objectStore('misc');
            miscStore.put('Vision.', 'directorsVision');
            miscStore.put('director', 'workflowStage');
            miscStore.put(mockGeneratedImages, 'generatedImages');
            
            console.log('[Test] Injected project data into IndexedDB');
        };
    });
  });

  test('should trigger export all pipeline and complete tasks', async ({ page }) => {
    // 1. Navigate to the page
    await page.goto('/');

    // 2. Wait for hydration and settings
    await page.waitForFunction(() => {
        return (window as any).useSettingsStore?.getState()?.workflowProfiles?.['wan-t2i'];
    });

    // 3. Wait for project data to load (Director Mode)
    await page.waitForSelector('[data-testid="scene-card-scene-1"]', { timeout: 10000 });

    // 4. Navigate to Continuity Review stage
    console.log('[Test] Navigating to Continuity Review stage...');
    await page.getByRole('button', { name: 'Continuity Review' }).click();

    // 5. Trigger Export
    console.log('[Test] Triggering Export...');
    const exportBtn = page.getByRole('button', { name: /Export All Scenes/i });
    await expect(exportBtn).toBeVisible({ timeout: 5000 });
    await exportBtn.click();

    // 6. Verify Export Started
    // The toast might be too transient, so we check for the status panel instead
    
    // Verify pipeline starts (button changes state)
    await expect(page.getByText(/Pipeline Active...|Processing.../)).toBeVisible();

    // Verify pipeline completes (button returns to initial state)
    // Increase timeout as pipeline execution might take a few seconds even with mocks
    await expect(page.getByText('Export All Scenes')).toBeVisible({ timeout: 20000 });
  });
});
