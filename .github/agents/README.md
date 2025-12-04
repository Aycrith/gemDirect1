# VS Code Copilot Agents

This directory contains custom agent definitions for VS Code Copilot Chat. Each `.agent.md` file defines an autonomous agent with specific capabilities and workflows.

## Available Agents

| Agent | Command | Purpose |
|-------|---------|---------|
| **Guardian** | `@Guardian` | Project health monitor - fixes TypeScript errors, test failures, code issues |
| **QualityDirector** | `@QualityDirector` | Pipeline quality agent - uses SWE-bench winning patterns to improve CSG quality |

## How to Use

In VS Code Copilot Chat, type `@` followed by the agent name:

```
@Guardian Fix TypeScript errors
@QualityDirector Run full quality audit
```

Or use the **handoff buttons** that appear when you invoke an agent.

---

## Guardian Agent

**Focus**: Project health and stability

**Handoffs**:
- 📊 Show Status - Current issue counts
- 🔍 Run Full Scan - Refresh issue data
- 🔧 Fix TypeScript Errors - Autonomous TS fixes
- 🧪 Fix Test Failures - Autonomous test fixes
- ✅ Full Validation - Complete health check

**Best for**: Build errors, test failures, CI/CD health

---

## QualityDirector Agent

**Focus**: CSG pipeline quality using proven autonomous agent patterns

**Based on**: Anthropic's SWE-bench winning agent (49% - state of the art) and "Building Effective Agents" research

**The Pattern**:
```
EXPLORE → REPRODUCE → PLAN → IMPLEMENT → VERIFY → ITERATE
```

**Handoffs**:
- 🚀 Run Full Quality Audit - Complete autonomous 6-phase workflow
- 📊 Audit Only (No Changes) - Read-only analysis with recommendations
- 🔧 Fix Prompt Quality - Focus on payloadService prompt improvements
- 📐 Fix Bookend Workflow - Start/end image validation
- 🎭 Fix Narrative Coherence - Character/location state tracking
- 🔄 Continue Previous Session - Resume from last session's handoff

**Key Principles** (from research):
1. **Explore before coding** - Read files completely first
2. **Create scratchpad** - Track issues in `agent/reports/quality-audit.md`
3. **Plan explicitly** - Write out exact changes before implementing
4. **Verify with ground truth** - Run `tsc` after every change
5. **Self-correct** - Try different approaches if something fails

**Best for**: Prompt quality, narrative coherence, video generation quality

---

## Agent Patterns

Both agents follow the **evaluator-optimizer loop** pattern from Anthropic's research:

```
┌────────────────────────────────────────────┐
│                                            │
│   AUDIT → EVALUATE → PRIORITIZE → PLAN    │
│     ▲                              │       │
│     │                              ▼       │
│   VERIFY ◄─── IMPLEMENT ◄─── DESIGN       │
│     │                                      │
│     └─────────► HANDOFF                    │
│                                            │
└────────────────────────────────────────────┘
```

## State Files

Agents read/write state for continuity across sessions:

| File | Purpose |
|------|---------|
| `agent/.state/session-handoff.json` | Session context for continuity |
| `agent/.state/issues.json` | Current project issues |
| `agent/reports/quality-audit.md` | QualityDirector working scratchpad |

## Research Sources

The QualityDirector agent is built on patterns from:

1. **Anthropic's "Building Effective Agents"** - Evaluator-optimizer loops, orchestrator-workers
2. **Claude Code Best Practices** - CLAUDE.md files, checklists, explore-plan-code-commit
3. **SWE-bench Agent** - Reproduction scripts, minimal changes, ground truth verification
4. **OpenHands SDK** - Task decomposition, context compression

## Creating New Agents

To create a new agent:

1. Create `<AgentName>.agent.md` in this directory
2. Add YAML frontmatter with `name`, `description`, `tools`, `handoffs`
3. Add markdown body with agent instructions
4. Optionally create supporting prompts in `.github/prompts/`

See existing agents for examples.
