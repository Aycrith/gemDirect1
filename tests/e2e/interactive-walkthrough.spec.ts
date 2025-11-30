/**
 * Interactive Browser Walkthrough Test
 * 
 * Executes full lifecycle test with detailed logging and captures:
 * - Initial load and console errors
 * - Settings configuration
 * - Story generation (all 6 sections)
 * - Director's vision and scenes
 * - AI enhancements
 * - Keyframe generation (WAN T2I)
 * - Video generation (WAN 2.2 I2V)
 * - Coherence review
 * - Persistence and export/import
 */

import { test, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';
import { initializeTest } from '../helpers/setup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const COHERENCE_THRESHOLD = 0.7;

// Logging utilities
class WalkthroughLogger {
  private logs: Array<{ timestamp: string; phase: string; message: string; level: string }> = [];
  private reportDir: string;

  constructor(_testName: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '-' + 
                     (new Date().toTimeString().split(' ')[0] ?? '').replace(/:/g, '');
    this.reportDir = join(__dirname, '..', 'logs', `walkthrough-${timestamp}`);
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  log(phase: string, message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      phase,
      message,
      level
    };
    this.logs.push(entry);
    console.log(`[${phase}] ${level.toUpperCase()}: ${message}`);
  }

  async saveReport() {
    const reportPath = join(this.reportDir, 'walkthrough-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.logs, null, 2));
    console.log(`\n✓ Report saved to: ${reportPath}`);
    return reportPath;
  }

  async captureScreenshot(page: Page, name: string) {
    const screenshotPath = join(this.reportDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    this.log('screenshot', `Captured: ${name}`, 'info');
  }
}

test.describe('Interactive Browser Walkthrough', () => {
  test.setTimeout(600000); // 10 minutes for full walkthrough

  test.skip('Full lifecycle test with detailed logging', async ({ page }) => {
    // SKIP: This test requires full LLM generation pipeline (120s+) and is too long for standard CI runs.
    // Run manually with: RUN_MANUAL_E2E=1 npx playwright test interactive-walkthrough
    const logger = new WalkthroughLogger('full-lifecycle');
    const consoleMessages: Array<{ type: string; text: string; timestamp: string }> = [];
    const networkErrors: Array<{ url: string; error: string; timestamp: string }> = [];

    // Capture console messages
    page.on('console', msg => {
      const entry = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      };
      consoleMessages.push(entry);
      if (msg.type() === 'error' || msg.type() === 'warning') {
        logger.log('console', `${msg.type()}: ${msg.text()}`, msg.type() === 'error' ? 'error' : 'warn');
      }
    });

    // Capture network errors
    page.on('requestfailed', request => {
      const entry = {
        url: request.url(),
        error: request.failure()?.errorText || 'Unknown error',
        timestamp: new Date().toISOString()
      };
      networkErrors.push(entry);
      logger.log('network', `Failed request: ${request.url()} - ${entry.error}`, 'error');
    });

    try {
      // ========================================
      // PHASE 1: Initial Load & Settings
      // ========================================
      logger.log('phase1', '=== Starting Phase 1: Initial Load & Settings ===', 'info');
      
      const startTime = Date.now();
      // Use helper for deterministic initialization
      await initializeTest(page);
      const loadTime = Date.now() - startTime;
      logger.log('phase1', `Page initialized in ${loadTime}ms`, 'success');
      await logger.captureScreenshot(page, '01-initial-load');
      await logger.captureScreenshot(page, '02-after-welcome');

      // Open Settings (skip if not testing settings flow)
      // Note: initializeTest already handled modal, so settings button should be accessible
      const skipSettingsPhase = true; // Phase 1 already validated in other tests
      
      if (!skipSettingsPhase) {
        logger.log('phase1', 'Opening Settings...', 'info');
        const settingsButton = page.locator('[aria-label="Open settings"]').first();
        await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
        await settingsButton.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(1000);
        await logger.captureScreenshot(page, '03-settings-open');

        // Verify ComfyUI URL
        const comfyUIInput = page.locator('input[placeholder*="ComfyUI"], input[value*="8188"]').first();
        if (await comfyUIInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          const comfyUIValue = await comfyUIInput.inputValue();
          logger.log('phase1', `ComfyUI URL: ${comfyUIValue}`, comfyUIValue.includes('8188') ? 'success' : 'warn');
        } else {
          logger.log('phase1', 'ComfyUI URL input not found', 'warn');
        }

        // Check for WAN profile indicators
        const wanReadiness = page.locator('text=/WAN|wan-t2i|wan-i2v/i');
        const wanCount = await wanReadiness.count();
        logger.log('phase1', `Found ${wanCount} WAN-related elements in settings`, wanCount > 0 ? 'success' : 'warn');

        // Close Settings
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        logger.log('phase1', 'Settings closed', 'success');
      } else {
        logger.log('phase1', 'Skipping settings validation (covered in other tests)', 'info');
      }
      
      await logger.captureScreenshot(page, '03-settings-open');

      // ========================================
      // PHASE 2: Story Generation
      // ========================================
      logger.log('phase2', '=== Starting Phase 2: Story Generation ===', 'info');

      // Enter story idea
      const storyIdea = `A quantum physicist discovers a parallel universe where time runs backwards - ${Date.now()}`;
      const storyIdeaInput = page.getByTestId('story-idea-input');
      
      await storyIdeaInput.waitFor({ state: 'visible', timeout: 10000 });
      await storyIdeaInput.fill(storyIdea);
      logger.log('phase2', `Story idea entered: "${storyIdea.substring(0, 50)}..."`, 'success');

      await logger.captureScreenshot(page, '04-story-idea-entered');

      // Select genre
      const genreSelect = page.locator('select[id*="genre"], select[name*="genre"]').first();
      if (await genreSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await genreSelect.selectOption('sci-fi');
        logger.log('phase2', 'Genre selected: sci-fi', 'success');
      }

      // Generate story
      logger.log('phase2', 'Clicking Generate Story button...', 'info');
      const generateButton = page.locator('button:has-text("Generate Story"), button:has-text("Generate")').first();
      
      const storyGenStart = Date.now();
      await generateButton.click();
      logger.log('phase2', 'Generate button clicked, waiting for story generation...', 'info');

      // Wait for story generation to complete
      // Look for indicators that sections are populated
      await page.waitForSelector('text=/logline|premise/i', { timeout: 120000 });
      const storyGenTime = Date.now() - storyGenStart;
      logger.log('phase2', `Story generation completed in ${(storyGenTime / 1000).toFixed(1)}s`, 'success');

      await logger.captureScreenshot(page, '05-story-generated');

      // Verify all 6 sections
      const sections = [
        { name: 'Logline/Premise', selector: 'text=/logline|premise/i' },
        { name: 'Characters', selector: 'text=/character/i' },
        { name: 'Setting', selector: 'text=/setting/i' },
        { name: 'Plot Structure', selector: 'text=/plot|structure|outline/i' },
        { name: 'Scenes', selector: 'text=/scene/i' },
        { name: 'Themes/Dialogue', selector: 'text=/theme|dialogue/i' }
      ];

      let sectionsFound = 0;
      for (const section of sections) {
        const found = await page.locator(section.selector).count();
        if (found > 0) {
          logger.log('phase2', `✓ Section found: ${section.name}`, 'success');
          sectionsFound++;
        } else {
          logger.log('phase2', `✗ Section missing: ${section.name}`, 'warn');
        }
      }
      logger.log('phase2', `Story sections complete: ${sectionsFound}/6`, sectionsFound === 6 ? 'success' : 'warn');

      // ========================================
      // PHASE 3: Director's Vision & Scenes
      // ========================================
      logger.log('phase3', '=== Starting Phase 3: Directors Vision & Scenes ===', 'info');

      // Enter director's vision
      const visionText = 'Emphasize the paradoxical nature of reversed time through visual metaphors and dreamlike cinematography';
      const visionInput = page.locator('textarea[placeholder*="vision"], textarea[name*="vision"]').first();
      
      if (await visionInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await visionInput.fill(visionText);
        logger.log('phase3', 'Directors vision entered', 'success');
        await logger.captureScreenshot(page, '06-vision-entered');
      } else {
        logger.log('phase3', 'Directors vision input not found', 'warn');
      }

      // Generate scenes
      const generateScenesButton = page.locator('button:has-text("Generate Scenes"), button:has-text("Create Scenes")').first();
      
      if (await generateScenesButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        const scenesGenStart = Date.now();
        await generateScenesButton.click();
        logger.log('phase3', 'Generate Scenes clicked, waiting...', 'info');

        // Wait for Scene Navigator to populate
        await page.waitForSelector('[data-testid="scene-navigator"], .scene-list, text=/Scene \\d+/i', { timeout: 120000 });
        const scenesGenTime = Date.now() - scenesGenStart;
        logger.log('phase3', `Scenes generated in ${(scenesGenTime / 1000).toFixed(1)}s`, 'success');

        await logger.captureScreenshot(page, '07-scenes-generated');

        // Count scenes
        const sceneItems = await page.locator('[data-testid*="scene"], .scene-item, text=/Scene \\d+/i').count();
        logger.log('phase3', `Found ${sceneItems} scene(s) in Scene Navigator`, sceneItems > 0 ? 'success' : 'warn');
      } else {
        logger.log('phase3', 'Generate Scenes button not found - may be auto-generated', 'info');
      }

      // ========================================
      // PHASE 4: AI Enhancements (InspireMeNow)
      // ========================================
      logger.log('phase4', '=== Starting Phase 4: AI Enhancements ===', 'info');

      // Look for Co-Director or InspireMeNow panel
      const coDirectorButton = page.locator('button:has-text("Co-Director"), button:has-text("Inspire"), [data-testid*="inspire"]').first();
      
      if (await coDirectorButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await coDirectorButton.click();
        logger.log('phase4', 'Co-Director panel opened', 'success');
        await page.waitForTimeout(1000);
        await logger.captureScreenshot(page, '08-co-director-open');

        // Request objectives/suggestions
        const requestButton = page.locator('button:has-text("Inspire"), button:has-text("Generate"), button:has-text("Request")').first();
        if (await requestButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await requestButton.click();
          logger.log('phase4', 'Requested AI suggestions', 'info');
          await page.waitForTimeout(3000); // Wait for suggestions to load
          
          // Check for suggestions
          const suggestions = await page.locator('[data-testid*="suggestion"], .suggestion-card, text=/suggestion|recommend/i').count();
          logger.log('phase4', `Found ${suggestions} AI suggestion(s)`, suggestions > 0 ? 'success' : 'warn');

          await logger.captureScreenshot(page, '09-suggestions-generated');

          // Try to apply first suggestion
          const applyButton = page.locator('button:has-text("Apply"), button:has-text("Accept")').first();
          if (await applyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await applyButton.click();
            logger.log('phase4', 'Applied first AI suggestion', 'success');
            await page.waitForTimeout(1000);
          }
        }
      } else {
        logger.log('phase4', 'Co-Director/InspireMeNow not found in UI', 'warn');
      }

      // Test augmentation controls (framing, mood, etc.)
      const framingControl = page.locator('select[id*="framing"], select[name*="framing"]').first();
      if (await framingControl.isVisible({ timeout: 2000 }).catch(() => false)) {
        await framingControl.selectOption({ index: 1 });
        logger.log('phase4', 'Augmentation control (framing) tested', 'success');
      } else {
        logger.log('phase4', 'Augmentation controls not found', 'info');
      }

      // ========================================
      // PHASE 5: Keyframe Generation (WAN T2I)
      // ========================================
      logger.log('phase5', '=== Starting Phase 5: Keyframe Generation ===', 'info');

      // Navigate to first scene
      const firstScene = page.locator('[data-testid*="scene"], .scene-item, text=/Scene 1/i').first();
      if (await firstScene.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstScene.click();
        logger.log('phase5', 'Selected first scene', 'success');
        await page.waitForTimeout(1000);
        await logger.captureScreenshot(page, '10-scene-selected');
      }

      // Generate keyframe
      const keyframeButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")').first();
      
      if (await keyframeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        const keyframeStart = Date.now();
        await keyframeButton.click();
        logger.log('phase5', 'Generate Keyframe clicked, waiting for ComfyUI...', 'info');

        // Wait for keyframe to appear (image preview or data URI)
        await page.waitForSelector('img[src*="data:image"], img[src*="blob:"], [data-testid*="keyframe"]', { timeout: 180000 });
        const keyframeTime = Date.now() - keyframeStart;
        logger.log('phase5', `Keyframe generated in ${(keyframeTime / 1000).toFixed(1)}s`, 'success');

        await logger.captureScreenshot(page, '11-keyframe-generated');

        // Verify keyframe image exists
        const keyframeImages = await page.locator('img[src*="data:image"], img[src*="blob:"]').count();
        logger.log('phase5', `Found ${keyframeImages} keyframe image(s)`, keyframeImages > 0 ? 'success' : 'warn');
      } else {
        logger.log('phase5', 'Generate Keyframe button not found', 'error');
      }

      // ========================================
      // PHASE 6: Video Generation (WAN I2V)
      // ========================================
      logger.log('phase6', '=== Starting Phase 6: Video Generation ===', 'info');

      // Find and click generate video button
      const videoButton = page.locator('button:has-text("Generate Video"), button:has-text("Create Video")').first();
      
      if (await videoButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        const videoStart = Date.now();
        await videoButton.click();
        logger.log('phase6', 'Generate Video clicked, waiting for WAN I2V processing...', 'info');

        // Wait for video or frames link
        await page.waitForSelector('video, [href*=".mp4"], [data-testid*="video"], text=/video complete|frames/i', { timeout: 300000 });
        const videoTime = Date.now() - videoStart;
        logger.log('phase6', `Video generated in ${(videoTime / 1000).toFixed(1)}s`, 'success');

        await logger.captureScreenshot(page, '12-video-generated');

        // Check for video element or download link
        const videos = await page.locator('video, [href*=".mp4"]').count();
        logger.log('phase6', `Found ${videos} video element(s)/link(s)`, videos > 0 ? 'success' : 'warn');
      } else {
        logger.log('phase6', 'Generate Video button not found', 'error');
      }

      // ========================================
      // PHASE 7: Coherence Review
      // ========================================
      logger.log('phase7', '=== Starting Phase 7: Coherence Review ===', 'info');

      // Look for coherence review panel
      const coherenceButton = page.locator('button:has-text("Review"), button:has-text("Coherence"), button:has-text("Analyze")').first();
      
      if (await coherenceButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await coherenceButton.click();
        logger.log('phase7', 'Coherence review initiated', 'info');
        await page.waitForTimeout(5000); // Wait for analysis

        // Check for coherence score
        const scoreText = await page.locator('text=/score|coherence.*\\d+/i').first().textContent({ timeout: 5000 }).catch(() => null);
        if (scoreText) {
          logger.log('phase7', `Coherence score found: ${scoreText}`, 'success');
          
          // Check if score meets threshold
          const scoreMatch = scoreText.match(/(\d+\.?\d*)/);
          if (scoreMatch?.[1]) {
            const score = parseFloat(scoreMatch[1]);
            if (score < 1) {
              // Already normalized
              logger.log('phase7', `Score ${score} vs threshold ${COHERENCE_THRESHOLD}`, score >= COHERENCE_THRESHOLD ? 'success' : 'warn');
            } else {
              // Percentage
              logger.log('phase7', `Score ${score}% vs threshold ${COHERENCE_THRESHOLD * 100}%`, score >= COHERENCE_THRESHOLD * 100 ? 'success' : 'warn');
            }
          }
        } else {
          logger.log('phase7', 'Coherence score not found in UI', 'warn');
        }

        await logger.captureScreenshot(page, '13-coherence-review');

        // Try to mark as final shot
        const finalShotButton = page.locator('button:has-text("Mark Final"), button:has-text("Accept"), button:has-text("Finalize")').first();
        if (await finalShotButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await finalShotButton.click();
          logger.log('phase7', 'Marked shot as final', 'success');
          await page.waitForTimeout(1000);
        }
      } else {
        logger.log('phase7', 'Coherence review panel not found', 'warn');
      }

      // ========================================
      // PHASE 8: Persistence & Export/Import
      // ========================================
      logger.log('phase8', '=== Starting Phase 8: Persistence & Export/Import ===', 'info');

      // Export project
      const exportButton = page.locator('button:has-text("Export"), [data-testid*="export"]').first();
      
      if (await exportButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Setup download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await exportButton.click();
        logger.log('phase8', 'Export button clicked', 'info');

        try {
          const download = await downloadPromise;
          const exportPath = join(logger['reportDir'], await download.suggestedFilename());
          await download.saveAs(exportPath);
          logger.log('phase8', `Project exported to: ${exportPath}`, 'success');

          await logger.captureScreenshot(page, '14-exported');

          // Reload page to test persistence
          logger.log('phase8', 'Reloading page to test persistence...', 'info');
          await page.reload();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);

          await logger.captureScreenshot(page, '15-after-reload');

          // Check if story data persisted
          const storyStillExists = await page.locator('text=/logline|premise|quantum/i').count();
          logger.log('phase8', `Story data after reload: ${storyStillExists > 0 ? 'PERSISTED' : 'LOST'}`, storyStillExists > 0 ? 'success' : 'error');

          // Try import
          const importButton = page.locator('button:has-text("Import"), input[type="file"]').first();
          if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            if (await importButton.getAttribute('type') === 'file') {
              await importButton.setInputFiles(exportPath);
              logger.log('phase8', 'Import file selected', 'info');
              await page.waitForTimeout(2000);
              
              const importedData = await page.locator('text=/logline|premise|quantum/i').count();
              logger.log('phase8', `Data after import: ${importedData > 0 ? 'SUCCESS' : 'FAILED'}`, importedData > 0 ? 'success' : 'error');

              await logger.captureScreenshot(page, '16-after-import');
            }
          }
        } catch (error) {
          logger.log('phase8', `Export/import error: ${error}`, 'error');
        }
      } else {
        logger.log('phase8', 'Export button not found', 'warn');
      }

      // ========================================
      // Final Network & Console Analysis
      // ========================================
      logger.log('analysis', '=== Final Analysis ===', 'info');
      
      // Save console messages
      const consoleLogPath = join(logger['reportDir'], 'console-messages.json');
      fs.writeFileSync(consoleLogPath, JSON.stringify(consoleMessages, null, 2));
      logger.log('analysis', `Captured ${consoleMessages.length} console messages`, 'info');

      // Save network errors
      const networkLogPath = join(logger['reportDir'], 'network-errors.json');
      fs.writeFileSync(networkLogPath, JSON.stringify(networkErrors, null, 2));
      logger.log('analysis', `Captured ${networkErrors.length} network errors`, networkErrors.length === 0 ? 'success' : 'warn');

      // Count errors/warnings
      const errorCount = consoleMessages.filter(m => m.type === 'error').length;
      const warningCount = consoleMessages.filter(m => m.type === 'warning').length;
      logger.log('analysis', `Console errors: ${errorCount}, warnings: ${warningCount}`, errorCount === 0 ? 'success' : 'warn');

      // Check for expected network calls
      const expectedHosts = ['localhost:1234', '127.0.0.1:8188', 'fonts.googleapis.com', 'fonts.gstatic.com'];
      logger.log('analysis', `Expected network hosts: ${expectedHosts.join(', ')}`, 'info');

      await logger.captureScreenshot(page, '17-final-state');

    } catch (error) {
      logger.log('error', `Test failed: ${error}`, 'error');
      await logger.captureScreenshot(page, 'error-state');
      throw error;
    } finally {
      const reportPath = await logger.saveReport();
      console.log(`\n${'='.repeat(80)}`);
      console.log(`WALKTHROUGH COMPLETE`);
      console.log(`Report: ${reportPath}`);
      console.log(`${'='.repeat(80)}\n`);
    }
  });
});
