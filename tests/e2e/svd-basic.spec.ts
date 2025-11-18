import { test, expect, type Page } from '@playwright/test';

const openSettingsButton = (page: Page) =>
  page.getByRole('button', { name: /open settings/i }).first();

test.describe('SVD workflow validation', () => {
  test('defaults to Stable Video Diffusion and allows switching to WAN', async ({ page }) => {
    await page.goto('/');
    await expect(openSettingsButton(page)).toBeVisible();
    await openSettingsButton(page).click();

    const modelSelect = page.getByLabel('Video Model');
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toHaveValue('comfy-svd');

    await modelSelect.selectOption('wan-video');
    await expect(modelSelect).toHaveValue('wan-video');
  });
});
