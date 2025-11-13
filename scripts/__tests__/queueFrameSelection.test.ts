import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('queue-real-workflow frame selection', () => {
    it('prefers the most recently updated output directory and logs chosen outputDir', () => {
        const scriptPath = path.resolve(__dirname, '..', 'queue-real-workflow.ps1');
        const content = fs.readFileSync(scriptPath, 'utf8');

        // Expect the script to build a list of candidate output directories and
        // select the best by latest LastWriteTime. Look for the 'candidates'
        // local variable and the debug line that reports the chosen directory.
        expect(content).toMatch(/\$candidates\s*=\s*@\(\)/);
        expect(content).toMatch(/Debug: chosen outputDir/);
        expect(content).toMatch(/Select-Object -First 1/);
    });
});
