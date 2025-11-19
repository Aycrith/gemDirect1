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

const SUMMARY_FILENAME = 'mapping-preflight.json';

type LoggerEntry = {
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  timestamp: string;
};

const createLogger = (logPath?: string) => {
  const entries: LoggerEntry[] = [];
  const writeLine = (level: LoggerEntry['level'], message: string) => {
    const timestamp = new Date().toISOString();
    const levelTag = `${level}:`;
    const line = `${timestamp} [${level}] ${levelTag} ${message}`;
    entries.push({ level, message, timestamp });
    switch (level) {
      case 'INFO':
        console.log(line);
        break;
      case 'WARN':
        console.warn(line);
        break;
      default:
        console.error(line);
        break;
    }
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

function detectWanWorkflows(baseDir: string): WorkflowPresence {
  const workflowsDir = path.join(baseDir, 'workflows');
  const t2i = path.join(workflowsDir, 'image_netayume_lumina_t2i.json');
  const i2v = path.join(workflowsDir, 'video_wan2_2_5B_ti2v.json');
  return {
    hasWanT2I: fs.existsSync(t2i),
    hasWanI2V: fs.existsSync(i2v),
  };
}

function buildMappingSummaryPayload(mappingResult: ReturnType<typeof buildMappingSummary>) {
  return {
    wanT2I: {
      clipText: mappingResult.clipText,
      keyframeImageRequired: false,
      clipNodePresent: mappingResult.hasClipNode,
      inferredClipNode: mappingResult.inferredClipNode,
    },
    wanI2V: {
      clipText: mappingResult.clipText,
      loadImage: mappingResult.loadImage,
      keyframeImageRequired: true,
      clipNodePresent: mappingResult.hasClipNode,
      loadNodePresent: mappingResult.hasLoadNode,
      inferredClipNode: mappingResult.inferredClipNode,
      inferredLoadNode: mappingResult.inferredLoadNode,
    },
  };
}

function main() {
  const projectArg = getArg('--project') || process.cwd();
  const summaryDir = getArg('--summary-dir');
  const logPath = getArg('--log-path');
  const logger = createLogger(logPath);
  const { projectDir, settings, settingsPath } = resolveProjectSettings(projectArg);

  if (!settings) {
    const attempted = path.resolve(projectArg || '.');
    logger.error(`localGenSettings not found. Tried path: ${attempted} (provide a project directory or exported-project.json)`);
    process.exit(2);
  }

  const nodes = extractWorkflowNodes(settings);
  const workflowPresence = detectWanWorkflows(projectDir);
  const mappingResult = buildMappingSummary(settings, nodes);
  const warnings: string[] = [];
  const missingRequirements: string[] = [];

  if (mappingResult.hasClipNode) {
    logger.info('Found CLIPTextEncode.text node');
  } else {
    logger.warn('No CLIPTextEncode.text node found in workflow.');
  }
  if (mappingResult.hasLoadNode) {
    logger.info('Found LoadImage.image node');
  } else {
    logger.warn('No LoadImage.image node found in workflow.');
  }

  if (mappingResult.clipText) {
    logger.info('Text mapping present');
  } else {
    logger.warn('No mapping for text prompts (human_readable_prompt or full_timeline_json).');
    warnings.push('Text mapping (wanI2V clipText) missing');
    missingRequirements.push('clipText');
  }
  if (mappingResult.loadImage) {
    logger.info('Keyframe mapping present');
  } else {
    logger.warn('No mapping for keyframe_image to a LoadImage.image input.');
    warnings.push('LoadImage mapping for keyframe_image missing');
    missingRequirements.push('loadImage');
  }

  if (mappingResult.inferredClipNode) {
    logger.info(`Auto-inferred CLIP node ${mappingResult.inferredClipNode} as human_readable_prompt`);
  }
  if (mappingResult.inferredLoadNode) {
    logger.info(`Auto-inferred LoadImage node ${mappingResult.inferredLoadNode} as keyframe_image`);
  }

  const summary = {
    helper: 'MappingPreflight',
    timestamp: new Date().toISOString(),
    projectPath: projectDir,
    settingsPath: settingsPath ?? null,
    workflows: workflowPresence,
    mappings: buildMappingSummaryPayload(mappingResult),
    missingWanI2VRequirements: missingRequirements,
    warnings,
    logEntries: logger.entries(),
    logPath: logPath ? logPath.replace(/\\/g, '/') : null,
  };

  if (summaryDir) {
    const outPath = writeHelperSummary(summaryDir, SUMMARY_FILENAME, summary);
    logger.info(`Mapping preflight summary written to ${outPath}`);
  } else {
    logger.info('Mapping preflight summary:');
    console.log(JSON.stringify(summary, null, 2));
  }

  process.exit(missingRequirements.length ? 3 : 0);
}

main();
