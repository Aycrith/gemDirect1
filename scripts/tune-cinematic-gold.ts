#!/usr/bin/env ts-node
/**
 * tune-cinematic-gold.ts
 * 
 * Analysis helper that consumes Golden Set and A/B experiment reports
 * to recommend optimal Cinematic Gold default parameters.
 * 
 * Usage:
 *   npx ts-node scripts/tune-cinematic-gold.ts
 *   npx ts-node scripts/tune-cinematic-gold.ts --min-runs 5   # Require 5+ runs for analysis
 *   npx ts-node scripts/tune-cinematic-gold.ts --output suggestions.json
 * 
 * Output:
 *   - Console summary of recommendations
 *   - Optional JSON file with structured suggestions
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GoldenSetReport } from '../services/goldenSetService';
import type { ABExperimentReport } from './run-ab-experiments';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameter recommendation based on analysis
 */
export interface ParameterRecommendation {
    /** Parameter name */
    parameter: string;
    
    /** Current default value */
    currentValue: unknown;
    
    /** Recommended value */
    recommendedValue: unknown;
    
    /** Confidence level (0-1) */
    confidence: number;
    
    /** Number of data points supporting this recommendation */
    dataPoints: number;
    
    /** Brief explanation */
    rationale: string;
    
    /** Source experiments/reports */
    sources: string[];
}

/**
 * Overall tuning analysis result
 */
export interface TuningAnalysis {
    /** Timestamp of analysis */
    timestamp: string;
    
    /** Golden Set reports analyzed */
    goldenSetReportsAnalyzed: number;
    
    /** A/B experiment reports analyzed */
    abReportsAnalyzed: number;
    
    /** Total data points (runs) */
    totalDataPoints: number;
    
    /** Parameter recommendations */
    recommendations: ParameterRecommendation[];
    
    /** Scenario-specific insights */
    scenarioInsights: ScenarioInsight[];
    
    /** Overall health assessment */
    health: {
        overallPassRate: number;
        trendDirection: 'improving' | 'stable' | 'declining' | 'unknown';
        topIssues: string[];
    };
}

/**
 * Insight for a specific scenario
 */
export interface ScenarioInsight {
    scenarioId: string;
    
    /** Average pass rate across runs */
    passRate: number;
    
    /** Trend direction */
    trend: 'improving' | 'stable' | 'declining' | 'unknown';
    
    /** Common failure modes */
    failureModes: string[];
    
    /** Specific recommendations for this scenario */
    recommendations: string[];
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
    minRuns: number;
    outputPath?: string;
    verbose: boolean;
}

function parseArgs(): CliArgs {
    const args: CliArgs = {
        minRuns: 3,
        verbose: false,
    };
    
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg === '--min-runs' && process.argv[i + 1]) {
            args.minRuns = parseInt(process.argv[++i] as string, 10);
        } else if (arg === '--output' && process.argv[i + 1]) {
            args.outputPath = process.argv[++i] as string;
        } else if (arg === '--verbose') {
            args.verbose = true;
        }
    }
    
    return args;
}

// ============================================================================
// Data Loading
// ============================================================================

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');

/**
 * Load all Golden Set reports from the reports directory
 */
function loadGoldenSetReports(): GoldenSetReport[] {
    if (!fs.existsSync(REPORTS_DIR)) {
        return [];
    }
    
    const files = fs.readdirSync(REPORTS_DIR)
        .filter(f => f.startsWith('golden-set-') && f.endsWith('.json'));
    
    const reports: GoldenSetReport[] = [];
    
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8');
            reports.push(JSON.parse(content));
        } catch {
            console.warn(`Failed to load ${file}`);
        }
    }
    
    // Sort by runDate descending (newest first)
    return reports.sort((a, b) => 
        new Date(b.runDate).getTime() - new Date(a.runDate).getTime()
    );
}

/**
 * Load all A/B experiment reports
 */
