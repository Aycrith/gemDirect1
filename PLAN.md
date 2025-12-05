# gemDirect1 — Project Plan & Roadmap

## 🎯 Vision & High-Level Goals

- Build a **production-ready cinematic video generation pipeline** with:
  - reliable **reproducibility**
  - strong **temporal & motion coherence** (camera motion, frame-to-frame consistency, identity stability)
  - **VRAM / resource safety** (target up to 24 GB VRAM, prefer 20–22 GB headroom)
  - **modular, maintainable architecture**
  - **clear QA / evaluation / benchmarking**
  - **scalable orchestration** for multi-shot / narrative use
- Provide **stable defaults** for predictable results on modest hardware; make advanced features opt-in.
- Keep outputs **traceable** (manifests), **documented**, and **easy to reproduce**.

---

## 🧩 Workstreams & Domains

### Workstream A — QA & Quality Signal Alignment
**Goal:** QA signals (vision-QA, pixel-regression, coherence metrics) are consistent, meaningful, and correlate with perceived video quality.  
**Deliverables:** Unified QA thresholds, refreshed baselines for all presets, benchmark harness (temporal/motion/identity), human/perceptual review hooks, preflight status surfaced.  
**Success Criteria:** QA verdicts match visual quality; WARN/FAIL semantics uniform; benchmarks generate reliably for each preset.  
**Risks:** Threshold changes can surface regressions; VLM availability and CORS/timeouts must be handled explicitly.

### Workstream B — Resource Safety & Defaults Hardening
**Goal:** Prevent OOM/instability; simplify presets and defaults; provide safe defaults.  
**Deliverables:** GenerationQueue wired everywhere; VRAM/node/model preflight; simplified preset set (Fast, Production-Stable, Cinematic/High-Fidelity with optional character); “safe defaults” mode; clear VRAM requirements (8 GB minimum, tuned for up to 24 GB).  
**Success Criteria:** No OOM under concurrent use; predictable behavior for new users; advanced flags hidden by default; documentation updated.  
**Risks:** Refactors may affect existing flows; need fallbacks and communication.

### Workstream C — Reproducibility, Versioning & Maintainability
**Goal:** Deterministic, traceable outputs; clean architecture and config schema.  
**Deliverables:** Versioning for models/assets/configs; generation manifests; config schema for scenes/assets/generation/QA; modular pipeline refactor; documentation + example configs.  
**Success Criteria:** Same manifest + seed reproduces output; config-driven scenes render; docs and examples verified.  
**Risks:** Storage/infra for versioning; external dependency drift; migration effort.

### Workstream D — Pipeline Orchestration & Workflow Management
**Goal:** Robust multi-step orchestration (scene load → render → QA → post-process → output), with retries, logging, resource control.  
**Deliverables:** Orchestration framework (Prefect/Airflow/Dagster or similar), DAGs for core pipeline, CLI/API for jobs, logging/monitoring, example workflows.  
**Success Criteria:** End-to-end runs succeed or fail gracefully with retries; status/logs visible; easy to launch batch/multi-shot jobs.  
**Risks:** Added infra complexity; must fit existing stack; ops overhead.

### Workstream E — Cinematic / Temporal Quality Enhancements (Opt-in/Advanced)
**Goal:** Raise cinematic quality: smooth camera motion, temporal coherence, identity stability.  
**Deliverables:** Camera-as-code motion paths + config; flow-guided/regularized generation; optional temporal augmentation/regularization; coherence metrics integrated into benchmarks.  
**Success Criteria:** Sample scenes show smoother motion and less drift; coherence metrics improve vs baseline; feature flag protected; docs updated.  
**Risks:** Complexity, potential blur/artifacts if constraints misapplied; higher resource cost; must remain optional.

---

## 🗓 Roadmap & Schedule

| Phase / Timeline            | Workstreams / Focus |
|-----------------------------|---------------------|
| **Short-Term (0–4 weeks)**  | A (QA alignment + benchmark harness), B (queue + defaults hardening) |
| **Near-Term (1–3 months)**  | C (versioning, modular refactor, config schema, docs) |
| **Mid-Term (3–6 months)**   | D (orchestration framework), E (begin cinematic enhancements, opt-in) |
| **Long-Term (6+ months)**   | Extend multi-shot/narrative workflows; continuous QA/benchmarking; maintenance & polish |

---

## 📜 Notes & Constraints

- Preserve backward compatibility for stable/production presets where possible.  
- Advanced/experimental features must be opt-in and clearly documented.  
- All outputs should emit manifests (seed + configs + versions) for reproducibility.  
- QA bar should use multiple signals (vision QA, pixel regression, temporal/flow/identity metrics) and agree on WARN/FAIL semantics.  
- VRAM ceiling: design for up to 24 GB; provide safe modes for ~8 GB; avoid assuming more than 24 GB.  
