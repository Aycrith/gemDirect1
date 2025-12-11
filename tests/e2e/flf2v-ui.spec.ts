import { test, expect, type Page } from '@playwright/test';

const openSettingsButton = (page: Page) =>
  page.getByRole('button', { name: /open settings/i }).first();

test.describe('FLF2V UI Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Skip welcome modal
    await page.addInitScript(() => {
      try {
        localStorage.setItem('hasSeenWelcome', 'true');
      } catch (e) {
        // ignore
      }
    });
    await page.goto('/');
  });

  test('can enable FLF2V feature flag', async ({ page }) => {
    // 1. Open Settings
    await expect(openSettingsButton(page)).toBeVisible();
    await openSettingsButton(page).click();

    // 2. Navigate to Features tab
    const featuresTab = page.getByRole('button', { name: /features/i });
    await expect(featuresTab).toBeVisible();
    await featuresTab.click();

    // 3. Find FLF2V toggle
    // Note: The UI renders flags based on category. FLF2V is in 'continuity'.
    // We look for the label defined in FEATURE_FLAG_META
    const flf2vLabel = page.getByText('First-Last-Frame-to-Video');
    await expect(flf2vLabel).toBeVisible();

    // Find the checkbox associated with it (or near it)
    // The UI implementation might vary, but usually it's a checkbox input
    // We can try to find the input by label text if it's properly associated
    // Or find the checkbox within the same container
    
    // Assuming standard checkbox rendering:
    // The label text is "First-Last-Frame-to-Video"
    // We need to find the checkbox that controls this.
    // Let's look for a checkbox that is a sibling or child of the container
    
    // Strategy: Click the label or the checkbox
    await flf2vLabel.click(); 
    
    // If clicking the label toggles it, we need to verify the state.
    // Let's assume there's a visual indicator or we can check the underlying input.
    
    // Better approach: Check the store state via evaluate
    const isEnabledBefore = await page.evaluate(() => {
        // @ts-ignore
        const store = window.useSettingsStore?.getState();
        return store?.featureFlags?.enableFLF2V;
    });
    expect(isEnabledBefore).toBeFalsy(); // Should be false by default
    
    // If it was false (default), clicking should make it true
    // If the UI uses a specific switch component, we might need to target that.
    // Let's try to find the actual input.
    const checkbox = page.getByLabel('First-Last-Frame-to-Video');
    if (await checkbox.count() > 0) {
        await checkbox.check();
    } else {
        // Fallback: click the label if input is hidden/custom
        await flf2vLabel.click();
    }

    // 4. Save Settings
    const saveButton = page.getByRole('button', { name: /save settings/i });
    await saveButton.click();

    // 5. Verify persistence
    // Reload page to ensure it stuck
    await page.reload();
    
    // Check store state directly
    const isEnabledAfter = await page.evaluate(() => {
        // @ts-ignore
        // We need to access the store. It might be exposed on window for debugging
        // or we can check the UI again.
        return JSON.parse(localStorage.getItem('gemDirect-settings-store') || '{}').state?.featureFlags?.enableFLF2V;
    });

    expect(isEnabledAfter).toBe(true);
  });
});
