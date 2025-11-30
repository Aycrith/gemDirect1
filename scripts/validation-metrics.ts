import fs from 'node:fs';
import path from 'node:path';

interface SceneMetrics {
  sceneId: string;
  wan2VideoDetected: boolean;
  wan2VideoMissing: boolean;
  wan2UploadFailed: boolean;
}

interface RunMetrics {
  runDir: string;
  timestamp: string;
  totalScenes: number;
  videosDetected: number;
  videosMissing: number;
  uploadsFailed: number;
  scenes: SceneMetrics[];
}

const LOGS_ROOT = path.resolve(process.cwd(), 'logs');
const OUTPUT_DIR = path.resolve(process.cwd(), 'test-results', 'validation-metrics');
const HISTORY_LOG = path.join(OUTPUT_DIR, 'history.log');

function findLatestRunDir(): string | null {
  if (!fs.existsSync(LOGS_ROOT)) return null;
  const timestampDirPattern = /^\d{8}-\d{6}$/;
  const entries = fs.readdirSync(LOGS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && timestampDirPattern.test(d.name))
    .map(d => d.name)
    .sort()
    .reverse();
  return entries[0] ? path.join(LOGS_ROOT, entries[0]) : null;
}

function parseRunSummary(runDir: string): RunMetrics | null {
  const summaryPath = path.join(runDir, 'run-summary.txt');
  if (!fs.existsSync(summaryPath)) return null;

  const lines = fs.readFileSync(summaryPath, 'utf-8').split(/\r?\n/);
  const scenesMap = new Map<string, SceneMetrics>();

  for (const line of lines) {
    const sceneMatch = line.match(/\[Scene\s+([^\]]+)\]\s+Wan2\s+(.+)/);
    if (!sceneMatch || !sceneMatch[1] || !sceneMatch[2]) continue;
    const sceneId = sceneMatch[1].trim();
    const payload = sceneMatch[2];
    let scene = scenesMap.get(sceneId);
    if (!scene) {
      scene = {
        sceneId,
        wan2VideoDetected: false,
        wan2VideoMissing: false,
        wan2UploadFailed: false,
      };
      scenesMap.set(sceneId, scene);
    }
    if (/video detected/i.test(payload)) {
      scene.wan2VideoDetected = true;
    }
    if (/video missing/i.test(payload)) {
      scene.wan2VideoMissing = true;
    }
    if (/upload failed/i.test(payload)) {
      scene.wan2UploadFailed = true;
    }
  }

  const scenes = Array.from(scenesMap.values());
  const videosDetected = scenes.filter(s => s.wan2VideoDetected).length;
  const videosMissing = scenes.filter(s => s.wan2VideoMissing && !s.wan2VideoDetected).length;
  const uploadsFailed = scenes.filter(s => s.wan2UploadFailed).length;

  return {
    runDir,
    timestamp: path.basename(runDir),
    totalScenes: scenes.length,
    videosDetected,
    videosMissing,
    uploadsFailed,
    scenes,
  };
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeMetrics(metrics: RunMetrics) {
  ensureDir(OUTPUT_DIR);
  const outPath = path.join(OUTPUT_DIR, `validation-${metrics.timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(metrics, null, 2), 'utf-8');
  const latestPath = path.join(OUTPUT_DIR, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(metrics, null, 2), 'utf-8');

  // Append a compact, one-line history entry for trend tracking.
  const historyEntry = [
    metrics.timestamp,
    `runDir=${metrics.runDir}`,
    `totalScenes=${metrics.totalScenes}`,
    `videosDetected=${metrics.videosDetected}`,
    `videosMissing=${metrics.videosMissing}`,
    `uploadsFailed=${metrics.uploadsFailed}`,
  ].join(' ');
  fs.appendFileSync(HISTORY_LOG, historyEntry + '\n', 'utf-8');

  // Human-readable summary for quick inspection
  // This keeps the feedback loop tight after each e2e run.
  // eslint-disable-next-line no-console
  console.log(`Validation metrics for run ${metrics.timestamp}`);
  console.log(`  RunDir         : ${metrics.runDir}`);
  console.log(`  Total scenes   : ${metrics.totalScenes}`);
  console.log(`  Videos detected: ${metrics.videosDetected}`);
  console.log(`  Videos missing : ${metrics.videosMissing}`);
  console.log(`  Uploads failed : ${metrics.uploadsFailed}`);
  console.log(`History log      : ${HISTORY_LOG}`);
}

function main() {
  const latestRunDir = findLatestRunDir();
  if (!latestRunDir) {
    console.error('No logs directory found. Run the WAN e2e harness first.');
    process.exit(1);
  }
  const metrics = parseRunSummary(latestRunDir);
  if (!metrics) {
    console.error(`No run-summary.txt found in ${latestRunDir}.`);
    process.exit(2);
  }
  writeMetrics(metrics);
}

main();
