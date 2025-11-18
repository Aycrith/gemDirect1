import { test, expect, type Page } from '@playwright/test';

const openSettingsButton = (page: Page) =>
  page.getByRole('button', { name: /open settings/i }).first();

test.describe('WAN workflow validation', () => {
  test('loads WAN workflow details from the settings modal', async ({ page }) => {
    await page.goto('/');
    await expect(openSettingsButton(page)).toBeVisible();
    await openSettingsButton(page).click();

    const wanSection = page
      .getByRole('heading', { name: 'WAN Text+Image→Video' })
      .locator('..');

    await expect(wanSection).toBeVisible();
    const loadButton = wanSection.getByRole('button', { name: 'Load WAN Workflow' });
    await expect(loadButton).toBeVisible();
    await loadButton.click();
    await expect(loadButton).toBeEnabled();
  });
});
