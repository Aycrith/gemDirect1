import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('run-comfyui-e2e.ps1 safety guard', () => {
    it('uses safe background job management with Stop-Job and Remove-Job', () => {
        const scriptPath = path.resolve(__dirname, '..', 'run-comfyui-e2e.ps1');
        const content = fs.readFileSync(scriptPath, 'utf8');

        // After refactoring, the script uses background jobs for VRAM monitoring
        // which are safely stopped with Stop-Job (not Stop-Process).
        // Verify the script uses Stop-Job and Remove-Job for job cleanup.
        expect(content).toMatch(/Stop-Job/);
        expect(content).toMatch(/Remove-Job/);
        
        // Verify VRAM monitoring job variable exists
        expect(content).toMatch(/\$vramMonitorJob/);
    });
});