function loadABReports(): ABExperimentReport[] {
    if (!fs.existsSync(REPORTS_DIR)) {
        return [];
    }
    
    const files = fs.readdirSync(REPORTS_DIR)
        .filter(f => f.startsWith('ab-experiments-') && f.endsWith('.json'));
    
    const reports: ABExperimentReport[] = [];
    
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8');
            reports.push(JSON.parse(content));
        } catch {
            console.warn(`Failed to load ${file}`);
        }
    }
    
    // Sort by timestamp descending
    return reports.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyze Golden Set reports for trends and recommendations
 */
function analyzeGoldenSetReports(
    reports: GoldenSetReport[]
): { passRate: number; scenarioStats: Map<string, { passes: number; fails: number; warns: number }> } {
    const scenarioStats = new Map<string, { passes: number; fails: number; warns: number }>();
    let totalPasses = 0;
    let totalRuns = 0;
    
    for (const report of reports) {
        for (const result of report.results) {
            const stats = scenarioStats.get(result.scenarioId) ?? { passes: 0, fails: 0, warns: 0 };
            
            if (result.verdict === 'PASS') {
                stats.passes++;
                totalPasses++;
            } else if (result.verdict === 'WARN') {
                stats.warns++;
            } else {
                stats.fails++;
            }
            
            totalRuns++;
            scenarioStats.set(result.scenarioId, stats);
        }
    }
    
    return {
        passRate: totalRuns > 0 ? totalPasses / totalRuns : 0,
        scenarioStats,
    };
}

/**
 * Analyze A/B reports to extract parameter preferences
 */
function analyzeABReports(
    reports: ABExperimentReport[]
): Map<string, { winnerVariant: 'A' | 'B' | 'tie'; totalComparisons: number; confidence: number }> {
    const experimentResults = new Map<string, { aWins: number; bWins: number; total: number }>();
    
    for (const report of reports) {
        for (const result of report.results) {
            const expId = result.experimentId;
            const stats = experimentResults.get(expId) ?? { aWins: 0, bWins: 0, total: 0 };
            
            stats.aWins += result.summary.variantAWins;
            stats.bWins += result.summary.variantBWins;
            stats.total += result.summary.totalComparisons;
            
            experimentResults.set(expId, stats);
        }
    }
    
    // Convert to final results
    const results = new Map<string, { winnerVariant: 'A' | 'B' | 'tie'; totalComparisons: number; confidence: number }>();
    
    for (const [expId, stats] of experimentResults) {
        const total = stats.aWins + stats.bWins;
        const winner: 'A' | 'B' | 'tie' = 
            total === 0 ? 'tie' :
            stats.aWins > stats.bWins ? 'A' :
            stats.bWins > stats.aWins ? 'B' : 'tie';
        
        const dominantWins = Math.max(stats.aWins, stats.bWins);
        const confidence = total > 0 ? dominantWins / total : 0;
        
        results.set(expId, {
            winnerVariant: winner,
            totalComparisons: stats.total,
            confidence,
        });
    }
    
    return results;
}

/**
 * Generate parameter recommendations from A/B results
 */
