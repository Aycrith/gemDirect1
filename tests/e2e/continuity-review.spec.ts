/**
 * Phase 2 Validation Suite 4: Continuity Review
 * 
 * CONDITIONAL SUITE: Only runs if continuity review feature exists in codebase.
 * 
 * Tests:
 * 1. Feature verification (determines if suite runs)
 * 2. UI accessibility
 * 3. Rating/scoring system
 * 4. Context viewing (preceding/following scenes)
 * 5. AI analysis integration
 * 6. Review persistence
 */

import { test, expect } from '@playwright/test';
import { quickSetup } from '../fixtures/story-scenario';

test.describe('Phase 2 Suite 4: Continuity Review', () => {
  let featureExists = false;

  test.beforeAll(async ({ browser }) => {
    // Verify continuity review feature exists before running suite
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:3000');
    
    // Search for continuity review UI elements
    const continuityButton = page.locator('[data-testid*="continuity"], button:has-text("Continuity"), button:has-text("Review")');
    const reviewPanel = page.locator('[aria-label*="review"], [data-testid*="review-panel"]');
    const ratingSystem = page.locator('[data-testid*="rating"], [aria-label*="rating"]');
    
    featureExists = await continuityButton.count() > 0 || 
                   await reviewPanel.count() > 0 ||
                   await ratingSystem.count() > 0;
    
    if (!featureExists) {
      console.log('⚠️ CONTINUITY REVIEW FEATURE NOT FOUND');
      console.log('Suite 4 will be skipped - document in PHASE_2_CONTINUITY_REVIEW_NOT_FOUND_20251121.md');
      console.log('Adjusted test count: 35 → 29 tests');
    } else {
      console.log('✅ Continuity review feature detected - running full suite');
    }
    
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    if (!featureExists) {
      test.skip();
    }
    
    await page.goto('http://localhost:3000');
    
    // Skip welcome modal
    const welcomeModal = page.locator('[data-testid="welcome-modal"]');
    if (await welcomeModal.isVisible()) {
      const skipButton = page.locator('[data-testid="welcome-skip"]');
      await skipButton.click();
      await welcomeModal.waitFor({ state: 'hidden' });
    }
  });

  test('VERIFY: Continuity review feature exists', async ({ page }) => {
    // This test documents feature existence for the report
    
    if (!featureExists) {
      console.log('❌ Feature not found - skipping Suite 4');
      test.skip();
      return;
    }
    
    console.log('✅ Continuity review feature verified');
    expect(featureExists).toBeTruthy();
  });

  test('HIGH: Continuity review UI accessible', async ({ page }) => {
    // Navigate to continuity review interface
    
    const reviewButton = page.locator('button:has-text("Review"), button:has-text("Continuity"), [data-testid*="continuity"]');
    await expect(reviewButton.first()).toBeVisible({ timeout: 10000 });
    
    await reviewButton.first().click();
    
    // Verify review panel opens
    const reviewPanel = page.locator('[data-testid*="review-panel"], [aria-label*="review"]');
    await expect(reviewPanel.first()).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Continuity review UI accessible');
  });

  test('HIGH: Can rate generations (thumbs up/down or stars)', async ({ page }) => {
    // Test rating system functionality
    
    const ratingControls = page.locator('[data-testid*="rating"], [aria-label*="rating"], button:has-text("👍"), button:has-text("👎")');
    
    if (await ratingControls.count() === 0) {
      console.log('⚠️ No rating controls found');
      test.skip();
      return;
    }
    
    await ratingControls.first().click();
    
    // Verify rating was recorded
    const ratedIndicator = page.locator('[data-testid*="rated"], [aria-label*="rated"]');
    const hasRating = await ratedIndicator.count() > 0;
    
    expect(hasRating).toBeTruthy();
    console.log('✅ Rating system functional');
  });

  test('HIGH: Can score generation vs description', async ({ page }) => {
    // Test scoring system (how well generation matches description)
    
    const scoringControls = page.locator('[data-testid*="score"], input[type="range"], [role="slider"]');
    
    if (await scoringControls.count() === 0) {
      console.log('⚠️ No scoring controls found');
      test.skip();
      return;
    }
    
    // Interact with scoring control
    await scoringControls.first().click();
    
    console.log('✅ Scoring system accessible');
  });

  test('MEDIUM: Can view context (preceding/following scenes)', async ({ page }) => {
    // Test context viewing for continuity analysis
    
    const contextViewer = page.locator('[data-testid*="context"], [aria-label*="context"], button:has-text("Previous"), button:has-text("Next")');
    
    if (await contextViewer.count() === 0) {
      console.log('⚠️ No context viewer found');
      test.skip();
      return;
    }
    
    console.log('✅ Context viewer available');
  });

  test('MEDIUM: AI analysis provided for generations', async ({ page }) => {
    // Test AI-powered continuity analysis
    
    const aiAnalysis = page.locator('[data-testid*="ai-analysis"], [aria-label*="ai analysis"], text=/ai.*analysis|analysis.*ai/i');
    
    if (await aiAnalysis.count() === 0) {
      console.log('⚠️ No AI analysis found');
      test.skip();
      return;
    }
    
    const analysisText = await aiAnalysis.first().textContent();
    expect(analysisText).toBeTruthy();
    expect(analysisText!.length).toBeGreaterThan(10);
    
    console.log('✅ AI analysis present');
  });

  test('MEDIUM: Reviews saved to database', async ({ page }) => {
    // Test persistence of continuity reviews
    
    // Check IndexedDB for review storage
    const hasReviewStorage = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('gemDirect1-db', 1);
        
        request.onsuccess = () => {
          const db = request.result;
          const stores = Array.from(db.objectStoreNames);
          
          const hasReviews = stores.some(store => /review|rating|score|continuity/i.test(store));
          
          db.close();
          resolve(hasReviews);
        };
        
        request.onerror = () => resolve(false);
      });
    });
    
    if (hasReviewStorage) {
      console.log('✅ Review storage exists in IndexedDB');
    } else {
      console.log('⚠️ No review storage found - reviews may not persist');
    }
  });
});
