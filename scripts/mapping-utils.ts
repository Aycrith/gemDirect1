import fs from 'node:fs';
import path from 'node:path';

export type MappingSummary = {
  mapping: Record<string, string>;
  clipText: boolean;
  loadImage: boolean;
  hasClipNode: boolean;
  hasLoadNode: boolean;
  inferredClipNode: string | null;
  inferredLoadNode: string | null;
};

export interface ProjectSettingsResolution {
  projectDir: string;
  settings: any | null;
  settingsPath?: string;
}

export function extractWorkflowNodes(settings: any): Record<string, any> | null {
  const tryParse = (raw?: string) => {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.prompt ?? parsed;
    } catch {
      return null;
    }
  };
  const direct = tryParse(settings?.workflowJson);
  if (direct) return direct;
  const profiles = settings?.workflowProfiles || {};
  for (const profile of Object.values(profiles)) {
    const nodes = tryParse((profile as any)?.workflowJson);
    if (nodes) return nodes;
  }
  return null;
}

export function buildMappingSummary(settings: any, nodes: Record<string, any> | null): MappingSummary {
  // Collect mappings from top-level AND from workflow profiles (esp. wan-i2v)
  // Updated 2025-12-08: Check profile-specific mappings for wan-i2v
  const mapping: Record<string, string> = { ...(settings?.mapping || {}) };
  
  // Also merge mappings from workflow profiles (wan-t2i and wan-i2v)
  const profiles = settings?.workflowProfiles || {};
  for (const profileId of ['wan-t2i', 'wan-i2v']) {
    const profile = profiles[profileId];
    if (profile?.mapping) {
      Object.assign(mapping, profile.mapping);
    }
  }
  
  let clipText = false;
  let loadImage = false;
  let inferredClipNode: string | null = null;
  let inferredLoadNode: string | null = null;

  for (const [, value] of Object.entries(mapping)) {
    const str = String(value);
    if (str === 'human_readable_prompt' || str === 'full_timeline_json') clipText = true;
    if (str === 'keyframe_image') loadImage = true;
  }

  const findNode = (clazz: string, inputKey: 'text' | 'image'): string | null => {
    if (!nodes) return null;
    for (const [nodeId, node] of Object.entries(nodes)) {
      const candidate: any = node;
      if (candidate?.class_type === clazz && candidate?.inputs && typeof candidate.inputs[inputKey] !== 'undefined') {
        return nodeId;
      }
    }
    return null;
  };

  if (!clipText) {
    const clipNode = findNode('CLIPTextEncode', 'text');
    if (clipNode) {
      mapping[`${clipNode}:text`] = 'human_readable_prompt';
      clipText = true;
      inferredClipNode = clipNode;
    }
  }

  if (!loadImage) {
    const loadNode = findNode('LoadImage', 'image');
    if (loadNode) {
      mapping[`${loadNode}:image`] = 'keyframe_image';
      loadImage = true;
      inferredLoadNode = loadNode;
    }
  }

  const hasClipNode = Boolean(nodes && Object.values(nodes).some((node: any) => node?.class_type === 'CLIPTextEncode' && node?.inputs && typeof node.inputs.text !== 'undefined'));
  const hasLoadNode = Boolean(nodes && Object.values(nodes).some((node: any) => node?.class_type === 'LoadImage' && node?.inputs && typeof node.inputs.image !== 'undefined'));

  return {
    mapping,
    clipText,
    loadImage,
    hasClipNode,
    hasLoadNode,
    inferredClipNode,
    inferredLoadNode,
  };
}

function readJsonFile(filePath: string): any | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function resolveProjectSettings(target?: string): ProjectSettingsResolution {
  const resolved = path.resolve(target ?? '.');
  let projectDir = resolved;
  let settings: any | null = null;
  let settingsPath: string | undefined;

  const assignSettings = (value: any, candidatePath: string) => {
    settings = value;
    settingsPath = candidatePath;
    projectDir = path.dirname(candidatePath);
  };

  const evaluateFile = (candidatePath: string): boolean => {
    const parsed = readJsonFile(candidatePath);
    if (parsed === null) return false;
    const base = path.basename(candidatePath).toLowerCase();
    if (base === 'localgensettings.json') {
      assignSettings(parsed, candidatePath);
      return true;
    }
    if (base === 'exported-project.json' || base === 'exportedproject.json') {
      if (parsed?.localGenSettings) {
        assignSettings(parsed.localGenSettings, candidatePath);
      } else {
        assignSettings(parsed, candidatePath);
      }
      return true;
    }
    if (parsed?.localGenSettings) {
      assignSettings(parsed.localGenSettings, candidatePath);
      return true;
    }
    if (parsed?.workflowJson || parsed?.mapping) {
      assignSettings(parsed, candidatePath);
      return true;
    }
    return false;
  };

  try {
    const stats = fs.statSync(resolved);
    if (stats.isFile()) {
      evaluateFile(resolved);
      projectDir = path.dirname(resolved);
      return { projectDir, settings, settingsPath };
    }
    if (stats.isDirectory()) {
      const localPath = path.join(resolved, 'localGenSettings.json');
      if (fs.existsSync(localPath) && evaluateFile(localPath)) {
        return { projectDir, settings, settingsPath };
      }
      const exportedPath = path.join(resolved, 'exported-project.json');
      if (fs.existsSync(exportedPath) && evaluateFile(exportedPath)) {
        return { projectDir, settings, settingsPath };
      }
      const exportedAlt = path.join(resolved, 'exportedproject.json');
      if (fs.existsSync(exportedAlt) && evaluateFile(exportedAlt)) {
        return { projectDir, settings, settingsPath };
      }
      const files = fs.readdirSync(resolved).sort();
      for (const file of files) {
        if (!file.toLowerCase().endsWith('.json')) continue;
        const candidatePath = path.join(resolved, file);
        if (evaluateFile(candidatePath)) {
          return { projectDir, settings, settingsPath };
        }
      }
      return { projectDir, settings, settingsPath };
    }
  } catch {
    // ignore errors and return default resolution
  }

  return { projectDir, settings, settingsPath };
}

export function writeHelperSummary(summaryDir: string, fileName: string, data: any): string {
  fs.mkdirSync(summaryDir, { recursive: true });
  const outPath = path.join(summaryDir, fileName);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  const unitDir = path.join(summaryDir, 'unit');
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(path.join(unitDir, fileName), JSON.stringify(data, null, 2), 'utf-8');
  return outPath;
}
