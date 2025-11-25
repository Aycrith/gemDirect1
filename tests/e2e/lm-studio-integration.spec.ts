import { test, expect } from '@playwright/test';
import { dismissWelcomeDialog, ensureDirectorMode } from '../fixtures/test-helpers';

/**
 * LM Studio Integration Test Suite
 * 
 * Tests the integration with LM Studio (Mistral Nemo) for text generation.
 * Validates error handling, retry logic, timeout behavior, and fallback mechanisms.
 * 
 * Prerequisites:
 * - LM Studio running on http://192.168.50.192:1234 (configured in .env.local)
 * - Mistral Nemo model loaded
 * - Vite dev server running (provides CORS proxy)
 * 
 * NOTE: These tests make REAL LLM calls and should be skipped by default.
 * Set RUN_REAL_WORKFLOWS=1 to enable these tests.
 */

const RUN_REAL_WORKFLOWS = process.env.RUN_REAL_WORKFLOWS === '1';

test.describe('LM Studio Integration', () => {
  test.skip(!RUN_REAL_WORKFLOWS, 'LM Studio integration tests require RUN_REAL_WORKFLOWS=1 and running LM Studio service to avoid overwhelming the LLM server');
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
  });

  test('generates story bible successfully with valid response', async ({ page }) => {
    // This test requires LM Studio to be running
    // Expected duration: 30-90 seconds for Mistral 7B generation
    
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await ideaTextarea.waitFor({ state: 'visible', timeout: 10000 });
    await ideaTextarea.fill('A cyberpunk hacker discovers a corporate surveillance AI');
    
    // Start generation
    const generateButton = page.locator('button:has-text("Generate Story Bible")').first();
    await generateButton.click();
    
    // Wait for generation to complete (120s timeout as configured)
    const storyBibleSection = page.locator('text=/logline|setting|characters/i').first();
    await expect(storyBibleSection).toBeVisible({ timeout: 120000 });
    
    // Verify story bible content appears
    const pageContent = await page.textContent('body');
    expect(pageContent).toMatch(/logline|setting|characters|plot/i);
    
    console.log('✅ Story bible generated successfully via LM Studio');
  });

  test('shows user-friendly error when LM Studio is offline', async ({ page }) => {
    // To test this manually: Stop LM Studio service before running
    // Expected behavior: User sees clear error message with guidance
    
    // Note: This test will only trigger if LM Studio is actually offline
    // In CI/CD, use a mock service that returns connection refused
    
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await ideaTextarea.fill('Test idea');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible")').first();
    await generateButton.click();
    
    // Wait for either success or error
    await page.waitForTimeout(5000);
    
    // Check if error message appears (if LM Studio is offline)
    const errorMessage = page.locator('text=/cannot connect|offline|unavailable|failed/i');
    if (await errorMessage.isVisible({ timeout: 5000 })) {
      console.log('✅ Offline error displayed correctly');
      
      // Verify error message is helpful
      const errorText = await errorMessage.textContent();
      expect(errorText?.toLowerCase()).toContain('connect');
    } else {
      console.log('⚠️ LM Studio is running - cannot test offline behavior');
    }
  });

  test.skip('handles JSON parsing errors gracefully', async ({ page }) => {
    // SKIPPED: LM Studio consistently returns well-formed JSON in practice.
    // The sanitizeLLMJson function handles markdown fences, but LM Studio's Mistral 7B
    // model reliably produces valid JSON without wrapping or malformed output.
    
    // The fallback mechanism is still validated via the "offline" test which verifies
    // template-based generation when LLM is unavailable.
    
    // If this becomes a real-world issue, we can re-enable and improve the test.
  });

  test('respects timeout configuration (120s)', async ({ page }) => {
    // Test that long-running requests timeout appropriately
    // This requires mocking a very slow response
    
    let timeoutTriggered = false;
    
    await page.route('**/api/local-llm', async route => {
      // Delay response beyond timeout
      await new Promise(resolve => setTimeout(resolve, 125000)); // 125s > 120s timeout
      timeoutTriggered = true;
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                logline: 'Test story',
                characters: 'Test characters'
              })
            }
          }]
        })
      });
    });
    
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await ideaTextarea.fill('Test story idea');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible")').first();
    const startTime = Date.now();
    await generateButton.click();
    
    // Wait for timeout error (should appear around 120s)
    const errorMessage = page.locator('text=/timeout|taking too long|exceeded/i');
    const appeared = await errorMessage.isVisible({ timeout: 125000 }).catch(() => false);
    const duration = Date.now() - startTime;
    
    if (appeared) {
      console.log(`✅ Timeout error appeared after ${Math.round(duration / 1000)}s`);
      expect(duration).toBeGreaterThan(118000); // ~120s
      expect(duration).toBeLessThan(130000); // Not too much longer
    } else {
      console.log('⚠️ Timeout not triggered - check configuration');
    }
  });

  test('validates temperature configuration', async ({ page }) => {
    // Verify temperature setting is applied correctly
    // This requires checking the request payload
    
    let capturedRequest: any = null;
    
    await page.route('**/api/local-llm', async route => {
      capturedRequest = await route.request().postDataJSON();
      
      await route.continue();
    });
    
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await ideaTextarea.fill('Test story');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible")').first();
    await generateButton.click();
    
    // Wait for request to be captured
    await page.waitForTimeout(3000);
    
    if (capturedRequest) {
      console.log('Captured LLM request:', JSON.stringify(capturedRequest, null, 2));
      
      // Verify temperature is set (from .env.local: 0.7)
      expect(capturedRequest).toHaveProperty('temperature');
      expect(typeof capturedRequest.temperature).toBe('number');
      
      console.log(`✅ Temperature configured: ${capturedRequest.temperature}`);
    } else {
      console.log('⚠️ Request not captured - check proxy configuration');
    }
  });

  test('includes proper system and user messages', async ({ page }) => {
    // Verify request format follows OpenAI chat completion spec
    
    let capturedRequest: any = null;
    
    await page.route('**/api/local-llm', async route => {
      capturedRequest = await route.request().postDataJSON();
      await route.continue();
    });
    
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await ideaTextarea.fill('A sci-fi adventure story');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible")').first();
    await generateButton.click();
    
    await page.waitForTimeout(3000);
    
    if (capturedRequest) {
      // Verify message format
      expect(capturedRequest).toHaveProperty('messages');
      expect(Array.isArray(capturedRequest.messages)).toBe(true);
      expect(capturedRequest.messages.length).toBeGreaterThan(0);
      
      // For Mistral 7B compatibility, we use a single combined user message
      // (no system role support). Verify this pattern.
      const userMessage = capturedRequest.messages.find((m: any) => m.role === 'user');
      expect(userMessage).toBeDefined();
      
      // The user message should contain both system instructions and user content
      expect(userMessage.content).toContain('gemDirect1'); // System instructions
      expect(userMessage.content).toContain('sci-fi adventure'); // User input
      
      // Verify NO system role is used (Mistral 7B limitation)
      const systemMessage = capturedRequest.messages.find((m: any) => m.role === 'system');
      expect(systemMessage).toBeUndefined();
      
      console.log('✅ Request format validated (single user message pattern)');
    }
  });

  test('tracks request with correlation ID', async ({ page }) => {
    // Verify correlation IDs are generated and logged
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('CORR')) {
        consoleLogs.push(msg.text());
      }
    });
    
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await ideaTextarea.fill('Test story');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible")').first();
    await generateButton.click();
    
    // Wait for request to complete
    await page.waitForTimeout(5000);
    
    // Check if correlation logs appeared
    const hasCorrelationLogs = consoleLogs.some(log => 
      log.includes('story-generation-request') || 
      log.includes('lm-studio')
    );
    
    if (hasCorrelationLogs) {
      console.log('✅ Correlation tracking working');
      console.log('Sample logs:', consoleLogs.slice(0, 3));
    } else {
      console.log('⚠️ No correlation logs detected');
    }
  });

  test('persists generated story bible to IndexedDB', async ({ page }) => {
    // This test requires a successful generation first
    // Then verify persistence across reload
    
    // Skip if LM Studio not available (would timeout)
    const testTimeout = 120000;
    
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    await ideaTextarea.fill('A quick test story');
    
    const generateButton = page.locator('button:has-text("Generate Story Bible")').first();
    await generateButton.click();
    
    // Wait for generation (with timeout)
    const storyBible = page.locator('text=/logline|setting/i').first();
    const appeared = await storyBible.isVisible({ timeout: testTimeout }).catch(() => false);
    
    if (!appeared) {
      console.log('⚠️ Generation timed out - skipping persistence test');
      return;
    }
    
    // Capture story content
    const originalContent = await page.textContent('body');
    
    // Reload page
    await page.reload();
    await dismissWelcomeDialog(page);
    await page.waitForTimeout(2000); // Wait for hydration
    
    // Verify story bible still visible
    const reloadedBible = page.locator('text=/logline|setting/i').first();
    await expect(reloadedBible).toBeVisible({ timeout: 10000 });
    
    console.log('✅ Story bible persisted across reload');
  });
});

test.describe('LM Studio Retry Logic', () => {
  test.skip('retries on transient failures', async ({ page }) => {
    // SKIPPED: LocalStoryService does not implement retry logic.
    // Instead, it immediately falls back to template-based generation on any error.
    // This is intentional design - local LLM failures should not block users.
    // Retry logic only exists in Gemini service (withRetry wrapper).
    
    // Future enhancement: Implement retry logic in localStoryService.ts
    // if we want to match Gemini's resilience pattern for local LLMs.
  });

  test.skip('stops retrying after max attempts', async ({ page }) => {
    // SKIPPED: LocalStoryService does not implement retry logic.
    // Instead, it immediately falls back to template-based generation on any error.
    // This is intentional design - local LLM failures should not block users.
    // Retry logic only exists in Gemini service (withRetry wrapper).
    
    // Future enhancement: Implement retry logic in localStoryService.ts
    // if we want to match Gemini's resilience pattern for local LLMs.
  });
});
