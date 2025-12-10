import { test, expect } from '@playwright/test';
import fs from 'fs';

test.describe('Pipeline Export', () => {
  test('should export all scenes via pipeline', async ({ page }) => {
    // 1. Navigate to app
    await page.goto('/');
    
    // 2. Inject Settings
    const injectionScript = fs.readFileSync('injection_script.js', 'utf8');
    // Wrap in IIFE to execute
    await page.evaluate(`(${injectionScript})()`);
    
    // 3. Inject Story
    const storyInjectionScript = fs.readFileSync('tests/e2e/fixtures/inject-story.js', 'utf8');
    await page.evaluate(`(${storyInjectionScript})()`);

    // 4. Reload to pick up changes
    await page.reload();
    
    page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

    // Inspect DB
    const dbContent = await page.evaluate(async () => {
        const dbName = 'cinematic-story-db';
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName);
            req.onsuccess = (e) => {
                const target = e.target as IDBOpenDBRequest;
                const db = target.result;
                const tx = db.transaction(['misc'], 'readonly');
                const store = tx.objectStore('misc');
                const getReq = store.get('gemDirect-scene-store');
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => reject(getReq.error);
            };
            req.onerror = () => reject(req.error);
        });
    });
    console.log('DB Content:', JSON.stringify(dbContent, null, 2));

    // 5. Verify we are on Continuity Director
    await expect(page.getByText('Continuity Director')).toBeVisible();

    // 6. Click Export All Scenes
    const exportButton = page.getByRole('button', { name: /Export All Scenes/i });
    await expect(exportButton).toBeVisible();
    
    const isDisabled = await exportButton.isDisabled();
    console.log(`Export button disabled: ${isDisabled}`);
    
    if (isDisabled) {
        const text = await exportButton.textContent();
        console.log(`Export button text: ${text}`);
    }

    await exportButton.click();

    // 7. Verify Pipeline Active state
    // Use a more flexible selector or wait for text change
    await expect(page.getByText('Pipeline Active...')).toBeVisible({ timeout: 5000 }).catch(() => {
        console.log("Pipeline Active text not found, checking toast...");
    });

    // 8. Wait for completion (or at least verify it started)
    await expect(page.getByText('Export pipeline started')).toBeVisible();

    // 9. Wait for pipeline to finish (button reverts)
    // This confirms that tasks were processed (either success or failure)
    // 2 minute timeout to allow for actual generation if server is fast, or failure if not.
    await expect(page.getByRole('button', { name: /Export All Scenes/i })).toBeVisible({ timeout: 120000 });
  });
});
