import { test, expect } from '@playwright/test';

test.describe('Continuity Director Stability', () => {
  test('should render scene list without crashing when timeline is missing', async ({ page }) => {
    // 1. Load page to ensure DB is created
    await page.goto('/');
    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // 2. Inject broken state (Scene with no timeline)
    await page.evaluate(async () => {
        const dbName = 'cinematic-story-db';
        
        const scene1 = {
            "id": "scene-1",
            "title": "Valid Scene",
            "summary": "A valid scene.",
            "order": 1,
            "timeline": { "shots": [] }
        };

        const scene2 = {
            "id": "scene-2",
            "title": "Broken Scene",
            "summary": "A scene without timeline.",
            "order": 2,
            // No timeline property
        };
        
        const sceneStoreState = {
            state: {
                scenes: [scene1, scene2],
                timelines: {
                    "scene-1": scene1.timeline
                },
                generatedImages: {
                    "scene-1": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                    "scene-2": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                },
                generatedShotImages: {},
                generatedVideos: {},
                videoFeedbackResults: {},
                generationJobs: {},
                sceneImageStatuses: {},
                selectedSceneId: "scene-1",
                _hasHydrated: true
            },
            version: 0
        };

        const openRequest = indexedDB.open(dbName);
        
        await new Promise((resolve, reject) => {
            openRequest.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                // Ensure stores exist
                if (!db.objectStoreNames.contains('misc') || !db.objectStoreNames.contains('scenes')) {
                    // If stores missing, we can't inject easily without version upgrade.
                    // But since we loaded the app, they should exist.
                    reject("Stores not found");
                    return;
                }

                const tx = db.transaction(['misc', 'scenes', 'storyBible'], 'readwrite');
                tx.objectStore('scenes').clear();
                tx.objectStore('storyBible').clear();
                
                // Populate legacy stores
                tx.objectStore('scenes').put(scene1);
                tx.objectStore('scenes').put(scene2);
                tx.objectStore('storyBible').put({
                    "title": "Test Story",
                    "logline": "A test story.",
                    "synopsis": "A test story.",
                    "characters": [],
                    "plotOutline": "Act I\nScene 1: A test scene.",
                    "version": "2.0"
                }, 'current');

                tx.objectStore('misc').put('continuity', 'workflowStage');
                tx.objectStore('misc').put(sceneStoreState, 'gemDirect-scene-store');
                tx.oncomplete = () => resolve("Injected");
                tx.onerror = (e) => reject("Tx Error: " + (e.target as any).error);
            };
            openRequest.onerror = (e) => reject("DB Open Error: " + (e.target as any).error);
        });
    });

    // 3. Reload to pick up changes
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 4. Navigate to Continuity
    const continuityTab = page.getByRole('button', { name: /Continuity Review/i });
    if (await continuityTab.isVisible()) {
        await continuityTab.click();
    }
    
    // Wait for content
    await page.waitForTimeout(2000);

    // 5. Verify scene is rendered
    // Check if it appears in the warning list (confirms data exists)
    await expect(page.getByText(/Scene 2.*Broken Scene.*no shots/)).toBeVisible();
    
    // Check if the scene card is rendered (confirms no crash)
    await expect(page.getByRole('heading', { name: /Scene 2: Broken Scene/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Scene 1: Valid Scene/ })).toBeVisible();
  });
});
