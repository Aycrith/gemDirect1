// Test the workflow detection logic
import { readFileSync } from 'fs';

const localGenSettings = JSON.parse(readFileSync('./localGenSettings.json', 'utf8'));
const wanWorkflow = JSON.parse(readFileSync('./workflows/video_wan2_2_5B_ti2v.json', 'utf8'));

function testDetection(data, name) {
    console.log(`\n=== Testing: ${name} ===`);
    console.log('Keys:', Object.keys(data).slice(0, 10));
    
    // Check workflowProfiles
    const hasWorkflowProfiles = 'workflowProfiles' in data && typeof data.workflowProfiles === 'object';
    console.log('Has workflowProfiles?', hasWorkflowProfiles);
    
    // Check numeric keys
    const keys = Object.keys(data);
    const hasNumericKeys = keys.some(k => /^\d+$/.test(k) && typeof data[k] === 'object' && data[k].class_type);
    console.log('Has numeric node keys?', hasNumericKeys);
    
    // Check prompt structure
    const hasPromptStructure = 'prompt' in data && typeof data.prompt === 'object';
    console.log('Has prompt structure?', hasPromptStructure);
    
    // Check settings markers
    const looksLikeSettingsFile = 'comfyUIUrl' in data || 'workflowProfiles' in data || 'mapping' in data;
    console.log('Looks like settings?', looksLikeSettingsFile);
    
    // Final detection
    const isComfyUIWorkflow = (hasNumericKeys || hasPromptStructure) && !looksLikeSettingsFile;
    console.log('IS COMFYUI WORKFLOW?', isComfyUIWorkflow);
    
    if (hasWorkflowProfiles) {
        console.log('✅ Would import as settings file');
    } else if (isComfyUIWorkflow) {
        console.log('✅ Would import as raw workflow');
    } else {
        console.log('❌ Would reject');
    }
}

testDetection(localGenSettings, 'localGenSettings.json');
testDetection(wanWorkflow, 'video_wan2_2_5B_ti2v.json');
