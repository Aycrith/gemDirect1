# Branching Status & Cleanup Plan

## Current landscape
- `main` (trunk) is now in sync with `origin/main` at commit `a6d8ca9` (the merge of PR #1) and remains the only fully protected release branch for creating new work.
- `feature/local-integration-v2` still contains the UTF-8 and Windows dashboard work plus the `trackPromptExecution` fix (commit `d04f142`). The branch was pushed after `npm run test` succeeded, so the remote now matches and it is ready for a PR targeting `main`.
- `codex/fix-critical-bug-in-artifactviewer` completed its work long ago; the branch has been deleted locally and on `origin` now that its commits live on `main`.
- `pr/align-ci-node-and-deploy-helper` was merged into `main`, deleted remotely, and removed locally as well.

## Pull request summary
- PR #1 (`pr/align-ci-node-and-deploy-helper` → `main`) is merged. There are no open PRs (verified with `gh pr status`) and the status checks (`Vitest CI` and `Vitest on Windows`) have passed, so `main` is healthy.
- PR #2 (`codex/fix-critical-bug-in-artifactviewer` → `pr/align-ci-node-and-deploy-helper`) is also merged; the branch has now been removed upstream, so no further action is needed.

## Cleanup actions completed
1. Fast-forwarded local `main` to `origin/main` with `git pull --ff-only` so the trunk now reflects the merged history from PR #1.
2. Deleted the obsolete local branch `pr/align-ci-node-and-deploy-helper` after confirming the remote branch was removed post-merge.
3. Pruned and listed remotes; only `origin/main` and `origin/feature/local-integration-v2` remain, ensuring no stray `pr/*` or helper branches linger.
4. Captured the cleanup plan and status in this document for quick onboarding and future reference.
5. Reproduced the Vitest suite via `npm run test` (and `npm run test -- --run` when a single run is needed) after adjusting `trackPromptExecution` so the `services/__tests__/trackPromptExecution` assertion now matches the asynchronous flow; the tests now pass on the feature branch.
6. Deleted `codex/fix-critical-bug-in-artifactviewer` both locally and remotely; the commits remain accessible through `main`, so the branch index is leaner.
7. Commands were executed directly through `pwsh` because `scripts/safe-terminal.ps1` is not yet present; once that helper lands we can switch to it to avoid interfering with background ComfyUI services.

## Pending cleanup and next steps
- Raise a PR from `feature/local-integration-v2` into `main`. The branch now contains the UTF-8/dashboard work plus the `trackPromptExecution` fix and passes `npm run test` in this environment; attach that pass or the Windows `Vitest` workflow link, and run `npm run test -- --run` (or set `CI=1`) locally so Vitest exits instead of staying in watch mode.
- After the PR merges, delete `feature/local-integration-v2` locally and remotely (or turn it into a documented `draft/` branch if further follow-up work is required).
- The `codex/fix-critical-bug-in-artifactviewer` branch is already gone; stay vigilant for any future helper branches and treat them as ephemeral (merge and prune quickly).
- Keep `main` as the single protected release branch, and avoid targeting other long-lived branches unless there is a dedicated release train or hotfix window.

## Recommendations for steady collaboration
1. **Branching model:** Adopt a trunk-based approach: always create feature, fix, or docs branches from `main` (e.g., `feature/<area>`, `fix/<short-id>`, `docs/<topic>`). Avoid long-lived `pr/*` or ambiguous `codex/*` lines unless they represent a stable workspace for a helper agent.
2. **Branch hygiene:** Delete local branches once their PRs are merged and coordinate with the team before deleting remote branches. Periodically run `git remote prune origin` and `git branch -r` to catch stale references.
3. **Naming conventions:** Keep branch names descriptive and scoped (e.g., `feature/local-integration-v2`, `hotfix/windows-utf8-console`, `chore/vite-config`). This makes it obvious which area the branch touches when reviewing branch lists or CI runs.
4. **CI/Protection rules:** Protect `main` with the following checks:
   - Require pull requests for all changes to `main`.
   - Require the `Vitest CI` job (plus any new e2e helper workflow) to pass before merge.
   - Require at least one approving review and no merge conflicts (`mergeable: BLOCKED` should always be cleared).
   - Prefer a linear history (either squash merges or rebase + merge) so `main` stays readable and traceable.
5. **Pull request discipline:** Run the relevant tests locally (e.g., `npm run test`, or `npm run test -- --run` / `CI=1 npm run test` if you need Vitest to exit non-interactively, plus any new scripts under `scripts/`) before creating a PR. Attach the test summary (`test-results-*.json`) or workflow links so reviewers can see the verification steps.
6. **CI/CD integration:** Since the repository now uses Vitest and dedicated Windows runners, ensure status checks are referenced in the branch protection rules and that workflows update references (e.g., `scripts/run-vitests.ps1`). Keep the `deploy-helper` branch CNC if there are longer-running operations; otherwise, slot every change into `main`.

## Documentation and follow-up
- Keep this file or an excerpt of its recommendations in the onboarding documentation (e.g., `PROJECT_OVERVIEW.md` or `README.md`) so future contributors understand the desired workflow.
- Highlight the `trackPromptExecution` fix (commit `d04f142`) in the release notes or status snapshots so the new behavior and the `npm run test` validation run are documented for future reviewers.
- If new helper branches are introduced (like `codex/*`), document their purpose (temporary automation, hotfix, etc.) and the process for recycling or deleting them once their work is done.
- Schedule a periodic housekeeping pass as part of the team’s workflow: review open branches weekly, delete merged ones, and update branch protection rules when CI workflows change.

By keeping `main` as the trunk, pruning branches after merge, and documenting conventions, the repository will stay clean and accelerate collaborative development. Let me know if you’d like me to open the PR from `feature/local-integration-v2` or help collect the Windows runner logs before merging.