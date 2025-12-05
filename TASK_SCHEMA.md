# Task Object Schema for gemDirect1

Each task is represented as a JSON (or YAML) object with the following fields:

- **id** (string): Unique task identifier, e.g. `"B1"`, `"A2.1"`
- **workstream** (string): One of the workstreams (e.g. `"Workstream A — QA & Quality Signal Alignment"`)
- **description** (string): Short human-readable description of what to do
- **dependencies** (array of task IDs): Tasks that must be completed before this one
- **deliverables** (array of strings): Outputs (files, configs, scripts, docs, tests, etc.)
- **acceptance_criteria** (array of strings): Criteria/tests for completion
- **priority** (string): `"high"`, `"medium"`, or `"low"`
- **estimated_effort** (string): `"small"`, `"medium"`, or `"large"`
- **notes** (optional string): Additional context or caveats

Example:

```json
{
  "id": "B1",
  "workstream": "Workstream B — Resource Safety & Defaults Hardening",
  "description": "Integrate GenerationQueue into all video generation entry points and add VRAM/resource preflight checks",
  "dependencies": [],
  "deliverables": [
    "modified generation code",
    "resource preflight module",
    "fallback logic",
    "updated docs"
  ],
  "acceptance_criteria": [
    "No OOM under concurrent jobs",
    "Resource failures handled gracefully",
    "Default presets still work",
    "Documentation updated"
  ],
  "priority": "high",
  "estimated_effort": "medium",
  "notes": ""
}
```
