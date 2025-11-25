// Comprehensive diagnostic for settings import and save flow
// Run in browser console AFTER importing settings

(async () => {
  console.log('=== FULL SETTINGS FLOW DIAGNOSTIC ===\n');
  
  // 1. Check IndexedDB
  console.log('1️⃣ CHECKING INDEXEDDB...');
  const request = indexedDB.open('cinematic-story-db', 1);
  
  request.onsuccess = () => {
    const db = request.result;
    console.log('   Database opened successfully');
    console.log('   Object stores:', Array.from(db.objectStoreNames).join(', '));
    
    const tx = db.transaction('misc', 'readonly');
    const store = tx.objectStore('misc');
    const getRequest = store.get('localGenSettings');
    
    getRequest.onsuccess = () => {
      const settings = getRequest.result;
      
      if (!settings) {
        console.error('   ❌ NO SETTINGS IN INDEXEDDB');
        console.log('\n   This means either:');
        console.log('   - Settings were imported but NOT saved (forgot to click "Save Settings")');
        console.log('   - Database write failed');
        console.log('   - Wrong storage key being used');
      } else {
        console.log('   ✅ Settings found in IndexedDB');
        console.log('   Has workflowProfiles?', !!settings.workflowProfiles);
        if (settings.workflowProfiles) {
          const profileIds = Object.keys(settings.workflowProfiles);
          console.log('   Profile count:', profileIds.length);
          console.log('   Profile IDs:', profileIds);
          
          // Check each profile
          profileIds.forEach(id => {
            const profile = settings.workflowProfiles[id];
            console.log(`\n   Profile "${id}":`);
            console.log(`     Label: ${profile.label}`);
            console.log(`     Has workflowJson: ${!!profile.workflowJson} (${profile.workflowJson?.length || 0} chars)`);
            console.log(`     Mapping keys: ${Object.keys(profile.mapping || {}).length}`);
            console.log(`     Mapping: ${JSON.stringify(profile.mapping || {})}`);
          });
        } else {
          console.error('   ❌ Settings exist but workflowProfiles is missing/null');
        }
      }
      
      console.log('\n2️⃣ CHECKING REACT STATE...');
      // Check if React context has the settings
      const reactContext = window.__localGenSettings;
      if (!reactContext) {
        console.error('   ❌ React context not available on window');
      } else {
        console.log('   ✅ React context found');
        console.log('   Has workflowProfiles?', !!reactContext.workflowProfiles);
        if (reactContext.workflowProfiles) {
          const profileIds = Object.keys(reactContext.workflowProfiles);
          console.log('   Profile count:', profileIds.length);
          console.log('   Profile IDs:', profileIds);
        }
      }
      
      console.log('\n3️⃣ CHECKING LOCALSTORAGE FALLBACK...');
      try {
        const lsKey = 'gemDirect_localGenSettings';
        const lsValue = localStorage.getItem(lsKey);
        if (lsValue) {
          console.log('   ✅ localStorage fallback found');
          const parsed = JSON.parse(lsValue);
          console.log('   Has workflowProfiles?', !!parsed.workflowProfiles);
          if (parsed.workflowProfiles) {
            console.log('   Profile count:', Object.keys(parsed.workflowProfiles).length);
          }
        } else {
          console.log('   ⚪ No localStorage fallback (expected if IndexedDB works)');
        }
      } catch (error) {
        console.error('   ❌ localStorage check failed:', error.message);
      }
      
      console.log('\n4️⃣ NEXT STEPS:');
      if (!settings) {
        console.log('   🔧 ACTION REQUIRED:');
        console.log('      1. Open Settings (⚙️ icon)');
        console.log('      2. Click "Import from File" in ComfyUI Settings tab');
        console.log('      3. Select localGenSettings.json');
        console.log('      4. **IMPORTANT:** Click "Save Settings" button at bottom');
        console.log('      5. Re-run this diagnostic to confirm');
      } else if (!settings.workflowProfiles || Object.keys(settings.workflowProfiles).length === 0) {
        console.log('   🔧 ACTION REQUIRED:');
        console.log('      Settings exist but workflowProfiles are missing');
        console.log('      Re-import localGenSettings.json and click "Save Settings"');
      } else {
        console.log('   ✅ Settings are properly saved!');
        console.log('      Try generating keyframes now');
      }
      
      console.log('\n=== END DIAGNOSTIC ===');
    };
    
    getRequest.onerror = () => {
      console.error('   ❌ Failed to read from IndexedDB:', getRequest.error);
    };
  };
  
  request.onerror = () => {
    console.error('   ❌ Failed to open IndexedDB:', request.error);
  };
})();
