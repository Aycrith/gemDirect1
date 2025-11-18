import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  WorkflowProfile,
  ComfyUIStatusProfileSummary,
  ComfyUIStatusSummary,
  WorkflowProfileMappingHighlight,
  MappableData,
  ComfyUIStatusQueueSummary,
  ComfyUIStatusSystemStats,
} from '../types';

type ComfyQueueData = {
  queue_running: any[];
  queue_pending: any[];
};

type FetchResult<T> = {
  ok: boolean;
  status?: number;
  duration: number;
  data?: T;
  error?: string;
};

type WorkflowMapping = Record<string, string>;

const DEFAULT_COMFY_URL =
  process.env.LOCAL_COMFY_URL ||
  process.env.VITE_LOCAL_COMFY_URL ||
  process.env.VITE_LOCAL_COMFYURL ||
  'http://127.0.0.1:8188';

// Canonical WAN workflows expected on the ComfyUI host. These are absolute
// paths to API-format workflow JSON exports and are used only for existence
// checks and logging; the React app reads workflows via "Sync from Server".
const KNOWN_WAN_WORKFLOWS = [
  'C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\image_netayume_lumina_t2i.json',
  'C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\video_wan2_2_5B_ti2v.json',
];

const PROFILE_DEFINITIONS: Array<{ id: string; label: string }> = [
  { id: 'wan-t2i', label: 'WAN Text→Image (Keyframe)' },
  { id: 'wan-i2v', label: 'WAN Text+Image→Video' },
];

const highlightTypes = ['human_readable_prompt', 'full_timeline_json', 'keyframe_image'];
const TEXT_MAPPING_TYPES = ['human_readable_prompt', 'full_timeline_json'];
const KEYFRAME_MAPPING_TYPE = 'keyframe_image';

const runtimeLogEntries: string[] = [];

const pushLogEntry = (level: 'INFO' | 'WARN' | 'ERROR', message: string) => {
  const timestamp = new Date().toISOString();
  const entry = `[${level}] ${timestamp} ${message}`;
  runtimeLogEntries.push(entry);
  return entry;
};

const logInfo = (message: string) => {
  console.log(message);
  pushLogEntry('INFO', message);
};

const logWarn = (message: string) => {
  console.warn(message);
  pushLogEntry('WARN', message);
};

const logError = (message: string) => {
  console.error(message);
  pushLogEntry('ERROR', message);
};

