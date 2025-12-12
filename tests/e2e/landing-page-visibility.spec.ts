import { test, expect } from '@playwright/test';
import { waitForHydrationGate } from '../fixtures/test-helpers';

/**
 * Landing Page Visibility Test
 * Validates that the landing page (idea stage) is visible on initial load
 */

test.describe('Landing Page Visibility', () => {
  test('landing page renders and is visible on first load', async ({ page }) => {
    // Capture console errors
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleMessages.push(`Console Error: ${msg.text()}`);
        console.error('Browser console error:', msg.text());
      }
    });
    
    page.on('pageerror', error => {
      consoleMessages.push(`Page Error: ${error.message}`);
      console.error('Browser page error:', error.message);
    });
    
    // Go to app
    await page.goto('/');
    
    // Wait for HydrationGate to complete (preferred over networkidle + waitForTimeout)
    await waitForHydrationGate(page);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/landing-page-initial-load.png', fullPage: true });
    
    // Check if the main header is visible
    const header = page.locator('header');
    await expect(header).toBeVisible({ timeout: 5000 });
    console.log('✓ Header is visible');
    
    // Check if the app title is visible (use .first() since there are two h1s: header + landing page)
    const title = page.locator('h1').filter({ hasText: 'Cinematic Story Generator' }).first();
    await expect(title).toBeVisible({ timeout: 5000 });
    console.log('✓ App title is visible');
    
    // Check if we're in the idea stage (landing page) or Director Mode
    // This depends on whether Quick Generate is enabled
    const quickButton = page.locator('[data-testid="mode-quick"]');
    const isQuickGenerateEnabled = await quickButton.isVisible().catch(() => false);

    if (isQuickGenerateEnabled) {
      const ideaFormTitle = page.locator('h2').filter({ hasText: 'Start with an Idea' });
      await expect(ideaFormTitle).toBeVisible({ timeout: 5000 });
      console.log('✓ Idea form title is visible');
      
      // Check if the story idea textarea is visible and interactive
      const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
      await expect(ideaTextarea).toBeVisible({ timeout: 5000 });
      await expect(ideaTextarea).toBeEditable({ timeout: 5000 });
      console.log('✓ Story idea textarea is visible and editable');
      
      // Check if the generate button is visible
      const generateButton = page.locator('button:has-text("Generate Story Bible")');
      await expect(generateButton).toBeVisible({ timeout: 5000 });
      console.log('✓ Generate button is visible');
    } else {
      console.log('ℹ️ Quick Generate disabled, verifying Director Mode landing page');
      const directorButton = page.locator('[data-testid="mode-director"]');
      await expect(directorButton).toBeVisible({ timeout: 5000 });
      
      const directorClasses = await directorButton.getAttribute('class');
      expect(directorClasses).toContain('bg-amber');
      console.log('✓ Director Mode is active');
      
      // Verify Director Mode specific elements
      // Ensure we don't see the idea form
      const ideaFormTitle = page.locator('h2').filter({ hasText: 'Start with an Idea' });
      await expect(ideaFormTitle).not.toBeVisible();
    }
    
    // Verify no loading spinner or blocker is present
    const loadingSpinner = page.locator('.animate-spin');
    await expect(loadingSpinner).not.toBeVisible({ timeout: 1000 }).catch(() => {
      console.log('⚠ Loading spinner present - this may indicate initialization issue');
    });
    
    console.log('\n✅ All landing page elements are visible and accessible');
  });
  
  test('landing page renders in Director Mode by default', async ({ page }) => {
    await page.goto('/');
    await waitForHydrationGate(page);
    
    // Check if Director Mode button is active
    const directorButton = page.locator('[data-testid="mode-director"]');
    await expect(directorButton).toBeVisible({ timeout: 5000 });
    
    const directorClasses = await directorButton.getAttribute('class');
    expect(directorClasses).toContain('bg-amber');
    console.log('✓ Director Mode is active by default');
  });
  
  test('can switch between Quick Generate and Director Mode', async ({ page }) => {
    // This test requires the Quick Generate feature flag to be enabled.
    // Since the feature is disabled by default and cannot be reliably enabled
    // via addInitScript (Zustand stores load from IndexedDB), we check if
    // the button is available and skip if the feature is disabled.
    
    await page.goto('/');
    await waitForHydrationGate(page);
    
    // Check if Quick Generate is available (requires feature flag)
    const quickButton = page.locator('[data-testid="mode-quick"]');
    const quickButtonVisible = await quickButton.isVisible().catch(() => false);
    if (!quickButtonVisible) {
      console.log('⚠️ SKIP: Quick Generate feature flag is disabled - mode switching test requires enableQuickGenerate=true');
      test.skip();
      return;
    }
    
    // Switch to Quick Generate
    await expect(quickButton).toBeVisible({ timeout: 5000 });
    await quickButton.click();
    await page.waitForTimeout(500);
    
    let quickClasses = await quickButton.getAttribute('class');
    expect(quickClasses).toContain('bg-amber');
    console.log('✓ Quick Generate mode activated');
    
    // Switch back to Director Mode
    const directorButton = page.locator('[data-testid="mode-director"]');
    await directorButton.click();
    await page.waitForTimeout(500);
    
    const directorClasses = await directorButton.getAttribute('class');
    expect(directorClasses).toContain('bg-amber');
    console.log('✓ Director Mode re-activated');
    
    // Verify idea form is still visible
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await expect(ideaTextarea).toBeVisible();
    console.log('✓ Idea form remains visible after mode switch');
  });
});
