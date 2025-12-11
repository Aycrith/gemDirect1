# Multi-Agent Strategy for gemDirect1

**Date**: December 10, 2025
**Status**: Active

This document outlines the strategy for leveraging VS Code's new multi-agent capabilities (Agent HQ, Background Agents, Custom Agents) to accelerate the `gemDirect1` project.

## Agent Roster

We define specialized agents to handle different aspects of the development lifecycle.

| Agent | Role | Type | Focus |
|-------|------|------|-------|
| **@Guardian** | Health Monitor | Background | Continuous monitoring of build health, TypeScript errors, and test stability. |
| **@QualityDirector** | Planner/Auditor | Chat/Interactive | High-level architectural planning, code reviews, and quality audits. |
| **@Implementer** | Developer | Background (Worktree) | Focused implementation of specific features or bug fixes (TDD). |
| **@BookendQA** | QA Engineer | Background (Long-running) | Running extensive regression suites (Vision QA, Benchmarks). |
| **@Scribe** | Documentarian | Background | Keeping documentation in sync with code changes. |

## Workflow Strategy

### 1. Triage & Planning (Interactive)
*   **User** interacts with **@QualityDirector** to define the scope of work (e.g., "Plan the SVI integration").
*   **Output**: A detailed plan in `IMPLEMENTATION_PLAN_NEXT.md` or `REMEDIATION_PLAN.MD`.

### 2. Execution (Background Parallelism)
*   **User** delegates tasks to **@Implementer** running in **Background Agents** (using Git Worktrees).
    *   *Example*: "Implement P1.2 GenerationQueue Integration" -> Agent creates a worktree, implements, tests.
*   **User** delegates long-running tests to **@BookendQA**.
    *   *Example*: "Run full regression on the new WAN2 model" -> Agent runs suite, reports results.

### 3. Verification & Merge
*   **@Guardian** is used to "bless" a worktree before merging.
    *   *Command*: "Scan this worktree for issues."
*   **User** merges the worktree changes into the main branch.

## Implementation Tasks

### Immediate Actions (Phase 1)

1.  **GenerationQueue Integration (P1.2)**
    *   **Agent**: `@Implementer`
    *   **Mode**: Background Agent (Git Worktree)
    *   **Prompt**: "Implement the `queueComfyUIPromptSafe` wrapper in `videoGenerationService.ts` as described in `REMEDIATION_PLAN.MD` item P1.2. Ensure all ComfyUI calls are routed through it."

2.  **E2E Stabilization (P3)**
    *   **Agent**: `@Guardian`
    *   **Mode**: Background Agent
    *   **Prompt**: "Analyze the E2E test failures in `tests/e2e/`. Identify tests that fail due to missing services and implement the `skip` logic using `service-mocks.ts`."

3.  **Documentation Sync**
    *   **Agent**: `@Scribe` (or generic Chat)
    *   **Mode**: Background Agent
    *   **Prompt**: "Read `README.md` and `REMEDIATION_PLAN.MD`. Update `Documentation/PROJECT_STATUS_CONSOLIDATED.md` to reflect the completion of Phase 1 items."

## Setup Instructions

1.  Ensure you are on VS Code 1.107+.
2.  Enable `github.copilot.chat.cli.customAgents.enabled` in settings (Added to `.vscode/settings.json`).
3.  Use the "New Background Agent" command or select "Background" from the agent picker.
4.  **Note**: If "Run in Git Worktree" is not explicitly shown, select **"Background"**. The agent will run in a background session. You may be prompted to create a worktree or it may run in the current workspace depending on your specific VS Code version/configuration.
    *   *Recommendation*: If running in the main workspace, ensure you have a clean git state before starting.

## Future Expansion

*   **Subagents**: We will configure `@QualityDirector` to automatically call `@Implementer` as a subagent for specific tasks once the experimental feature stabilizes.
*   **MCP Integration**: We will connect `@BookendQA` to a local MCP server that provides direct access to ComfyUI logs and artifacts for deeper analysis.