const flushHelperLog = async () => {
  if (!resolvedHelperLogPath) return;
  try {
    await fs.mkdir(path.dirname(resolvedHelperLogPath), { recursive: true });
    await fs.writeFile(resolvedHelperLogPath, `${runtimeLogEntries.join('\n')}\n`, { encoding: 'utf-8' });
    logInfo(`Helper log written to ${resolvedHelperLogPath}`);
  } catch (error) {
    logWarn(`Failed to write helper log: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const parseCliArg = (names: string[]): string | undefined => {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (names.includes(args[i]) && args[i + 1]) {
      return args[i + 1];
    }
  }
  return undefined;
};

const summaryDirArg = parseCliArg(['--summary-dir', '-s']);
const SUMMARY_DIR = path.resolve(process.cwd(), summaryDirArg ?? path.join('test-results', 'comfyui-status'));
const HELPER_LOG_PATH = parseCliArg(['--log-path', '-l']);
const resolvedHelperLogPath = HELPER_LOG_PATH ? path.resolve(process.cwd(), HELPER_LOG_PATH) : undefined;
if (!HELPER_LOG_PATH) {
  logWarn('No --log-path provided; helper log file will not be generated. Pass --log-path for QA artifacts.');
}

const resolveComfyUrl = (): string => DEFAULT_COMFY_URL.replace(/\/+$/g, '');

const fetchWithTiming = async <T>(url: string, label: string, timeout = 5000): Promise<FetchResult<T>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const duration = Date.now() - startedAt;
    if (!response.ok) {
      return { ok: false, status: response.status, duration, error: `HTTP ${response.status}` };
    }
    const text = await response.text();
    let data: T | undefined;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    return { ok: true, status: response.status, duration, data };
  } catch (error) {
    const duration = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, duration, error: message };
  } finally {
    clearTimeout(timer);
  }
};

const loadLocalSettings = async (candidatePath?: string) => {
  if (!candidatePath) {
    return null;
  }
  try {
    const resolved = path.resolve(process.cwd(), candidatePath);
    const json = await fs.readFile(resolved, 'utf-8');
    const parsed = JSON.parse(json);
    const settings = parsed.localGenSettings ?? parsed;
    if (!settings || typeof settings !== 'object') {
      throw new Error('Project file does not contain LocalGenerationSettings');
    }
    // Lightweight migration: older localGenSettings persisted keyframe_image as a
    // missing mapping for the wan-t2i profile even though wan-t2i *produces*
    // keyframes instead of consuming them. Strip that stale metadata so helper
    // warnings reflect the current per-profile validation rules.
    const wanT2i = (settings as any).workflowProfiles?.['wan-t2i'];
    if (wanT2i?.metadata) {
      if (Array.isArray(wanT2i.metadata.missingMappings)) {
        wanT2i.metadata.missingMappings = wanT2i.metadata.missingMappings.filter(
          (type: MappableData) => type !== 'keyframe_image',
        );
      }
      if (Array.isArray(wanT2i.metadata.warnings)) {
        wanT2i.metadata.warnings = wanT2i.metadata.warnings.filter(
          (message: unknown) =>
            typeof message !== 'string' || !/LoadImage keyframe mapping/i.test(message),
        );
      }
    }
    return { settings, filePath: resolved };
  } catch (error) {
    logWarn(`Could not load LocalGenerationSettings from ${candidatePath}:`,
      error instanceof Error ? error.message : error);
    return null;
  }
};

const getPromptPayload = (workflowJson?: string): Record<string, any> | null => {
  if (!workflowJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(workflowJson);
    return parsed.prompt ?? parsed;
  } catch {
    return null;
  }
};

const hasTextMapping = (mapping: WorkflowMapping): boolean =>
  Object.values(mapping).some(value => TEXT_MAPPING_TYPES.includes(value));

const hasKeyframeMapping = (mapping: WorkflowMapping): boolean =>
  Object.values(mapping).includes(KEYFRAME_MAPPING_TYPE);

const computeHighlightMappings = (workflowJson: string | undefined, mapping: WorkflowMapping) => {
  const prompt = getPromptPayload(workflowJson);
  return highlightTypes.flatMap(type => {
    const entry = Object.entries(mapping).find(([, dataType]) => dataType === type);
    if (!entry) {
      return [];
    }
    const [key] = entry;
    const [nodeId, inputName] = key.split(':');
    const node = prompt?.[nodeId];
    const nodeTitle = node?._meta?.title || node?.label || `Node ${nodeId}`;
    return [{ type, nodeId, inputName: inputName ?? '', nodeTitle }];
  });
};

const friendlyLabelForType = (type: string) => {
  switch (type) {
    case 'human_readable_prompt':
      return 'Human-Readable Prompt (CLIP)';
    case 'full_timeline_json':
      return 'Full Timeline JSON (CLIP)';
    case 'keyframe_image':
      return 'Keyframe Image (LoadImage)';
    default:
      return type;
  }
};

// Mirrors the queue snapshot shapes documented in ComfyUI's websocket API example:
// https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
const summarizeQueue = (queue?: ComfyQueueData) => {
  const runningLength = Array.isArray(queue?.queue_running)
    ? queue!.queue_running.length
    : Number(queue?.queue_running) || 0;
  const pendingLength = Array.isArray(queue?.queue_pending)
    ? queue!.queue_pending.length
    : Number(queue?.queue_pending) || 0;
  logInfo(`Queue status: Running=${runningLength}, Pending=${pendingLength}`);
  if (runningLength + pendingLength > 0) {
    logWarn('Queue is busy. Expect slower or queued sprite generations.');
  }
};

const summarizeSystem = (stats: any) => {
  if (!stats) {
    return;
  }
  const devices = Array.isArray(stats.devices) ? stats.devices : [];
  if (devices.length > 0) {
    devices.forEach((device: any, index: number) => {
      const name = device.name ?? device.title ?? `Device ${index + 1}`;
      const free = device.free_memory ?? device.free_vram ?? device.free ?? 'unknown';
      const total = device.total_memory ?? device.total_vram ?? device.memory ?? 'unknown';
      const type = device.type ?? 'device';
      logInfo(`Device ${index + 1}: ${name} (${type}). VRAM: ${free}/${total}`);
    });
  } else if (stats.system?.name) {
    logInfo(`System: ${stats.system.name}`);
  }
};

const describeProfileMapping = (
  profileId: string,
  label: string,
  profile?: WorkflowProfile
): ComfyUIStatusProfileSummary => {
  const mapping = profile?.mapping ?? {};
  const highlightEntries = profile?.metadata?.highlightMappings ?? computeHighlightMappings(profile?.workflowJson, mapping);
  const containsMapping = Object.keys(mapping).length > 0;
  const hasText = hasTextMapping(mapping);
  const hasKeyframe = hasKeyframeMapping(mapping);
  const missingMappings: MappableData[] = [];
  const warnings: string[] = [];

  if (!hasText) {
    missingMappings.push('human_readable_prompt', 'full_timeline_json');
    warnings.push('Missing CLIP text input mapping (Human-Readable Prompt / Full Timeline JSON).');
  }
  if (profileId === 'wan-i2v' && !hasKeyframe) {
    missingMappings.push('keyframe_image');
    warnings.push('Missing LoadImage keyframe mapping.');
  }
  profile?.metadata?.missingMappings?.forEach(type => {
    if (!missingMappings.includes(type)) {
      missingMappings.push(type);
    }
  });
  if (profile?.metadata?.warnings?.length) {
    warnings.push(...profile.metadata.warnings);
  }

  const mappingEntries = Object.entries(mapping).map(([key, dataType]) => ({ key, dataType }));
  const referencesCanonical = Boolean(
    profile?.workflowJson &&
    KNOWN_WAN_WORKFLOWS.some(workflowFile =>
      profile.workflowJson.toLowerCase().includes(path.basename(workflowFile).toLowerCase())
    )
  );

  logInfo(`\nProfile ${label} (${profileId}) mapping:`);
  if (profile?.sourcePath) {
    logInfo(`  Source: ${profile.sourcePath}`);
  } else {
    logInfo('  Source: inline workflow JSON');
  }

  if (!containsMapping) {
    logWarn('  No mapping entries detected. Please sync the workflow and re-export.');
  }

  if (highlightEntries.length > 0) {
    highlightEntries.forEach(entry => {
      logInfo(`  - ${friendlyLabelForType(entry.type)}: ${entry.nodeId}:${entry.inputName} (${entry.nodeTitle})`);
    });
  }

  if (!hasText) {
    logWarn('  Warning: Missing CLIP text input mapping (Human-Readable Prompt / Full Timeline JSON).');
  }
  if (profileId === 'wan-i2v' && !hasKeyframe) {
    logWarn('  Warning: Missing LoadImage keyframe mapping.');
  }

  if (mappingEntries.length > 0) {
    logInfo('  Full mapping snapshot:');
    mappingEntries.forEach(entry => {
      logInfo(`    ${entry.dataType.padEnd(20)} ${entry.key}`);
    });
  }

  return {
    id: profileId,
    label,
    sourcePath: profile?.sourcePath,
    highlightMappings: highlightEntries,
    mappingEntries,
    missingMappings,
    warnings,
    hasTextMapping: hasText,
    hasKeyframeMapping: hasKeyframe,
    referencesCanonical,
  };
};

const logLocalSettingsSummary = (settings: any, filePath?: string) => {
  logInfo('LocalGenerationSettings summary:');
  logInfo(`  Client ID: ${settings.comfyUIClientId || 'not set'}`);
  logInfo(`  Save path: ${filePath ?? 'N/A'} (${process.env.LOCAL_PROJECT_STATE_PATH ?? 'LOCAL_PROJECT_STATE_PATH not set'})`);
  const profileCount = Object.keys(settings.workflowProfiles ?? {}).length;
  logInfo(`  Workflow profiles synced: ${profileCount}`);
};

const confirmWanWorkflows = async (settings: { workflowJson?: string; workflowProfiles?: Record<string, WorkflowProfile> }) => {
  PROFILE_DEFINITIONS.forEach(profile => {
    const workflowJson = settings.workflowProfiles?.[profile.id]?.workflowJson ?? '';
    if (!workflowJson) {
      logWarn(`Profile ${profile.label} has no synced workflow JSON.`);
      return;
    }
    const containsKnown = KNOWN_WAN_WORKFLOWS.some(workflowFile =>
      workflowJson.toLowerCase().includes(path.basename(workflowFile).toLowerCase())
    );
    logInfo(`Profile ${profile.label}: ${containsKnown ? 'References canonical WAN bundle(s)' : 'No canonical bundle detected'}`);
  });

  const fileChecks = await Promise.all(
    KNOWN_WAN_WORKFLOWS.map(async (workflowFile) => {
      const candidatePath = workflowFile;
      try {
        await fs.access(candidatePath);
        logInfo(`? WAN workflow file available: ${candidatePath}`);
        return { path: candidatePath, exists: true };
      } catch {
        logInfo(`? WAN workflow file missing: ${candidatePath}`);
        return { path: candidatePath, exists: false };
      }
    })
  );

  return fileChecks;
};

const buildQueueSummary = (result: FetchResult<ComfyQueueData>): ComfyUIStatusQueueSummary => {
  if (result.ok && result.data) {
    const normalize = (entry: any) => {
      if (Array.isArray(entry)) return entry.length;
      if (typeof entry === 'number') return entry;
      if (typeof entry === 'string' && entry.length > 0 && !Number.isNaN(Number(entry))) {
        return Number(entry);
      }
      return undefined;
    };
    return {
      running: normalize(result.data.queue_running),
      pending: normalize(result.data.queue_pending),
      latencyMs: result.duration,
    };
  }
  return {
    latencyMs: result.duration,
    error: result.error,
  };
};

const buildSystemSummary = (result: FetchResult<unknown>): ComfyUIStatusSystemStats => {
  if (result.ok && result.data && typeof result.data === 'object' && result.data !== null) {
    const stats = result.data as Record<string, any>;
    const devices = Array.isArray(stats.devices)
      ? stats.devices.map((device: any, index: number) => ({
          name: device.name ?? device.title ?? `Device ${index + 1}`,
          type: device.type ?? 'device',
          free: device.free_memory ?? device.free_vram ?? device.free ?? 'unknown',
          total: device.total_memory ?? device.total_vram ?? device.memory ?? 'unknown',
        }))
      : undefined;
    const summary = stats.system?.name ?? stats.system?.title;
    return {
      durationMs: result.duration,
      summary,
      devices,
    };
  }
  return {
    durationMs: result.duration,
    warning: result.error,
  };
};

const main = async () => {
  const baseUrl = resolveComfyUrl();
  logInfo(`Checking ComfyUI at ${baseUrl}`);

  const projectArg = parseCliArg(['--project', '-p']) ?? process.env.LOCAL_PROJECT_STATE_PATH;
  const settingsPath = projectArg;
  const loaded = await loadLocalSettings(settingsPath);
  if (loaded) {
    logInfo(`Loaded LocalGenerationSettings from ${loaded.filePath}`);
  } else if (!settingsPath) {
    logInfo('You can provide an exported project JSON with --project <path> to surface workflow mappings.');
  }

  const statsPromise = fetchWithTiming<unknown>(`${baseUrl}/system_stats`, 'system_stats');
  const queuePromise = fetchWithTiming<ComfyQueueData>(`${baseUrl}/queue`, 'queue');

  const [statsResult, queueResult] = await Promise.all([statsPromise, queuePromise]);

  if (statsResult.ok) {
    logInfo(`system_stats: ${statsResult.duration}ms (status ${statsResult.status})`);
    summarizeSystem(statsResult.data);
  } else {
    logWarn(`system_stats request failed: ${statsResult.error ?? 'unknown error'}`);
  }

  if (queueResult.ok) {
    logInfo(`queue: ${queueResult.duration}ms (status ${queueResult.status})`);
    summarizeQueue(queueResult.data);
  } else {
    logWarn(`queue request failed: ${queueResult.error ?? 'unknown error'}`);
  }

  let profileSummaries: ComfyUIStatusProfileSummary[] = [];
  let workflowFiles: Array<{ path: string; exists: boolean }> = [];
  if (loaded) {
    logLocalSettingsSummary(loaded.settings, loaded.filePath);
    profileSummaries = PROFILE_DEFINITIONS.map(profileDef => {
      const profileSettings = loaded.settings.workflowProfiles?.[profileDef.id];
      return describeProfileMapping(profileDef.id, profileDef.label, profileSettings);
    });
    workflowFiles = await confirmWanWorkflows(loaded.settings);
  }

  const queueSummary = buildQueueSummary(queueResult);
  const systemSummary = buildSystemSummary(statsResult);

  const summaryWarnings = [
    ...profileSummaries.flatMap(profile => profile.warnings),
    ...workflowFiles.filter(file => !file.exists).map(file => `Missing WAN workflow: ${file.path}`),
  ];
  if (!statsResult.ok && statsResult.error) {
    summaryWarnings.push(`System stats: ${statsResult.error}`);
  }
  if (!queueResult.ok && queueResult.error) {
    summaryWarnings.push(`Queue fetch: ${queueResult.error}`);
  }

  const timestamp = new Date().toISOString();
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  const summaryPath = path.join(SUMMARY_DIR, `comfyui-status-${safeTimestamp}.json`);
  const summary: ComfyUIStatusSummary = {
    timestamp,
    summaryPath,
    helperLogPath: resolvedHelperLogPath,
    comfyUrl: baseUrl,
    queue: queueSummary,
    systemStats: systemSummary,
    workflows: profileSummaries,
    workflowFiles,
    warnings: Array.from(new Set(summaryWarnings)),
  };

  try {
    await fs.mkdir(SUMMARY_DIR, { recursive: true });
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    logInfo(`Helper summary written to ${summaryPath}`);
  } catch (error) {
    logWarn(`Failed to write helper summary: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await flushHelperLog();
  }
};

main().catch(async (error) => {
  logError(`Health check failed: ${error instanceof Error ? error.message : error}`);
  await flushHelperLog();
  process.exit(1);
});