function generateParameterRecommendations(
    abAnalysis: Map<string, { winnerVariant: 'A' | 'B' | 'tie'; totalComparisons: number; confidence: number }>,
    abReports: ABExperimentReport[]
): ParameterRecommendation[] {
    const recommendations: ParameterRecommendation[] = [];
    
    // Define parameter mappings for known experiments
    const parameterMappings: Record<string, {
        parameter: string;
        variantAValue: unknown;
        variantBValue: unknown;
        currentDefault: unknown;
    }> = {
        'temporal-reg-comparison': {
            parameter: 'temporalRegularization',
            variantAValue: 'none',
            variantBValue: 'adaptive',
            currentDefault: 'adaptive',
        },
        'camera-path-comparison': {
            parameter: 'cameraPathType',
            variantAValue: 'static',
            variantBValue: 'bezier',
            currentDefault: 'bezier',
        },
    };
    
    for (const [expId, result] of abAnalysis) {
        const mapping = parameterMappings[expId];
        if (!mapping) continue;
        
        if (result.winnerVariant === 'tie') {
            continue; // No clear recommendation
        }
        
        const recommendedValue = result.winnerVariant === 'A' 
            ? mapping.variantAValue 
            : mapping.variantBValue;
        
        // Only recommend if different from current and confidence is high enough
        if (recommendedValue !== mapping.currentDefault && result.confidence >= 0.6) {
            recommendations.push({
                parameter: mapping.parameter,
                currentValue: mapping.currentDefault,
                recommendedValue,
                confidence: result.confidence,
                dataPoints: result.totalComparisons,
                rationale: `A/B testing shows ${result.winnerVariant === 'A' ? 'variant A' : 'variant B'} wins ${(result.confidence * 100).toFixed(0)}% of comparisons`,
                sources: abReports
                    .filter(r => r.results.some(res => res.experimentId === expId))
                    .map(r => r.reportId),
            });
        }
    }
    
    return recommendations;
}

/**
 * Generate scenario-specific insights
 */
function generateScenarioInsights(
    goldenStats: Map<string, { passes: number; fails: number; warns: number }>,
    goldenReports: GoldenSetReport[]
): ScenarioInsight[] {
    const insights: ScenarioInsight[] = [];
    
    for (const [scenarioId, stats] of goldenStats) {
        const total = stats.passes + stats.fails + stats.warns;
        const passRate = total > 0 ? (stats.passes + stats.warns * 0.5) / total : 0;
        
        // Determine trend (compare older vs newer reports)
        let trend: ScenarioInsight['trend'] = 'unknown';
        if (goldenReports.length >= 3) {
            const recentReports = goldenReports.slice(0, Math.ceil(goldenReports.length / 2));
            const olderReports = goldenReports.slice(Math.ceil(goldenReports.length / 2));
            
            const recentPassRate = calculateScenarioPassRate(scenarioId, recentReports);
            const olderPassRate = calculateScenarioPassRate(scenarioId, olderReports);
            
            if (recentPassRate > olderPassRate + 0.1) {
                trend = 'improving';
            } else if (recentPassRate < olderPassRate - 0.1) {
                trend = 'declining';
            } else {
                trend = 'stable';
            }
        }
        
        // Identify failure modes
        const failureModes: string[] = [];
        if (stats.fails > 0) {
            // Aggregate failure reasons from reports
            for (const report of goldenReports) {
                const result = report.results.find(r => r.scenarioId === scenarioId);
                if (result?.failureReasons) {
                    for (const reason of result.failureReasons) {
                        if (!failureModes.includes(reason)) {
                            failureModes.push(reason);
                        }
                    }
                }
            }
        }
        
        // Generate recommendations
        const recommendations: string[] = [];
        if (passRate < 0.5) {
            recommendations.push('Consider lowering thresholds or investigating root cause');
        }
        if (failureModes.some(f => f.includes('flicker'))) {
            recommendations.push('Enable or tune temporal regularization');
        }
        if (failureModes.some(f => f.includes('identity'))) {
            recommendations.push('Review character prompt consistency');
        }
        if (trend === 'declining') {
            recommendations.push('Recent regressions detected - review recent changes');
        }
        
        insights.push({
            scenarioId,
            passRate,
            trend,
            failureModes: failureModes.slice(0, 5), // Top 5
            recommendations,
        });
    }
    
    return insights.sort((a, b) => a.passRate - b.passRate); // Worst first
}

function calculateScenarioPassRate(scenarioId: string, reports: GoldenSetReport[]): number {
    let passes = 0;
    let total = 0;
    
    for (const report of reports) {
        const result = report.results.find(r => r.scenarioId === scenarioId);
        if (result) {
            total++;
            if (result.verdict === 'PASS') passes++;
        }
    }
    
    return total > 0 ? passes / total : 0;
}

