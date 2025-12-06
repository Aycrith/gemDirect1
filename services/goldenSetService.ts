/**
 * Golden Set Service
 * 
 * Service for managing golden set regression testing. Loads scenarios,
 * tracks run history, computes deltas between runs, and provides
 * summary data for the UI.
 * 
 * Part of Q1 - Golden Set Runner & Regression Harness
 * 
 * @module services/goldenSetService
 */

import type { QAVerdict } from '../types/narrativeScript';

// ============================================================================
// Types
// ============================================================================

/**
 * Expected outcome thresholds for a scenario
 */
export interface ScenarioExpectedOutcome {
    visionQaMinScore?: number;
    flickerMaxFrames?: number;
    identityMinScore?: number;
    jitterMaxScore?: number;
    overallMinScore?: number;
    pathAdherenceMaxError?: number;
}

/**
 * A single golden scenario definition
 */
export interface GoldenScenario {
    id: string;
    name: string;
    description: string;
    sampleId: string;
    pipelineConfigId: string;
    expectedOutcome: ScenarioExpectedOutcome;
    tags?: string[];
    priority?: number;
}

/**
 * Golden scenarios configuration file structure
 */
export interface GoldenScenariosConfig {
    version: string;
    description: string;
    lastUpdated: string;
    scenarios: GoldenScenario[];
    metadata?: {
        author?: string;
        notes?: string;
    };
}

/**
 * Metrics from a single scenario run
 */
export interface ScenarioRunMetrics {
    visionQaScore?: number;
    visionVerdict?: QAVerdict;
    flickerFrameCount?: number;
    identityScore?: number;
    jitterScore?: number;
    overallScore?: number;
    pathAdherenceMeanError?: number;
    pathDirectionConsistency?: number;
}

/**
 * Result of running a single scenario
 */
export interface ScenarioRunResult {
    scenarioId: string;
    status: 'passed' | 'failed' | 'error' | 'skipped';
    verdict: QAVerdict;
    metrics: ScenarioRunMetrics;
    failureReasons?: string[];
    videoPath?: string;
    manifestPath?: string;
    benchmarkPath?: string;
    visionQaPath?: string;
    runDir?: string;
    durationMs?: number;
    errorMessage?: string;
}

/**
 * Complete golden set run report
 */
export interface GoldenSetReport {
    reportId: string;
    runDate: string;
    finishedAt: string;
    totalDurationMs: number;
    
    summary: {
        total: number;
        passed: number;
        failed: number;
        errors: number;
        skipped: number;
        overallVerdict: QAVerdict;
    };
    
    results: ScenarioRunResult[];
    
    metadata?: {
        runBy?: string;
        gitCommit?: string;
        gitBranch?: string;
        notes?: string;
    };
}

/**
 * Delta between two metric values
 */
export interface MetricDelta {
    metricName: string;
    previousValue?: number;
    currentValue?: number;
    delta?: number;
    percentChange?: number;
    improved: boolean;
    direction: 'higher-is-better' | 'lower-is-better';
}

/**
 * Delta summary for a scenario between two runs
 */
export interface ScenarioDelta {
    scenarioId: string;
    previousVerdict?: QAVerdict;
    currentVerdict: QAVerdict;
    verdictChange: 'improved' | 'regressed' | 'unchanged' | 'new';
    metricDeltas: MetricDelta[];
}

/**
 * Complete delta report between two golden set runs
 */
export interface GoldenSetDeltaReport {
    currentReportId: string;
    previousReportId?: string;
    comparisonDate: string;
    
    summary: {
        improved: number;
        regressed: number;
        unchanged: number;
        newScenarios: number;
    };
    
    scenarioDeltas: ScenarioDelta[];
}

// ============================================================================
// Constants
// ============================================================================

const GOLDEN_SCENARIOS_PATH = '/config/golden-scenarios.json';
const GOLDEN_REPORTS_PATH = '/reports';
const NODE_GOLDEN_SCENARIOS_PATH = 'config/golden-scenarios.json';
const NODE_REPORTS_PATH = 'reports';

// ============================================================================
// Internal State
// ============================================================================

let cachedScenarios: GoldenScenariosConfig | null = null;
let cachedLastReport: GoldenSetReport | null = null;

// ============================================================================
// Helpers
// ============================================================================

function isNodeContext(): boolean {
    return typeof window === 'undefined';
}

/**
 * Determine verdict based on metrics vs expected outcomes
 */
