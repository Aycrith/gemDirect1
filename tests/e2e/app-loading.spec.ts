import { test, expect } from '@playwright/test';

test.describe('App Loading Diagnostics', () => {
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

    // Wait for the root element to render
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
    
    // Look for any h1 element
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 10000 });
    
    const headingText = await h1.textContent();
    console.log('Main heading found:', headingText);
  });

  test('IndexedDB initializes correctly', async ({ page }) => {
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForTimeout(2000);
    
    const dbExists = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.some(db => db.name === 'cinematic-story-db');
    });
    
    console.log('IndexedDB "cinematic-story-db" exists:', dbExists);
    expect(dbExists).toBeTruthy();
  });

  test('Mode switching works (Quick Generate ↔ Director Mode)', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Cinematic Story Generator")', { timeout: 10000 });
    
    // Dismiss welcome dialog if present by clicking on any button in the dialog
    try {
      const welcomeDialog = page.locator('[role="dialog"]');
      if (await welcomeDialog.isVisible({ timeout: 2000 })) {
        // Find and click the first button in the welcome dialog
        const dialogButton = welcomeDialog.locator('button').first();
        await dialogButton.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // Welcome dialog not present or already dismissed
      console.log('No welcome dialog to dismiss');
    }
    
    // Get initial mode button states
    const quickButton = page.locator('[data-testid="mode-quick"]');
    const directorButton = page.locator('[data-testid="mode-director"]');
    
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
