// Check what keys actually exist in IndexedDB

console.log('=== INDEXEDDB KEY DIAGNOSTIC ===\n');

(async () => {
  try {
    const request = indexedDB.open('cinematic-story-db', 1);
    
    request.onsuccess = () => {
      const db = request.result;
      console.log('✅ Database opened');
      console.log('   Object stores:', Array.from(db.objectStoreNames).join(', '));
      
      const tx = db.transaction('misc', 'readonly');
      const store = tx.objectStore('misc');
      
      // Get ALL keys in the misc store
      const keysRequest = store.getAllKeys();
      
      keysRequest.onsuccess = () => {
        const keys = keysRequest.result;
        console.log(`\n📋 Found ${keys.length} key(s) in 'misc' store:`);
        keys.forEach((key, i) => {
          console.log(`   ${i + 1}. "${key}"`);
        });
        
        // Check for settings-related keys
        const settingsKeys = keys.filter(k => 
          k.includes('settings') || 
          k.includes('Settings') || 
          k.includes('local') || 
          k.includes('Local') ||
          k.includes('Gen') ||
          k.includes('workflow')
        );
        
        if (settingsKeys.length > 0) {
          console.log('\n🔍 Settings-related keys found:');
          settingsKeys.forEach(key => {
            console.log(`   - "${key}"`);
          });
          
          // Try to read each settings key
          console.log('\n📖 Reading settings data:');
          settingsKeys.forEach(async (key) => {
            const data = await store.get(key);
            console.log(`\n   Key: "${key}"`);
            console.log(`   Has workflowProfiles: ${!!data?.workflowProfiles}`);
            if (data?.workflowProfiles) {
              console.log(`   Profile IDs: ${Object.keys(data.workflowProfiles).join(', ')}`);
            }
          });
        } else {
          console.log('\n❌ No settings-related keys found');
          console.log('   The original diagnostic is looking for "localGenerationSettings"');
          console.log('   But that key does not exist in the database');
        }
        
        console.log('\n=== END KEY DIAGNOSTIC ===');
      };
      
      keysRequest.onerror = () => {
        console.error('❌ Failed to get keys:', keysRequest.error);
      };
    };
    
    request.onerror = () => {
      console.error('❌ Failed to open database:', request.error);
    };
  } catch (error) {
    console.error('❌ Error:', error);
  }
})();