export function determineVerdict(
    metrics: ScenarioRunMetrics,
    expected: ScenarioExpectedOutcome
): { verdict: QAVerdict; failureReasons: string[] } {
    const failureReasons: string[] = [];
    let hasWarning = false;
    let hasFail = false;
    
    // Check vision QA score
    if (expected.visionQaMinScore !== undefined && metrics.visionQaScore !== undefined) {
        if (metrics.visionQaScore < expected.visionQaMinScore * 0.8) {
            hasFail = true;
            failureReasons.push(`Vision QA score ${metrics.visionQaScore.toFixed(1)} far below threshold ${expected.visionQaMinScore}`);
        } else if (metrics.visionQaScore < expected.visionQaMinScore) {
            hasWarning = true;
            failureReasons.push(`Vision QA score ${metrics.visionQaScore.toFixed(1)} below threshold ${expected.visionQaMinScore}`);
        }
    }
    
    // Check flicker frames
    if (expected.flickerMaxFrames !== undefined && metrics.flickerFrameCount !== undefined) {
        if (metrics.flickerFrameCount > expected.flickerMaxFrames * 1.5) {
            hasFail = true;
            failureReasons.push(`Flicker frames ${metrics.flickerFrameCount} far exceeds max ${expected.flickerMaxFrames}`);
        } else if (metrics.flickerFrameCount > expected.flickerMaxFrames) {
            hasWarning = true;
            failureReasons.push(`Flicker frames ${metrics.flickerFrameCount} exceeds max ${expected.flickerMaxFrames}`);
        }
    }
    
    // Check identity score
    if (expected.identityMinScore !== undefined && metrics.identityScore !== undefined) {
        if (metrics.identityScore < expected.identityMinScore * 0.8) {
            hasFail = true;
            failureReasons.push(`Identity score ${metrics.identityScore.toFixed(1)} far below threshold ${expected.identityMinScore}`);
        } else if (metrics.identityScore < expected.identityMinScore) {
            hasWarning = true;
            failureReasons.push(`Identity score ${metrics.identityScore.toFixed(1)} below threshold ${expected.identityMinScore}`);
        }
    }
    
    // Check jitter score (lower is better)
    if (expected.jitterMaxScore !== undefined && metrics.jitterScore !== undefined) {
        if (metrics.jitterScore > expected.jitterMaxScore * 1.5) {
            hasFail = true;
            failureReasons.push(`Jitter score ${metrics.jitterScore.toFixed(1)} far exceeds max ${expected.jitterMaxScore}`);
        } else if (metrics.jitterScore > expected.jitterMaxScore) {
            hasWarning = true;
            failureReasons.push(`Jitter score ${metrics.jitterScore.toFixed(1)} exceeds max ${expected.jitterMaxScore}`);
        }
    }
    
    // Check overall score
    if (expected.overallMinScore !== undefined && metrics.overallScore !== undefined) {
        if (metrics.overallScore < expected.overallMinScore * 0.8) {
            hasFail = true;
            failureReasons.push(`Overall score ${metrics.overallScore.toFixed(1)} far below threshold ${expected.overallMinScore}`);
        } else if (metrics.overallScore < expected.overallMinScore) {
            hasWarning = true;
            failureReasons.push(`Overall score ${metrics.overallScore.toFixed(1)} below threshold ${expected.overallMinScore}`);
        }
    }
    
    const verdict: QAVerdict = hasFail ? 'FAIL' : hasWarning ? 'WARN' : 'PASS';
    return { verdict, failureReasons };
}

/**
 * Compute delta between two metric values
 */
function computeMetricDelta(
    metricName: string,
    previous: number | undefined,
    current: number | undefined,
    direction: 'higher-is-better' | 'lower-is-better'
): MetricDelta {
    const delta = current !== undefined && previous !== undefined
        ? current - previous
        : undefined;
    
    const percentChange = delta !== undefined && previous !== undefined && previous !== 0
        ? (delta / previous) * 100
        : undefined;
    
    let improved = false;
    if (delta !== undefined) {
        improved = direction === 'higher-is-better' ? delta > 0 : delta < 0;
    }
    
    return {
        metricName,
        previousValue: previous,
        currentValue: current,
        delta,
        percentChange,
        improved,
        direction,
    };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load golden scenarios configuration
 */
export async function loadGoldenScenarios(): Promise<GoldenScenariosConfig> {
    if (cachedScenarios) {
        return cachedScenarios;
    }
    
    if (isNodeContext()) {
        const fs = await import('fs');
        const path = await import('path');
        const projectRoot = process.cwd();
        const filePath = path.join(projectRoot, NODE_GOLDEN_SCENARIOS_PATH);
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`Golden scenarios config not found: ${filePath}`);
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        cachedScenarios = JSON.parse(content) as GoldenScenariosConfig;
    } else {
        const response = await fetch(GOLDEN_SCENARIOS_PATH);
        if (!response.ok) {
            throw new Error(`Failed to load golden scenarios: ${response.statusText}`);
        }
        cachedScenarios = await response.json() as GoldenScenariosConfig;
    }
    
    return cachedScenarios;
}

