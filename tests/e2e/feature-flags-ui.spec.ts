/**
 * @file feature-flags-ui.spec.ts
 * E2E tests for Feature Flags UI in LocalGenerationSettingsModal
 */

import { test, expect } from '@playwright/test';

/**
 * Helper function to open the settings modal and wait for it to fully load.
 * Uses the robust pattern from bookend-sequential.spec.ts to handle lazy-loading.
 */
async function openSettingsModal(page: import('@playwright/test').Page): Promise<void> {
    const settingsBtn = page.locator('[data-testid="settings-button"]');
    await expect(settingsBtn).toBeVisible({ timeout: 10000 });
    await settingsBtn.click();
    
    // Wait for modal to load (it's lazy-loaded via Suspense)
    // First wait for either the loading state or modal content to appear
    await page.waitForFunction(() => {
        const loadingText = document.querySelector('[data-testid="modal-loading"]');
        const modalContent = document.querySelector('[data-testid="LocalGenerationSettingsModal"]');
        return loadingText || modalContent;
    }, { timeout: 10000 });
    
    // Then wait for loading to complete and modal content to be visible
    try {
        await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { timeout: 30000 });
    } catch (e) {
        // Retry once if first attempt fails
        console.log('Modal not found immediately, retrying click...');
        await page.waitForTimeout(1000);
        await settingsBtn.click({ force: true });
        await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { timeout: 30000 });
    }
}

test.describe('Feature Flags UI', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the app
        await page.goto('/');
        
        // Wait for app to load
        await page.waitForSelector('[data-testid="settings-button"]', { timeout: 30000 });
    });

    test('should show Features tab in settings modal', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Check that Features tab exists
        const featuresTab = page.locator('button', { hasText: 'Features' });
        await expect(featuresTab).toBeVisible();
    });

    test('should display all feature flag categories', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.locator('button', { hasText: 'Features' }).click();
        
        // Verify all category headers are present
        await expect(page.locator('text=Quality Enhancement')).toBeVisible();
        await expect(page.locator('text=Workflow').first()).toBeVisible();
        await expect(page.locator('text=Continuity').first()).toBeVisible();
        await expect(page.locator('text=Experimental').first()).toBeVisible();
    });

    test('should display feature flags with labels and stability badges', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.click('button:has-text("Features")');
        
        // Check for some specific feature flags
        await expect(page.locator('text=Auto-Generate Suggestions')).toBeVisible();
        await expect(page.locator('text=Provider Health Polling')).toBeVisible();
        await expect(page.locator('text=Prompt Quality Gate')).toBeVisible();
        await expect(page.locator('text=Bookend Keyframes')).toBeVisible();
        
        // Check for stability badges
        await expect(page.locator('text=STABLE').first()).toBeVisible();
        await expect(page.locator('text=BETA').first()).toBeVisible();
        await expect(page.locator('text=EXPERIMENTAL').first()).toBeVisible();
    });

    test('should toggle feature flags on/off', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.click('button:has-text("Features")');
        
        // Find the Auto-Generate Suggestions checkbox (should be unchecked by default)
        const autoSuggestionsLabel = page.locator('label:has-text("Auto-Generate Suggestions")');
        const checkbox = autoSuggestionsLabel.locator('input[type="checkbox"]');
        
        // Verify it's initially unchecked (defaults to false)
        await expect(checkbox).not.toBeChecked();
        
        // Click to enable
        await autoSuggestionsLabel.click();
        
        // Verify it's now checked
        await expect(checkbox).toBeChecked();
        
        // Click again to disable
        await autoSuggestionsLabel.click();
        
        // Verify it's unchecked again
        await expect(checkbox).not.toBeChecked();
    });

    test('should show dependency warnings for flags with dependencies', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.click('button:has-text("Features")');
        
        // Find Video Upscaling which has dependency on characterConsistency
        const videoUpscalingLabel = page.locator('label:has-text("Video Upscaling")');
        
        // Enable it
        await videoUpscalingLabel.click();
        
        // Check for dependency warning (requires Character Consistency)
        await expect(page.locator('text=⚠️ Requires:')).toBeVisible();
    });

    test('should show configuration warnings when certain flag combinations are enabled', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.click('button:has-text("Features")');
        
        // Enable Prompt A/B Testing (should warn without Quality Gate)
        const abTestingLabel = page.locator('label:has-text("Prompt A/B Testing")');
        await abTestingLabel.click();
        
        // Check for configuration warning (contains the warning about quality gate)
        await expect(page.locator('text=Configuration Warnings')).toBeVisible();
        await expect(page.locator('text=Consider enabling quality gate')).toBeVisible();
    });

    test('should reset all features to defaults', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.click('button:has-text("Features")');
        
        // Enable a few features
        await page.locator('label:has-text("Auto-Generate Suggestions")').click();
        await page.locator('label:has-text("Prompt Quality Gate")').click();
        
        // Verify they're enabled
        const autoSuggestCheckbox = page.locator('label:has-text("Auto-Generate Suggestions") input[type="checkbox"]');
        const qualityGateCheckbox = page.locator('label:has-text("Prompt Quality Gate") input[type="checkbox"]');
        await expect(autoSuggestCheckbox).toBeChecked();
        await expect(qualityGateCheckbox).toBeChecked();
        
        // Click reset button
        await page.click('button:has-text("Reset all features to defaults")');
        
        // Verify they're now unchecked
        await expect(autoSuggestCheckbox).not.toBeChecked();
        await expect(qualityGateCheckbox).not.toBeChecked();
    });

    test('should save feature flag settings and persist them', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.click('button:has-text("Features")');
        
        // Enable Provider Health Polling
        await page.locator('label:has-text("Provider Health Polling")').click();
        
        // Save settings
        await page.click('[data-testid="save-settings"]');
        
        // Wait for modal to close
        await page.waitForSelector('[data-testid="save-settings"]', { state: 'hidden', timeout: 5000 });
        
        // Re-open settings
        await openSettingsModal(page);
        
        // Go to Features tab
        await page.click('button:has-text("Features")');
        
        // Verify Provider Health Polling is still enabled
        const healthPollingCheckbox = page.locator('label:has-text("Provider Health Polling") input[type="checkbox"]');
        await expect(healthPollingCheckbox).toBeChecked();
    });

    test('should show feature descriptions on hover or in label', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.click('button:has-text("Features")');
        
        // Verify description text is visible for features
        await expect(page.locator('text=Periodically check ComfyUI health')).toBeVisible();
        await expect(page.locator('text=Block generation when prompt quality')).toBeVisible();
    });

    test('should highlight enabled features with different styling', async ({ page }) => {
        // Open settings modal with robust loading pattern
        await openSettingsModal(page);
        
        // Click Features tab
        await page.click('button:has-text("Features")');
        
        // Get the Quality Enhancement section
        const autoSuggestLabel = page.locator('label:has-text("Auto-Generate Suggestions")');
        
        // Get initial class (should not contain green)
        const initialClass = await autoSuggestLabel.getAttribute('class') || '';
        expect(initialClass).not.toContain('green');
        
        // Enable it
        await autoSuggestLabel.click();
        
        // Check class changed to include green styling
        const enabledClass = await autoSuggestLabel.getAttribute('class') || '';
        expect(enabledClass).toContain('green');
    });
});

