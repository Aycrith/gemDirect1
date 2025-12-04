# Terminal Usage Directive for Agents

**Directive ID**: `terminal-usage`  
**Priority**: CRITICAL  
**Applies To**: All Copilot agents, Guardian agents, and automated processes

---

## Purpose

This directive establishes mandatory rules for terminal and server usage by AI agents. Violations waste user time and resources.

## Rule 1: Server Commands MUST Use VS Code Tasks

**Servers are NEVER started using `run_in_terminal`.** They are started using `run_task` or `create_and_run_task`.

### Rationale
When an agent runs a server command in a terminal and then runs a follow-up command in the same terminal, the server is terminated. The agent often doesn't realize this and continues working with a dead server.

### Approved Methods

| Server | Task Label |
|--------|------------|
| Dev Server (port 3000) | `Dev Server` |
| ComfyUI (port 8188) | `Start ComfyUI Server (Patched - Recommended)` |
| FastVideo (port 8055) | `Start FastVideo Server` |
| Guardian | `Guardian: Start` |

### Pre-Start Validation

Before starting ANY server, check if it's already running:

```powershell
pwsh -File scripts/check-server-running.ps1 -Port <PORT>
```

Exit code 0 = server running (do NOT start another)
Exit code 1 = server not running (safe to start via task)

---

## Rule 2: Tests MUST Use Single-Run Mode with Reporters

**Tests are NEVER run without `--run` (vitest) or `--reporter=list` (playwright).**

### Rationale
- Vitest without `--run` enters infinite watch mode with no output
- Playwright without `--reporter` uses dot reporter with minimal feedback
- Agents cannot determine when tests complete, wasting resources

### Approved Methods

| Test Type | Command |
|-----------|---------|
| Unit Tests | `npm test -- --run --reporter=verbose` |
| Unit Tests | `pwsh -File scripts/run-tests.ps1` |
| Unit Tests | Use task: `Run Unit Tests (Single Run)` |
| Playwright | `npx playwright test --reporter=list` |
| Playwright | `pwsh -File scripts/run-playwright.ps1` |
| Playwright | Use task: `Run Playwright Tests` |

### Forbidden Commands

These commands are NEVER acceptable:

- `npm test` (without `-- --run`)
- `vitest` (enters watch mode)
- `npx playwright test` (without `--reporter`)

---

## Rule 3: Terminal Safety Checklist

Before running ANY terminal command, verify:

1. **Is this a server command?**
   - YES → Use `run_task`, not `run_in_terminal`
   - Check port first: `scripts/check-server-running.ps1`

2. **Is this a test command?**
   - YES → Include `--run` flag (vitest) or `--reporter=list` (playwright)
   - Prefer wrapper scripts: `scripts/run-tests.ps1`, `scripts/run-playwright.ps1`

3. **Will this command block indefinitely?**
   - YES → Set `isBackground: true` if using `run_in_terminal`
   - Better: Use a VS Code task instead

4. **Am I reusing a terminal running a server?**
   - YES → STOP. Use a different terminal or a task.

---

## Enforcement

These rules are referenced in:
- `.github/copilot-instructions.md` (Section: "MANDATORY: Agent Tool Usage Rules")
- `.github/instructions/handoff.instructions.md`
- `vscode-userdata:/prompts/testing.instructions.md`

Agents violating these rules will:
1. Receive explicit correction in the next prompt
2. Be redirected to read this directive
3. Have their actions logged for review

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────────────┐
│                    AGENT TERMINAL RULES                       │
├──────────────────────────────────────────────────────────────┤
│  SERVERS                                                      │
│  ❌ npm run dev                    → ✅ task: Dev Server     │
│  ❌ python main.py (ComfyUI)       → ✅ task: Start ComfyUI  │
│  ❌ python fastvideo_server.py     → ✅ task: Start FastVideo│
├──────────────────────────────────────────────────────────────┤
│  TESTS                                                        │
│  ❌ npm test                       → ✅ npm test -- --run    │
│  ❌ vitest                         → ✅ scripts/run-tests.ps1│
│  ❌ npx playwright test            → ✅ npx ... --reporter=list│
├──────────────────────────────────────────────────────────────┤
│  BEFORE STARTING SERVER: pwsh -File scripts/check-server-running.ps1 -Port <PORT> │
└──────────────────────────────────────────────────────────────┘
```