/**
 * Get scenarios filtered by priority
 */
export async function getScenariosByPriority(maxPriority: number = 3): Promise<GoldenScenario[]> {
    const config = await loadGoldenScenarios();
    return config.scenarios.filter(s => (s.priority ?? 1) <= maxPriority);
}

/**
 * Get a specific scenario by ID
 */
export async function getScenario(scenarioId: string): Promise<GoldenScenario | undefined> {
    const config = await loadGoldenScenarios();
    return config.scenarios.find(s => s.id === scenarioId);
}

/**
 * Load the latest golden set report
 */
export async function loadLatestGoldenSetReport(): Promise<GoldenSetReport | null> {
    if (cachedLastReport) {
        return cachedLastReport;
    }
    
    if (isNodeContext()) {
        const fs = await import('fs');
        const path = await import('path');
        const projectRoot = process.cwd();
        const reportsDir = path.join(projectRoot, NODE_REPORTS_PATH);
        
        if (!fs.existsSync(reportsDir)) {
            return null;
        }
        
        // Find latest GOLDEN_SET_*.json file
        const files = fs.readdirSync(reportsDir)
            .filter(f => f.startsWith('GOLDEN_SET_') && f.endsWith('.json'))
            .sort()
            .reverse();
        
        if (files.length === 0) {
            return null;
        }
        
        const firstFile = files[0];
        if (!firstFile) {
            return null;
        }
        
        const latestFile = path.join(reportsDir, firstFile);
        const content = fs.readFileSync(latestFile, 'utf-8');
        cachedLastReport = JSON.parse(content) as GoldenSetReport;
    } else {
        // In browser, try to load from known location
        try {
            const response = await fetch(`${GOLDEN_REPORTS_PATH}/latest-golden-set.json`);
            if (response.ok) {
                cachedLastReport = await response.json() as GoldenSetReport;
            }
        } catch {
            return null;
        }
    }
    
    return cachedLastReport;
}

/**
 * Load a specific golden set report by ID
 */
export async function loadGoldenSetReport(reportId: string): Promise<GoldenSetReport | null> {
    if (isNodeContext()) {
        const fs = await import('fs');
        const path = await import('path');
        const projectRoot = process.cwd();
        const filePath = path.join(projectRoot, NODE_REPORTS_PATH, `GOLDEN_SET_${reportId}.json`);
        
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) as GoldenSetReport;
    }
    
    return null;
}

/**
 * Compute deltas between current and previous golden set reports
 */
export function computeGoldenSetDeltas(
    current: GoldenSetReport,
    previous: GoldenSetReport | null
): GoldenSetDeltaReport {
    const scenarioDeltas: ScenarioDelta[] = [];
    let improved = 0;
    let regressed = 0;
    let unchanged = 0;
    let newScenarios = 0;
    
    for (const result of current.results) {
        const prevResult = previous?.results.find(r => r.scenarioId === result.scenarioId);
        
        // Determine verdict change
        let verdictChange: ScenarioDelta['verdictChange'];
        if (!prevResult) {
            verdictChange = 'new';
            newScenarios++;
        } else if (result.verdict === prevResult.verdict) {
            verdictChange = 'unchanged';
            unchanged++;
        } else if (
            (result.verdict === 'PASS' && prevResult.verdict !== 'PASS') ||
            (result.verdict === 'WARN' && prevResult.verdict === 'FAIL')
        ) {
            verdictChange = 'improved';
            improved++;
        } else {
            verdictChange = 'regressed';
            regressed++;
        }
        
        // Compute metric deltas
        const metricDeltas: MetricDelta[] = [];
        
        metricDeltas.push(computeMetricDelta(
            'visionQaScore',
            prevResult?.metrics.visionQaScore,
            result.metrics.visionQaScore,
            'higher-is-better'
        ));
        
        metricDeltas.push(computeMetricDelta(
            'flickerFrameCount',
            prevResult?.metrics.flickerFrameCount,
            result.metrics.flickerFrameCount,
            'lower-is-better'
        ));
        
        metricDeltas.push(computeMetricDelta(
            'identityScore',
            prevResult?.metrics.identityScore,
            result.metrics.identityScore,
            'higher-is-better'
        ));
        
        metricDeltas.push(computeMetricDelta(
            'jitterScore',
            prevResult?.metrics.jitterScore,
            result.metrics.jitterScore,
            'lower-is-better'
        ));
        
        metricDeltas.push(computeMetricDelta(
            'overallScore',
            prevResult?.metrics.overallScore,
            result.metrics.overallScore,
            'higher-is-better'
        ));
        
        if (result.metrics.pathAdherenceMeanError !== undefined) {
            metricDeltas.push(computeMetricDelta(
                'pathAdherenceMeanError',
                prevResult?.metrics.pathAdherenceMeanError,
                result.metrics.pathAdherenceMeanError,
                'lower-is-better'
            ));
        }
        
        scenarioDeltas.push({
            scenarioId: result.scenarioId,
            previousVerdict: prevResult?.verdict,
            currentVerdict: result.verdict,
            verdictChange,
            metricDeltas: metricDeltas.filter(d => d.currentValue !== undefined),
        });
    }
    
    return {
        currentReportId: current.reportId,
        previousReportId: previous?.reportId,
        comparisonDate: new Date().toISOString(),
        summary: {
            improved,
            regressed,
            unchanged,
            newScenarios,
        },
        scenarioDeltas,
    };
}

