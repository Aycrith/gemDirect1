#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildMappingSummary,
  extractWorkflowNodes,
  resolveProjectSettings,
  writeHelperSummary,
} from './mapping-utils.ts';

const SUMMARY_FILENAME = 'comfyui-status.json';
const FETCH_TIMEOUT_MS = 5000;

type ProbeResult = {
  ok: boolean;
  durationMs: number | null;
  error?: string;
  data?: any;
};

type WorkflowPresence = {
  hasWanT2I: boolean;
  hasWanI2V: boolean;
};

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

function createLogger(logPath?: string) {
  const entries: string[] = [];
  const writeLine = (level: string, message: string) => {
    const line = `${new Date().toISOString()} [${level}] ${message}`;
    console.log(line);
    entries.push(line);
    if (logPath) {
      try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, line + os.EOL, 'utf-8');
      } catch (error) {
        console.warn(`WARN: Unable to append to log ${logPath}: ${(error as Error)?.message ?? String(error)}`);
      }
    }
  };
  return {
    info: (message: string) => writeLine('INFO', message),
    warn: (message: string) => writeLine('WARN', message),
    error: (message: string) => writeLine('ERROR', message),
    entries: () => entries.slice(),
  };
}

function summarizeWorkflows(projectDir: string): WorkflowPresence {
  const workflowsDir = path.join(projectDir, 'workflows');
  const t2i = path.join(workflowsDir, 'image_netayume_lumina_t2i.json');
  const i2v = path.join(workflowsDir, 'video_wan2_2_5B_ti2v.json');
  return {
    hasWanT2I: fs.existsSync(t2i),
    hasWanI2V: fs.existsSync(i2v),
  };
}

function buildMappingPayload(result: ReturnType<typeof buildMappingSummary>) {
  return {
    wanT2I: {
      clipText: result.clipText,
      keyframeImageRequired: false,
      clipNodePresent: result.hasClipNode,
      inferredClipNode: result.inferredClipNode,
    },
    wanI2V: {
      clipText: result.clipText,
      loadImage: result.loadImage,
      keyframeImageRequired: true,
      clipNodePresent: result.hasClipNode,
      loadNodePresent: result.hasLoadNode,
      inferredClipNode: result.inferredClipNode,
      inferredLoadNode: result.inferredLoadNode,
    },
  };
}

function summarizeSystemStats(data?: any) {
  if (!data) return null;
  const devices = Array.isArray(data.devices)
    ? data.devices.map((device) => ({
        name: device?.name ?? device?.model ?? 'unknown',
        totalMB: device?.memory_total ?? device?.total ?? null,
        freeMB: device?.memory_free ?? device?.free ?? null,
        usedMB: device?.memory_used ?? device?.used ?? null,
      }))
    : [];
  return {
    deviceCount: devices.length,
    devices,
    durationMs: data?.duration ?? null,
  };
}

function summarizeQueue(data?: any) {
  if (!data) return null;
  return {
    running: typeof data.running === 'number' ? data.running : null,
    pending: typeof data.pending === 'number' ? data.pending : null,
    blocked: typeof data.blocked === 'number' ? data.blocked : null,
    latencyMs:
      typeof data.latency === 'number'
        ? data.latency
        : typeof data.latency_ms === 'number'
          ? data.latency_ms
          : null,
  };
}

async function probeEndpoint(url: string, pathFragment: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<ProbeResult> {
  const normalized = url.endsWith('/') ? url : `${url}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch(`${normalized}${pathFragment}`, { signal: controller.signal });
    const durationMs = Date.now() - start;
    let payload: any;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      ok: response.ok,
      durationMs,
      data: payload,
      error: response.ok ? undefined : `status ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      error: (error as Error)?.name === 'AbortError' ? 'timeout' : (error as Error)?.message ?? 'unknown',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const projectArg = getArg('--project') || process.cwd();
  const summaryDir = getArg('--summary-dir');
  const logPath = getArg('--log-path');
  const logger = createLogger(logPath);
  const comfyUrl = process.env.LOCAL_COMFY_URL || process.env.VITE_LOCAL_COMFY_URL || 'http://127.0.0.1:8188';
  const { projectDir, settings, settingsPath } = resolveProjectSettings(projectArg);
  const workflows = summarizeWorkflows(projectDir);

  if (!settings) {
    logger.warn(`localGenSettings could not be resolved from ${projectArg}`);
  }

  const systemStatsProbe = await probeEndpoint(comfyUrl, 'system_stats');
  logger.info(
    `Probed /system_stats: ok=${systemStatsProbe.ok} duration=${systemStatsProbe.durationMs}ms${systemStatsProbe.error ? ` error=${systemStatsProbe.error}` : ''
    }`
  );
  const queueProbe = await probeEndpoint(comfyUrl, 'queue');
  logger.info(
    `Probed /queue: ok=${queueProbe.ok} duration=${queueProbe.durationMs}ms${queueProbe.error ? ` error=${queueProbe.error}` : ''}`
  );

  const nodes = settings ? extractWorkflowNodes(settings) : null;
  const mappingSummary = settings ? buildMappingSummary(settings, nodes) : null;
  const mappingPayload = mappingSummary ? buildMappingPayload(mappingSummary) : {
    wanT2I: {
      clipText: false,
      keyframeImageRequired: false,
      clipNodePresent: false,
      inferredClipNode: null,
    },
    wanI2V: {
      clipText: false,
      loadImage: false,
      keyframeImageRequired: true,
      clipNodePresent: false,
      loadNodePresent: false,
      inferredClipNode: null,
      inferredLoadNode: null,
    },
  };

  const warnings: string[] = [];
  if (!mappingSummary) {
    warnings.push('Mapping details unavailable because localGenSettings could not be parsed.');
  } else if (!mappingSummary.clipText || !mappingSummary.loadImage) {
    warnings.push('WAN mapping requirements (clipText + keyframe LoadImage) are incomplete.');
  }

  const summary = {
    helper: 'ComfyUIStatus',
    timestamp: new Date().toISOString(),
    comfyUrl,
    projectPath: projectDir,
    settingsPath: settingsPath ?? null,
    probedEndpoints: {
      system_stats: {
        ok: systemStatsProbe.ok,
        durationMs: systemStatsProbe.durationMs,
        error: systemStatsProbe.error ?? null,
      },
      queue: {
        ok: queueProbe.ok,
        durationMs: queueProbe.durationMs,
        error: queueProbe.error ?? null,
      },
    },
    systemStats: summarizeSystemStats(systemStatsProbe.data),
    queueState: summarizeQueue(queueProbe.data),
    workflows,
    mappings: mappingPayload,
    warnings,
    logEntries: logger.entries(),
    logPath: logPath ? logPath.replace(/\\/g, '/') : null,
  };

  if (summaryDir) {
    const outPath = writeHelperSummary(summaryDir, SUMMARY_FILENAME, summary);
    logger.info(`ComfyUI status summary written to ${outPath}`);
  } else {
    logger.info('ComfyUI status summary:');
    console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch((error) => {
  console.error('[comfyui-status] error:', (error as Error)?.message || String(error));
  process.exit(1);
});
