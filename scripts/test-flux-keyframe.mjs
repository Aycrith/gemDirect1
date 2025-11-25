/**
 * Test FLUX keyframe generation to verify no comic-style segmentation
 */

const COMFYUI_URL = 'http://127.0.0.1:8188';

const fluxWorkflow = {
  "3": {
    "inputs": {
      "seed": Math.floor(Math.random() * 999999999999999),
      "steps": 20,
      "cfg": 1.0,
      "sampler_name": "euler",
      "scheduler": "simple",
      "denoise": 1.0,
      "model": ["12", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler",
    "_meta": { "title": "KSampler" }
  },
  "5": {
    "inputs": {
      "width": 1280,
      "height": 720,
      "batch_size": 1
    },
    "class_type": "EmptySD3LatentImage",
    "_meta": { "title": "Empty SD3 Latent Image" }
  },
  "6": {
    "inputs": {
      "text": "A lone astronaut in a white spacesuit standing in an ancient alien temple filled with glowing blue technology and mysterious symbols on the walls. Cinematic widescreen composition, dramatic lighting, single cohesive scene, photorealistic quality.",
      "clip": ["11", 0]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Positive Prompt)" }
  },
  "7": {
    "inputs": {
      "text": "comic panels, multiple frames, segmented, split screen, collage, grid layout, manga panels, storyboard",
      "clip": ["11", 0]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Negative Prompt)" }
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["10", 0]
    },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "9": {
    "inputs": {
      "filename_prefix": "FLUX_test_keyframe",
      "images": ["8", 0]
    },
    "class_type": "SaveImage",
    "_meta": { "title": "Save Image" }
  },
  "10": {
    "inputs": {
      "vae_name": "ae.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": { "title": "Load VAE" }
  },
  "11": {
    "inputs": {
      "clip_name1": "t5\\t5xxl_fp8_e4m3fn_scaled.safetensors",
      "clip_name2": "clip_l.safetensors",
      "type": "flux"
    },
    "class_type": "DualCLIPLoader",
    "_meta": { "title": "DualCLIPLoader" }
  },
  "12": {
    "inputs": {
      "unet_name": "flux1-krea-dev_fp8_scaled.safetensors",
      "weight_dtype": "fp8_e4m3fn"
    },
    "class_type": "UNETLoader",
    "_meta": { "title": "Load Diffusion Model" }
  }
};

async function queuePrompt() {
  console.log('🎨 Testing FLUX keyframe generation...');
  console.log(`   Prompt: "${fluxWorkflow["6"].inputs.text.substring(0, 80)}..."`);
  console.log(`   Seed: ${fluxWorkflow["3"].inputs.seed}`);
  console.log(`   Resolution: ${fluxWorkflow["5"].inputs.width}x${fluxWorkflow["5"].inputs.height}`);
  
  const response = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: fluxWorkflow,
      client_id: `flux-test-${Date.now()}`
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Failed to queue prompt:', error);
    process.exit(1);
  }
  
  const result = await response.json();
  console.log(`✅ Prompt queued successfully!`);
  console.log(`   Prompt ID: ${result.prompt_id}`);
  
  // Poll for completion
  console.log('\n⏳ Waiting for generation to complete...');
  let completed = false;
  let attempts = 0;
  const maxAttempts = 120; // 2 minutes max
  
  while (!completed && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
    
    const historyRes = await fetch(`${COMFYUI_URL}/history/${result.prompt_id}`);
    const history = await historyRes.json();
    
    if (history[result.prompt_id]) {
      const entry = history[result.prompt_id];
      if (entry.status?.completed) {
        completed = true;
        console.log(`✅ Generation complete! (${attempts * 2}s)`);
        
        // Find output images
        const outputs = entry.outputs;
        for (const nodeId of Object.keys(outputs)) {
          const nodeOutput = outputs[nodeId];
          if (nodeOutput.images) {
            for (const img of nodeOutput.images) {
              console.log(`\n📸 Output image:`);
              console.log(`   Filename: ${img.filename}`);
              console.log(`   Subfolder: ${img.subfolder || '(root)'}`);
              console.log(`   Type: ${img.type}`);
              console.log(`\n   Full path: C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\output\\${img.filename}`);
            }
          }
        }
      } else if (entry.status?.status_str === 'error') {
        console.error('❌ Generation failed:', entry.status.messages);
        process.exit(1);
      }
    }
    
    if (!completed && attempts % 10 === 0) {
      console.log(`   Still generating... (${attempts * 2}s elapsed)`);
    }
  }
  
  if (!completed) {
    console.error('❌ Timed out waiting for generation');
    process.exit(1);
  }
  
  console.log('\n✅ FLUX test complete! Check the output image for comic-style segmentation.');
  console.log('   If the image shows a single cohesive scene (no panels/grids), FLUX is working correctly.');
}

queuePrompt().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
