# Copilot Instructions for gemDirect1 (Canonical Archived Copy)

## Project Overview
This repository is an AI-powered cinematic story generator that creates production-ready video timelines. It integrates Gemini AI for content generation and ComfyUI for local rendering.

## Architecture

### Service Layer Pattern
All external API interactions go through dedicated services:
- `services/geminiService.ts` — Gemini API helpers, `withRetry`, context pruning, structured outputs
- `services/comfyUIService.ts` — ComfyUI integration, pre-flight checks, websocket progress
- `services/payloadService.ts` — Prompt/payload transforms

**Rule**: Do not call external APIs directly from React components. Use the service layer and validate responses.

## Key Rules (Short)
- Always use `withRetry` for Gemini calls to handle 429/backoff and track usage.
- Request structured JSON with `responseMimeType: "application/json"` and `responseSchema`.
- Prune large context with `getPrunedContext*` helpers before multi-step calls.
- Validate ComfyUI workflow mappings with `comfyUIService.validateWorkflowAndMappings()` before queuing jobs.
- Use the `safe-terminal.ps1` wrapper for any automated shell commands to avoid killing background servers.

## Running Locally
```powershell
npm install
# Put GEMINI_API_KEY=your_api_key_here in .env.local (do not commit)
npm run dev
```

## ComfyUI
Default path: `C:\ComfyUI\ComfyUI_windows_portable\` (default port `8188`).
Start via the VS Code task "Start ComfyUI Server" or included scripts.

## Terminal Safety (CRITICAL)
Run agent-driven commands with the safe wrapper:
```powershell
& 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command 'Invoke-RestMethod http://127.0.0.1:8188/system_stats'
```

## Useful Links
- Active short guidance: `.github/copilot-instructions.md`
- Canonical archived copy (this file): `docs/archived/copilot-instructions.legacy.cleaned.md`

---
If you want the canonical file moved to `docs/archived/copilot-instructions.legacy.md` (replacing the existing file) I can do that next — I created this cleaned canonical copy to avoid risky in-place edits first.
