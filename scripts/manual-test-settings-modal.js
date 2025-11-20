/**
 * MANUAL BROWSER TESTING SCRIPT - Settings Modal
 * 
 * Instructions:
 * 1. Open browser developer console (F12)
 * 2. Copy and paste this entire script into console
 * 3. Run: await testSettingsModal()
 * 4. Review test results in console output
 */

async function testSettingsModal() {
    console.log('\n========================================');
    console.log('SETTINGS MODAL MANUAL TEST SUITE');
    console.log('========================================\n');

    const results = {
        passed: 0,
        failed: 0,
        warnings: 0,
        tests: []
    };

    function logTest(testName, passed, message) {
        const status = passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${status}: ${testName}`);
        if (message) console.log(`   ${message}`);
        results.tests.push({ testName, passed, message });
        if (passed) results.passed++;
        else results.failed++;
    }

    function logWarning(testName, message) {
        console.log(`⚠️  WARN: ${testName}`);
        console.log(`   ${message}`);
        results.warnings++;
        results.tests.push({ testName, passed: null, message });
    }

    // TEST 1: Settings Modal Trigger
    console.log('\n--- Test 1: Settings Modal Accessibility ---');
    const settingsButton = document.querySelector('[aria-label*="ettings"]') || 
                           document.querySelector('button[title*="ettings"]') ||
                           document.querySelector('svg.lucide-settings')?.closest('button');
    
    if (!settingsButton) {
        logTest('Settings button exists', false, 'Cannot find settings button in DOM');
        console.log('DOM buttons:', Array.from(document.querySelectorAll('button')).map(b => b.textContent || b.getAttribute('aria-label')));
        return results;
    }
    logTest('Settings button exists', true, `Found: ${settingsButton.getAttribute('aria-label') || settingsButton.title}`);

    // Click settings button
    settingsButton.click();
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for modal animation

    // TEST 2: Modal Dialog Structure
    console.log('\n--- Test 2: Modal Dialog Structure ---');
    const modal = document.querySelector('[role="dialog"]') || document.querySelector('.fixed.inset-0');
    logTest('Modal dialog appears', !!modal, modal ? 'Dialog element found' : 'No dialog element');

    if (!modal) {
        console.log('Available dialogs:', document.querySelectorAll('[role="dialog"]'));
        return results;
    }

    // TEST 3: Tab Navigation
    console.log('\n--- Test 3: Tab Interface ---');
    const tabs = Array.from(modal.querySelectorAll('[role="tab"]'));
    logTest('Has tab interface', tabs.length >= 2, `Found ${tabs.length} tabs`);
    
    const tabNames = tabs.map(t => t.textContent?.trim()).filter(Boolean);
    console.log(`   Tab names: ${tabNames.join(', ')}`);
    
    const hasLLMTab = tabNames.some(name => name.toLowerCase().includes('llm'));
    const hasComfyTab = tabNames.some(name => name.toLowerCase().includes('comfy'));
    logTest('Has LLM Settings tab', hasLLMTab, hasLLMTab ? 'Found LLM tab' : 'Missing LLM tab');
    logTest('Has ComfyUI Settings tab', hasComfyTab, hasComfyTab ? 'Found ComfyUI tab' : 'Missing ComfyUI tab');

    // TEST 4: LLM Configuration Fields
    console.log('\n--- Test 4: LLM Configuration Fields ---');
    const llmTab = tabs.find(t => t.textContent?.toLowerCase().includes('llm'));
    if (llmTab) {
        llmTab.click();
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    const providerUrlInput = modal.querySelector('input[placeholder*="provider" i], input[placeholder*="url" i]');
    logTest('Provider URL field exists', !!providerUrlInput, providerUrlInput?.placeholder);
    logTest('Provider URL is editable', !providerUrlInput?.readOnly && !providerUrlInput?.disabled, 
            `readOnly: ${providerUrlInput?.readOnly}, disabled: ${providerUrlInput?.disabled}`);

    const modelInput = modal.querySelector('input[placeholder*="model" i]');
    logTest('Model Name field exists', !!modelInput, modelInput?.placeholder);
    logTest('Model Name is editable', !modelInput?.readOnly && !modelInput?.disabled, 
            `readOnly: ${modelInput?.readOnly}, disabled: ${modelInput?.disabled}`);

    const tempSlider = modal.querySelector('input[type="range"]');
    logTest('Temperature slider exists', !!tempSlider, tempSlider ? `Range: ${tempSlider.min}-${tempSlider.max}` : '');

    const timeoutInput = modal.querySelector('input[placeholder*="timeout" i]');
    logTest('Timeout field exists', !!timeoutInput, timeoutInput?.placeholder);

    // TEST 5: ComfyUI Configuration Fields
    console.log('\n--- Test 5: ComfyUI Configuration Fields ---');
    const comfyTab = tabs.find(t => t.textContent?.toLowerCase().includes('comfy'));
    if (comfyTab) {
        comfyTab.click();
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    const comfyUrlInput = modal.querySelector('input[placeholder*="comfy" i]');
    logTest('ComfyUI URL field exists', !!comfyUrlInput, comfyUrlInput?.placeholder);

    const wsUrlInput = Array.from(modal.querySelectorAll('input')).find(inp => 
        inp.placeholder?.toLowerCase().includes('websocket') || 
        inp.placeholder?.toLowerCase().includes('ws://')
    );
    logTest('WebSocket URL field exists', !!wsUrlInput, wsUrlInput?.placeholder);

    // TEST 6: Action Buttons
    console.log('\n--- Test 6: Action Buttons ---');
    const testLLMBtn = Array.from(modal.querySelectorAll('button')).find(b => 
        b.textContent?.toLowerCase().includes('test') && b.textContent?.toLowerCase().includes('llm')
    );
    logTest('Test LLM Connection button exists', !!testLLMBtn, testLLMBtn?.textContent);

    const testComfyBtn = Array.from(modal.querySelectorAll('button')).find(b => 
        b.textContent?.toLowerCase().includes('test') && b.textContent?.toLowerCase().includes('comfy')
    );
    logTest('Test ComfyUI Connection button exists', !!testComfyBtn, testComfyBtn?.textContent);

    const saveBtn = Array.from(modal.querySelectorAll('button')).find(b => 
        b.textContent?.toLowerCase().includes('save')
    );
    logTest('Save button exists', !!saveBtn, saveBtn?.textContent);

    const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => 
        b.textContent?.toLowerCase().includes('cancel')
    );
    logTest('Cancel button exists', !!cancelBtn, cancelBtn?.textContent);

    // TEST 7: Global Settings Exposure
    console.log('\n--- Test 7: Global Settings Exposure ---');
    const globalSettings = window.__localGenSettings;
    logTest('window.__localGenSettings exists', !!globalSettings, globalSettings ? 'Object present' : 'Not found');
    
    if (globalSettings) {
        console.log('   Current settings:', JSON.stringify(globalSettings, null, 2));
        logTest('Settings has llmProviderUrl', !!globalSettings.llmProviderUrl, globalSettings.llmProviderUrl);
        logTest('Settings has llmModel', !!globalSettings.llmModel, globalSettings.llmModel);
        logTest('Settings has comfyUIUrl', !!globalSettings.comfyUIUrl, globalSettings.comfyUIUrl);
        logTest('Settings has comfyUIWebSocketUrl', globalSettings.comfyUIWebSocketUrl !== undefined, 
                globalSettings.comfyUIWebSocketUrl || '(empty)');
    }

    // TEST 8: IndexedDB Persistence Check
    console.log('\n--- Test 8: IndexedDB Persistence ---');
    try {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('cinematic-story-db');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const storeExists = db.objectStoreNames.contains('keyValueStore');
        logTest('keyValueStore exists in IndexedDB', storeExists, storeExists ? 'Store found' : 'Store missing');

        if (storeExists) {
            const transaction = db.transaction(['keyValueStore'], 'readonly');
            const store = transaction.objectStore('keyValueStore');
            const getRequest = store.get('local-generation-settings');
            
            const savedSettings = await new Promise((resolve, reject) => {
                getRequest.onsuccess = () => resolve(getRequest.result);
                getRequest.onerror = () => reject(getRequest.error);
            });

            logTest('Settings persisted in IndexedDB', !!savedSettings, savedSettings ? 'Found saved settings' : 'No saved settings');
            if (savedSettings) {
                console.log('   Saved settings:', JSON.stringify(savedSettings, null, 2));
            }
        }

        db.close();
    } catch (error) {
        logWarning('IndexedDB access', `Error: ${error.message}`);
    }

    // TEST 9: Accessibility Features
    console.log('\n--- Test 9: Accessibility Features ---');
    const modalHasAriaLabel = modal.getAttribute('aria-label') || modal.getAttribute('aria-labelledby');
    logTest('Modal has accessible label', !!modalHasAriaLabel, modalHasAriaLabel || 'No aria-label/labelledby');

    const hasAriaDescribedby = modal.getAttribute('aria-describedby');
    if (hasAriaDescribedby) {
        logTest('Modal has aria-describedby', true, hasAriaDescribedby);
    } else {
        logWarning('Modal aria-describedby', 'Not present - consider adding for screen readers');
    }

    const focusableElements = modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    logTest('Has focusable elements', focusableElements.length > 0, `Found ${focusableElements.length} focusable elements`);

    // TEST 10: Form Validation (if applicable)
    console.log('\n--- Test 10: Form Validation ---');
    if (providerUrlInput) {
        const originalValue = providerUrlInput.value;
        providerUrlInput.value = 'invalid-url';
        providerUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
        providerUrlInput.dispatchEvent(new Event('blur', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const errorMessage = modal.querySelector('[role="alert"], .text-red-500, .text-rose-500');
        if (errorMessage) {
            logTest('Form validation shows error', true, errorMessage.textContent);
        } else {
            logWarning('Form validation', 'No visible error for invalid URL - may be client-side only');
        }
        
        // Restore original value
        providerUrlInput.value = originalValue;
        providerUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // SUMMARY
    console.log('\n========================================');
    console.log('TEST SUMMARY');
    console.log('========================================');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⚠️  Warnings: ${results.warnings}`);
    console.log(`📊 Total Tests: ${results.tests.length}`);
    console.log(`🎯 Pass Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    console.log('========================================\n');

    // Keep modal open for visual inspection
    console.log('ℹ️  Modal remains open for visual inspection. Close manually or run: document.querySelector("[role=\\"dialog\\"]")?.querySelector("button")?.click()');

    return results;
}

// Auto-run if in browser console
if (typeof window !== 'undefined' && window.location) {
    console.log('📋 Settings Modal Manual Test Suite loaded!');
    console.log('📝 To run tests, execute: await testSettingsModal()');
    console.log('🌐 Ensure you are on: http://localhost:4173\n');
}
