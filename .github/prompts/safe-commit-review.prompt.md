````prompt
---
description: 'Review uncommitted changes, run validation, and safely commit+push to repository'
agent: SafeCommitReviewer
---

# Safe Commit Review Agent

Automatically review all uncommitted/pending changes, run validation checks, generate a conventional commit message, and commit+push only when all checks pass.

---

## Step 1: Gather Pending Changes

First, identify all changes that need to be committed:

```powershell
# Get current branch
git branch --show-current

# Get staged changes
git diff --cached --name-only

# Get unstaged changes  
git diff --name-only

# Get untracked files
git ls-files --others --exclude-standard
```

Read the diff content to understand what was changed:
```powershell
# Full diff for review
git diff HEAD
```

---

## Step 2: Analyze Changes for Commit Scope

Based on the changed files, auto-detect the conventional commit scope:

| Changed Path Pattern | Scope |
|---------------------|-------|
| `services/*` | `services` |
| `components/*` | `components` |
| `agent/*` | `agent` |
| `scripts/*` | `scripts` |
| `workflows/*` | `workflows` |
| `tests/*`, `*.test.ts` | `tests` |
| `.github/*` | `ci` |
| `Documentation/*`, `*.md` | `docs` |
| `utils/*`, `hooks/*` | `utils` |
| Multiple areas | Use primary affected area or omit scope |

Determine commit type from changes:
| Change Pattern | Type |
|----------------|------|
| Bug fix, error correction | `fix` |
| New feature, capability | `feat` |
| Documentation only | `docs` |
| Test additions/fixes | `test` |
| Refactoring, no behavior change | `refactor` |
| Build/config changes | `chore` |
| Performance improvement | `perf` |

---

## Step 3: Run Pre-Commit Validation

Execute the validation script to ensure code quality:

```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/safe-commit.ps1 -ValidateOnly
```

**All checks must pass:**
1. ✅ TypeScript compilation (`npx tsc --noEmit`) - Zero errors
2. ✅ Unit tests (`npm test -- --run`) - All pass
3. ✅ No critical issues in `agent/.state/issues.json`
4. ✅ No merge conflicts in staged files

If any check fails:
- Report the specific failure
- Do NOT proceed with commit
- Suggest fixes for the issues found

---

## Step 4: Review Changes for Safety

Before committing, verify:

### Code Quality
- [ ] No debug statements (`console.log`, `debugger`) in production code
- [ ] No commented-out code blocks
- [ ] No hardcoded secrets or API keys
- [ ] No TODO/FIXME without issue tracking

### Functional Safety
- [ ] Changes don't break existing APIs (check for removed exports)
- [ ] Changes don't remove required functionality
- [ ] Test coverage exists for new code paths

### Project Conventions
- [ ] Follows service layer pattern (no direct API calls from components)
- [ ] Uses `withRetry` for Gemini API calls
- [ ] Uses `usePersistentState` for user data persistence

---

## Step 5: Generate Commit Message

Create a conventional commit message:

```
<type>(<scope>): <short description>

<optional body explaining what and why>

<optional footer with breaking changes or issue refs>
```

**Examples:**
```
fix(video): correct VAE version mismatch for WAN 2.2 workflows

Updated workflow mappings to use compatible VAE encoder version.
Fixes keyframe-to-video generation failures.

fix(agent): prevent infinite loop in MediaGenerationProvider

Used useRef pattern to stabilize context dependencies in StrictMode.

feat(components): add SafeCommitReviewer agent prompt

Enables automated code review and safe git commits via VS Code Copilot.
```

---

## Step 6: Execute Commit and Push

If all validations pass:

```powershell
# Stage all changes (or specific files)
git add -A

# Commit with generated message
git commit -m "<generated message>"

# Push to remote
git push origin <current-branch>
```

---

## Step 7: Post-Commit Verification

After successful push:

```powershell
# Verify commit was pushed
git log --oneline -1

# Verify remote is up to date
git status
```

Report:
- ✅ Commit SHA: `<sha>`
- ✅ Pushed to: `origin/<branch>`
- 📁 Files committed: `<count>`

---

## Abort Conditions

**STOP and DO NOT commit if:**

1. ❌ TypeScript compilation has errors
2. ❌ Unit tests are failing
3. ❌ Critical issues exist in `agent/.state/issues.json`
4. ❌ Merge conflicts are present
5. ❌ Changes contain obvious security issues (exposed keys, etc.)
6. ❌ Changes would break documented API contracts

---

## Rollback Instructions

If a commit needs to be reverted:

```powershell
# Undo last commit (keeps changes staged)
git reset --soft HEAD~1

# Or use rollback script
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/undo-last-commit.ps1
```

---

## Usage

Invoke this agent via VS Code Copilot Chat:

1. Make your code changes
2. Open Copilot Chat
3. Type: `@workspace /safe-commit-review` or reference this prompt
4. Agent will review, validate, and commit if safe

Or use the VS Code task: **"Safe Commit Review"**

````
