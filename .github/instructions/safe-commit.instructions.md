---
description: 'Rules for safe automated commits - validates code before any git operations'
applyTo: '**/*'
---

# Safe Commit Guidelines

These rules govern automated commits made by the SafeCommitReviewer agent.

## Pre-Commit Requirements

Before ANY commit operation, these checks MUST pass:

### 1. TypeScript Compilation (Mandatory)
```powershell
npx tsc --noEmit
```
**Requirement**: Exit code 0 with zero errors.

### 2. Unit Tests (Mandatory)
```powershell
npm test -- --run --reporter=verbose
```
**Requirement**: All tests pass. Skipped tests are acceptable.

### 3. No Critical Issues (Mandatory)
Check `agent/.state/issues.json`:
- Zero `severity: "critical"` issues
- High severity issues should be acknowledged

### 4. Clean Working State
- No merge conflicts
- No partially staged files (all or nothing)

## Conventional Commit Format

All commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types
| Type | Use When |
|------|----------|
| `fix` | Bug fix, error correction |
| `feat` | New feature or capability |
| `docs` | Documentation only changes |
| `test` | Adding or fixing tests |
| `refactor` | Code change with no behavior change |
| `chore` | Build, config, tooling changes |
| `perf` | Performance improvement |
| `style` | Formatting, whitespace changes |
| `ci` | CI/CD configuration changes |

### Scope Detection

Auto-detect scope from changed file paths:

| Path Pattern | Scope |
|--------------|-------|
| `services/**` | `services` |
| `components/**` | `components` |
| `agent/**` | `agent` |
| `scripts/**` | `scripts` |
| `workflows/**` | `workflows` |
| `tests/**`, `**/*.test.ts` | `tests` |
| `.github/**` | `ci` |
| `Documentation/**`, `**/*.md` | `docs` |
| `utils/**`, `hooks/**` | `utils` |
| `contexts/**` | `contexts` |
| `store/**` | `store` |

If multiple scopes apply, use the primary affected area or omit scope.

### Description Rules
- Use imperative mood: "add feature" not "added feature"
- No period at the end
- Max 72 characters
- Clearly describe WHAT changed

### Body (Optional)
- Explain WHY the change was made
- Describe any non-obvious implementation details
- Reference related issues or documentation

### Footer (Optional)
- `BREAKING CHANGE:` for breaking changes
- `Fixes #123` to auto-close issues
- `Refs #456` for related issues

## Commit Review Checklist

Before committing, verify:

### Code Quality
- [ ] No `console.log` or `debugger` statements in production code
- [ ] No large commented-out code blocks
- [ ] No hardcoded secrets, API keys, or passwords
- [ ] No `TODO` or `FIXME` without tracking

### Functional Safety
- [ ] No removed exports that other files depend on
- [ ] No breaking changes to public APIs without version bump
- [ ] Test coverage exists for new code paths
- [ ] Service layer pattern followed (no direct API calls from components)

### Project Conventions
- [ ] Gemini API calls use `withRetry` wrapper
- [ ] User data uses `usePersistentState` hook
- [ ] React hooks follow infinite loop prevention patterns
- [ ] TypeScript strict mode satisfied

## Push Policy

After successful commit:
1. **Always push immediately** to `origin/<current-branch>`
2. Verify push succeeded with `git status`
3. Report commit SHA and branch name

## Abort Conditions

**DO NOT commit or push if:**
1. TypeScript compilation fails
2. Unit tests fail
3. Critical issues exist in Guardian state
4. Merge conflicts are present
5. Security concerns detected (exposed credentials)
6. Breaking change without proper versioning

## Rollback Procedure

If a bad commit was pushed:

```powershell
# Option 1: Revert (creates new commit)
git revert HEAD
git push

# Option 2: Reset (requires force push - use carefully)
git reset --hard HEAD~1
git push --force-with-lease

# Option 3: Use rollback script
pwsh -File scripts/undo-last-commit.ps1
```

## Integration with Guardian

The SafeCommitReviewer agent integrates with Project Guardian:
- Reads issue state from `agent/.state/issues.json`
- Respects Guardian's auto-fix and auto-stage settings
- Updates session handoff after successful commits

## Usage Examples

### Good Commit Messages
```
fix(video): correct VAE version for WAN 2.2 workflows

feat(agent): add SafeCommitReviewer for automated code review

docs(readme): update testing section with new commands

refactor(services): extract retry logic into utility function

test(components): add coverage for TimelineEditor edge cases
```

### Bad Commit Messages
```
fixed stuff                    # No type, vague description
feat: Add new feature.         # Period at end, vague
WIP                            # Not descriptive
update files                   # No type, not specific
```
