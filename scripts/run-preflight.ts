/**
 * Simple preflight runner.
 *
 * Executes the ffmpeg/tmix/VLM checks defined in utils/preflight.ts and writes
 * the result to public/preflight-status.json for the UI to read or for local
 * inspection. This is intentionally lightweight and does not touch the run
 * registry or summaries.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { runPreflight } from '../utils/preflight';

async function main() {
    const outPath = path.resolve(process.cwd(), 'public', 'preflight-status.json');
    const result = await runPreflight();
    const payload = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        result,
    };

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf-8');

    console.log('Preflight complete:');
    console.log(`  ffmpeg version: ${result.ffmpegVersion ?? 'not found'}`);
    console.log(`  tmix normalize supported: ${result.tmixNormalizeSupported}`);
    console.log(`  VLM endpoint: ${result.vlmEndpoint}`);
    console.log(`  VLM reachable: ${result.vlmReachable}`);
    if (result.warnings.length) {
        console.log('Warnings:');
        result.warnings.forEach(w => console.log(`  - ${w}`));
    } else {
        console.log('No warnings detected.');
    }

    console.log(`\nWrote ${outPath}`);
}

main().catch(err => {
    console.error('Preflight failed:', err?.message || err);
    process.exitCode = 1;
});
