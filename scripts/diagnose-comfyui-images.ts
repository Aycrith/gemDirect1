/**
 * ComfyUI Image Generation Diagnostic Script
 * 
 * Purpose: Validates that ComfyUI server is properly generating and saving images
 * 
 * Usage:
 *   node --loader ts-node/esm scripts/diagnose-comfyui-images.ts
 * 
 * Checks:
 * 1. ComfyUI server connectivity
 * 2. Recent history entries
 * 3. Output images from recent generations
 * 4. File system locations where images are saved
 */

import fetch from 'node-fetch';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';

interface HistoryEntry {
  prompt: any;
  outputs: Record<string, any>;
  status: any;
}

async function checkServerConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${COMFYUI_URL}/system_stats`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      console.error(`❌ Server responded with status ${response.status}`);
      return false;
    }
    
    const data = await response.json();
    console.log('✅ ComfyUI server is running');
    console.log(`   GPU: ${data.devices?.[0]?.name || 'Unknown'}`);
    console.log(`   VRAM: ${(data.devices?.[0]?.vram_total / (1024**3)).toFixed(2)} GB`);
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to ComfyUI server:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function checkHistory(): Promise<Record<string, HistoryEntry>> {
  try {
    const response = await fetch(`${COMFYUI_URL}/history`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    
    const history = await response.json() as Record<string, HistoryEntry>;
    const entries = Object.entries(history);
    
    console.log(`\n📊 History: ${entries.length} total entries`);
    
    if (entries.length === 0) {
      console.log('   No generation history found');
      return history;
    }
    
    // Show last 5 entries
    const recent = entries.slice(-5);
    console.log(`\n📋 Recent generations (last ${recent.length}):`);
    
    recent.forEach(([promptId, entry], index) => {
      const status = entry.status?.status_str || 'unknown';
      const outputNodes = Object.keys(entry.outputs || {});
      
      console.log(`\n   ${index + 1}. Prompt ID: ${promptId}`);
      console.log(`      Status: ${status}`);
      console.log(`      Output nodes: ${outputNodes.length > 0 ? outputNodes.join(', ') : 'none'}`);
      
      // Check for images in outputs
      outputNodes.forEach(nodeId => {
        const nodeOutput = entry.outputs[nodeId];
        const images = nodeOutput?.images || [];
        const videos = nodeOutput?.videos || [];
        
        if (images.length > 0) {
          console.log(`      📷 Node ${nodeId} - Images: ${images.length}`);
          images.forEach((img: any, imgIndex: number) => {
            console.log(`         ${imgIndex + 1}. ${img.filename} (${img.subfolder || 'default'}, type: ${img.type || 'output'})`);
          });
        }
        
        if (videos.length > 0) {
          console.log(`      🎬 Node ${nodeId} - Videos: ${videos.length}`);
          videos.forEach((vid: any, vidIndex: number) => {
            console.log(`         ${vidIndex + 1}. ${vid.filename} (${vid.subfolder || 'default'})`);
          });
        }
      });
    });
    
    return history;
  } catch (error) {
    console.error('❌ Failed to fetch history:', error instanceof Error ? error.message : error);
    return {};
  }
}

async function testImageRetrieval(history: Record<string, HistoryEntry>): Promise<void> {
  const entries = Object.entries(history);
  if (entries.length === 0) {
    console.log('\n⚠️  No history entries to test image retrieval');
    return;
  }
  
  // Find most recent entry with image outputs
  let testImage: { filename: string; subfolder: string; type: string } | null = null;
  let testPromptId: string | null = null;
  
  for (const [promptId, entry] of entries.reverse()) {
    const outputs = entry.outputs || {};
    for (const nodeId of Object.keys(outputs)) {
      const images = outputs[nodeId]?.images || [];
      if (images.length > 0) {
        testImage = images[0];
        testPromptId = promptId;
        break;
      }
    }
    if (testImage) break;
  }
  
  if (!testImage || !testPromptId) {
    console.log('\n⚠️  No image outputs found in history');
    return;
  }
  
  console.log(`\n🧪 Testing image retrieval for prompt ${testPromptId}`);
  console.log(`   Filename: ${testImage.filename}`);
  console.log(`   Subfolder: ${testImage.subfolder || 'default'}`);
  console.log(`   Type: ${testImage.type || 'output'}`);
  
  try {
    const viewUrl = `${COMFYUI_URL}/view?filename=${encodeURIComponent(testImage.filename)}&subfolder=${encodeURIComponent(testImage.subfolder || '')}&type=${encodeURIComponent(testImage.type || 'output')}`;
    
    const response = await fetch(viewUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    
    console.log(`✅ Image retrieved successfully`);
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   Size: ${contentLength ? `${(parseInt(contentLength) / 1024).toFixed(2)} KB` : 'unknown'}`);
    
    // Try to read as data URL
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;
    
    console.log(`✅ Converted to data URL: ${dataUrl.slice(0, 100)}...`);
    console.log(`   Data URL length: ${dataUrl.length} characters`);
    
  } catch (error) {
    console.error('❌ Failed to retrieve image:', error instanceof Error ? error.message : error);
  }
}

async function checkQueue(): Promise<void> {
  try {
    const response = await fetch(`${COMFYUI_URL}/queue`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    
    const queueData = await response.json() as any;
    const pending = queueData.queue_pending?.length || 0;
    const running = queueData.queue_running?.length || 0;
    
    console.log(`\n📊 Queue Status:`);
    console.log(`   Pending: ${pending}`);
    console.log(`   Running: ${running}`);
    
    if (running > 0) {
      console.log(`\n   ⚠️  Generation currently in progress`);
      queueData.queue_running.forEach((item: any, index: number) => {
        console.log(`   ${index + 1}. Prompt ID: ${item[1]}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Failed to fetch queue:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  console.log('🔍 ComfyUI Image Generation Diagnostics\n');
  console.log(`Server URL: ${COMFYUI_URL}\n`);
  console.log('═'.repeat(60));
  
  // Step 1: Check server connection
  const serverOk = await checkServerConnection();
  if (!serverOk) {
    console.log('\n❌ Cannot proceed - server is not accessible');
    process.exit(1);
  }
  
  // Step 2: Check queue status
  await checkQueue();
  
  // Step 3: Check history
  const history = await checkHistory();
  
  // Step 4: Test image retrieval
  await testImageRetrieval(history);
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Diagnostics complete\n');
  
  // Summary
  const totalEntries = Object.keys(history).length;
  let totalImages = 0;
  let totalVideos = 0;
  
  Object.values(history).forEach(entry => {
    const outputs = entry.outputs || {};
    Object.values(outputs).forEach((nodeOutput: any) => {
      totalImages += nodeOutput?.images?.length || 0;
      totalVideos += nodeOutput?.videos?.length || 0;
    });
  });
  
  console.log('📊 Summary:');
  console.log(`   Total generations: ${totalEntries}`);
  console.log(`   Total images generated: ${totalImages}`);
  console.log(`   Total videos generated: ${totalVideos}`);
  
  if (totalEntries > 0 && totalImages === 0 && totalVideos === 0) {
    console.log('\n⚠️  WARNING: Generations exist but no images/videos found in outputs!');
    console.log('   This suggests outputs are not being properly captured or saved.');
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