/**
 * Determine overall trend direction
 */
function determineTrend(reports: GoldenSetReport[]): TuningAnalysis['health']['trendDirection'] {
    if (reports.length < 3) return 'unknown';
    
    // Calculate pass rates for recent vs older reports
    const midpoint = Math.ceil(reports.length / 2);
    const recentReports = reports.slice(0, midpoint);
    const olderReports = reports.slice(midpoint);
    
    const recentPassRate = calculateOverallPassRate(recentReports);
    const olderPassRate = calculateOverallPassRate(olderReports);
    
    if (recentPassRate > olderPassRate + 0.05) return 'improving';
    if (recentPassRate < olderPassRate - 0.05) return 'declining';
    return 'stable';
}

function calculateOverallPassRate(reports: GoldenSetReport[]): number {
    let passes = 0;
    let total = 0;
    
    for (const report of reports) {
        for (const result of report.results) {
            total++;
            if (result.verdict === 'PASS') passes++;
        }
    }
    
    return total > 0 ? passes / total : 0;
}

/**
 * Identify top issues from reports
 */
function identifyTopIssues(goldenReports: GoldenSetReport[]): string[] {
    const issueCounts = new Map<string, number>();
    
    for (const report of goldenReports) {
        for (const result of report.results) {
            if (result.failureReasons) {
                for (const reason of result.failureReasons) {
                    issueCounts.set(reason, (issueCounts.get(reason) ?? 0) + 1);
                }
            }
        }
    }
    
    // Sort by count and return top 5
    return Array.from(issueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([issue]) => issue);
}

// ============================================================================
// Main Analysis
// ============================================================================

function runAnalysis(args: CliArgs): TuningAnalysis {
    console.log('Loading reports...');
    
    const goldenReports = loadGoldenSetReports();
    const abReports = loadABReports();
    
    console.log(`  Golden Set reports: ${goldenReports.length}`);
    console.log(`  A/B reports: ${abReports.length}`);
    
    // Check minimum runs requirement
    if (goldenReports.length < args.minRuns && abReports.length < args.minRuns) {
        console.warn(`  ⚠️ Warning: Fewer than ${args.minRuns} reports available. Results may be unreliable.`);
    }
    
    // Analyze Golden Set data
    const { passRate, scenarioStats } = analyzeGoldenSetReports(goldenReports);
    
    // Analyze A/B data
    const abAnalysis = analyzeABReports(abReports);
    
    // Generate recommendations
    const recommendations = generateParameterRecommendations(abAnalysis, abReports);
    
    // Generate scenario insights
    const scenarioInsights = generateScenarioInsights(scenarioStats, goldenReports);
    
    // Calculate total data points
    let totalDataPoints = 0;
    for (const report of goldenReports) {
        totalDataPoints += report.results.length;
    }
    for (const report of abReports) {
        for (const result of report.results) {
            totalDataPoints += result.comparisons.length * 2; // Two runs per comparison
        }
    }
    
    return {
        timestamp: new Date().toISOString(),
        goldenSetReportsAnalyzed: goldenReports.length,
        abReportsAnalyzed: abReports.length,
        totalDataPoints,
        recommendations,
        scenarioInsights,
        health: {
            overallPassRate: passRate,
            trendDirection: determineTrend(goldenReports),
            topIssues: identifyTopIssues(goldenReports),
        },
    };
}

// ============================================================================
// Output Formatting
// ============================================================================

