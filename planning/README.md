# Pipeline-to-CSG Integration Plan

Goal: make the CSG React frontend the primary driver and consumer of the production/narrative pipelines, surfacing preflight, temporal, QA/benchmark, and artifacts directly in-product.

Phases (see individual task files):
- Phase 1: Telemetry & Surfacing — planning/phase-1-telemetry-in-ui.md
- Phase 2: Run Launchers & Orchestration — planning/phase-2-run-launchers.md
- Phase 3: Preflight Gating & Temporal UX — planning/phase-3-preflight-temporal.md
- Phase 4: Quality Signals & Sources — planning/phase-4-quality-surfacing.md
- Phase 5: Retention, Registry & History — planning/phase-5-retention-history.md
- Phase 6: DX & Stability — planning/phase-6-dx-stability.md

Execution notes:
- Keep changes modular; ship phases independently.
- Ensure all new UI reads from the existing public/latest-* summary feeds before adding new APIs.
- Prefer additive wiring; avoid breaking current CLI flows.