/**
 * Get a quick summary for the UI
 */
export interface GoldenSetQuickSummary {
    lastRunDate: string | null;
    overallVerdict: QAVerdict | null;
    passed: number;
    failed: number;
    total: number;
    hasRegression: boolean;
    scenarioSummaries: {
        id: string;
        name: string;
        verdict: QAVerdict;
        delta?: 'improved' | 'regressed' | 'unchanged' | 'new';
    }[];
}

export async function getGoldenSetQuickSummary(): Promise<GoldenSetQuickSummary> {
    const [scenarios, latestReport] = await Promise.all([
        loadGoldenScenarios().catch(() => null),
        loadLatestGoldenSetReport().catch(() => null),
    ]);
    
    if (!latestReport) {
        return {
            lastRunDate: null,
            overallVerdict: null,
            passed: 0,
            failed: 0,
            total: scenarios?.scenarios.length ?? 0,
            hasRegression: false,
            scenarioSummaries: [],
        };
    }
    
    // Load previous report for delta comparison
    const reports = await listGoldenSetReports();
    const secondReportId = reports.length > 1 ? reports[1] : undefined;
    const previousReport = secondReportId
        ? await loadGoldenSetReport(secondReportId)
        : null;
    
    const deltas = previousReport
        ? computeGoldenSetDeltas(latestReport, previousReport)
        : null;
    
    const scenarioSummaries = latestReport.results.map(result => {
        const scenario = scenarios?.scenarios.find(s => s.id === result.scenarioId);
        const delta = deltas?.scenarioDeltas.find(d => d.scenarioId === result.scenarioId);
        return {
            id: result.scenarioId,
            name: scenario?.name ?? result.scenarioId,
            verdict: result.verdict,
            delta: delta?.verdictChange,
        };
    });
    
    return {
        lastRunDate: latestReport.runDate,
        overallVerdict: latestReport.summary.overallVerdict,
        passed: latestReport.summary.passed,
        failed: latestReport.summary.failed + latestReport.summary.errors,
        total: latestReport.summary.total,
        hasRegression: deltas?.summary.regressed ? deltas.summary.regressed > 0 : false,
        scenarioSummaries,
    };
}

/**
 * List all golden set report IDs (most recent first)
 */
export async function listGoldenSetReports(): Promise<string[]> {
    if (isNodeContext()) {
        const fs = await import('fs');
        const path = await import('path');
        const projectRoot = process.cwd();
        const reportsDir = path.join(projectRoot, NODE_REPORTS_PATH);
        
        if (!fs.existsSync(reportsDir)) {
            return [];
        }
        
        return fs.readdirSync(reportsDir)
            .filter(f => f.startsWith('GOLDEN_SET_') && f.endsWith('.json'))
            .map(f => f.replace('GOLDEN_SET_', '').replace('.json', ''))
            .sort()
            .reverse();
    }
    
    return [];
}

/**
 * Clear cached data (useful after a new run)
 */
export function clearGoldenSetCache(): void {
    cachedScenarios = null;
    cachedLastReport = null;
}

/**
 * Save a golden set report
 */
