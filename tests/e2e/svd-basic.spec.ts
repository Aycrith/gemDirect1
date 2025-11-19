import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { attachHelperSummaries } from './helperSummaries';

const openSettingsButton = (page: Page) =>
  page.getByRole('button', { name: /open settings/i }).first();

// Make SVD e2e UI coverage strictly opt-in. By default this
// suite is skipped so that only WAN workflows are exercised.
const RUN_SVD_E2E = process.env.RUN_SVD_E2E === '1';

test.describe('SVD workflow validation (optional)', () => {
  test.skip(!RUN_SVD_E2E, 'SVD e2e is disabled unless RUN_SVD_E2E=1');

  test('defaults to Stable Video Diffusion and allows switching to WAN', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('hasSeenWelcome', 'true');
      } catch (e) {
        // ignore
      }
    });
    await page.goto('/');
    await expect(openSettingsButton(page)).toBeVisible();
    await openSettingsButton(page).click();

    const modelSelect = page.getByLabel('Video Model');
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toHaveValue('comfy-svd');

    await modelSelect.selectOption('wan-video');
    await expect(modelSelect).toHaveValue('wan-video');
  });

  test.afterEach(async ({ }, testInfo: TestInfo) => {
    await attachHelperSummaries(testInfo);
  });
});
