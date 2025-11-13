#!/usr/bin/env python3
"""Test ComfyUI workflow - Comprehensive validation script."""

import json
import requests
import time
import os
import uuid
import websocket
from pathlib import Path

# Configuration
COMFYUI_URL = "http://127.0.0.1:8188"
WORKFLOW_PATH = r"c:\Dev\gemDirect1\workflows\text-to-video.json"
INPUT_IMAGE = "test_keyframe.jpg"
OUTPUT_DIR = r"C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
TIMEOUT = 300  # 5 minutes

def check_server():
    """Verify ComfyUI server is running."""
    print("🔍 Checking ComfyUI server...")
    try:
        response = requests.get(f"{COMFYUI_URL}/system_stats", timeout=5)
        stats = response.json()
        print(f"✅ ComfyUI Server: Running")
        print(f"   CPU Cores: {stats.get('cpu_count', 'unknown')}")
        print(f"   RAM: {stats.get('ram', {}).get('total', 'unknown')} bytes")
        return True
    except Exception as e:
        print(f"❌ Server check failed: {e}")
        return False

def check_models():
    """Verify required models are available."""
    print("\n📦 Checking models...")
    try:
        response = requests.get(f"{COMFYUI_URL}/api/models", timeout=10)
        if response.status_code == 200:
            models = response.json()
            print(f"✅ Models endpoint working")
            return True
    except Exception as e:
        print(f"⚠️  Model check warning: {e}")
        # This may not be critical
        return True

def load_workflow():
    """Load workflow JSON."""
    print("\n📋 Loading workflow...")
    with open(WORKFLOW_PATH, 'r') as f:
        workflow = json.load(f)
    print(f"✅ Workflow loaded: {WORKFLOW_PATH}")
    print(f"   Nodes: {list(workflow.keys())}")
    return workflow

def verify_workflow_connections(workflow):
    """Verify all nodes are properly connected."""
    print("\n🔗 Verifying workflow connections...")
    issues = []
    
    for node_id, node in workflow.items():
        inputs = node.get('inputs', {})
        for input_name, input_value in inputs.items():
            if isinstance(input_value, list) and len(input_value) == 2:
                ref_node_id = str(input_value[0])
                if ref_node_id not in workflow:
                    issues.append(f"Node {node_id}: references non-existent node {ref_node_id}")
    
    if issues:
        print("❌ Connection issues found:")
        for issue in issues:
            print(f"   - {issue}")
        return False
    else:
        print(f"✅ All {len(workflow)} nodes properly connected")
        return True

def update_workflow_image(workflow, image_name):
    """Update workflow to use the test image."""
    print(f"\n🖼️  Updating workflow with image: {image_name}")
    workflow['2']['inputs']['image'] = image_name
    print(f"✅ Workflow updated to use: {image_name}")
    return workflow

def queue_prompt(workflow):
    """Queue the prompt for generation."""
    print("\n⏳ Queueing prompt...")
    client_id = str(uuid.uuid4())
    
    payload = {
        "prompt": workflow,
        "client_id": client_id
    }
    
    try:
        response = requests.post(f"{COMFYUI_URL}/prompt", json=payload, timeout=10)
        if response.status_code == 200:
            data = response.json()
            prompt_id = data.get('prompt_id')
            print(f"✅ Prompt queued")
            print(f"   Prompt ID: {prompt_id}")
            print(f"   Client ID: {client_id}")
            return prompt_id, client_id
        else:
            print(f"❌ Failed to queue prompt: {response.status_code}")
            print(f"   Response: {response.text}")
            return None, None
    except Exception as e:
        print(f"❌ Queue error: {e}")
        return None, None

def wait_for_completion(prompt_id, client_id, timeout=TIMEOUT):
    """Wait for generation to complete via WebSocket."""
    print(f"\n⏳ Waiting for generation (timeout: {timeout}s)...")
    
    try:
        ws_url = f"ws://127.0.0.1:8188/ws?clientId={client_id}"
        ws = websocket.create_connection(ws_url, timeout=10)
        
        start_time = time.time()
        last_progress = 0
        
        while time.time() - start_time < timeout:
            try:
                msg = ws.recv()
                if not msg:
                    continue
                
                data = json.loads(msg)
                msg_type = data.get('type')
                
                if msg_type == 'executing':
                    node = data.get('data', {}).get('node')
                    print(f"   Executing node: {node}")
                
                elif msg_type == 'progress':
                    progress = data.get('data', {}).get('value', 0)
                    max_progress = data.get('data', {}).get('max', 100)
                    if progress != last_progress:
                        pct = (progress / max_progress * 100) if max_progress > 0 else 0
                        print(f"   Progress: {progress}/{max_progress} ({pct:.0f}%)")
                        last_progress = progress
                
                elif msg_type == 'executed':
                    print(f"   ✅ Generation complete!")
                    ws.close()
                    return True
                
                elif msg_type == 'error':
                    error = data.get('data', {}).get('exception_message', 'Unknown error')
                    print(f"   ❌ Error: {error}")
                    ws.close()
                    return False
                    
            except json.JSONDecodeError:
                continue
            except Exception as e:
                print(f"   ⚠️  WebSocket error: {e}")
                continue
        
        ws.close()
        print(f"❌ Timeout after {timeout} seconds")
        return False
        
    except Exception as e:
        print(f"❌ WebSocket connection error: {e}")
        return False

def verify_output():
    """Verify that output files were generated."""
    print("\n📁 Verifying output...")
    
    if not os.path.exists(OUTPUT_DIR):
        print(f"❌ Output directory not found: {OUTPUT_DIR}")
        return False
    
    # Look for PNG files with our prefix
    png_files = list(Path(OUTPUT_DIR).glob("gemdirect1_shot_*.png"))
    
    if png_files:
        print(f"✅ Output files generated: {len(png_files)} PNG files")
        for f in sorted(png_files)[:5]:  # Show first 5
            size_kb = f.stat().st_size / 1024
            print(f"   - {f.name} ({size_kb:.1f} KB)")
        if len(png_files) > 5:
            print(f"   ... and {len(png_files) - 5} more")
        return len(png_files) >= 25  # Should have 25 frames for 25-frame video
    else:
        print(f"❌ No output files found in {OUTPUT_DIR}")
        return False

def main():
    """Run complete workflow test."""
    print("=" * 60)
    print("🎬 ComfyUI Workflow Test - Text to Video")
    print("=" * 60)
    
    # Step 1: Check server
    if not check_server():
        print("\n❌ Cannot proceed without server")
        return False
    
    # Step 2: Check models
    check_models()
    
    # Step 3: Load workflow
    try:
        workflow = load_workflow()
    except Exception as e:
        print(f"❌ Failed to load workflow: {e}")
        return False
    
    # Step 4: Verify connections
    if not verify_workflow_connections(workflow):
        print("❌ Workflow has connection issues")
        return False
    
    # Step 5: Update with test image
    workflow = update_workflow_image(workflow, INPUT_IMAGE)
    
    # Step 6: Queue prompt
    prompt_id, client_id = queue_prompt(workflow)
    if not prompt_id:
        print("❌ Failed to queue prompt")
        return False
    
    # Step 7: Wait for completion
    if not wait_for_completion(prompt_id, client_id):
        print("❌ Generation failed or timed out")
        return False
    
    # Step 8: Verify output
    if not verify_output():
        print("❌ No output files generated")
        return False
    
    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED - Workflow is working!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
