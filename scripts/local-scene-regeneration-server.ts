/**
 * Local Scene Regeneration Server
 *
 * Lightweight HTTP bridge that allows the React front-end (or any local
 * client) to request per-scene regeneration over HTTP. This is intentionally
 * simple and local-only; operators can wire it into more advanced workflows
 * or proxies as needed.
 *
 * Usage (from project root, after `npm install`):
 *   npx ts-node scripts/local-scene-regeneration-server.ts
 *
 * Endpoint:
 *   POST http://127.0.0.1:43210/api/scene/regenerate
 *   Body: { "sceneId": "scene-001", "runDir"?: "C:\\Dev\\gemDirect1\\logs\\<run>" }
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = Number(process.env.SCENE_REGEN_SERVER_PORT ?? '43210');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

interface RegenerateRequestBody {
  sceneId?: string;
  runDir?: string;
  prompt?: string;
  negativePrompt?: string;
}

function jsonResponse(res: http.ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function getLatestRunDir(): string | null {
  try {
    const fs = require('node:fs') as typeof import('node:fs');
    const logsDir = path.join(PROJECT_ROOT, 'logs');
    if (!fs.existsSync(logsDir)) return null;
    const entries = fs
      .readdirSync(logsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .sort((a, b) => {
        const aStat = fs.statSync(path.join(logsDir, a.name));
        const bStat = fs.statSync(path.join(logsDir, b.name));
        return bStat.mtimeMs - aStat.mtimeMs;
      });
    if (!entries.length) return null;
    return path.join(logsDir, entries[0].name);
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/scene/regenerate') {
    jsonResponse(res, 404, { error: 'Not found' });
    return;
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });

  req.on('end', () => {
    let body: RegenerateRequestBody = {};
    try {
      if (raw.trim()) {
        body = JSON.parse(raw);
      }
    } catch (err) {
      jsonResponse(res, 400, { error: 'Invalid JSON body', detail: (err as Error).message });
      return;
    }

    const sceneId = body.sceneId?.trim();
    if (!sceneId) {
      jsonResponse(res, 400, { error: 'sceneId is required' });
      return;
    }

    const runDir = body.runDir?.trim() || getLatestRunDir();
    if (!runDir) {
      jsonResponse(res, 400, { error: 'runDir not provided and latest run could not be resolved' });
      return;
    }

    const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'regenerate-scene-video.ps1');

    const args = [
      '-NoLogo',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-RunDir',
      runDir,
      '-SceneId',
      sceneId,
    ];

    if (body.prompt && body.prompt.trim()) {
      args.push('-Prompt', body.prompt);
    }
    if (body.negativePrompt && body.negativePrompt.trim()) {
      args.push('-NegativePrompt', body.negativePrompt);
    }

    const child = spawn('pwsh', args, {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      jsonResponse(res, 500, {
        error: 'Failed to start regeneration process',
        detail: err.message,
      });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        jsonResponse(res, 500, {
          error: 'regenerate-scene-video.ps1 failed',
          exitCode: code,
          stderr: stderr.trim(),
        });
      } else {
        jsonResponse(res, 200, {
          status: 'ok',
          sceneId,
          runDir,
          stdout: stdout.trim(),
        });
      }
    });
  });
});

server.listen(DEFAULT_PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(
    `[local-scene-regeneration-server] Listening on http://127.0.0.1:${DEFAULT_PORT}/api/scene/regenerate`
  );
});
