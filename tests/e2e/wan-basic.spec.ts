import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { attachHelperSummaries } from './helperSummaries';

const openSettingsButton = (page: Page) =>
  page.getByRole('button', { name: /open settings/i }).first();

test.describe('WAN workflow validation', () => {
  test('loads WAN workflow details from the settings modal', async ({ page }) => {
    // Ensure the welcome modal does not block clicks in CI/E2E environments
    // by pre-seeding a localStorage flag before the page loads.
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

    // The settings modal contains multiple 'Load WAN Workflow' buttons (for
    // different sections). Pick the WAN video workflow button if available,
    // otherwise fall back to the first match.
    const possibleButtons = page.getByRole('button', { name: 'Load WAN Workflow' });
    let loadButton = possibleButtons.nth(1);
    try {
      if (!(await loadButton.isVisible())) {
        loadButton = possibleButtons.first();
      }
    } catch (e) {
      loadButton = possibleButtons.first();
    }

    await expect(loadButton).toBeVisible();
    await loadButton.click();
    await expect(loadButton).toBeEnabled();
  });
  test.afterEach(async ({ }, testInfo: TestInfo) => {
    await attachHelperSummaries(testInfo);
  });
});
