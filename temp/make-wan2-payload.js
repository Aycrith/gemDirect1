const fs = require('fs');
const path = require('path');

const settingsPath = 'C:\\Dev\\gemDirect1\\localGenSettings.json';
const fallbackWorkflowPath = 'C:\\Dev\\gemDirect1\\workflows\\video_wan2_2_5B_ti2v.json';
const outPath = 'C:\\Dev\\gemDirect1\\temp\\wan2-full-prompt.json';
const sceneId = process.argv[2] || 'scene-001';
const uploadedFilename = process.argv[3] || `gemdirect1_${sceneId}_00676_.png`;

function loadWorkflowFromSettings() {
  const raw = fs.readFileSync(settingsPath, 'utf8');
  const settings = JSON.parse(raw);
  if (settings.workflowProfiles && settings.workflowProfiles['wan-i2v'] && settings.workflowProfiles['wan-i2v'].workflowJson) {
    return settings.workflowProfiles['wan-i2v'].workflowJson;
  }
  if (settings.workflowJson) return settings.workflowJson;
  return null;
}

function tryParseMaybeString(jsonOrString) {
  if (typeof jsonOrString === 'object') return jsonOrString;
  try {
    return JSON.parse(jsonOrString);
  } catch (e) {
    // Might already be escaped twice or have newlines; attempt eval-less replacement
    try {
      return JSON.parse(jsonOrString.replace(/\\\n/g, '\\n'));
    } catch (e2) {
      throw new Error('Failed to parse workflow JSON: ' + e.message + ' / ' + e2.message);
    }
  }
}

let wfStr = loadWorkflowFromSettings();
let wfObj = null;
if (!wfStr) {
  wfObj = JSON.parse(fs.readFileSync(fallbackWorkflowPath, 'utf8'));
  // fallback file already contains { "prompt": {...} }
  if (wfObj && wfObj.prompt) wfObj = wfObj.prompt;
} else {
  wfObj = tryParseMaybeString(wfStr);
}

// Find LoadImage node and SaveVideo node (by class_type)
let loadImageKey = null;
let saveVideoKey = null;
for (const k of Object.keys(wfObj)) {
  const node = wfObj[k];
  if (!node || !node.class_type) continue;
  if (node.class_type === 'LoadImage') loadImageKey = k;
  if (node.class_type === 'SaveVideo') saveVideoKey = k;
}

if (!loadImageKey) {
  // try by looking for inputs.image
  for (const k of Object.keys(wfObj)) {
    const node = wfObj[k];
    if (node && node.inputs && Object.prototype.hasOwnProperty.call(node.inputs, 'image')) {
      loadImageKey = k; break;
    }
  }
}

if (!saveVideoKey) {
  for (const k of Object.keys(wfObj)) {
    const node = wfObj[k];
    if (node && node.class_type && node.class_type.includes('SaveVideo')) { saveVideoKey = k; break; }
  }
}

if (loadImageKey) {
  if (!wfObj[loadImageKey].inputs) wfObj[loadImageKey].inputs = {};
  wfObj[loadImageKey].inputs.image = uploadedFilename;
} else {
  console.warn('No LoadImage node found to set image.');
}

if (saveVideoKey) {
  if (!wfObj[saveVideoKey].inputs) wfObj[saveVideoKey].inputs = {};
  // Use forward slash to be safe for ComfyUI
  wfObj[saveVideoKey].inputs.filename_prefix = `video/${sceneId}`;
  if (!wfObj[saveVideoKey].inputs.format) wfObj[saveVideoKey].inputs.format = 'auto';
  if (!wfObj[saveVideoKey].inputs.codec) wfObj[saveVideoKey].inputs.codec = 'auto';
} else {
  console.warn('No SaveVideo node found to configure filename_prefix.');
}

const payload = { prompt: wfObj };
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log('Wrote payload to', outPath);
