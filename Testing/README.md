# Testing Documentation

Comprehensive testing documentation including E2E tests, unit tests, and validation reports.

## Structure

- **E2E/** - End-to-end test reports and execution summaries
- **Unit/** - Unit test documentation
- **Reports/** - Validation and verification reports
- **Strategies/** - Testing strategies and coverage plans

## Running Tests

\\\powershell
# Unit tests
npm test

# E2E tests (Playwright)
npx playwright test

# E2E pipeline test
pwsh scripts/run-comfyui-e2e.ps1 -FastIteration
\\\

## Test Coverage

- Playwright: ~44/50 tests passing (88%)
- Unit tests: Full coverage
- E2E pipeline: 3/3 scenes validated
