import fs from 'node:fs';
import path from 'node:path';

const METRICS_DIR = path.resolve(process.cwd(), 'test-results', 'validation-metrics');
const HISTORY_LOG = path.join(METRICS_DIR, 'history.log');

const WARNING_THRESHOLD = {
  videosMissing: 0,
  uploadsFailed: 0,
};

let lastSize = 0;

const ensureHistoryLog = () => {
  if (!fs.existsSync(HISTORY_LOG)) {
    console.warn(`Validation history log not found at ${HISTORY_LOG}. Run \`npm run validation:metrics\` first.`);
    fs.mkdirSync(METRICS_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_LOG, '', 'utf-8');
  }
};

const parseHistoryLine = (line: string) => {
  const entry: Record<string, string> = {};
  line.split(' ').forEach((token) => {
    const [key, value] = token.split('=');
    if (key && value) {
      entry[key.trim()] = value.trim();
    }
  });
  return {
    timestamp: entry['timestamp'] ?? '',
    totalScenes: Number(entry['totalScenes'] ?? entry['total_scenes'] ?? 0),
    videosDetected: Number(entry['videosDetected'] ?? entry['videos_detected'] ?? 0),
    videosMissing: Number(entry['videosMissing'] ?? entry['videos_missing'] ?? 0),
    uploadsFailed: Number(entry['uploadsFailed'] ?? entry['uploads_failed'] ?? 0),
    runDir: entry['runDir'] ?? entry['run_dir'] ?? '',
  };
};

const checkForWarnings = (metrics: ReturnType<typeof parseHistoryLine>) => {
  if (metrics.videosMissing > WARNING_THRESHOLD.videosMissing) {
    console.warn(
      `[Validation Watcher] ${metrics.timestamp} - videosMissing=${metrics.videosMissing} (totalScenes=${metrics.totalScenes}). Investigate ${metrics.runDir}`
    );
  }
  if (metrics.uploadsFailed > WARNING_THRESHOLD.uploadsFailed) {
    console.warn(
      `[Validation Watcher] ${metrics.timestamp} - uploadsFailed=${metrics.uploadsFailed}. Check Comfy uploads for ${metrics.runDir}`
    );
  }
};

const readNewEntries = () => {
  const stats = fs.statSync(HISTORY_LOG);
  if (stats.size <= lastSize) {
    lastSize = stats.size;
    return [];
  }

  const fd = fs.openSync(HISTORY_LOG, 'r');
  const buffer = Buffer.alloc(stats.size - lastSize);
  fs.readSync(fd, buffer, 0, buffer.length, lastSize);
  fs.closeSync(fd);

  const newBlock = buffer.toString('utf-8');
  lastSize = stats.size;
  return newBlock.split(/\r?\n/).filter((line) => line.trim().length > 0);
};

const main = () => {
  console.log('[Validation Watcher] Monitoring validation metrics history...');
  ensureHistoryLog();
  lastSize = fs.statSync(HISTORY_LOG).size;

  const interval = setInterval(() => {
    try {
      const lines = readNewEntries();
      lines.forEach((line) => {
        const metrics = parseHistoryLine(line);
        checkForWarnings(metrics);
      });
    } catch (error) {
      console.error('[Validation Watcher] Error reading history log:', error);
    }
  }, 3000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n[Validation Watcher] Exiting.');
    process.exit(0);
  });
};

main();
