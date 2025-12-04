/**
 * ReportGenerator - Generates project health reports
 * Creates JSON and console-friendly reports of current issues
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Issue, Report, AgentConfig, IssueSeverity, IssueCategory } from '../core/types.js';
import { StateManager } from '../core/StateManager.js';
import { getLogger } from '../core/Logger.js';

export class ReportGenerator {
  private readonly version = '1.0.0';

  constructor(
    private config: AgentConfig,
    private stateManager: StateManager
  ) {}

  async generate(): Promise<Report> {
    const issues = this.stateManager.getUnresolvedIssues();
    const recentFixes = this.stateManager.getRecentFixes(20);

    const report: Report = {
      generatedAt: new Date(),
      agentVersion: this.version,
      summary: {
        total: issues.length,
        bySeverity: this.countBySeverity(issues),
        byCategory: this.countByCategory(issues),
        autoFixable: issues.filter(i => i.autoFixable).length,
        fixed: recentFixes.filter(f => f.success).length,
        queued: this.stateManager.getQueueItems().length,
      },
      issues,
      recentFixes,
    };

    // Save to file
    await this.saveReport(report);

    // Log summary
    this.logSummary(report);

    return report;
  }

  private countBySeverity(issues: Issue[]): Record<IssueSeverity, number> {
    const counts: Record<IssueSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const issue of issues) {
      counts[issue.severity]++;
    }

    return counts;
  }

  private countByCategory(issues: Issue[]): Record<IssueCategory, number> {
    const counts: Record<IssueCategory, number> = {
      typescript: 0,
      test: 0,
      lint: 0,
      build: 0,
      doc: 0,
      perf: 0,
      security: 0,
      'service-layer': 0,
      'e2e-quality': 0,
    };

    for (const issue of issues) {
      counts[issue.category]++;
    }

    return counts;
  }

  private async saveReport(report: Report): Promise<void> {
    const reportsDir = path.join(this.config.projectRoot, this.config.reportsDir);
    fs.mkdirSync(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `report-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');

    // Also save as latest.json for easy access
    const latestPath = path.join(reportsDir, 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), 'utf-8');

    getLogger().info(`Report saved: ${filename}`);
  }

  private logSummary(report: Report): void {
    const logger = getLogger();

    logger.section('PROJECT GUARDIAN REPORT');

    console.log(`  Generated: ${report.generatedAt.toISOString()}`);
    console.log(`  Agent Version: ${report.agentVersion}`);
    console.log('');
    console.log('  📊 SUMMARY');
    console.log('  ' + '─'.repeat(40));
    console.log(`  Total Issues:     ${report.summary.total}`);
    console.log(`  🚨 Critical:      ${report.summary.bySeverity.critical}`);
    console.log(`  ⚠️  High:         ${report.summary.bySeverity.high}`);
    console.log(`  📝 Medium:        ${report.summary.bySeverity.medium}`);
    console.log(`  ℹ️  Low:          ${report.summary.bySeverity.low}`);
    console.log(`  🔧 Auto-fixable:  ${report.summary.autoFixable}`);
    console.log(`  ✅ Recently fixed: ${report.summary.fixed}`);
    console.log(`  📬 Queued:        ${report.summary.queued}`);
    console.log('');
    console.log('  📁 BY CATEGORY');
    console.log('  ' + '─'.repeat(40));

    for (const [category, count] of Object.entries(report.summary.byCategory)) {
      if (count > 0) {
        console.log(`  ${category.padEnd(15)} ${count}`);
      }
    }

    if (report.issues.length > 0) {
      console.log('');
      console.log('  🔍 TOP ISSUES');
      console.log('  ' + '─'.repeat(40));

      const topIssues = report.issues
        .filter(i => i.severity === 'critical' || i.severity === 'high')
        .slice(0, 5);

      for (const issue of topIssues) {
        const icon = issue.severity === 'critical' ? '🚨' : '⚠️';
        console.log(`\n  ${icon} [${issue.category}] ${issue.message.substring(0, 60)}${issue.message.length > 60 ? '...' : ''}`);
        if (issue.file) {
          console.log(`     📄 ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
        }
      }
    }

    console.log('\n  ' + '═'.repeat(60) + '\n');
  }

  async getLatestReport(): Promise<Report | null> {
    const latestPath = path.join(this.config.projectRoot, this.config.reportsDir, 'latest.json');
    
    try {
      if (!fs.existsSync(latestPath)) {
        return null;
      }

      const content = fs.readFileSync(latestPath, 'utf-8');
      const data = JSON.parse(content);

      return {
        ...data,
        generatedAt: new Date(data.generatedAt),
        issues: data.issues.map((i: Issue) => ({
          ...i,
          timestamp: new Date(i.timestamp),
          resolvedAt: i.resolvedAt ? new Date(i.resolvedAt) : undefined,
        })),
        recentFixes: data.recentFixes.map((f: any) => ({
          ...f,
          timestamp: new Date(f.timestamp),
        })),
      };
    } catch {
      return null;
    }
  }

  printReport(report: Report): void {
    this.logSummary(report);
  }
}
