# Skipped E2E Tests Audit

This document tracks tests that are currently skipped in the E2E suite and the reasons why.

## Categories

### 1. Heavy Integration Tests
These tests require the full stack (ComfyUI + LM Studio) to be running and responsive. They often exceed standard timeouts or require specific environment flags.

- **File**: `tests/e2e/wan-full-journey.spec.ts`
- **Test**: "creates a story, generates scenes and triggers local WAN video generation"
- **Reason**: Requires full pipeline execution (120s+). Can be run manually with `RUN_REAL_WORKFLOWS=1`.

### 2. UI State & Timing
These tests verify UI states (loading spinners, progress bars) that are difficult to capture when using fast mocks/fixtures.

- **File**: `tests/e2e/ui-state-generation.spec.ts`
- **Test**: "HIGH: Progress indicators update during generation"
- **Reason**: Fixtures complete instantly, bypassing loading states. Requires real generation or delayed mocks to verify.

### 3. Conditional / Fixture-Dependent
These tests are skipped dynamically based on the state of the test data (e.g., number of scenes generated).

- **File**: `tests/e2e/user-testing-fixes.spec.ts`
- **Tests**: Various scene deletion/layout tests.
- **Reason**: Skipped if the random seed or fixture generation results in insufficient scenes (e.g., "Need at least 2 scenes to test deletion").

## Action Plan

1. **Heavy Integration**: Create a dedicated "nightly" or "full-stack" test run configuration that enables these tests.
2. **UI State**: Implement `page.route` with artificial delays to simulate generation time for UI testing.
3. **Conditional**: Standardize fixtures to ensure deterministic scene counts for these tests.
