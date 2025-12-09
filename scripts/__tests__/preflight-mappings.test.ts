import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const projectDir = process.cwd();
const scriptPath = path.resolve(projectDir, 'scripts', 'preflight-mappings.ts');
const summaryDir = path.resolve(projectDir, 'test-results', 'preflight-mappings');

describe('scripts/preflight-mappings.ts', () => {
  beforeEach(() => {
    if (fs.existsSync(summaryDir)) {
      fs.rmSync(summaryDir, { recursive: true, force: true });
    }
  });

  it('writes a summary for a mapped project and exits with warnings', () => {
    const result = spawnSync(process.execPath, [
      scriptPath,
      '--project',
      projectDir,
      '--summary-dir',
      summaryDir
    ], {
      env: { ...process.env, NODE_OPTIONS: '--loader ts-node/esm' },
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // Note: buildMappingSummary now checks ALL workflow profiles (wan-t2i and wan-i2v)
    // Since wan-i2v has the keyframe_image mapping, the combined check passes
    // Exit code 0 indicates all required mappings are present across profiles
    expect(result.status).toBe(0);

    const summaryPath = path.join(summaryDir, 'mapping-preflight.json');
    expect(fs.existsSync(summaryPath)).toBe(true);
    const json = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

    expect(json.helper).toBe('MappingPreflight');
    expect(typeof json.workflows.hasWanT2I).toBe('boolean');
    expect(typeof json.workflows.hasWanI2V).toBe('boolean');
    expect(typeof json.mappings.wanT2I.clipText).toBe('boolean');
    // wan-i2v profile has loadImage mapping, so combined check passes
    expect(json.mappings.wanI2V.clipNodePresent).toBeDefined();
    expect(json.mappings.wanI2V.loadNodePresent).toBeDefined();
    expect(Array.isArray(json.missingWanI2VRequirements)).toBe(true);
    // With profile-aware mapping, loadImage is found in wan-i2v profile
    expect(json.missingWanI2VRequirements).not.toContain('loadImage');
    expect(Array.isArray(json.warnings)).toBe(true);

    const unitPath = path.join(summaryDir, 'unit', 'mapping-preflight.json');
    expect(fs.existsSync(unitPath)).toBe(true);
  });

  it('fails when wan-i2v LoadImage mapping is missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-mapping-'));
    try {
      const minimalSettings = {
        workflowJson: JSON.stringify({
          '1': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'test prompt' }
          }
        }),
        mapping: {
          '1:text': 'human_readable_prompt'
        }
      };
      fs.writeFileSync(path.join(tempDir, 'localGenSettings.json'), JSON.stringify(minimalSettings));

      const result = spawnSync(process.execPath, [
        scriptPath,
        '--project',
        tempDir
      ], {
        env: { ...process.env, NODE_OPTIONS: '--loader ts-node/esm' },
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      expect(result.status).toBe(3);
      expect(result.stderr).toContain('WARN: No LoadImage.image node found in workflow.');
      expect(result.stderr).toContain('WARN: No mapping for keyframe_image to a LoadImage.image input.');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
