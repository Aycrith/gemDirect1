#!/usr/bin/env npx tsx
/**
 * Run Cleanup Utility
 * 
 * CLI script to prune old pipeline artifacts based on configurable retention policy.
 * By default, this is opt-in only - no automatic deletion.
 * 
 * Usage:
 *   # Dry run - show what would be deleted
 *   npx tsx scripts/cleanup-runs.ts --dry-run
 *   
 *   # Keep last 20 runs
 *   npx tsx scripts/cleanup-runs.ts --keep-last 20
 *   
 *   # Keep runs from last 7 days
 *   npx tsx scripts/cleanup-runs.ts --keep-days 7
 *   
 *   # Delete specific run by ID
 *   npx tsx scripts/cleanup-runs.ts --delete-run run-2025-12-01_12-00-00-abc123
 *   
 *   # Clean all (respecting policy), including output folder
 *   npx tsx scripts/cleanup-runs.ts --keep-last 20 --include-output
 *   
 * Targets:
 *   - data/benchmarks/*.json
 *   - data/run-summaries/*.json
 *   - data/narratives/*.json
 *   - data/run-registry.json entries
 *   - public/run-history.json entries
 *   - output/ (optional, with --include-output)
 * 
 * @module scripts/cleanup-runs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    readRegistry,
    getRunsOlderThan,
    getRunsBeyondLimit,
    removeRunsFromRegistry,
} from './utils/runRegistry';
import type { RunRegistryEntry } from '../types/runRegistry';

// ============================================================================
// Constants
// ============================================================================

// ESM-compatible path resolution (replaces __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const TARGET_DIRS = {
    benchmarks: path.join(PROJECT_ROOT, 'data', 'benchmarks'),
    runSummaries: path.join(PROJECT_ROOT, 'data', 'run-summaries'),
    narratives: path.join(PROJECT_ROOT, 'data', 'narratives'),
    output: path.join(PROJECT_ROOT, 'output'),
};

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
    dryRun: boolean;
    keepLast?: number;
    keepDays?: number;
    deleteRun?: string;
    includeOutput: boolean;
    verbose: boolean;
    help: boolean;
}

function parseArgs(): CliArgs {
    const args: CliArgs = {
        dryRun: false,
        includeOutput: false,
        verbose: false,
        help: false,
    };
    const argv = process.argv.slice(2);
    
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        
        switch (arg) {
            case '--dry-run':
            case '-n':
                args.dryRun = true;
                break;
            case '--keep-last':
            case '-l':
                args.keepLast = parseInt(next || '0', 10);
                i++;
                break;
            case '--keep-days':
            case '-d':
                args.keepDays = parseInt(next || '0', 10);
                i++;
                break;
            case '--delete-run':
                args.deleteRun = next;
                i++;
                break;
            case '--include-output':
                args.includeOutput = true;
                break;
            case '--verbose':
            case '-v':
                args.verbose = true;
                break;
            case '--help':
            case '-h':
                args.help = true;
                break;
        }
    }
    
    return args;
}

// ============================================================================
// File Operations
// ============================================================================

interface CleanupStats {
    filesScanned: number;
    filesDeleted: number;
    bytesFreed: number;
    runsRemoved: number;
    errors: string[];
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Note: getFileAge is available if needed for future expansion
// function getFileAge(filePath: string): Date | null {
//     try {
//         const stats = fs.statSync(filePath);
//         return stats.mtime;
//     } catch {
//         return null;
//     }
// }

function deleteFile(filePath: string, dryRun: boolean, stats: CleanupStats, verbose: boolean): void {
    try {
        const fileStats = fs.statSync(filePath);
        const size = fileStats.size;
        
        if (dryRun) {
            if (verbose) {
                console.log(`  [DRY-RUN] Would delete: ${filePath} (${formatBytes(size)})`);
            }
        } else {
            fs.unlinkSync(filePath);
            if (verbose) {
                console.log(`  Deleted: ${filePath} (${formatBytes(size)})`);
            }
        }
        
        stats.filesDeleted++;
        stats.bytesFreed += size;
    } catch (error) {
        stats.errors.push(`Failed to delete ${filePath}: ${error}`);
    }
}

function deleteDirectory(dirPath: string, dryRun: boolean, stats: CleanupStats, verbose: boolean): void {
    try {
        if (!fs.existsSync(dirPath)) return;
        
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                deleteDirectory(entryPath, dryRun, stats, verbose);
            } else {
                deleteFile(entryPath, dryRun, stats, verbose);
            }
        }
        
        // Remove empty directory
        if (!dryRun) {
            const remaining = fs.readdirSync(dirPath);
            if (remaining.length === 0) {
                fs.rmdirSync(dirPath);
                if (verbose) {
                    console.log(`  Removed empty directory: ${dirPath}`);
                }
            }
        }
    } catch (error) {
        stats.errors.push(`Failed to delete directory ${dirPath}: ${error}`);
    }
}

// ============================================================================
// Cleanup Logic
// ============================================================================

function findFilesToDelete(
    directory: string,
    cutoffDate: Date | null,
    verbose: boolean
): string[] {
    const toDelete: string[] = [];
    
    try {
        if (!fs.existsSync(directory)) return toDelete;
        
        const entries = fs.readdirSync(directory);
        
        for (const entry of entries) {
            const filePath = path.join(directory, entry);
            const stats = fs.statSync(filePath);
            
            if (!stats.isFile()) continue;
            
            // If cutoff date specified, only delete files older than cutoff
            if (cutoffDate) {
                const fileDate = stats.mtime;
                if (fileDate >= cutoffDate) continue;
            }
            
            toDelete.push(filePath);
        }
    } catch (error) {
        if (verbose) {
            console.warn(`  Warning: Could not scan ${directory}: ${error}`);
        }
    }
    
    return toDelete;
}

function cleanupByPolicy(
    runsToRemove: RunRegistryEntry[],
    args: CliArgs
): CleanupStats {
    const stats: CleanupStats = {
        filesScanned: 0,
        filesDeleted: 0,
        bytesFreed: 0,
        runsRemoved: 0,
        errors: [],
    };
    
    console.log(`\n📋 Runs to remove: ${runsToRemove.length}`);
    
    if (runsToRemove.length === 0) {
        console.log('   Nothing to clean up.');
        return stats;
    }
    
    // Delete artifact files associated with runs
    for (const run of runsToRemove) {
        console.log(`\n   🗑️  Run: ${run.runId}`);
        
        // Delete associated files
        const artifactPaths = [
            run.artifacts.summaryJson,
            run.artifacts.visionQa,
            run.artifacts.benchmarkJson,
            run.artifacts.benchmarkMd,
            run.artifacts.manifest,
            run.artifacts.video,
            run.artifacts.originalVideo,
            run.artifacts.finalVideo,
        ].filter(Boolean) as string[];
        
        for (const artifactPath of artifactPaths) {
            stats.filesScanned++;
            if (fs.existsSync(artifactPath)) {
                deleteFile(artifactPath, args.dryRun, stats, args.verbose);
            }
        }
        
        // Delete run directory if exists
        if (run.artifacts.runDir && fs.existsSync(run.artifacts.runDir)) {
            if (args.verbose) {
                console.log(`   Run directory: ${run.artifacts.runDir}`);
            }
            deleteDirectory(run.artifacts.runDir, args.dryRun, stats, args.verbose);
        }
    }
    
    // Remove runs from registry
    if (!args.dryRun) {
        const runIds = runsToRemove.map(r => r.runId);
        const removed = removeRunsFromRegistry(runIds);
        stats.runsRemoved = removed;
    } else {
        stats.runsRemoved = runsToRemove.length;
        console.log(`\n   [DRY-RUN] Would remove ${runsToRemove.length} runs from registry`);
    }
    
    return stats;
}

function cleanupOrphanedFiles(
    cutoffDate: Date | null,
    includeOutput: boolean,
    args: CliArgs
): CleanupStats {
    const stats: CleanupStats = {
        filesScanned: 0,
        filesDeleted: 0,
        bytesFreed: 0,
        runsRemoved: 0,
        errors: [],
    };
    
    console.log('\n🔍 Scanning for orphaned files...');
    
    // Scan each target directory
    const dirsToScan: Array<{ name: string; path: string }> = [
        { name: 'Benchmarks', path: TARGET_DIRS.benchmarks },
        { name: 'Run Summaries', path: TARGET_DIRS.runSummaries },
        { name: 'Narratives', path: TARGET_DIRS.narratives },
    ];
    
    if (includeOutput) {
        dirsToScan.push({ name: 'Output', path: TARGET_DIRS.output });
    }
    
    for (const dir of dirsToScan) {
        console.log(`\n   📁 ${dir.name}: ${dir.path}`);
        
        const files = findFilesToDelete(dir.path, cutoffDate, args.verbose);
        stats.filesScanned += files.length;
        
        if (files.length === 0) {
            console.log('      No files to clean');
            continue;
        }
        
        console.log(`      Found ${files.length} files to clean`);
        
        for (const file of files) {
            deleteFile(file, args.dryRun, stats, args.verbose);
        }
    }
    
    return stats;
}

// ============================================================================
// Main
// ============================================================================

function printHelp(): void {
    console.log(`
Run Cleanup Utility
===================

Prune old pipeline artifacts based on retention policy.
By default, operates in dry-run mode - no files are deleted.

Usage:
  npx tsx scripts/cleanup-runs.ts [options]

Options:
  --dry-run, -n        Show what would be deleted without deleting (default)
  --keep-last <N>      Keep the last N runs, delete older ones
  --keep-days <N>      Keep runs from the last N days
  --delete-run <id>    Delete a specific run by ID
  --include-output     Also clean the output/ directory
  --verbose, -v        Show detailed file operations
  --help, -h           Show this help message

Examples:
  # Preview cleanup keeping last 20 runs
  npx tsx scripts/cleanup-runs.ts --keep-last 20 --dry-run

  # Actually clean, keeping runs from last 7 days
  npx tsx scripts/cleanup-runs.ts --keep-days 7

  # Delete a specific run
  npx tsx scripts/cleanup-runs.ts --delete-run run-2025-12-01_12-00-00-abc123

Targets:
  - data/benchmarks/*.json
  - data/run-summaries/*.json
  - data/narratives/*.json
  - data/run-registry.json entries
  - output/ (only with --include-output)

Note: public/latest-* files are NOT touched.
`);
}

async function main(): Promise<void> {
    const args = parseArgs();
    
    if (args.help) {
        printHelp();
        return;
    }
    
    console.log('🧹 Run Cleanup Utility');
    console.log('======================');
    
    if (args.dryRun) {
        console.log('⚠️  DRY RUN MODE - No files will be deleted');
    }
    
    const registry = readRegistry();
    console.log(`📊 Registry contains ${registry.runs.length} runs`);
    
    let runsToRemove: RunRegistryEntry[] = [];
    let cutoffDate: Date | null = null;
    
    // Determine runs to remove
    if (args.deleteRun) {
        // Delete specific run
        const run = registry.runs.find(r => r.runId === args.deleteRun);
        if (run) {
            runsToRemove = [run];
            console.log(`\n🎯 Targeting specific run: ${args.deleteRun}`);
        } else {
            console.log(`❌ Run not found: ${args.deleteRun}`);
            process.exit(1);
        }
    } else if (args.keepLast !== undefined && args.keepLast > 0) {
        // Keep last N runs
        runsToRemove = getRunsBeyondLimit(args.keepLast);
        console.log(`\n📏 Keeping last ${args.keepLast} runs, removing ${runsToRemove.length}`);
    } else if (args.keepDays !== undefined && args.keepDays > 0) {
        // Keep runs from last N days
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - args.keepDays);
        runsToRemove = getRunsOlderThan(cutoffDate);
        console.log(`\n📅 Keeping runs from last ${args.keepDays} days, removing ${runsToRemove.length}`);
    } else {
        // No policy specified, just report
        console.log('\n⚠️  No cleanup policy specified. Use --keep-last or --keep-days.');
        console.log('   Use --help for usage information.');
        
        // Still show stats
        const now = Date.now();
        const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        
        const olderThanWeek = getRunsOlderThan(oneWeekAgo).length;
        const olderThanMonth = getRunsOlderThan(oneMonthAgo).length;
        
        console.log(`\n📊 Registry stats:`);
        console.log(`   Total runs: ${registry.runs.length}`);
        console.log(`   Older than 7 days: ${olderThanWeek}`);
        console.log(`   Older than 30 days: ${olderThanMonth}`);
        
        return;
    }
    
    // Perform cleanup
    const registryStats = cleanupByPolicy(runsToRemove, args);
    const orphanStats = cleanupOrphanedFiles(cutoffDate, args.includeOutput, args);
    
    // Summary
    const totalStats: CleanupStats = {
        filesScanned: registryStats.filesScanned + orphanStats.filesScanned,
        filesDeleted: registryStats.filesDeleted + orphanStats.filesDeleted,
        bytesFreed: registryStats.bytesFreed + orphanStats.bytesFreed,
        runsRemoved: registryStats.runsRemoved,
        errors: [...registryStats.errors, ...orphanStats.errors],
    };
    
    console.log('\n📊 Cleanup Summary:');
    console.log(`   Files scanned: ${totalStats.filesScanned}`);
    console.log(`   Files ${args.dryRun ? 'would be ' : ''}deleted: ${totalStats.filesDeleted}`);
    console.log(`   Space ${args.dryRun ? 'would be ' : ''}freed: ${formatBytes(totalStats.bytesFreed)}`);
    console.log(`   Runs ${args.dryRun ? 'would be ' : ''}removed: ${totalStats.runsRemoved}`);
    
    if (totalStats.errors.length > 0) {
        console.log('\n⚠️  Errors:');
        for (const error of totalStats.errors) {
            console.log(`   - ${error}`);
        }
    }
    
    if (args.dryRun && totalStats.filesDeleted > 0) {
        console.log('\n💡 To actually delete files, run without --dry-run');
    }
    
    console.log('\n✅ Cleanup complete');
}

main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
