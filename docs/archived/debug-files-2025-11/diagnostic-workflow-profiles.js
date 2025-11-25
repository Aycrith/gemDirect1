// Diagnostic test for workflow profile configuration
// Run this in browser console to check settings

(async () => {
  console.log('=== WORKFLOW PROFILE DIAGNOSTIC ===\n');
  
  // Check IndexedDB
  const request = indexedDB.open('cinematic-story-db', 1);
  
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction('misc', 'readonly');
    const store = tx.objectStore('misc');
    const getRequest = store.get('localGenerationSettings');
    
    getRequest.onsuccess = () => {
      const settings = getRequest.result;
      
      if (!settings) {
        console.error('❌ No localGenerationSettings found in IndexedDB');
        return;
      }
      
      console.log('✅ Settings found in IndexedDB');
      console.log('\n📋 ComfyUI URL:', settings.comfyUIUrl);
      console.log('📋 Image Workflow Profile ID:', settings.imageWorkflowProfile);
      console.log('📋 Video Workflow Profile ID:', settings.videoWorkflowProfile);
      
      // Check workflow profiles
      if (!settings.workflowProfiles) {
        console.error('\n❌ No workflowProfiles object found!');
        return;
      }
      
      const profileCount = Object.keys(settings.workflowProfiles).length;
      console.log(`\n✅ Found ${profileCount} workflow profile(s)`);
      
      // Check wan-t2i profile
      const wanT2I = settings.workflowProfiles['wan-t2i'];
      if (!wanT2I) {
        console.error('\n❌ Missing wan-t2i profile!');
      } else {
        console.log('\n✅ wan-t2i profile found');
        console.log('   Label:', wanT2I.label);
        console.log('   Has workflowJson:', !!wanT2I.workflowJson);
        console.log('   WorkflowJson length:', wanT2I.workflowJson?.length || 0);
        console.log('   Mapping keys:', Object.keys(wanT2I.mapping || {}));
        console.log('   Mapping values:', Object.values(wanT2I.mapping || {}));
        
        // Validate mapping
        const hasTextMapping = Object.values(wanT2I.mapping || {}).includes('human_readable_prompt') || 
                              Object.values(wanT2I.mapping || {}).includes('full_timeline_json');
        if (!hasTextMapping) {
          console.error('   ❌ Missing text prompt mapping!');
        } else {
          console.log('   ✅ Has text prompt mapping');
        }
      }
      
      // Check wan-i2v profile
      const wanI2V = settings.workflowProfiles['wan-i2v'];
      if (!wanI2V) {
        console.error('\n❌ Missing wan-i2v profile!');
      } else {
        console.log('\n✅ wan-i2v profile found');
        console.log('   Label:', wanI2V.label);
        console.log('   Has workflowJson:', !!wanI2V.workflowJson);
        console.log('   WorkflowJson length:', wanI2V.workflowJson?.length || 0);
        console.log('   Mapping keys:', Object.keys(wanI2V.mapping || {}));
        console.log('   Mapping values:', Object.values(wanI2V.mapping || {}));
        
        // Validate mappings
        const hasTextMapping = Object.values(wanI2V.mapping || {}).includes('human_readable_prompt') || 
                              Object.values(wanI2V.mapping || {}).includes('full_timeline_json');
        const hasKeyframeMapping = Object.values(wanI2V.mapping || {}).includes('keyframe_image');
        
        if (!hasTextMapping) {
          console.error('   ❌ Missing text prompt mapping!');
        } else {
          console.log('   ✅ Has text prompt mapping');
        }
        
        if (!hasKeyframeMapping) {
          console.error('   ❌ Missing keyframe image mapping!');
        } else {
          console.log('   ✅ Has keyframe image mapping');
        }
      }
      
      console.log('\n=== END DIAGNOSTIC ===');
    };
    
    getRequest.onerror = () => {
      console.error('❌ Failed to read settings from IndexedDB');
    };
  };
  
  request.onerror = () => {
    console.error('❌ Failed to open IndexedDB');
  };
})();
