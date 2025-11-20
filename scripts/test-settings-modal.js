// Manual Browser Testing Script
// Run this in browser console at http://localhost:3001

console.log('=== Settings Modal Full Test Suite ===\n');

// Test 1: Check if settings modal exists
console.log('Test 1: Settings Modal Exists');
const settingsButton = document.querySelector('[aria-label="Open settings"]');
console.log('Settings button found:', !!settingsButton);

// Test 2: Open modal
console.log('\nTest 2: Opening Settings Modal');
if (settingsButton) {
    settingsButton.click();
    setTimeout(() => {
        const modal = document.querySelector('[data-testid="LocalGenerationSettingsModal"]');
        console.log('Modal opened:', !!modal);
        
        if (modal) {
            // Test 3: Check tabs exist
            console.log('\nTest 3: Tab Navigation');
            const tabs = modal.querySelectorAll('button');
            console.log('Number of buttons:', tabs.length);
            console.log('Tab texts:', Array.from(tabs).slice(0, 3).map(t => t.textContent));
            
            // Test 4: Check LLM inputs
            console.log('\nTest 4: LLM Configuration Fields');
            const llmInputs = modal.querySelectorAll('input[type="text"], input[type="number"], input[type="range"], select');
            console.log('Number of input fields:', llmInputs.length);
            
            llmInputs.forEach((input, i) => {
                const label = input.closest('div')?.querySelector('label')?.textContent || 'Unknown';
                console.log(`  Input ${i}: ${label.substring(0, 30)} = ${input.value || input.placeholder}`);
            });
            
            // Test 5: Check connection test buttons
            console.log('\nTest 5: Connection Test Buttons');
            const testButtons = Array.from(modal.querySelectorAll('button')).filter(b => 
                b.textContent?.includes('Test') || b.textContent?.includes('Connection')
            );
            console.log('Connection test buttons:', testButtons.map(b => b.textContent));
            
            // Test 6: Check Save button state
            console.log('\nTest 6: Save Button');
            const saveButton = Array.from(modal.querySelectorAll('button')).find(b => 
                b.textContent?.includes('Save Settings')
            );
            console.log('Save button found:', !!saveButton);
            console.log('Save button disabled:', saveButton?.disabled);
            
            // Test 7: Check IndexedDB
            console.log('\nTest 7: IndexedDB Settings');
            const request = indexedDB.open('cinematic-story-db', 1);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('misc', 'readonly');
                const store = tx.objectStore('misc');
                const getRequest = store.get('localGenSettings');
                getRequest.onsuccess = () => {
                    console.log('Current settings in IndexedDB:');
                    console.log(JSON.stringify(getRequest.result, null, 2));
                };
            };
            
            // Test 8: Check window.__localGenSettings
            console.log('\nTest 8: Global Settings Object');
            console.log('window.__localGenSettings exists:', !!window.__localGenSettings);
            if (window.__localGenSettings) {
                console.log('Settings:', JSON.stringify(window.__localGenSettings, null, 2));
            }
        }
    }, 500);
}

console.log('\n=== Test Suite Complete ===');
console.log('Check results above. If modal opened, you can:');
console.log('1. Edit LLM Provider URL field');
console.log('2. Click "Test LLM Connection" button');
console.log('3. Edit ComfyUI URL field');
console.log('4. Click "Test ComfyUI Connection" button');
console.log('5. Click "Save Settings" button');
console.log('6. Close and reopen modal to verify persistence');
