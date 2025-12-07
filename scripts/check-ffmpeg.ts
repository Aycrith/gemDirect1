#!/usr/bin/env tsx
/**
 * Quick preflight: ffmpeg version, tmix normalize support, VLM reachability
 */
import { runPreflight } from '../utils/preflight';

async function main() {
    const result = await runPreflight();
    console.log('=== FFmpeg / VLM Preflight ===');
    console.log(`ffmpeg version: ${result.ffmpegVersion ?? 'not found'}`);
    console.log(`tmix normalize=1 supported: ${result.tmixNormalizeSupported ? 'yes' : 'no (will fall back)'}`);
    console.log(`VLM endpoint: ${result.vlmEndpoint} (${result.vlmReachable ? 'reachable' : 'unreachable'})`);
    if (result.warnings.length > 0) {
        console.log(`Warnings: ${result.warnings.join('; ')}`);
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error('Preflight failed:', err);
    process.exit(1);
});
