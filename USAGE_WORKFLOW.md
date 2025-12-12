# gemDirect1 — Development Workflow & Agent Orchestration

## Roles
- **Planning agent (Codec CLI)**: Ingests `plan.md`, `TASK_SCHEMA.md`, and `backlog.json`; produces and tracks structured backlog.
- **Implementation agent (Cloud Opus 4.5 + Copilot in VS Code)**: Receives individual task definitions and implements code/config/docs.
- **Human reviewer / maintainer**: Runs tests/QA/benchmarks, reviews changes, approves or requests fixes, marks tasks done.

## Typical Workflow
1. Ingest plan & backlog:  
   `codec plan ingest plan.md backlog.json`
2. List tasks:  
   `codec plan list`
3. Fetch ready tasks (dependencies satisfied):  
   `codec plan next <N>`
4. For each returned task: hand it to the implementation agent with scope, paths, and constraints (run tests/QA, keep changes focused).
5. After implementation, human reviewer runs automated tests, QA/benchmark harness, and any manual checks. If all acceptance criteria are met, mark task complete:  
   `codec plan complete <TASK_ID>`
6. Repeat steps 3–5 until backlog is clear or new tasks are added.

## Principles & Constraints
- Keep tasks small/medium; avoid multi-day mega-tasks.
- Advanced/optional features (e.g., cinematic motion, flow guidance) must be opt-in; defaults stay stable.
- Every behavioral/config change must include docs (README/guide/config schema/usage notes).
- Outputs should remain reproducible: emit manifests (seed + config + versions) where applicable.
- Experimental features must pass QA/benchmark before inclusion in stable presets.
- VRAM assumptions: safe mode for ~8 GB; optimize up to 24 GB (20–22 GB target headroom); no reliance on >24 GB.

## Ready-to-Use Commands
- Ingest: `codec plan ingest plan.md backlog.json`
- List: `codec plan list`
- Next tasks: `codec plan next <N>`
- Complete task: `codec plan complete <TASK_ID>`

Adjust command names if your Codec CLI variant uses different verbs/flags.
