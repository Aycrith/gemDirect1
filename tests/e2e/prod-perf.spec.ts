import { test } from '@playwright/test';

test('production build cold start', async ({ page }) => {
  const startTime = Date.now();
  
  await page.goto('/');
  
  // Wait for app to be interactive
  await page.waitForLoadState('domcontentloaded');
  const domReadyTime = Date.now() - startTime;
  console.log(`[PROD] DOM Content Loaded: ${domReadyTime}ms`);
  
  await page.waitForLoadState('networkidle');
  const networkIdleTime = Date.now() - startTime;
  console.log(`[PROD] Network Idle: ${networkIdleTime}ms`);
  
  // Wait for React to mount (look for actual React-rendered content)
  const appRoot = page.locator('#root').first();
  await appRoot.waitFor({ state: 'attached' });
  
  // Wait for first meaningful content (either welcome dialog or main UI)
  const welcomeDialog = page.locator('[role="dialog"]').first();
  const mainContent = page.locator('main, .app-content, #root > div').first();
  
  await Promise.race([
    welcomeDialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
    mainContent.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null)
  ]);
  
  const reactMountTime = Date.now() - startTime;
  console.log(`[PROD] React Mount: ${reactMountTime}ms`);
  
  // Wait for app to be fully interactive
  await page.waitForLoadState('load');
  const interactiveTime = Date.now() - startTime;
  console.log(`[PROD] Time to Interactive: ${interactiveTime}ms`);
  
  console.log(`\n=== PRODUCTION BUILD PERFORMANCE ===`);
  console.log(`DOM Ready: ${domReadyTime}ms`);
  console.log(`Network Idle: ${networkIdleTime}ms`);
  console.log(`React Mount: ${reactMountTime}ms`);
  console.log(`Time to Interactive: ${interactiveTime}ms`);
  console.log(`====================================\n`);
});
