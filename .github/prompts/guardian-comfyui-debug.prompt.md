---
description: 'Debug ComfyUI connection and workflow issues'
agent: Guardian
---

Diagnose and fix ComfyUI issues:

## Step 1: Check Server Status
Run `npm run check:health-helper` and analyze the output.

## Step 2: Verify Server is Running
Check if ComfyUI process is running. If not, guide user to start it via VS Code task "Start ComfyUI Server (Patched - Recommended)".

## Step 3: Check Workflow Mappings
Read the health check output for workflow mapping issues. Common problems:
- Missing node mappings in workflow profiles
- Incorrect workflow file paths
- CLIP text mapping missing for wan-t2i/wan-i2v

## Step 4: Verify Network
Test connection to `http://127.0.0.1:8188/system_stats`

## Step 5: Report
- Server status (running/stopped)
- Workflow mapping status
- Any configuration issues
- Recommended fixes
