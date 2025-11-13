import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('run-comfyui-e2e.ps1 safety guard', () => {
    it('contains a process Path verification before Stop-Process', () => {
        const scriptPath = path.resolve(__dirname, '..', 'run-comfyui-e2e.ps1');
        const content = fs.readFileSync(scriptPath, 'utf8');

        // We expect the script to verify the process Path matches the embedded
        // ComfyUI python before calling Stop-Process. Look for the expected
        // variable name and the case-insensitive equality check.
        expect(content).toMatch(/expectedComfyPython/);
        expect(content).toMatch(/-ieq\s+\$expectedComfyPython/);
        expect(content).toMatch(/Stop-Process\s+-Id\s+\$ComfyProc.Id/);
    });
});