test.describe('Provider Health Indicator', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the app
        await page.goto('/');
        await page.waitForSelector('[data-testid="settings-button"]', { timeout: 30000 });
    });

    test('should not show health indicator by default (flag disabled)', async ({ page }) => {
        // Provider health indicator should not be visible by default
        const healthIndicator = page.locator('[data-testid="provider-health-indicator"]');
        await expect(healthIndicator).not.toBeVisible();
    });

    test('should show compact health indicator when flag is enabled', async ({ page }) => {
        // Open settings and enable Provider Health Polling
        await openSettingsModal(page);
        await page.click('button:has-text("Features")');
        await page.locator('label:has-text("Provider Health Polling")').click();
        await page.click('[data-testid="save-settings"]');
        
        // Wait for modal to close and page to update
        await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { state: 'hidden' });
        
        // Give time for component to re-render
        await page.waitForTimeout(500);
        
        // Look for the compact health indicator button in the header
        // It should show "ComfyUI" text
        const healthButton = page.locator('button:has-text("ComfyUI")');
        await expect(healthButton).toBeVisible({ timeout: 5000 });
    });
});

test.describe('Quality Gate Indicator', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the app
        await page.goto('/');
        await page.waitForSelector('[data-testid="settings-button"]', { timeout: 30000 });
    });

    test('should show quality gate indicator when flag is enabled and scenes exist', async ({ page }) => {
        // First enable Quality Gate flag
        await openSettingsModal(page);
        await page.click('button:has-text("Features")');
        await page.locator('label:has-text("Prompt Quality Gate")').click();
        await page.click('[data-testid="save-settings"]');
        await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { state: 'hidden' });
        
        // Note: Full integration testing of quality gate blocking requires
        // completing story generation, which is tested separately in
        // comprehensive-walkthrough.spec.ts
        
        // For now, just verify the flag was saved
        await openSettingsModal(page);
        await page.click('button:has-text("Features")');
        
        const qualityGateCheckbox = page.locator('label:has-text("Prompt Quality Gate") input[type="checkbox"]');
        await expect(qualityGateCheckbox).toBeChecked();
    });
});


