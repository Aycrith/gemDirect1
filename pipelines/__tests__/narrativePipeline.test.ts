/**
 * Tests for narrativePipeline.ts - N1 task
 * Uses actual files on disk to avoid ESM mocking limitations with fs module
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

import {
  isNarrativeShotRef,
  isNarrativeScript,
  type NarrativeScript,
  type NarrativeShotRef,
  type NarrativeRunSummary,
  type NarrativeShotArtifacts,
  type ShotQASummary,
  type NarrativeShotMetrics,
} from '../../types/narrativeScript';

import type { PipelineStepContext } from '../../services/pipelineOrchestrator';

import {
  loadNarrativeScript,
  getNarrativePipeline,
  getNarrativeScriptInfo,
  initializeRunContext,
  generateNarrativeSummary,
  listNarrativeScripts,
  writeJsonSummary,
  writeMarkdownReport,
  computeShotQAVerdict,
  computeNarrativeOverallVerdict,
  buildNarrativeQASummary,
} from '../narrativePipeline';

// Test data
const validShot: NarrativeShotRef = {
  id: 'shot-001',
  pipelineConfigId: 'fast-preview',
  cameraPathId: 'orbit-horizontal',
  durationSeconds: 5,
  sampleId: 'sample-001'
};

const validScript: NarrativeScript = {
  id: 'test-script',
  title: 'Test Script',
  description: 'A test narrative script',
  shots: [validShot]
};

// Path to actual demo script (relative path used by implementation)
const DEMO_SCRIPT_PATH = 'config/narrative/demo-three-shot.json';
const PROJECT_ROOT = process.cwd();

describe('narrativePipeline', () => {
  describe('Type Guards', () => {
    describe('isNarrativeShotRef', () => {
      it('returns true for valid shot reference', () => {
        expect(isNarrativeShotRef(validShot)).toBe(true);
      });

      it('returns false for null', () => {
        expect(isNarrativeShotRef(null)).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(isNarrativeShotRef(undefined)).toBe(false);
      });

      it('returns false for non-object', () => {
        expect(isNarrativeShotRef('string')).toBe(false);
        expect(isNarrativeShotRef(123)).toBe(false);
      });

      it('returns false when missing required id', () => {
        const invalid = { pipelineConfigId: 'fast-preview' };
        expect(isNarrativeShotRef(invalid)).toBe(false);
      });

      it('returns false when missing required pipelineConfigId', () => {
        const invalid = { id: 'shot-001' };
        expect(isNarrativeShotRef(invalid)).toBe(false);
      });

      it('returns true when optional fields are missing', () => {
        const minimal = {
          id: 'shot-001',
          pipelineConfigId: 'fast-preview'
        };
        expect(isNarrativeShotRef(minimal)).toBe(true);
      });

      it('returns false when id is not a string', () => {
        const invalid = { id: 123, pipelineConfigId: 'fast-preview' };
        expect(isNarrativeShotRef(invalid)).toBe(false);
      });

      it('returns false when pipelineConfigId is not a string', () => {
        const invalid = { id: 'shot-001', pipelineConfigId: 123 };
        expect(isNarrativeShotRef(invalid)).toBe(false);
      });
    });

    describe('isNarrativeScript', () => {
      it('returns true for valid script', () => {
        expect(isNarrativeScript(validScript)).toBe(true);
      });

      it('returns false for null', () => {
        expect(isNarrativeScript(null)).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(isNarrativeScript(undefined)).toBe(false);
      });

      it('returns false when missing id', () => {
        const invalid = { title: 'Test', shots: [validShot] };
        expect(isNarrativeScript(invalid)).toBe(false);
      });

      it('returns true when title is missing (title is optional)', () => {
        const noTitle = { id: 'test', shots: [validShot] };
        expect(isNarrativeScript(noTitle)).toBe(true);
      });

      it('returns false when shots is not an array', () => {
        const invalid = { id: 'test', title: 'Test', shots: 'not-array' };
        expect(isNarrativeScript(invalid)).toBe(false);
      });

      it('returns true when shots array is empty (implementation allows empty)', () => {
        // Note: The isNarrativeScript type guard allows empty arrays
        // Validation of non-empty is done at a higher level
        const empty = { id: 'test', title: 'Test', shots: [] };
        expect(isNarrativeScript(empty)).toBe(true);
      });

      it('returns false when shots contains invalid shot', () => {
        const invalid = { 
          id: 'test',
          title: 'Test',
          shots: [{ id: 123, pipelineConfigId: 'test' }] 
        };
        expect(isNarrativeScript(invalid)).toBe(false);
      });

      it('returns true with multiple valid shots', () => {
        const multiShot = {
          id: 'test',
          title: 'Test',
          shots: [
            validShot,
            { id: 'shot-002', pipelineConfigId: 'production' },
            { id: 'shot-003', pipelineConfigId: 'cinematic' }
          ]
        };
        expect(isNarrativeScript(multiShot)).toBe(true);
      });
    });
  });

  describe('initializeRunContext', () => {
    it('creates context with correct structure', () => {
      const outputDir = 'output/narratives';
      const scriptPath = 'config/narrative/test.json';
      const context = initializeRunContext(validScript, scriptPath, outputDir);

      expect(context.narrativeId).toBe(validScript.id);
      expect(context.scriptPath).toBe(scriptPath);
      expect(context.outputDir).toContain(validScript.id);
      expect(context.startedAt).toBeDefined();
      expect(context.status).toBe('running');
      expect(context.shots).toHaveLength(1);
      expect(context.shots[0]!.shotId).toBe(validShot.id);
      expect(context.shots[0]!.status).toBe('pending');
    });

    it('creates context for multi-shot script', () => {
      const multiShot: NarrativeScript = {
        id: 'multi-test',
        title: 'Multi-shot Test',
        shots: [
          validShot,
          { id: 'shot-002', pipelineConfigId: 'production-qa-preview' },
          { id: 'shot-003', pipelineConfigId: 'cinematic-preview' }
        ]
      };
      const context = initializeRunContext(multiShot, 'test.json', 'output');

      expect(context.shots).toHaveLength(3);
      expect(context.shots[0]!.shotId).toBe('shot-001');
      expect(context.shots[1]!.shotId).toBe('shot-002');
      expect(context.shots[2]!.shotId).toBe('shot-003');
    });
  });

  describe('generateNarrativeSummary', () => {
    it('generates summary with correct structure', () => {
      const startedAt = new Date().toISOString();
      const ctx: PipelineStepContext = {
        narrativeContext: {
          narrativeId: 'test-script',
          scriptPath: 'test.json',
          outputDir: '/tmp/run',
          startedAt,
          status: 'running',
          shots: [
            {
              shotId: validShot.id,
              pipelineConfigId: validShot.pipelineConfigId,
              status: 'succeeded',
              videoPath: '/tmp/run/shot-001/video.mp4',
            } as NarrativeShotArtifacts
          ]
        }
      };

      const summary = generateNarrativeSummary(validScript, ctx, startedAt);

      expect(summary.narrativeId).toBe('test-script');
      expect(summary.title).toBe('Test Script');
      expect(summary.shotCount).toBe(1);
      expect(summary.successfulShots).toBe(1);
      expect(summary.failedShots).toBe(0);
      expect(summary.status).toBe('succeeded');
    });

    it('generates summary with mixed results', () => {
      const startedAt = new Date().toISOString();
      const multiScript: NarrativeScript = {
        id: 'test-script',
        title: 'Test Script',
        shots: [
          validShot,
          { id: 'shot-002', pipelineConfigId: 'production' }
        ]
      };

      const ctx: PipelineStepContext = {
        narrativeContext: {
          narrativeId: 'test-script',
          scriptPath: 'test.json',
          outputDir: '/tmp/run',
          startedAt,
          status: 'running',
          shots: [
            {
              shotId: 'shot-001',
              pipelineConfigId: 'fast-preview',
              status: 'succeeded',
              videoPath: '/tmp/run/shot-001/video.mp4'
            } as NarrativeShotArtifacts,
            {
              shotId: 'shot-002',
              pipelineConfigId: 'production',
              status: 'failed',
              errorMessage: 'Generation failed'
            } as NarrativeShotArtifacts
          ]
        }
      };

      const summary = generateNarrativeSummary(multiScript, ctx, startedAt);

      expect(summary.shotCount).toBe(2);
      expect(summary.successfulShots).toBe(1);
      expect(summary.failedShots).toBe(1);
      expect(summary.status).toBe('failed'); // Any failure means overall failure
    });

    it('generates summary with all failed', () => {
      const startedAt = new Date().toISOString();
      const ctx: PipelineStepContext = {
        narrativeContext: {
          narrativeId: 'test-script',
          scriptPath: 'test.json',
          outputDir: '/tmp/run',
          startedAt,
          status: 'running',
          shots: [
            {
              shotId: 'shot-001',
              pipelineConfigId: 'fast-preview',
              status: 'failed',
              errorMessage: 'Failed to generate'
            } as NarrativeShotArtifacts
          ]
        }
      };

      const summary = generateNarrativeSummary(validScript, ctx, startedAt);

      expect(summary.status).toBe('failed');
      expect(summary.failedShots).toBe(1);
      expect(summary.successfulShots).toBe(0);
    });
  });

  describe('loadNarrativeScript (with actual file)', () => {
    it('loads demo-three-shot.json successfully', () => {
      const absolutePath = path.join(PROJECT_ROOT, DEMO_SCRIPT_PATH);
      // Skip if the file doesn't exist
      if (!fs.existsSync(absolutePath)) {
        console.warn('Skipping test: demo-three-shot.json not found');
        return;
      }

      const script = loadNarrativeScript(DEMO_SCRIPT_PATH);
      
      expect(script).toBeDefined();
      expect(script.id).toBe('demo-three-shot');
      expect(script.title).toBe('Three-Shot Demo: Fast → Production → Cinematic');
      expect(script.shots).toHaveLength(3);
      expect(script.shots[0]!.id).toBe('shot-001');
      expect(script.shots[0]!.pipelineConfigId).toBe('fast-preview');
    });

    it('throws for non-existent file', () => {
      expect(() => loadNarrativeScript('/nonexistent/path.json')).toThrow();
    });
  });

  describe('getNarrativePipeline (with actual file)', () => {
    it('creates pipeline from demo-three-shot.json', () => {
      const absolutePath = path.join(PROJECT_ROOT, DEMO_SCRIPT_PATH);
      // Skip if the file doesn't exist
      if (!fs.existsSync(absolutePath)) {
        console.warn('Skipping test: demo-three-shot.json not found');
        return;
      }

      const pipeline = getNarrativePipeline(DEMO_SCRIPT_PATH);
      
      expect(pipeline).toBeDefined();
      expect(pipeline.id).toBe('narrative-demo-three-shot');
      expect(pipeline.description).toContain('Three-Shot Demo');
      expect(pipeline.steps).toBeDefined();
      expect(Array.isArray(pipeline.steps)).toBe(true);
      // Should have steps for each shot plus concat and summary
      expect(pipeline.steps.length).toBeGreaterThan(3);
    });

    it('throws for non-existent script file', () => {
      expect(() => getNarrativePipeline('/nonexistent/script.json')).toThrow();
    });
  });

  describe('getNarrativeScriptInfo (with actual file)', () => {
    it('returns info from demo-three-shot.json', () => {
      const absolutePath = path.join(PROJECT_ROOT, DEMO_SCRIPT_PATH);
      // Skip if the file doesn't exist
      if (!fs.existsSync(absolutePath)) {
        console.warn('Skipping test: demo-three-shot.json not found');
        return;
      }

      const info = getNarrativeScriptInfo(DEMO_SCRIPT_PATH);
      
      expect(info).toBeDefined();
      expect(info.id).toBe('demo-three-shot');
      expect(info.title).toBe('Three-Shot Demo: Fast → Production → Cinematic');
      expect(info.shotCount).toBe(3);
    });

    it('throws for non-existent file', () => {
      expect(() => getNarrativeScriptInfo('/nonexistent/path.json')).toThrow();
    });
  });

  describe('listNarrativeScripts', () => {
    it('lists scripts from config/narrative directory', () => {
      const narrativeDir = path.join(PROJECT_ROOT, 'config', 'narrative');
      
      // Skip if the directory doesn't exist
      if (!fs.existsSync(narrativeDir)) {
        console.warn('Skipping test: config/narrative directory not found');
        return;
      }

      const scripts = listNarrativeScripts();
      
      expect(Array.isArray(scripts)).toBe(true);
      // Should find at least the demo script
      expect(scripts.length).toBeGreaterThanOrEqual(1);
      
      // Scripts are returned as relative paths
      const hasDemoScript = scripts.some(s => s.includes('demo-three-shot.json'));
      expect(hasDemoScript).toBe(true);
    });
  });

  describe('writeJsonSummary', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = path.join(PROJECT_ROOT, 'temp', `test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('writes summary JSON file', () => {
      const summary: NarrativeRunSummary = {
        narrativeId: 'test-script',
        title: 'Test Script',
        scriptPath: 'test.json',
        startedAt: '2025-01-01T12:00:00.000Z',
        finishedAt: '2025-01-01T12:01:00.000Z',
        totalDurationMs: 60000,
        shotCount: 1,
        successfulShots: 1,
        failedShots: 0,
        shotMetrics: [{ shotId: 'shot-001' }],
        shotArtifacts: [{
          shotId: 'shot-001',
          pipelineConfigId: 'fast-preview',
          status: 'succeeded',
          videoPath: '/tmp/video.mp4'
        }],
        status: 'succeeded'
      };

      const summaryPath = writeJsonSummary(summary, tempDir);
      
      expect(fs.existsSync(summaryPath)).toBe(true);
      
      const content = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      expect(content.narrativeId).toBe('test-script');
      expect(content.shotCount).toBe(1);
    });
  });

  describe('writeMarkdownReport', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = path.join(PROJECT_ROOT, 'temp', `test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('writes markdown report file', () => {
      const summary: NarrativeRunSummary = {
        narrativeId: 'test-script',
        title: 'Test Script',
        scriptPath: 'test.json',
        startedAt: '2025-01-01T12:00:00.000Z',
        finishedAt: '2025-01-01T12:01:00.000Z',
        totalDurationMs: 60000,
        shotCount: 1,
        successfulShots: 1,
        failedShots: 0,
        shotMetrics: [{ shotId: 'shot-001' }],
        shotArtifacts: [{
          shotId: 'shot-001',
          pipelineConfigId: 'fast-preview',
          status: 'succeeded',
          videoPath: '/tmp/video.mp4'
        }],
        status: 'succeeded'
      };

      const reportPath = writeMarkdownReport(summary, tempDir);
      
      expect(fs.existsSync(reportPath)).toBe(true);
      
      const content = fs.readFileSync(reportPath, 'utf-8');
      expect(content).toContain('Narrative Run Report');
      expect(content).toContain('Test Script');
    });

    it('writes markdown report with QA summary (N2)', () => {
      const summary: NarrativeRunSummary = {
        narrativeId: 'test-script',
        title: 'Test Script',
        scriptPath: 'test.json',
        startedAt: '2025-01-01T12:00:00.000Z',
        finishedAt: '2025-01-01T12:01:00.000Z',
        totalDurationMs: 60000,
        shotCount: 2,
        successfulShots: 2,
        failedShots: 0,
        shotMetrics: [
          { shotId: 'shot-001', visionQaOverall: 85, flickerFrameCount: 2 },
          { shotId: 'shot-002', visionQaOverall: 75, flickerFrameCount: 8 },
        ],
        shotArtifacts: [
          { shotId: 'shot-001', pipelineConfigId: 'fast-preview', status: 'succeeded' },
          { shotId: 'shot-002', pipelineConfigId: 'production-qa', status: 'succeeded' },
        ],
        status: 'succeeded',
        qaSummary: {
          overallVerdict: 'WARN',
          overallReasons: ['1/2 shots have warnings'],
          shots: [
            { shotId: 'shot-001', pipelineConfigId: 'fast-preview', metrics: {}, verdict: 'PASS', verdictReasons: [] },
            { shotId: 'shot-002', pipelineConfigId: 'production-qa', metrics: {}, verdict: 'WARN', verdictReasons: ['Mild flicker'] },
          ],
        },
      };

      const reportPath = writeMarkdownReport(summary, tempDir);
      
      expect(fs.existsSync(reportPath)).toBe(true);
      
      const content = fs.readFileSync(reportPath, 'utf-8');
      expect(content).toContain('Narrative QA Summary (N2)');
      expect(content).toContain('Overall QA Verdict');
      expect(content).toContain('WARN');
      expect(content).toContain('Per-Shot QA Verdicts');
    });
  });

  // ============================================================================
  // N2: QA Verdict Computation Tests
  // ============================================================================

  describe('computeShotQAVerdict (N2)', () => {
    it('returns PASS for metrics clearly above thresholds', () => {
      const metrics: ShotQASummary['metrics'] = {
        visionOverall: 90,
        visionArtifacts: 20,
        flickerFrameCount: 1,
        jitterScore: 5,
        identityScore: 85,
        overallQuality: 80,
        pathAdherenceMeanError: 0.05,
        pathDirectionConsistency: 0.9,
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('PASS');
      expect(reasons.length).toBe(0);
    });

    it('returns FAIL for Vision QA FAIL status', () => {
      const metrics: ShotQASummary['metrics'] = {
        visionStatus: 'FAIL',
        visionOverall: 65,
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('FAIL');
      expect(reasons.some(r => r.includes('Vision QA: FAIL'))).toBe(true);
    });

    it('returns FAIL for Vision overall below threshold', () => {
      const metrics: ShotQASummary['metrics'] = {
        visionOverall: 75, // Below 80 threshold
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('FAIL');
      expect(reasons.some(r => r.includes('Vision overall'))).toBe(true);
    });

    it('returns WARN for Vision overall in margin zone', () => {
      const metrics: ShotQASummary['metrics'] = {
        visionOverall: 82, // Between 80 and 85 (threshold + margin)
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('WARN');
      expect(reasons.some(r => r.includes('marginal'))).toBe(true);
    });

    it('returns WARN for mild flicker', () => {
      const metrics: ShotQASummary['metrics'] = {
        flickerFrameCount: 8, // Between 5 (warn) and 15 (fail)
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('WARN');
      expect(reasons.some(r => r.includes('Mild flicker'))).toBe(true);
    });

    it('returns FAIL for high flicker', () => {
      const metrics: ShotQASummary['metrics'] = {
        flickerFrameCount: 20, // Above 15 threshold
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('FAIL');
      expect(reasons.some(r => r.includes('High flicker'))).toBe(true);
    });

    it('returns WARN for mild jitter', () => {
      const metrics: ShotQASummary['metrics'] = {
        jitterScore: 25, // Between 20 (warn) and 40 (fail)
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('WARN');
      expect(reasons.some(r => r.includes('Mild jitter'))).toBe(true);
    });

    it('returns FAIL for low identity score', () => {
      const metrics: ShotQASummary['metrics'] = {
        identityScore: 40, // Below 50 threshold
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('FAIL');
      expect(reasons.some(r => r.includes('Low identity'))).toBe(true);
    });

    it('returns WARN for camera path adherence issues (soft signal)', () => {
      const metrics: ShotQASummary['metrics'] = {
        pathAdherenceMeanError: 0.35, // Above 0.30 fail threshold
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      // Path adherence is a soft signal - WARN not FAIL
      expect(verdict).toBe('WARN');
      expect(reasons.some(r => r.includes('Path adherence'))).toBe(true);
    });

    it('handles missing/undefined metrics gracefully', () => {
      const metrics: ShotQASummary['metrics'] = {};

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('PASS');
      expect(reasons.length).toBe(0);
    });

    it('accumulates multiple issues', () => {
      const metrics: ShotQASummary['metrics'] = {
        flickerFrameCount: 8, // WARN
        jitterScore: 25, // WARN
        visionOverall: 82, // WARN
      };

      const { verdict, reasons } = computeShotQAVerdict('shot-001', metrics);
      
      expect(verdict).toBe('WARN');
      expect(reasons.length).toBe(3);
    });
  });

  describe('computeNarrativeOverallVerdict (N2)', () => {
    it('returns PASS when all shots pass', () => {
      const shots: ShotQASummary[] = [
        { shotId: 'shot-001', pipelineConfigId: 'fast', metrics: {}, verdict: 'PASS', verdictReasons: [] },
        { shotId: 'shot-002', pipelineConfigId: 'prod', metrics: {}, verdict: 'PASS', verdictReasons: [] },
        { shotId: 'shot-003', pipelineConfigId: 'cine', metrics: {}, verdict: 'PASS', verdictReasons: [] },
      ];

      const { verdict, reasons } = computeNarrativeOverallVerdict(shots);
      
      expect(verdict).toBe('PASS');
      expect(reasons[0]).toBe('All shots passed QA');
    });

    it('returns WARN when one shot has warnings', () => {
      const shots: ShotQASummary[] = [
        { shotId: 'shot-001', pipelineConfigId: 'fast', metrics: {}, verdict: 'PASS', verdictReasons: [] },
        { shotId: 'shot-002', pipelineConfigId: 'prod', metrics: {}, verdict: 'WARN', verdictReasons: ['Mild flicker'] },
        { shotId: 'shot-003', pipelineConfigId: 'cine', metrics: {}, verdict: 'PASS', verdictReasons: [] },
      ];

      const { verdict, reasons } = computeNarrativeOverallVerdict(shots);
      
      expect(verdict).toBe('WARN');
      expect(reasons.some(r => r.includes('1/3 shots have warnings'))).toBe(true);
    });

    it('returns FAIL when one shot fails', () => {
      const shots: ShotQASummary[] = [
        { shotId: 'shot-001', pipelineConfigId: 'fast', metrics: {}, verdict: 'PASS', verdictReasons: [] },
        { shotId: 'shot-002', pipelineConfigId: 'prod', metrics: {}, verdict: 'FAIL', verdictReasons: ['Low identity'] },
        { shotId: 'shot-003', pipelineConfigId: 'cine', metrics: {}, verdict: 'WARN', verdictReasons: ['Mild flicker'] },
      ];

      const { verdict, reasons } = computeNarrativeOverallVerdict(shots);
      
      expect(verdict).toBe('FAIL');
      expect(reasons.some(r => r.includes('1/3 shots failed'))).toBe(true);
    });

    it('returns FAIL when multiple shots fail', () => {
      const shots: ShotQASummary[] = [
        { shotId: 'shot-001', pipelineConfigId: 'fast', metrics: {}, verdict: 'FAIL', verdictReasons: [] },
        { shotId: 'shot-002', pipelineConfigId: 'prod', metrics: {}, verdict: 'FAIL', verdictReasons: [] },
      ];

      const { verdict, reasons } = computeNarrativeOverallVerdict(shots);
      
      expect(verdict).toBe('FAIL');
      expect(reasons.some(r => r.includes('2/2 shots failed'))).toBe(true);
    });

    it('returns PASS for empty shots array', () => {
      const { verdict, reasons } = computeNarrativeOverallVerdict([]);
      
      expect(verdict).toBe('PASS');
      expect(reasons[0]).toBe('No shots to evaluate');
    });
  });

  describe('buildNarrativeQASummary (N2)', () => {
    it('builds complete QA summary from metrics and artifacts', () => {
      const shotMetrics: NarrativeShotMetrics[] = [
        { shotId: 'shot-001', visionQaOverall: 90, flickerFrameCount: 1 },
        { shotId: 'shot-002', visionQaOverall: 75, flickerFrameCount: 8 },
      ];

      const shotArtifacts: NarrativeShotArtifacts[] = [
        { shotId: 'shot-001', pipelineConfigId: 'fast-preview', status: 'succeeded' },
        { shotId: 'shot-002', pipelineConfigId: 'production-qa', status: 'succeeded', temporalRegularizationApplied: true },
      ];

      const qaSummary = buildNarrativeQASummary(shotMetrics, shotArtifacts);

      expect(qaSummary.shots).toHaveLength(2);
      expect(qaSummary.shots[0]!.shotId).toBe('shot-001');
      expect(qaSummary.shots[0]!.pipelineConfigId).toBe('fast-preview');
      expect(qaSummary.shots[0]!.verdict).toBe('PASS');
      
      expect(qaSummary.shots[1]!.shotId).toBe('shot-002');
      expect(qaSummary.shots[1]!.temporalRegularizationApplied).toBe(true);
      // shot-002 has visionOverall=75 (below 80) → FAIL
      expect(qaSummary.shots[1]!.verdict).toBe('FAIL');
      
      expect(qaSummary.overallVerdict).toBe('FAIL');
    });

    it('uses demo-three-shot style script with synthetic metrics', () => {
      // Simulate a three-shot narrative with varied quality
      const shotMetrics: NarrativeShotMetrics[] = [
        { shotId: 'shot-001', visionQaOverall: 88, flickerFrameCount: 2, overallQuality: 78 },
        { shotId: 'shot-002', visionQaOverall: 82, flickerFrameCount: 4, overallQuality: 72 },
        { shotId: 'shot-003', visionQaOverall: 92, flickerFrameCount: 1, overallQuality: 85 },
      ];

      const shotArtifacts: NarrativeShotArtifacts[] = [
        { shotId: 'shot-001', pipelineConfigId: 'fast-preview', status: 'succeeded' },
        { shotId: 'shot-002', pipelineConfigId: 'production-qa-preview', status: 'succeeded', temporalRegularizationApplied: true },
        { shotId: 'shot-003', pipelineConfigId: 'cinematic-preview', status: 'succeeded', temporalRegularizationApplied: true },
      ];

      const qaSummary = buildNarrativeQASummary(shotMetrics, shotArtifacts);

      // shot-001: visionOverall=88 (above 85 margin) → PASS
      expect(qaSummary.shots[0]!.verdict).toBe('PASS');
      
      // shot-002: visionOverall=82 (80-85 margin zone) → WARN
      expect(qaSummary.shots[1]!.verdict).toBe('WARN');
      
      // shot-003: visionOverall=92 → PASS
      expect(qaSummary.shots[2]!.verdict).toBe('PASS');
      
      // Overall: 1 WARN → overall WARN
      expect(qaSummary.overallVerdict).toBe('WARN');
      expect(qaSummary.overallReasons.some(r => r.includes('warnings'))).toBe(true);
    });
  });
});
