#!/usr/bin/env python3
"""
Quick test of FastVideo API - validates correct initialization
"""
import os
import sys

# Add script directory to path
sys.path.insert(0, os.path.dirname(__file__))

print("Testing FastVideo imports...")
try:
    from fastvideo import VideoGenerator, SamplingParam
    from fastvideo.fastvideo_args import FastVideoArgs
    from fastvideo.worker.executor import Executor
    print("✓ Imports successful")
except Exception as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)

print("\nTesting FastVideoArgs initialization...")
try:
    args = FastVideoArgs(
        model_path="hao-ai-lab/FastHunyuan-diffusers",
        num_gpus=1,
        inference_mode=True,
        dit_cpu_offload=True,
        output_type="pil"
    )
    print(f"✓ FastVideoArgs created")
    print(f"  model_path: {args.model_path}")
    print(f"  num_gpus: {args.num_gpus}")
    print(f"  inference_mode: {args.inference_mode}")
except Exception as e:
    print(f"✗ FastVideoArgs failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n✓ All API tests passed")
print("FastVideo server should work with these imports")