export async function saveGoldenSetReport(report: GoldenSetReport): Promise<string> {
    if (!isNodeContext()) {
        throw new Error('Cannot save reports in browser context');
    }
    
    const fs = await import('fs');
    const path = await import('path');
    const projectRoot = process.cwd();
    const reportsDir = path.join(projectRoot, NODE_REPORTS_PATH);
    
    // Ensure reports directory exists
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Save JSON report
    const jsonPath = path.join(reportsDir, `GOLDEN_SET_${report.reportId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    
    // Save Markdown report
    const mdPath = path.join(reportsDir, `GOLDEN_SET_${report.reportId}.md`);
    const markdown = generateMarkdownReport(report);
    fs.writeFileSync(mdPath, markdown);
    
    // Update latest symlink/copy for browser access
    const latestJsonPath = path.join(reportsDir, 'latest-golden-set.json');
    fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
    
    // Clear cache
    clearGoldenSetCache();
    
    return jsonPath;
}

/**
 * Generate Markdown report from JSON report
 */
function generateMarkdownReport(report: GoldenSetReport): string {
    const lines: string[] = [];
    
    lines.push(`# Golden Set Report - ${report.reportId}`);
    lines.push('');
    lines.push(`**Run Date**: ${report.runDate}`);
    lines.push(`**Duration**: ${(report.totalDurationMs / 1000).toFixed(1)}s`);
    lines.push(`**Overall Verdict**: ${verdictEmoji(report.summary.overallVerdict)} ${report.summary.overallVerdict}`);
    lines.push('');
    
    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Scenarios | ${report.summary.total} |`);
    lines.push(`| Passed | ${report.summary.passed} |`);
    lines.push(`| Failed | ${report.summary.failed} |`);
    lines.push(`| Errors | ${report.summary.errors} |`);
    lines.push(`| Skipped | ${report.summary.skipped} |`);
    lines.push('');
    
    // Per-scenario results
    lines.push('## Scenario Results');
    lines.push('');
    
    for (const result of report.results) {
        const emoji = verdictEmoji(result.verdict);
        lines.push(`### ${emoji} ${result.scenarioId}`);
        lines.push('');
        lines.push(`**Status**: ${result.status} | **Verdict**: ${result.verdict}`);
        if (result.durationMs) {
            lines.push(`**Duration**: ${(result.durationMs / 1000).toFixed(1)}s`);
        }
        lines.push('');
        
        // Metrics table
        lines.push('| Metric | Value |');
        lines.push('|--------|-------|');
        if (result.metrics.visionQaScore !== undefined) {
            lines.push(`| Vision QA Score | ${result.metrics.visionQaScore.toFixed(1)} |`);
        }
        if (result.metrics.flickerFrameCount !== undefined) {
            lines.push(`| Flicker Frames | ${result.metrics.flickerFrameCount} |`);
        }
        if (result.metrics.identityScore !== undefined) {
            lines.push(`| Identity Score | ${result.metrics.identityScore.toFixed(1)} |`);
        }
        if (result.metrics.jitterScore !== undefined) {
            lines.push(`| Jitter Score | ${result.metrics.jitterScore.toFixed(1)} |`);
        }
        if (result.metrics.overallScore !== undefined) {
            lines.push(`| Overall Score | ${result.metrics.overallScore.toFixed(1)} |`);
        }
        lines.push('');
        
        // Failure reasons
        if (result.failureReasons && result.failureReasons.length > 0) {
            lines.push('**Issues**:');
            for (const reason of result.failureReasons) {
                lines.push(`- ${reason}`);
            }
            lines.push('');
        }
        
        // Artifact paths
        if (result.videoPath || result.manifestPath) {
            lines.push('**Artifacts**:');
            if (result.videoPath) lines.push(`- Video: \`${result.videoPath}\``);
            if (result.manifestPath) lines.push(`- Manifest: \`${result.manifestPath}\``);
            if (result.benchmarkPath) lines.push(`- Benchmark: \`${result.benchmarkPath}\``);
            if (result.visionQaPath) lines.push(`- Vision QA: \`${result.visionQaPath}\``);
            lines.push('');
        }
    }
    
    // Metadata
    if (report.metadata) {
        lines.push('## Metadata');
        lines.push('');
        if (report.metadata.gitCommit) lines.push(`- Git Commit: \`${report.metadata.gitCommit}\``);
        if (report.metadata.gitBranch) lines.push(`- Git Branch: \`${report.metadata.gitBranch}\``);
        if (report.metadata.runBy) lines.push(`- Run By: ${report.metadata.runBy}`);
        if (report.metadata.notes) lines.push(`- Notes: ${report.metadata.notes}`);
    }
    
    return lines.join('\n');
}

function verdictEmoji(verdict: QAVerdict): string {
    switch (verdict) {
        case 'PASS': return '✅';
        case 'WARN': return '⚠️';
        case 'FAIL': return '❌';
        default: return '○';
    }
}
