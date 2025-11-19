import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestInfo } from '@playwright/test';

// Support both CommonJS (__dirname) and ESM (import.meta.url) execution contexts.
const __dirname_safe = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// The test runner may run with different CWDs. Try several candidate locations for
// the public artifacts file so Playwright tests can attach helper summaries whether
// the runner writes to the repo-level `public/artifacts` or a tests-scoped copy.
const candidatePaths = [
    // ../public/artifacts/latest-run.json (project root public when tests are executed from tests/e2e)
    path.resolve(__dirname_safe, '..', '..', 'public', 'artifacts', 'latest-run.json'),
    // ../public/artifacts/latest-run.json (tests/public fallback)
    path.resolve(__dirname_safe, '..', 'public', 'artifacts', 'latest-run.json'),
    // project-root public (cwd may be project root during test execution)
    path.resolve(process.cwd(), 'public', 'artifacts', 'latest-run.json'),
];

let latestArtifactPath: string | null = null;
for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
        latestArtifactPath = p;
        break;
    }
}
// Fallback to the first candidate even if it doesn't exist yet; caller will handle missing file.
if (!latestArtifactPath) latestArtifactPath = candidatePaths[0];

const stripFileScheme = (helperPath: string): string => {
    if (helperPath.startsWith('file://')) {
        return helperPath.replace(/^file:\/\/\/?/, '');
    }
    return helperPath;
};

export async function attachHelperSummaries(testInfo: TestInfo): Promise<void> {
    if (!latestArtifactPath || !fs.existsSync(latestArtifactPath)) {
        // No latest-run.json found; nothing to attach.
        return;
    }
    try {
        const payload = JSON.parse(fs.readFileSync(latestArtifactPath, 'utf-8'));
        const helperSummaries = payload?.HelperSummaries ?? {};
        for (const [label, helperPaths] of Object.entries(helperSummaries)) {
            if (!helperPaths || typeof helperPaths !== 'object') continue;
            for (const [suffix, helperPath] of Object.entries(helperPaths)) {
                if (!helperPath) continue;
                const normalized = stripFileScheme(String(helperPath));
                const candidatePath = normalized.split('/').join(path.sep);
                if (!fs.existsSync(candidatePath)) continue;
                // Attach by file path only. Playwright requires exactly one of `path` or `body`.
                await testInfo.attach(`helper-${label}-${suffix}`, {
                    path: candidatePath,
                    contentType: 'application/json',
                });
            }
        }
    } catch (error) {
        console.warn('Unable to attach helper summaries:', error);
    }
}
