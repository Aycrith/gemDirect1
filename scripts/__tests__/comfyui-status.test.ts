import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

describe('scripts/comfyui-status.ts', () => {
  it('writes a summary JSON with workflow presence and mapping summary', () => {
    const projectDir = process.cwd();
    const outDir = path.resolve(projectDir, 'test-results', 'comfyui-status', 'unit');
    fs.mkdirSync(outDir, { recursive: true });

    const scriptPath = path.resolve(projectDir, 'scripts', 'comfyui-status.ts');
    const result = spawnSync(process.execPath, [scriptPath, '--project', projectDir, '--summary-dir', outDir], {
      env: {
        ...process.env,
        LOCAL_COMFY_URL: process.env.LOCAL_COMFY_URL || 'http://127.0.0.1:8188',
      },
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    // Script should exit 0 and write the summary file
    expect(result.status).toBe(0);

    const summaryPath = path.join(outDir, 'comfyui-status.json');
    expect(fs.existsSync(summaryPath)).toBe(true);
    const json = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as any;

    expect(json.helper).toBe('ComfyUIStatus');
    expect(typeof json.comfyUrl).toBe('string');
    expect(typeof json.projectPath).toBe('string');
    expect(json.settingsPath === null || typeof json.settingsPath === 'string').toBe(true);
    expect(json.workflows).toBeTruthy();
    expect(typeof json.workflows.hasWanT2I).toBe('boolean');
    expect(typeof json.workflows.hasWanI2V).toBe('boolean');
    expect(json.probedEndpoints.system_stats).toBeTruthy();
    expect(json.probedEndpoints.queue).toBeTruthy();
    expect(typeof json.probedEndpoints.system_stats.ok).toBe('boolean');
    expect(typeof json.probedEndpoints.system_stats.durationMs === 'number' || json.probedEndpoints.system_stats.durationMs === null).toBe(true);
    expect(json.systemStats === null || typeof json.systemStats?.deviceCount === 'number').toBe(true);

    expect(json.mappings).toBeTruthy();
    expect(json.mappings.wanT2I.clipText).toBeDefined();
    expect(json.mappings.wanT2I.clipNodePresent).toBeDefined();
    expect(json.mappings.wanI2V).toBeTruthy();
    expect(json.mappings.wanI2V.loadImage).toBeDefined();
    expect(json.mappings.wanI2V.loadNodePresent).toBeDefined();
    expect(Array.isArray(json.logEntries)).toBe(true);
    expect(Array.isArray(json.warnings)).toBe(true);

    const unitSummary = path.join(outDir, 'unit', 'comfyui-status.json');
    expect(fs.existsSync(unitSummary)).toBe(true);
  });
});
