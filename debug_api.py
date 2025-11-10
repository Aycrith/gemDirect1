#!/usr/bin/env python3
"""Debug ComfyUI node types."""

import requests
import json

try:
    response = requests.get("http://127.0.0.1:8188/api", timeout=5)
    api = response.json()
    
    # Find SVD-related nodes
    svd_nodes = [k for k in api.keys() if 'SVD' in k]
    sampler_nodes = [k for k in api.keys() if 'Sampler' in k]
    
    print("SVD Nodes:")
    for node in svd_nodes:
        print(f"  - {node}")
        if hasattr(api[node], '__getitem__'):
            outputs = api[node].get('return_types', [])
            print(f"    Return types: {outputs}")
    
    print("\nSampler Nodes:")
    for node in sampler_nodes:
        print(f"  - {node}")
        
except Exception as e:
    print(f"Error: {e}")
    # Try raw request
    import subprocess
    result = subprocess.run(['curl', '-s', 'http://127.0.0.1:8188/api'], 
                          capture_output=True, text=True)
    print(f"Raw curl response (first 500 chars):\n{result.stdout[:500]}")
