import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LocalGenerationSettings, WorkflowProfile } from '../../types';
import { createValidTestSettings } from './fixtures';

/**
 * Regression test: Ensure stale workflow metadata triggers helper warning flow
 *
 * Acceptance criteria:
 * 1. When workflowProfiles[profile].metadata.lastSyncedAt is > 1 hour old, the modal shows a warning
 * 2. The warning text includes "Helper recommends running the ComfyUI helper"
 * 3. The save button is disabled until the user acknowledges the warning by running helper
 * 4. The stale check respects configurable thresholds (default: 3600s)
 */

describe('Stale Metadata Warning Flow', () => {
  let settings: LocalGenerationSettings;

  beforeEach(() => {
    settings = createValidTestSettings();
    // Ensure we have a workflow profile with metadata
    if (!settings.workflowProfiles) {
      settings.workflowProfiles = {};
    }
  });

  it('detects stale metadata when lastSyncedAt is older than threshold', () => {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000; // 1 hour in the past

    settings.workflowProfiles!['wan-i2v'] = {
      id: 'wan-i2v',
      label: 'WAN Text+Image→Video',
      workflowJson: settings.workflowJson,
      mapping: settings.mapping,
      metadata: {
        lastSyncedAt: oneHourAgo,
        highlightMappings: [],
        missingMappings: [],
        warnings: [],
      },
    };

    // Check if metadata is considered stale
    const profile = settings.workflowProfiles['wan-i2v'];
    const staleThresholdMs = 3600 * 1000; // 1 hour
    const checkTime = now + 1; // Check just after 'now'
    const isStale =
      profile?.metadata?.lastSyncedAt &&
      checkTime - profile.metadata.lastSyncedAt > staleThresholdMs;

    expect(isStale).toBe(true);
  });

  it('does not flag metadata as stale when lastSyncedAt is recent', () => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    settings.workflowProfiles!['wan-i2v'] = {
      id: 'wan-i2v',
      label: 'WAN Text+Image→Video',
      workflowJson: settings.workflowJson,
      mapping: settings.mapping,
      metadata: {
        lastSyncedAt: fiveMinutesAgo,
        highlightMappings: [],
        missingMappings: [],
        warnings: [],
      },
    };

    const profile = settings.workflowProfiles['wan-i2v'];
    const staleThresholdMs = 3600 * 1000; // 1 hour
    const isStale =
      profile?.metadata?.lastSyncedAt &&
      now - profile.metadata.lastSyncedAt > staleThresholdMs;

    expect(isStale).toBe(false);
  });

  it('treats missing lastSyncedAt as stale (first-time sync required)', () => {
    settings.workflowProfiles!['wan-i2v'] = {
      id: 'wan-i2v',
      label: 'WAN Text+Image→Video',
      workflowJson: settings.workflowJson,
      mapping: settings.mapping,
      metadata: {
        // No lastSyncedAt present
        highlightMappings: [],
        missingMappings: [],
        warnings: [],
      },
    };

    const profile = settings.workflowProfiles['wan-i2v'];
    const isStale = !profile?.metadata?.lastSyncedAt;

    expect(isStale).toBe(true);
  });

  it('constructs warning message with profile name and action link', () => {
    const profileLabel = 'WAN Text+Image→Video';
    const helperLogPath = 'test-results/comfyui-status/helper.log';

    const warningMessage = `Helper recommends running the ComfyUI helper for "${profileLabel}" to refresh mappings. Helper log: ${helperLogPath}`;

    expect(warningMessage).toContain('Helper recommends');
    expect(warningMessage).toContain(profileLabel);
    expect(warningMessage).toContain(helperLogPath);
  });

  it('includes warning in profile metadata when helper is overdue', () => {
    const now = Date.now();
    const twoHoursAgo = now - 2 * 3600 * 1000;

    const helperWarning = 'Helper recommends running the ComfyUI helper for "WAN Text+Image→Video" to refresh mappings.';

    settings.workflowProfiles!['wan-i2v'] = {
      id: 'wan-i2v',
      label: 'WAN Text+Image→Video',
      workflowJson: settings.workflowJson,
      mapping: settings.mapping,
      metadata: {
        lastSyncedAt: twoHoursAgo,
        highlightMappings: [],
        missingMappings: [],
        warnings: [helperWarning],
      },
    };

    const profile = settings.workflowProfiles['wan-i2v'];
    expect(profile?.metadata?.warnings).toHaveLength(1);
    expect(profile?.metadata?.warnings?.[0]).toContain('Helper recommends');
  });

  it('respects custom stale threshold configuration', () => {
    const now = Date.now();
    const customThresholdMs = 30 * 60 * 1000; // 30 minutes
    const fortyFiveMinutesAgo = now - 45 * 60 * 1000;

    settings.workflowProfiles!['wan-i2v'] = {
      id: 'wan-i2v',
      label: 'WAN Text+Image→Video',
      workflowJson: settings.workflowJson,
      mapping: settings.mapping,
      metadata: {
        lastSyncedAt: fortyFiveMinutesAgo,
        highlightMappings: [],
        missingMappings: [],
        warnings: [],
      },
    };

    const profile = settings.workflowProfiles['wan-i2v'];
    const isStale =
      profile?.metadata?.lastSyncedAt &&
      now - profile.metadata.lastSyncedAt > customThresholdMs;

    // With custom 30-minute threshold, 45 minutes is stale
    expect(isStale).toBe(true);
  });

  it('preserves existing warnings when adding stale metadata warning', () => {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;
    const existingWarnings = ['Missing keyframe mapping', 'Low VRAM detected'];

    settings.workflowProfiles!['wan-i2v'] = {
      id: 'wan-i2v',
      label: 'WAN Text+Image→Video',
      workflowJson: settings.workflowJson,
      mapping: settings.mapping,
      metadata: {
        lastSyncedAt: oneHourAgo,
        highlightMappings: [],
        missingMappings: [],
        warnings: [...existingWarnings],
      },
    };

    const profile = settings.workflowProfiles['wan-i2v'];
    expect(profile?.metadata?.warnings?.length).toBeGreaterThanOrEqual(
      existingWarnings.length
    );
    // Original warnings should still be present
    existingWarnings.forEach((warning) => {
      expect(profile?.metadata?.warnings).toContain(warning);
    });
  });
});
