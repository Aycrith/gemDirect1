/**
 * Manual Validation Script for Feature Flags UI
 * Run with: npx ts-node scripts/manual-validation.ts
 */

import { chromium, Browser, Page } from 'playwright';

interface ValidationResult {
    phase: string;
    test: string;
    status: 'pass' | 'fail' | 'skip';
    details?: string;
}

const results: ValidationResult[] = [];

function log(result: ValidationResult) {
    results.push(result);
    const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '○';
    console.log(`${icon} [${result.phase}] ${result.test}${result.details ? ': ' + result.details : ''}`);
}

async function validateFeatureFlagsUI(page: Page) {
    console.log('\n=== PHASE 2: FEATURE FLAGS UI VALIDATION ===\n');

    // Open Settings modal
    await page.click('[data-testid="settings-button"]');
    
    try {
        await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { timeout: 30000 });
    } catch (e) {
        await page.click('[data-testid="settings-button"]');
        await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { timeout: 30000 });
    }
    log({ phase: 'UI', test: 'Settings modal opened', status: 'pass' });

    // Click Features tab
    await page.click('button:has-text("Features")');
    await page.waitForTimeout(500);
    log({ phase: 'UI', test: 'Features tab selected', status: 'pass' });

    // Verify all 4 category headers
    const categories = ['Quality Enhancement', 'Workflow', 'Continuity', 'Experimental'];
    for (const cat of categories) {
        const visible = await page.locator(`text=${cat}`).first().isVisible();
        log({ phase: 'UI', test: `Category: ${cat}`, status: visible ? 'pass' : 'fail' });
    }

    // Verify stability badges
    const badges = ['STABLE', 'BETA', 'EXPERIMENTAL'];
    for (const badge of badges) {
        const visible = await page.locator(`text=${badge}`).first().isVisible();
        log({ phase: 'UI', test: `Badge: ${badge}`, status: visible ? 'pass' : 'fail' });
    }

    // Check all 10 feature flags
    const flags = [
        'Auto-Generate Suggestions',
        'Prompt Quality Gate',
        'Video Upscaling',
        'Bookend Keyframes',
        'Provider Health Polling',
        'Character Consistency',
        'Visual Continuity',
        'Narrative State Tracking',
        'Character Presence Warnings',
        'Prompt A/B Testing'
    ];

    for (const flag of flags) {
        const visible = await page.locator(`text=${flag}`).first().isVisible();
        log({ phase: 'UI', test: `Flag: ${flag}`, status: visible ? 'pass' : 'fail' });
    }
}

async function validateToggleInteraction(page: Page) {
    console.log('\n=== PHASE 3: TOGGLE INTERACTION ===\n');

    // Toggle Auto-Generate Suggestions
    const checkbox = page.locator('label:has-text("Auto-Generate Suggestions") input[type="checkbox"]');
    const initialState = await checkbox.isChecked();
    
    await page.locator('label:has-text("Auto-Generate Suggestions")').click();
    const newState = await checkbox.isChecked();
    
    log({
        phase: 'Toggle',
        test: 'Auto-Generate Suggestions toggle',
        status: newState !== initialState ? 'pass' : 'fail',
        details: `${initialState} → ${newState}`
    });

    // Toggle back
    await page.locator('label:has-text("Auto-Generate Suggestions")').click();
    const restoredState = await checkbox.isChecked();
    log({
        phase: 'Toggle',
        test: 'Toggle restore',
        status: restoredState === initialState ? 'pass' : 'fail'
    });
}

async function validateDependencyWarnings(page: Page) {
    console.log('\n=== PHASE 4: DEPENDENCY WARNINGS ===\n');

    // Enable Video Upscaling (has dependency on Character Consistency)
    await page.locator('label:has-text("Video Upscaling")').click();
    await page.waitForTimeout(300);
    
    const warningVisible = await page.locator('text=⚠️ Requires:').isVisible();
    log({
        phase: 'Dependencies',
        test: 'Dependency warning for Video Upscaling',
        status: warningVisible ? 'pass' : 'fail'
    });

    // Disable it
    await page.locator('label:has-text("Video Upscaling")').click();
}