function printAnalysis(analysis: TuningAnalysis): void {
    console.log('\n' + '='.repeat(70));
    console.log('CINEMATIC GOLD TUNING ANALYSIS');
    console.log('='.repeat(70));
    
    console.log(`\nTimestamp: ${analysis.timestamp}`);
    console.log(`Data Sources:`);
    console.log(`  - Golden Set Reports: ${analysis.goldenSetReportsAnalyzed}`);
    console.log(`  - A/B Experiment Reports: ${analysis.abReportsAnalyzed}`);
    console.log(`  - Total Data Points: ${analysis.totalDataPoints}`);
    
    // Health Assessment
    console.log('\n' + '-'.repeat(40));
    console.log('HEALTH ASSESSMENT');
    console.log('-'.repeat(40));
    
    const passEmoji = analysis.health.overallPassRate >= 0.8 ? '✅' :
                      analysis.health.overallPassRate >= 0.6 ? '⚠️' : '❌';
    console.log(`${passEmoji} Overall Pass Rate: ${(analysis.health.overallPassRate * 100).toFixed(1)}%`);
    
    const trendEmoji = analysis.health.trendDirection === 'improving' ? '📈' :
                       analysis.health.trendDirection === 'declining' ? '📉' :
                       analysis.health.trendDirection === 'stable' ? '➡️' : '❓';
    console.log(`${trendEmoji} Trend: ${analysis.health.trendDirection}`);
    
    if (analysis.health.topIssues.length > 0) {
        console.log('\nTop Issues:');
        for (const issue of analysis.health.topIssues) {
            console.log(`  • ${issue}`);
        }
    }
    
    // Parameter Recommendations
    if (analysis.recommendations.length > 0) {
        console.log('\n' + '-'.repeat(40));
        console.log('PARAMETER RECOMMENDATIONS');
        console.log('-'.repeat(40));
        
        for (const rec of analysis.recommendations) {
            const confEmoji = rec.confidence >= 0.8 ? '🔥' : rec.confidence >= 0.6 ? '👍' : '🤔';
            console.log(`\n${confEmoji} ${rec.parameter}`);
            console.log(`   Current: ${JSON.stringify(rec.currentValue)}`);
            console.log(`   Recommended: ${JSON.stringify(rec.recommendedValue)}`);
            console.log(`   Confidence: ${(rec.confidence * 100).toFixed(0)}% (${rec.dataPoints} data points)`);
            console.log(`   Rationale: ${rec.rationale}`);
        }
    } else {
        console.log('\n' + '-'.repeat(40));
        console.log('PARAMETER RECOMMENDATIONS');
        console.log('-'.repeat(40));
        console.log('\nNo parameter changes recommended at this time.');
        console.log('Current defaults appear optimal based on available data.');
    }
    
    // Scenario Insights
    if (analysis.scenarioInsights.length > 0) {
        console.log('\n' + '-'.repeat(40));
        console.log('SCENARIO INSIGHTS');
        console.log('-'.repeat(40));
        
        for (const insight of analysis.scenarioInsights) {
            const passEmoji = insight.passRate >= 0.8 ? '✅' :
                              insight.passRate >= 0.6 ? '⚠️' : '❌';
            const trendEmoji = insight.trend === 'improving' ? '📈' :
                               insight.trend === 'declining' ? '📉' :
                               insight.trend === 'stable' ? '➡️' : '❓';
            
            console.log(`\n${passEmoji} ${insight.scenarioId}`);
            console.log(`   Pass Rate: ${(insight.passRate * 100).toFixed(1)}% ${trendEmoji}`);
            
            if (insight.failureModes.length > 0) {
                console.log(`   Failure Modes: ${insight.failureModes.join(', ')}`);
            }
            
            if (insight.recommendations.length > 0) {
                console.log(`   Recommendations:`);
                for (const rec of insight.recommendations) {
                    console.log(`     • ${rec}`);
                }
            }
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('END OF ANALYSIS');
    console.log('='.repeat(70));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    const args = parseArgs();
    
    console.log('Cinematic Gold Tuning Analysis');
    console.log('==============================\n');
    
    const analysis = runAnalysis(args);
    
    printAnalysis(analysis);
    
    // Save to file if requested
    if (args.outputPath) {
        const outputDir = path.dirname(args.outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(args.outputPath, JSON.stringify(analysis, null, 2));
        console.log(`\nAnalysis saved to: ${args.outputPath}`);
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
