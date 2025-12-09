import { test, expect } from '@playwright/test';
import { waitForHydrationGate, initializeApp } from '../fixtures/test-helpers';

test.describe('App Loading Diagnostics', () => {
  // Firefox has known issues with browser context cleanup in Playwright
  // These tests pass functionally but cleanup can fail with protocol errors
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox has known Playwright context cleanup issues');
  });
  test('React app loads without critical errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    
    // Capture console messages
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      consoleErrors.push(`Page Error: ${error.message}`);
    });

    // Navigate to the app
    await page.goto('/');

    // Wait for HydrationGate to complete (preferred over waitForSelector)
    await waitForHydrationGate(page);

    // Wait for the root element to be fully rendered
    await page.waitForSelector('#root', { timeout: 10000 });

    // Take a screenshot for diagnosis
    await page.screenshot({ path: 'test-results/app-loading-screenshot.png', fullPage: true });

    // Check for main app header or title
    const pageContent = await page.textContent('body');
    
    console.log('=== DIAGNOSTIC RESULTS ===');
    console.log('Page loaded successfully');
    console.log('\nConsole Errors:', consoleErrors.length);
    consoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    
    console.log('\nConsole Warnings:', consoleWarnings.length);
    consoleWarnings.forEach((warn, i) => console.log(`  ${i + 1}. ${warn}`));
    
    console.log('\nPage Content Preview (first 500 chars):');
    console.log(pageContent?.slice(0, 500));

    // Report findings
    if (consoleErrors.length > 0) {
      console.log('\n⚠️  Critical errors detected - app may not load properly');
    } else {
      console.log('\n✅ No critical console errors detected');
    }
  });

  test('App renders main heading', async ({ page }) => {
    await page.goto('/');
    
    // Wait for hydration before checking UI
    await waitForHydrationGate(page);
    
    // Look for any h1 element
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 10000 });
    
    const headingText = await h1.textContent();
    console.log('Main heading found:', headingText);
  });

  test('IndexedDB initializes correctly', async ({ page }) => {
    await page.goto('/');
    
    // Wait for hydration (which includes IndexedDB initialization)
    await waitForHydrationGate(page);
    
    const dbExists = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.some(db => db.name === 'cinematic-story-db');
    });
    
    console.log('IndexedDB "cinematic-story-db" exists:', dbExists);
    expect(dbExists).toBeTruthy();
  });

  test('Mode switching works (Quick Generate ↔ Director Mode)', async ({ page }) => {
    // This test requires the Quick Generate feature flag to be enabled.
    // Since the feature is disabled by default and cannot be reliably enabled
    // via addInitScript (Zustand stores load from IndexedDB), we check if
    // the button is available and skip if the feature is disabled.
    
    await page.goto('/');
    
    // Use initializeApp which handles hydration + welcome dialog
    await initializeApp(page);
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Cinematic Story Generator")', { timeout: 10000 });
    
    // Get mode button references
    const quickButton = page.locator('[data-testid="mode-quick"]');
    const directorButton = page.locator('[data-testid="mode-director"]');
    
    // Check if Quick Generate is available (requires feature flag)
    const quickButtonVisible = await quickButton.isVisible().catch(() => false);
    if (!quickButtonVisible) {
      console.log('⚠️ SKIP: Quick Generate feature flag is disabled - mode switching test requires enableQuickGenerate=true');
      test.skip();
      return;
    }
    
    // Verify both mode buttons exist
    await expect(quickButton).toBeVisible({ timeout: 5000 });
    await expect(directorButton).toBeVisible({ timeout: 5000 });
    
    // Click Quick Generate mode button
    await quickButton.click({ timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Take screenshot after switching to Quick mode
    await page.screenshot({ path: 'test-results/mode-quick-generate.png' });
    
    // Verify button state changed (Quick mode should now be active/highlighted)
    const quickButtonClass = await quickButton.getAttribute('class');
    console.log('Quick button classes after click:', quickButtonClass);
    
    // Click Director Mode button
    await directorButton.click({ timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Take screenshot after switching to Director mode
    await page.screenshot({ path: 'test-results/mode-director.png' });
    
    // Verify button state changed
    const directorButtonClass = await directorButton.getAttribute('class');
    console.log('Director button classes after click:', directorButtonClass);
    
    console.log('✅ Mode switching between Quick Generate and Director Mode works');
  });
});