async function validateConfigWarnings(page: Page) {
    console.log('\n=== PHASE 5: CONFIG WARNINGS ===\n');

    // Enable A/B Testing without Quality Gate
    await page.locator('label:has-text("Prompt A/B Testing")').click();
    await page.waitForTimeout(300);
    
    const warningVisible = await page.locator('text=Configuration Warnings').isVisible();
    log({
        phase: 'Config',
        test: 'Configuration warning for A/B Testing',
        status: warningVisible ? 'pass' : 'fail'
    });

    // Disable it
    await page.locator('label:has-text("Prompt A/B Testing")').click();
}

async function validateProviderHealthIndicator(page: Page) {
    console.log('\n=== PHASE 6: PROVIDER HEALTH INDICATOR ===\n');

    // Close modal first
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    // Check indicator is NOT visible by default
    const indicatorBeforeEnable = await page.locator('button:has-text("ComfyUI")').isVisible();
    log({
        phase: 'Health',
        test: 'Health indicator hidden by default',
        status: !indicatorBeforeEnable ? 'pass' : 'fail'
    });

    // Open settings and enable polling
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { timeout: 30000 });
    await page.click('button:has-text("Features")');
    await page.locator('label:has-text("Provider Health Polling")').click();
    await page.click('[data-testid="save-settings"]');
    await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { state: 'hidden' });
    await page.waitForTimeout(500);

    // Check indicator IS visible now
    const indicatorAfterEnable = await page.locator('button:has-text("ComfyUI")').isVisible();
    log({
        phase: 'Health',
        test: 'Health indicator visible when enabled',
        status: indicatorAfterEnable ? 'pass' : 'fail'
    });
}

async function validateResetFunctionality(page: Page) {
    console.log('\n=== PHASE 7: RESET FUNCTIONALITY ===\n');

    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForSelector('[data-testid="LocalGenerationSettingsModal"]', { timeout: 30000 });
    await page.click('button:has-text("Features")');

    // Enable a few flags
    await page.locator('label:has-text("Prompt Quality Gate")').click();
    await page.waitForTimeout(200);

    // Click reset
    await page.click('button:has-text("Reset all features to defaults")');
    await page.waitForTimeout(300);

    // Check flags are reset
    const qualityGateChecked = await page.locator('label:has-text("Prompt Quality Gate") input[type="checkbox"]').isChecked();
    log({
        phase: 'Reset',
        test: 'Reset restores defaults',
        status: !qualityGateChecked ? 'pass' : 'fail'
    });
}

async function printSummary() {
    console.log('\n\n========================================');
    console.log('         VALIDATION SUMMARY');
    console.log('========================================\n');

    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const skipped = results.filter(r => r.status === 'skip').length;
    const total = results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✓ Passed: ${passed}`);
    console.log(`✗ Failed: ${failed}`);
    console.log(`○ Skipped: ${skipped}`);
    console.log(`\nPass Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
        console.log('\n--- FAILED TESTS ---');
        results.filter(r => r.status === 'fail').forEach(r => {
            console.log(`  ✗ [${r.phase}] ${r.test}${r.details ? ': ' + r.details : ''}`);
        });
    }

    console.log('\n========================================\n');
}

async function main() {
    console.log('Starting Manual Validation Suite...\n');
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        await page.goto('http://localhost:3000');
        await page.waitForSelector('[data-testid="settings-button"]', { timeout: 30000 });
        log({ phase: 'Setup', test: 'App loaded', status: 'pass' });

        await validateFeatureFlagsUI(page);
        await validateToggleInteraction(page);
        await validateDependencyWarnings(page);
        await validateConfigWarnings(page);
        await validateProviderHealthIndicator(page);
        await validateResetFunctionality(page);

    } catch (error) {
        console.error('\n❌ Validation failed with error:', error);
        log({ phase: 'Error', test: 'Script execution', status: 'fail', details: String(error) });
    } finally {
        await browser.close();
        await printSummary();
    }
}

main();
