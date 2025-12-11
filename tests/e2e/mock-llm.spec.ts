import { test, expect } from '@playwright/test';
import { dismissWelcomeDialog, ensureDirectorMode } from '../fixtures/test-helpers';

test.describe('Mock LLM Integration', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`[Browser] ${msg.text()}`));
    
    // 1. Clear IndexedDB to force SettingsStore to use initial state
    await page.goto('about:blank'); // Navigate to blank page to ensure clean slate? No, need origin.
    // We must navigate to the app origin to clear its DB.
    // But if we navigate to '/', the app loads and might save to DB.
    // We can navigate to a non-existent page on the same origin?
    // Or just navigate to '/' and clear it, accepting that it might race?
    // Better: Navigate to '/' then clear. Then reload with init script.
    
    await page.goto('/');
    await page.evaluate(async () => {
        const dbName = 'cinematic-story-db';
        const storeName = 'misc';
        const key = 'gemDirect-settings-store';
        
        await new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(storeName)) {
                    resolve('Store not found');
                    return;
                }
                const transaction = db.transaction([storeName], "readwrite");
                const store = transaction.objectStore(storeName);
                const deleteReq = store.delete(key);
                
                deleteReq.onsuccess = () => resolve('Deleted');
                deleteReq.onerror = (e) => reject(e);
            };
            request.onerror = (e) => reject(e);
        });
        console.log('[Test] Cleared IndexedDB settings');
    });

    // 2. Inject settings via init script (runs before app loads on next navigation)
    await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__INJECTED_SETTINGS = {
            useMockLLM: true,
            featureFlags: {
                useLLMTransportAdapter: true
            }
        };
        console.log('[Test] Injected __INJECTED_SETTINGS');
        
        // Also inject into sessionStorage for usePersistentState hydration
        sessionStorage.setItem('gemDirect_planExpansion.strategy.selected', JSON.stringify('gemini-plan'));
    });

    // 3. Reload to apply injection and clean DB state
    console.log('[Test] Reloading to apply settings...');
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
  });

  test('generates story using Mock LLM', async ({ page }) => {
    // Fill in story idea
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await ideaTextarea.waitFor({ state: 'visible', timeout: 10000 });
    await ideaTextarea.fill('A brilliant hacker uncovers a massive corporate surveillance operation that threatens to expose government secrets, but she must choose between revealing the truth and protecting her family from dangerous enemies who will stop at nothing to silence her.');
    
    // Click generate button
    const generateButton = page.locator('button:has-text("Generate Story Bible")').first();
    await expect(generateButton).toBeEnabled({ timeout: 5000 });
    await generateButton.click();
    
    // Verify mock content appears
    // The mock response (from MockGeminiService) has specific titles/loglines
    // "Mock Story: The Neon Courier" or similar from SAMPLE_SCENES if using the script, 
    // but here we are using the UI service `MockGeminiService`.
    
    // Let's check what MockGeminiService returns.
    // It returns "Mock Story: The Neon Courier" in the logline or title.
    
    await expect(page.getByText('Mock Story: The Neon Courier')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Mock Vision: A stylized, high-contrast cinematic look')).toBeVisible();
  });
});
