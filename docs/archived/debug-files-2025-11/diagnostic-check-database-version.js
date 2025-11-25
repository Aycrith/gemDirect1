// Check if the updated database.ts code is running
// This should show localStorage fallback messages if quota is exceeded

console.log('=== DATABASE VERSION CHECK ===\n');

// Trigger a manual save to test the new code
(async () => {
  try {
    // Import the database module
    const dbModule = await import('/utils/database.ts');
    console.log('✅ Database module loaded');
    console.log('   Available exports:', Object.keys(dbModule));
    
    // Get current settings from React context
    const settings = window.__localGenSettings;
    if (!settings) {
      console.error('❌ No settings in window.__localGenSettings');
      console.log('   Settings may not have loaded yet');
      return;
    }
    
    console.log('✅ Settings found in React context');
    console.log('   Has workflowProfiles:', !!settings.workflowProfiles);
    
    if (settings.workflowProfiles) {
      const profileIds = Object.keys(settings.workflowProfiles);
      console.log('   Profile IDs:', profileIds);
      
      // Calculate size
      const settingsJson = JSON.stringify(settings);
      const sizeKB = (settingsJson.length / 1024).toFixed(2);
      const sizeMB = (settingsJson.length / 1024 / 1024).toFixed(2);
      console.log(`   Settings size: ${sizeKB} KB (${sizeMB} MB)`);
      
      if (settingsJson.length > 1024 * 1024) {
        console.warn('   ⚠️ Settings are over 1MB - may trigger quota error');
      }
    }
    
    // Try to manually save and watch for fallback messages
    console.log('\n🔧 Attempting manual save to test database code...');
    console.log('   Watch for localStorage fallback messages below:');
    
    await dbModule.saveData('localGenSettings', settings);
    
    console.log('✅ Save completed without throwing error');
    
    // Try to read back
    console.log('\n🔧 Attempting to read back from database...');
    const readBack = await dbModule.getData('localGenSettings');
    
    if (!readBack) {
      console.error('❌ Read returned null/undefined');
      console.log('   Data did not persist');
    } else {
      console.log('✅ Data read back successfully');
      console.log('   Has workflowProfiles:', !!readBack.workflowProfiles);
      if (readBack.workflowProfiles) {
        console.log('   Profile count:', Object.keys(readBack.workflowProfiles).length);
      }
    }
    
    // Check localStorage directly
    console.log('\n🔧 Checking localStorage fallback...');
    const lsData = localStorage.getItem('gemDirect_localGenSettings');
    if (lsData) {
      console.log('✅ Found data in localStorage fallback!');
      const parsed = JSON.parse(lsData);
      console.log('   Has workflowProfiles:', !!parsed.workflowProfiles);
      if (parsed.workflowProfiles) {
        console.log('   Profile count:', Object.keys(parsed.workflowProfiles).length);
      }
    } else {
      console.log('⚪ No data in localStorage fallback');
      console.log('   Either IndexedDB worked, or save failed completely');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  console.log('\n=== END DATABASE VERSION CHECK ===');
})();
