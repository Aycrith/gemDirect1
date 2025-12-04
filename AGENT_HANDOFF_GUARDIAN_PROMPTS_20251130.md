# Agent Handoff: Guardian Proactive Prompts

**Date**: 2025-11-30  
**Status**: ✅ COMPLETE  
**Session Focus**: Proactive Copilot Integration for Project Guardian

## Summary

Enhanced Project Guardian with proactive task delegation capabilities. The agent now generates Copilot-ready prompts for each detected issue, supports both VS Code Copilot Chat and GitHub Copilot CLI, and includes a semi-automated interactive mode.

## Key Achievements

### 1. Prompt Generation System
- **PromptGenerator** (`agent/tasks/PromptGenerator.ts`): Generates individual prompts per issue
- Two formats: `chat/` (VS Code optimized) and `cli/` (terminal optimized)
- Auto-extracts file context and project conventions
- Generates indexed `INDEX.md` for navigation

### 2. Task Directive System  
- **DirectiveManager** (`agent/tasks/TaskDirective.ts`): User-defined task system
- Supports directive types: fix-issue, fill-gap, improve, investigate, implement
- Auto-suggests tasks based on current issues

### 3. VS Code Chat Integration
- **ChatIntegration** (`agent/tasks/ChatIntegration.ts`): @workspace context support
- Structured prompts with file references optimized for Copilot Chat
- Batch prompts by category

### 4. Enhanced CopilotQueue
- Clipboard support via `Set-Clipboard`
- Stdin piping to `gh copilot suggest`
- Semi-automated mode with user confirmation

## New CLI Commands

```powershell
# Generate prompts for all issues
npm run guardian -- --generate-prompts
npm run guardian:prompts

# Interactive mode (select and confirm tasks)
npm run guardian -- --interactive

# Show suggested tasks
npm run guardian -- --suggest

# List generated prompts
npm run guardian -- --list-prompts

# Show specific prompt
npm run guardian -- --show-prompt <filename>

# Clear all prompts
npm run guardian -- --clear-prompts

# Create and execute a task
npm run guardian -- --task "fix typescript errors"
```

## Directory Structure

```
agent/
├── prompts/
│   ├── chat/         # VS Code Copilot Chat optimized
│   ├── cli/          # GitHub Copilot CLI optimized
│   ├── batch/        # Combined prompts by category
│   ├── INDEX.md      # Navigation index
│   └── README.md     # Usage documentation
├── directives/       # Task directive storage
└── tasks/
    ├── PromptGenerator.ts    # NEW - Prompt generation
    ├── TaskDirective.ts      # NEW - Task directive system
    ├── ChatIntegration.ts    # NEW - VS Code Chat optimization
    └── CopilotQueue.ts       # ENHANCED - Clipboard/piping support
```

## Usage Examples

### Copy prompt to clipboard (PowerShell)
```powershell
Get-Content "agent/prompts/chat/<filename>.md" | Set-Clipboard
# Paste into VS Code Copilot Chat
```

### Pipe to Copilot CLI
```powershell
Get-Content "agent/prompts/cli/<filename>.md" | gh copilot suggest
```

### Interactive Mode
```powershell
npm run guardian -- --interactive
# Shows menu of issues, user selects, prompt generated and copied
```

## TypeScript Fixes Applied

During this session, fixed TypeScript errors in:
1. `agent/tasks/PromptGenerator.ts` - Removed unused `baseName`, prefixed unused `format` parameter
2. `agent/tasks/TaskDirective.ts` - Removed unused options/config, added null assertion for array access
3. `agent/tasks/ChatIntegration.ts` - Prefixed unused `stateManager` parameter
4. `services/__tests__/lmStudioModelManager.test.ts` - Removed unused type imports

## Current State

- **TypeScript**: 0 errors (`npx tsc --noEmit` passes)
- **Guardian**: 8 issues detected (4 typescript*, 2 test*, 2 service-layer)
  - *Note: These are cached from watchers and may be stale; actual tsc passes
- **Prompts**: 16 generated (8 chat + 8 cli)
- **Tests**: All unit tests passing

## Next Steps

1. **Validation**: Run full test suite to ensure no regressions
2. **Cache Refresh**: Consider adding `--refresh` flag to force re-scan
3. **GitHub CLI Integration**: Test `gh copilot suggest` piping
4. **Handoff Integration**: Add prompts to Copilot Chat handoff workflow

## Files Changed

| File | Change |
|------|--------|
| `agent/tasks/PromptGenerator.ts` | NEW - 468 lines |
| `agent/tasks/TaskDirective.ts` | NEW - 398 lines |
| `agent/tasks/ChatIntegration.ts` | NEW - 185 lines |
| `agent/tasks/CopilotQueue.ts` | ENHANCED - clipboard/piping |
| `agent/index.ts` | UPDATED - new CLI commands |
| `agent/prompts/README.md` | NEW - usage docs |
| `package.json` | UPDATED - new scripts |
| `services/__tests__/lmStudioModelManager.test.ts` | FIXED - unused imports |

## Validation Commands

```powershell
# Verify TypeScript
npx tsc --noEmit

# Test Guardian scan
npm run guardian -- --scan

# Generate prompts
npm run guardian:prompts

# List prompts
npm run guardian -- --list-prompts

# Show suggestions
npm run guardian -- --suggest
```
