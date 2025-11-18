#!/usr/bin/env node

/**
 * E2E Smoke Check Script
 *
 * Performs a lightweight end-to-end test of the story-to-video pipeline:
 * 1. Generates a small test story (3 scenes)
 * 2. Runs frame/video generation via ComfyUI
 * 3. Analyzes generated frames for basic quality metrics
 * 4. Outputs a QA report JSON
 *
 * Requires ComfyUI to be running locally.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');
const HELPER_SUMMARY_DIR = path.join(PROJECT_ROOT, 'test-results', 'comfyui-status');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');

// Generate timestamp for run
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runId = `smoke-${timestamp}`;
const runDir = path.join(LOGS_DIR, runId);

console.log(`Starting E2E smoke check: ${runId}`);
console.log(`Run directory: ${runDir}`);

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Step 1: Generate test story
console.log('Step 1: Generating test story...');
try {
  const storyCmd = `node ${path.join(SCRIPTS_DIR, 'generate-story-scenes.ts')} --output "${runDir}" --scenes 3`;
  execSync(storyCmd, { stdio: 'inherit', cwd: PROJECT_ROOT });
} catch (error) {
  console.error('Failed to generate test story:', error.message);
  process.exit(1);
}

// Check if story was generated
const storyJsonPath = path.join(runDir, 'story.json');
if (!fs.existsSync(storyJsonPath)) {
  console.error('Story JSON not found at:', storyJsonPath);
  process.exit(1);
}

const storyData = JSON.parse(fs.readFileSync(storyJsonPath, 'utf8'));
console.log(`Generated story: ${storyData.storyId} with ${storyData.scenes.length} scenes`);

// Step 2: Run ComfyUI E2E pipeline
console.log('Step 2: Running ComfyUI E2E pipeline...');
try {
  const e2eCmd = `pwsh -NoLogo -ExecutionPolicy Bypass -File "${path.join(SCRIPTS_DIR, 'run-comfyui-e2e.ps1')}" -SceneRetryBudget 0 -FastIteration`;
  execSync(e2eCmd, { stdio: 'inherit', cwd: PROJECT_ROOT });
} catch (error) {
  console.error('ComfyUI E2E pipeline failed:', error.message);
  console.log('Note: This script requires ComfyUI to be running locally.');
  process.exit(1);
}

// Step 3: Analyze generated frames
console.log('Step 3: Analyzing generated frames...');

// Find the latest run directory (created by the e2e script)
const latestRunDir = findLatestRunDir();
if (!latestRunDir) {
  console.error('Could not find latest run directory');
  process.exit(1);
}

console.log(`Analyzing frames from: ${latestRunDir}`);

// Load artifact metadata
const artifactPath = path.join(latestRunDir, 'artifact-metadata.json');
if (!fs.existsSync(artifactPath)) {
  console.error('Artifact metadata not found at:', artifactPath);
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

// Analyze each scene
const qaReport = {
  runId,
  timestamp: new Date().toISOString(),
  scenes: [],
  helperSummary: undefined,
  helperSummaryPath: undefined,
};

const helperSummaryData = helperSummary?.data ?? null;
const helperSummaryPath = helperSummary?.path ?? null;

for (const scene of artifact.Scenes) {
  const sceneAnalysis = analyzeSceneFrames(latestRunDir, scene, helperSummaryData, helperSummaryPath);
  qaReport.scenes.push(sceneAnalysis);
}

console.log('Step 4: Writing QA report...');

// Write QA report
const helperSummary = loadLatestHelperSummary();
if (helperSummary) {
  qaReport.helperSummary = helperSummary.data;
  qaReport.helperSummaryPath = path.relative(PROJECT_ROOT, helperSummary.path);
  console.log(`Attached helper summary from ${helperSummary.path}`);
} else {
  console.warn('No helper summary files found in test-results/comfyui-status/');
}
const qaReportPath = path.join(latestRunDir, 'qa-report.json');
fs.writeFileSync(qaReportPath, JSON.stringify(qaReport, null, 2));

console.log(`QA report written to: ${qaReportPath}`);
console.log('E2E smoke check complete!');

const latestQaPath = path.join(LOGS_DIR, 'latest-qa.json');
fs.writeFileSync(latestQaPath, JSON.stringify(qaReport, null, 2));
console.log(`Latest QA report copied to: ${latestQaPath}`);

// Output summary
const successfulScenes = qaReport.scenes.filter(s => s.frameCount > 0).length;
const totalScenes = qaReport.scenes.length;
console.log(`Summary: ${successfulScenes}/${totalScenes} scenes generated frames`);

if (successfulScenes === 0) {
  console.error('No scenes generated frames - check ComfyUI setup');
  process.exit(1);
}

function findLatestRunDir() {
  if (!fs.existsSync(LOGS_DIR)) return null;

  const entries = fs.readdirSync(LOGS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => ({
      name: dirent.name,
      path: path.join(LOGS_DIR, dirent.name),
      mtime: fs.statSync(path.join(LOGS_DIR, dirent.name)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return entries.length > 0 ? entries[0].path : null;
}

function loadLatestHelperSummary() {
  if (!fs.existsSync(HELPER_SUMMARY_DIR)) {
    return null;
  }
  const entries = fs.readdirSync(HELPER_SUMMARY_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
    .map(dirent => ({
      name: dirent.name,
      path: path.join(HELPER_SUMMARY_DIR, dirent.name),
      mtime: fs.statSync(path.join(HELPER_SUMMARY_DIR, dirent.name)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (entries.length === 0) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(entries[0].path, 'utf8'));
    return { path: entries[0].path, data };
  } catch (error) {
    console.warn('Failed to parse helper summary:', error instanceof Error ? error.message : error);
    return null;
  }
}

function analyzeSceneFrames(runDir, scene, helperSummary, helperSummaryPath) {
  const sceneDir = path.join(runDir, scene.SceneId);
  const framesDir = path.join(sceneDir, 'frames');

  let frameCount = 0;
  let avgBrightness = 0;
  let frameVariance = 0;
  const flags = [];

  if (!fs.existsSync(framesDir)) {
    flags.push('no_frames_directory');
    return {
      sceneId: scene.SceneId,
      frameCount,
      avgBrightness,
      frameVariance,
      flags
    };
  }

  // Find PNG files (assuming frames are saved as PNG)
  const frameFiles = fs.readdirSync(framesDir)
    .filter(file => file.endsWith('.png'))
    .sort();

  frameCount = frameFiles.length;

  if (frameCount === 0) {
    flags.push('no_frame_files');
    return {
      sceneId: scene.SceneId,
      frameCount,
      avgBrightness,
      frameVariance,
      flags
    };
  }

  // Simple brightness analysis (placeholder - in a real implementation,
  // you'd use a library like sharp or canvas to analyze pixel data)
  // For now, just check file sizes as a proxy for content
  const fileSizes = frameFiles.map(file => {
    const stat = fs.statSync(path.join(framesDir, file));
    return stat.size;
  });

  const avgSize = fileSizes.reduce((sum, size) => sum + size, 0) / fileSizes.length;
  const variance = fileSizes.reduce((sum, size) => sum + Math.pow(size - avgSize, 2), 0) / fileSizes.length;

  // Normalize to 0-1 scale (arbitrary scaling for demo)
  avgBrightness = Math.min(avgSize / 100000, 1); // Assume 100KB is "bright"
  frameVariance = Math.min(variance / 1000000, 1); // Variance scaling

  // Basic quality checks
  if (frameCount < scene.FrameFloor) {
    flags.push(`frame_count_below_floor_${scene.FrameFloor}`);
  }

  if (avgBrightness < 0.1) {
    flags.push('potentially_dark_frames');
  }

  if (frameVariance < 0.01) {
    flags.push('potentially_identical_frames');
  }

  return {
    sceneId: scene.SceneId,
    frameCount,
    avgBrightness: parseFloat(avgBrightness.toFixed(3)),
    frameVariance: parseFloat(frameVariance.toFixed(3)),
    flags,
    helperSummaryPath: helperSummaryPath || undefined,
    helperSummary: helperSummary
      ? {
          timestamp: helperSummary.timestamp,
          queue: helperSummary.queue,
          systemStats: helperSummary.systemStats,
          workflows: helperSummary.workflows?.map(f => ({
            id: f.id,
            missingMappings: f.missingMappings,
            warnings: f.warnings,
            hasTextMapping: f.hasTextMapping,
            hasKeyframeMapping: f.hasKeyframeMapping,
          })),
        }
      : undefined
  };
}
