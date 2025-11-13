PR #1 — Summary of changes and verification
===========================================

Branch: pr/align-ci-node-and-deploy-helper

What changed
------------
- Bumped Node.js used in GitHub Actions to 22.19.0 (both Ubuntu and Windows jobs). This matches the README requirement (Node >= 22.19.0).
- Added `comfyui_nodes/write_done_marker.py` — an in-repo helper that atomically writes `<prefix>.done` markers (tmp -> atomic rename). Intended to be copied into ComfyUI `custom_nodes/` or invoked via a shell/script node.
- Added `scripts/deploy-write-done-marker.ps1` — safe helper to copy the above file into a ComfyUI installation's `custom_nodes/` folder (backs up existing file).
- Added `scripts/install-sentinel-service.ps1` — scaffold that prints recommended NSSM / sc.exe commands for installing the sentinel as a Windows Service (no automatic installs are performed).
- Added small CI/test-related helpers and telemetry tests (already present in branch): `scripts/utils/telemetryUtils.ts`, various `scripts/__tests__/*` new tests.

Local verification performed
---------------------------
- Ran the full Vitest suite locally: 103 tests passed (no failures).
- Ran FastIteration E2E earlier: run-summary validation passed and artifacts were produced locally. A sweep report was generated.
- Deployed `write_done_marker.py` to a local ComfyUI installation at:
  `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes\write_done_marker.py` (if you want me to revert this step, say so).

Notes for reviewers / how to test
--------------------------------
1. CI Node version
   - The workflow currently pins `node-version: '22.19.0'`. If you'd prefer a looser pin, change it to `22.x`.

2. Review the new scripts
   - `scripts/deploy-write-done-marker.ps1` — copy helper into a ComfyUI installation (use `-Force` to overwrite).
   - `scripts/install-sentinel-service.ps1` — prints commands to install using NSSM or `sc.exe` (Admin required).

3. How to test write_done_marker in ComfyUI
   - Copy `comfyui_nodes/write_done_marker.py` into your ComfyUI `custom_nodes/` folder (the deploy helper can do this).
   - Restart ComfyUI (recommended) or load the node if your ComfyUI hot-reloads `custom_nodes/`.
   - Add a Script node that calls:

       write_done_marker('C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/output', 'gemdirect1_scene-001', 25)

   - Confirm that `gemdirect1_scene-001.done` was created atomically (tmp → `.done`), and that the JSON payload has `Timestamp` and `FrameCount`.

4. CI / PR checks
   - The PR will trigger the `Vitest CI` workflow. I couldn't query the PR checks from here because the environment doesn't have GitHub authentication for the API. If you'd like me to monitor the PR checks, either:
     - Run `gh auth login` in this environment (and tell me once it's authenticated), or
     - I can watch the PR URL if you want me to poll it and you confirm it's accessible.

Files touched (high level)
-------------------------
- .github/workflows/vitest.yml  (Node pin changed to 22.19.0)
- comfyui_nodes/write_done_marker.py
- scripts/deploy-write-done-marker.ps1
- scripts/install-sentinel-service.ps1
- PR summary file (this file)

Next steps I can take for you
----------------------------
1. Monitor PR #1 checks and report results (requires `gh auth login` or PR accessibility).
2. If CI fails, fetch logs and summarize fixes.
3. Update workflow pin to `22.x` instead of `22.19.0` if you prefer a looser pin.
4. Create an NSSM-based installer script (requires Admin to execute).

If you'd like me to proceed with any of the above, tell me which one and I'll carry it out.
