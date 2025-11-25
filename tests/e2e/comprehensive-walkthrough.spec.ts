/**
 * Comprehensive Browser Walkthrough - Automated Critical Analysis
 * 
 * Executes the full manual walkthrough guide programmatically
 * Captures all errors, warnings, gaps, and issues for resolution
 */

import { test, expect, Page, ConsoleMessage, Request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initializeTest } from '../helpers/setup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_TIMEOUT = 900000; // 15 minutes
const STORY_GENERATION_TIMEOUT = 180000; // 3 minutes
const KEYFRAME_TIMEOUT = 180000; // 3 minutes
const VIDEO_TIMEOUT = 600000; // 10 minutes

interface Issue {
  id: string;
  phase: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'error' | 'warning' | 'gap' | 'performance' | 'ux' | 'network';
  description: string;
  details: any;
  timestamp: string;
}

interface PhaseMetrics {
  phase: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  issues: Issue[];
}

class CriticalAnalyzer {
  private issues: Issue[] = [];
  private consoleMessages: Array<{ type: string; text: string; timestamp: string }> = [];
  private networkRequests: Array<{ url: string; method: string; status?: number; timestamp: string }> = [];
  private phaseMetrics: PhaseMetrics[] = [];
  private currentPhase: PhaseMetrics | null = null;
  private reportDir: string;
  private issueCounter = 0;

  constructor(testName: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '-' + 
                     new Date().toTimeString().split(' ')[0].replace(/:/g, '');
    this.reportDir = path.join(__dirname, '..', '..', 'logs', `critical-analysis-${timestamp}`);
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
    console.log(`\n📁 Report directory: ${this.reportDir}\n`);
  }

  startPhase(phaseName: string) {
    if (this.currentPhase) {
      this.endPhase(false);
    }
    this.currentPhase = {
      phase: phaseName,
      startTime: Date.now(),
      success: false,
      issues: []
    };
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 PHASE: ${phaseName}`);
    console.log(`${'='.repeat(80)}\n`);
  }

  endPhase(success: boolean) {
    if (this.currentPhase) {
      this.currentPhase.endTime = Date.now();
      this.currentPhase.duration = this.currentPhase.endTime - this.currentPhase.startTime;
      this.currentPhase.success = success;
      this.phaseMetrics.push(this.currentPhase);
      
      const status = success ? '✅' : '❌';
      const duration = (this.currentPhase.duration / 1000).toFixed(2);
      console.log(`\n${status} Phase Complete: ${this.currentPhase.phase} (${duration}s)`);
      console.log(`   Issues Found: ${this.currentPhase.issues.length}\n`);
      
      this.currentPhase = null;
    }
  }

  addIssue(
    severity: Issue['severity'],
    category: Issue['category'],
    description: string,
    details: any = {}
  ) {
    this.issueCounter++;
    const issue: Issue = {
      id: `ISSUE-${String(this.issueCounter).padStart(4, '0')}`,
      phase: this.currentPhase?.phase || 'unknown',
      severity,
      category,
      description,
      details,
      timestamp: new Date().toISOString()
    };
    
    this.issues.push(issue);
    if (this.currentPhase) {
      this.currentPhase.issues.push(issue);
    }

    const icon = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️'
    }[severity];

    console.log(`${icon} [${severity.toUpperCase()}] ${issue.id}: ${description}`);
    if (Object.keys(details).length > 0) {
      console.log(`   Details:`, JSON.stringify(details, null, 2).split('\n').map(l => '   ' + l).join('\n'));
    }
  }

  recordConsole(msg: ConsoleMessage) {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    };
    this.consoleMessages.push(entry);

    if (msg.type() === 'error') {
      this.addIssue('high', 'error', `Console error: ${msg.text()}`, { location: msg.location() });
    } else if (msg.type() === 'warning' && !msg.text().includes('cdn.tailwindcss.com')) {
      this.addIssue('low', 'warning', `Console warning: ${msg.text()}`);
    }
  }

  recordNetworkRequest(request: Request) {
    const entry = {
      url: request.url(),
      method: request.method(),
      timestamp: new Date().toISOString()
    };
    this.networkRequests.push(entry);

    // Check for forbidden external AI services
    const forbiddenHosts = [
      'generativelanguage.googleapis.com',
      'api.openai.com',
      'api.anthropic.com'
    ];

    for (const host of forbiddenHosts) {
      if (request.url().includes(host)) {
        this.addIssue(
          'critical',
          'network',
          `Forbidden external API call detected: ${host}`,
          { url: request.url(), method: request.method() }
        );
      }
    }
  }

  async captureScreenshot(page: Page, name: string) {
    const screenshotPath = path.join(this.reportDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot: ${name}.png`);
  }

  async generateReport() {
    // Save console messages
    const consolePath = path.join(this.reportDir, 'console-messages.json');
    fs.writeFileSync(consolePath, JSON.stringify(this.consoleMessages, null, 2));

    // Save network requests
    const networkPath = path.join(this.reportDir, 'network-requests.json');
    fs.writeFileSync(networkPath, JSON.stringify(this.networkRequests, null, 2));

    // Generate issues summary
    const issuesBySeverity = {
      critical: this.issues.filter(i => i.severity === 'critical'),
      high: this.issues.filter(i => i.severity === 'high'),
      medium: this.issues.filter(i => i.severity === 'medium'),
      low: this.issues.filter(i => i.severity === 'low'),
      info: this.issues.filter(i => i.severity === 'info')
    };

    const issuesByCategory = {
      error: this.issues.filter(i => i.category === 'error'),
      warning: this.issues.filter(i => i.category === 'warning'),
      gap: this.issues.filter(i => i.category === 'gap'),
      performance: this.issues.filter(i => i.category === 'performance'),
      ux: this.issues.filter(i => i.category === 'ux'),
      network: this.issues.filter(i => i.category === 'network')
    };

    // Generate markdown report
    const report = this.generateMarkdownReport(issuesBySeverity, issuesByCategory);
    const reportPath = path.join(this.reportDir, 'CRITICAL_ANALYSIS_REPORT.md');
    fs.writeFileSync(reportPath, report);

    // Save raw data
    const dataPath = path.join(this.reportDir, 'analysis-data.json');
    fs.writeFileSync(dataPath, JSON.stringify({
      issues: this.issues,
      phaseMetrics: this.phaseMetrics,
      consoleMessages: this.consoleMessages,
      networkRequests: this.networkRequests,
      summary: {
        totalIssues: this.issues.length,
        criticalIssues: issuesBySeverity.critical.length,
        highIssues: issuesBySeverity.high.length,
        mediumIssues: issuesBySeverity.medium.length,
        lowIssues: issuesBySeverity.low.length,
        totalPhases: this.phaseMetrics.length,
        successfulPhases: this.phaseMetrics.filter(p => p.success).length
      }
    }, null, 2));

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 CRITICAL ANALYSIS COMPLETE`);
    console.log(`${'='.repeat(80)}`);
    console.log(`\n📁 Reports saved to: ${this.reportDir}`);
    console.log(`\n📋 Summary:`);
    console.log(`   Total Issues: ${this.issues.length}`);
    console.log(`   🔴 Critical: ${issuesBySeverity.critical.length}`);
    console.log(`   🟠 High: ${issuesBySeverity.high.length}`);
    console.log(`   🟡 Medium: ${issuesBySeverity.medium.length}`);
    console.log(`   🔵 Low: ${issuesBySeverity.low.length}`);
    console.log(`   ℹ️  Info: ${issuesBySeverity.info.length}`);
    console.log(`\n   Phases: ${this.phaseMetrics.filter(p => p.success).length}/${this.phaseMetrics.length} successful`);
    console.log(`\n📄 Full report: ${reportPath}\n`);

    return reportPath;
  }

  private generateMarkdownReport(issuesBySeverity: any, issuesByCategory: any): string {
    const totalDuration = this.phaseMetrics.reduce((sum, p) => sum + (p.duration || 0), 0);
    
    return `# Critical Analysis Report - gemDirect1 Browser Walkthrough

**Date**: ${new Date().toISOString()}  
**Total Duration**: ${(totalDuration / 1000).toFixed(2)}s  
**Total Issues**: ${this.issues.length}  
**Phases Tested**: ${this.phaseMetrics.length}

---

## Executive Summary

${this.generateExecutiveSummary(issuesBySeverity)}

---

## Issues by Severity

### 🔴 Critical Issues (${issuesBySeverity.critical.length})

${this.formatIssues(issuesBySeverity.critical)}

### 🟠 High Priority Issues (${issuesBySeverity.high.length})

${this.formatIssues(issuesBySeverity.high)}

### 🟡 Medium Priority Issues (${issuesBySeverity.medium.length})

${this.formatIssues(issuesBySeverity.medium)}

### 🔵 Low Priority Issues (${issuesBySeverity.low.length})

${this.formatIssues(issuesBySeverity.low)}

### ℹ️ Informational (${issuesBySeverity.info.length})

${this.formatIssues(issuesBySeverity.info)}

---

## Issues by Category

| Category | Count | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| Errors | ${issuesByCategory.error.length} | ${issuesByCategory.error.filter((i: Issue) => i.severity === 'critical').length} | ${issuesByCategory.error.filter((i: Issue) => i.severity === 'high').length} | ${issuesByCategory.error.filter((i: Issue) => i.severity === 'medium').length} | ${issuesByCategory.error.filter((i: Issue) => i.severity === 'low').length} |
| Warnings | ${issuesByCategory.warning.length} | ${issuesByCategory.warning.filter((i: Issue) => i.severity === 'critical').length} | ${issuesByCategory.warning.filter((i: Issue) => i.severity === 'high').length} | ${issuesByCategory.warning.filter((i: Issue) => i.severity === 'medium').length} | ${issuesByCategory.warning.filter((i: Issue) => i.severity === 'low').length} |
| Gaps | ${issuesByCategory.gap.length} | ${issuesByCategory.gap.filter((i: Issue) => i.severity === 'critical').length} | ${issuesByCategory.gap.filter((i: Issue) => i.severity === 'high').length} | ${issuesByCategory.gap.filter((i: Issue) => i.severity === 'medium').length} | ${issuesByCategory.gap.filter((i: Issue) => i.severity === 'low').length} |
| Performance | ${issuesByCategory.performance.length} | ${issuesByCategory.performance.filter((i: Issue) => i.severity === 'critical').length} | ${issuesByCategory.performance.filter((i: Issue) => i.severity === 'high').length} | ${issuesByCategory.performance.filter((i: Issue) => i.severity === 'medium').length} | ${issuesByCategory.performance.filter((i: Issue) => i.severity === 'low').length} |
| UX | ${issuesByCategory.ux.length} | ${issuesByCategory.ux.filter((i: Issue) => i.severity === 'critical').length} | ${issuesByCategory.ux.filter((i: Issue) => i.severity === 'high').length} | ${issuesByCategory.ux.filter((i: Issue) => i.severity === 'medium').length} | ${issuesByCategory.ux.filter((i: Issue) => i.severity === 'low').length} |
| Network | ${issuesByCategory.network.length} | ${issuesByCategory.network.filter((i: Issue) => i.severity === 'critical').length} | ${issuesByCategory.network.filter((i: Issue) => i.severity === 'high').length} | ${issuesByCategory.network.filter((i: Issue) => i.severity === 'medium').length} | ${issuesByCategory.network.filter((i: Issue) => i.severity === 'low').length} |

---

## Phase Performance

${this.formatPhaseMetrics()}

---

## Network Analysis

**Total Requests**: ${this.networkRequests.length}

### Requests by Host

${this.analyzeNetworkByHost()}

---

## Console Messages Summary

**Total Messages**: ${this.consoleMessages.length}
- Errors: ${this.consoleMessages.filter(m => m.type === 'error').length}
- Warnings: ${this.consoleMessages.filter(m => m.type === 'warning').length}
- Logs: ${this.consoleMessages.filter(m => m.type === 'log').length}

---

## Recommendations

${this.generateRecommendations(issuesBySeverity)}

---

## Next Steps for Resolution

${this.generateResolutionSteps(issuesBySeverity, issuesByCategory)}

---

**Files Generated**:
- \`CRITICAL_ANALYSIS_REPORT.md\` - This report
- \`analysis-data.json\` - Raw analysis data
- \`console-messages.json\` - All console messages
- \`network-requests.json\` - All network requests
- \`*.png\` - Screenshots from each phase

**Analysis Complete**: ${new Date().toISOString()}
`;
  }

  private generateExecutiveSummary(issuesBySeverity: any): string {
    const critical = issuesBySeverity.critical.length;
    const high = issuesBySeverity.high.length;
    
    if (critical > 0) {
      return `⚠️ **CRITICAL ISSUES DETECTED**: ${critical} critical issue(s) require immediate attention. These issues may prevent core functionality from working correctly.`;
    } else if (high > 0) {
      return `⚠️ **HIGH PRIORITY ISSUES**: ${high} high-priority issue(s) identified. These should be addressed before production deployment.`;
    } else {
      return `✅ **NO CRITICAL ISSUES**: The application appears to be functioning within acceptable parameters. ${this.issues.length} minor issues identified for improvement.`;
    }
  }

  private formatIssues(issues: Issue[]): string {
    if (issues.length === 0) {
      return '*None found*\n';
    }
    
    return issues.map(issue => `
#### ${issue.id} - ${issue.description}

- **Phase**: ${issue.phase}
- **Category**: ${issue.category}
- **Timestamp**: ${issue.timestamp}
${Object.keys(issue.details).length > 0 ? `- **Details**: \`\`\`json\n${JSON.stringify(issue.details, null, 2)}\n\`\`\`` : ''}
`).join('\n');
  }

  private formatPhaseMetrics(): string {
    return this.phaseMetrics.map(phase => {
      const duration = phase.duration ? (phase.duration / 1000).toFixed(2) : 'N/A';
      const status = phase.success ? '✅' : '❌';
      return `### ${status} ${phase.phase}\n\n- **Duration**: ${duration}s\n- **Issues**: ${phase.issues.length}\n`;
    }).join('\n');
  }

  private analyzeNetworkByHost(): string {
    const hostCounts = new Map<string, number>();
    
    this.networkRequests.forEach(req => {
      try {
        const url = new URL(req.url);
        const host = url.hostname + (url.port ? ':' + url.port : '');
        hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
      } catch (e) {
        // Invalid URL
      }
    });

    const sorted = Array.from(hostCounts.entries()).sort((a, b) => b[1] - a[1]);
    
    return sorted.map(([host, count]) => `- \`${host}\`: ${count} request(s)`).join('\n');
  }

  private generateRecommendations(issuesBySeverity: any): string {
    const recommendations: string[] = [];

    if (issuesBySeverity.critical.length > 0) {
      recommendations.push('1. **URGENT**: Address all critical issues immediately before further testing');
    }
    
    if (issuesBySeverity.high.length > 0) {
      recommendations.push(`${recommendations.length + 1}. Prioritize resolution of ${issuesBySeverity.high.length} high-priority issues`);
    }

    if (this.issues.filter((i: Issue) => i.category === 'network').length > 0) {
      recommendations.push(`${recommendations.length + 1}. Review network isolation - external API calls detected`);
    }

    if (this.consoleMessages.filter(m => m.type === 'error').length > 5) {
      recommendations.push(`${recommendations.length + 1}. Investigate console errors - ${this.consoleMessages.filter(m => m.type === 'error').length} errors logged`);
    }

    if (recommendations.length === 0) {
      recommendations.push('1. Continue monitoring application behavior during extended use');
      recommendations.push('2. Consider performance optimization for slower operations');
      recommendations.push('3. Enhance error handling and user feedback mechanisms');
    }

    return recommendations.join('\n');
  }

  private generateResolutionSteps(issuesBySeverity: any, issuesByCategory: any): string {
    const steps: string[] = [];
    
    steps.push('### Immediate Actions (Priority 1)\n');
    if (issuesBySeverity.critical.length > 0) {
      issuesBySeverity.critical.forEach((issue: Issue) => {
        steps.push(`- [ ] **${issue.id}**: ${issue.description}`);
      });
    } else {
      steps.push('*No critical issues - proceed to high priority*\n');
    }

    steps.push('\n### High Priority (Priority 2)\n');
    if (issuesBySeverity.high.length > 0) {
      issuesBySeverity.high.slice(0, 5).forEach((issue: Issue) => {
        steps.push(`- [ ] **${issue.id}**: ${issue.description}`);
      });
      if (issuesBySeverity.high.length > 5) {
        steps.push(`- [ ] ... and ${issuesBySeverity.high.length - 5} more high-priority issues`);
      }
    } else {
      steps.push('*No high-priority issues*\n');
    }

    steps.push('\n### Medium Priority (Priority 3)\n');
    steps.push(`- Review ${issuesBySeverity.medium.length} medium-priority issues in detail`);
    steps.push(`- Address UX concerns: ${issuesByCategory.ux.length} issue(s)`);
    steps.push(`- Optimize performance: ${issuesByCategory.performance.length} issue(s)`);

    return steps.join('\n');
  }
}

test.describe('Comprehensive Browser Walkthrough - Critical Analysis', () => {
  test.setTimeout(TEST_TIMEOUT);
  let analyzer: CriticalAnalyzer;

  test.beforeEach(async ({ page }) => {
    analyzer = new CriticalAnalyzer('comprehensive-walkthrough');
    
    // Setup listeners
    page.on('console', msg => analyzer.recordConsole(msg));
    page.on('request', req => analyzer.recordNetworkRequest(req));
    page.on('requestfailed', req => {
      analyzer.addIssue('medium', 'network', `Network request failed: ${req.url()}`, {
        url: req.url(),
        method: req.method(),
        failure: req.failure()?.errorText
      });
    });
  });

  test.skip('Execute full walkthrough with critical analysis', async ({ page }) => {
    // SKIP: This test requires full LLM generation pipeline (180s+) and is too long for standard CI runs.
    // Run manually with: RUN_MANUAL_E2E=1 npx playwright test comprehensive-walkthrough
    try {
      // ============================================================
      // PHASE 1: Initial Load & Settings
      // ============================================================
      analyzer.startPhase('Phase 1: Initial Load & Settings');
      
      const loadStart = Date.now();
      // Use helper to ensure deterministic initialization
      await initializeTest(page);
      const loadTime = Date.now() - loadStart;
      
      console.log(`⏱️  Page loaded in ${loadTime}ms`);
      
      if (loadTime > 2000) {
        analyzer.addIssue('medium', 'performance', 'Page load time exceeds 2 second target', {
          loadTime: `${loadTime}ms`,
          target: '2000ms'
        });
      } else {
        analyzer.addIssue('info', 'performance', `Page load time: ${loadTime}ms (within target)`);
      }

      await analyzer.captureScreenshot(page, 'phase1-01-initial-load');

      // Welcome modal already handled by initializeTest
      await analyzer.captureScreenshot(page, 'phase1-03-after-welcome');

      // Try to open Settings
      try {
        const settingsButton = page.locator('button[aria-label="Open settings"], button:has-text("Settings")').first();
        await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
        await settingsButton.click();
        await page.waitForTimeout(1000);
        
        console.log('✅ Settings modal opened');
        await analyzer.captureScreenshot(page, 'phase1-04-settings-open');

        // Verify ComfyUI URL field
        const comfyUIInput = page.locator('input[value*="8188"], input[placeholder*="ComfyUI"]').first();
        if (await comfyUIInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          const comfyUIValue = await comfyUIInput.inputValue();
          console.log(`✅ ComfyUI URL: ${comfyUIValue}`);
          if (!comfyUIValue.includes('8188')) {
            analyzer.addIssue('high', 'gap', 'ComfyUI URL does not include expected port 8188', { value: comfyUIValue });
          }
        } else {
          analyzer.addIssue('medium', 'gap', 'ComfyUI URL input not found in Settings');
        }

        // Close settings via close button with testid verification
        const closeButton = page.locator('button[aria-label="Close settings"]').first();
        if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeButton.click();
          // Wait for modal to be hidden
          await page.locator('[data-testid="LocalGenerationSettingsModal"]').waitFor({ state: 'hidden', timeout: 3000 });
          console.log('✅ Settings closed');
        } else {
          // Fallback: press Escape if close button not found
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          console.log('✅ Settings closed (via Escape)');
        }
        
      } catch (e) {
        analyzer.addIssue('high', 'error', 'Failed to open or interact with Settings modal', { error: String(e) });
      }

      analyzer.endPhase(true);

      // ============================================================
      // PHASE 2: Story Generation
      // ============================================================
      analyzer.startPhase('Phase 2: Story Generation');

      const storyIdea = `A quantum physicist discovers a parallel universe where causality runs backwards - ${Date.now()}`;
      
      // Find and fill story idea input
      try {
        // Ensure modal is fully hidden before interacting with form
        const settingsModal = page.locator('[data-testid="LocalGenerationSettingsModal"]');
        const isModalVisible = await settingsModal.isVisible({ timeout: 1000 }).catch(() => false);
        if (isModalVisible) {
          await settingsModal.waitFor({ state: 'hidden', timeout: 5000 });
        }
        
        const storyInput = page.getByTestId('story-idea-input');
        await storyInput.waitFor({ state: 'visible', timeout: 10000 });
        await storyInput.fill(storyIdea);
        console.log(`✅ Story idea entered`);
        await analyzer.captureScreenshot(page, 'phase2-01-story-entered');
      } catch (e) {
        analyzer.addIssue('critical', 'gap', 'Story idea input field not found', { error: String(e) });
        analyzer.endPhase(false);
        throw e;
      }

      // Select genre if available
      try {
        const genreSelect = page.locator('select[id*="genre" i], select[name*="genre" i]').first();
        if (await genreSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
          await genreSelect.selectOption('sci-fi');
          console.log('✅ Genre selected: sci-fi');
        }
      } catch (e) {
        analyzer.addIssue('low', 'gap', 'Genre selector not found or not functional');
      }

      // Generate story
      try {
        const generateButton = page.locator('button:has-text("Generate Story"), button:has-text("Generate")').first();
        await generateButton.waitFor({ state: 'visible', timeout: 5000 });
        
        const storyGenStart = Date.now();
        await generateButton.click();
        console.log('⏳ Generating story...');

        // Wait for story generation indicators
        await page.waitForSelector('text=/logline|premise|character|setting/i', { timeout: STORY_GENERATION_TIMEOUT });
        
        const storyGenTime = Date.now() - storyGenStart;
        console.log(`✅ Story generated in ${(storyGenTime / 1000).toFixed(1)}s`);
        
        if (storyGenTime > 90000) {
          analyzer.addIssue('medium', 'performance', 'Story generation exceeded 90 second threshold', {
            duration: `${(storyGenTime / 1000).toFixed(1)}s`,
            threshold: '90s'
          });
        }

        await analyzer.captureScreenshot(page, 'phase2-02-story-generated');

        // Verify all 6 sections
        const sections = [
          { name: 'Logline/Premise', selector: 'text=/logline|premise/i' },
          { name: 'Characters', selector: 'text=/character/i' },
          { name: 'Setting', selector: 'text=/setting/i' },
          { name: 'Plot Structure', selector: 'text=/plot|structure|outline/i' },
          { name: 'Scenes', selector: 'text=/scene/i' },
          { name: 'Themes', selector: 'text=/theme|dialogue/i' }
        ];

        let sectionsFound = 0;
        for (const section of sections) {
          const count = await page.locator(section.selector).count();
          if (count > 0) {
            console.log(`✅ Section found: ${section.name}`);
            sectionsFound++;
          } else {
            analyzer.addIssue('high', 'gap', `Story section missing: ${section.name}`);
          }
        }

        if (sectionsFound < 6) {
          analyzer.addIssue('high', 'gap', `Incomplete story generation: ${sectionsFound}/6 sections found`);
        } else {
          console.log(`✅ All 6 story sections present`);
        }

        analyzer.endPhase(sectionsFound >= 4); // At least 4/6 sections

      } catch (e) {
        analyzer.addIssue('critical', 'error', 'Story generation failed', { error: String(e) });
        await analyzer.captureScreenshot(page, 'phase2-error-story-generation');
        analyzer.endPhase(false);
        throw e;
      }

      // ============================================================
      // PHASE 3: Director's Vision & Scenes
      // ============================================================
      analyzer.startPhase('Phase 3: Directors Vision & Scenes');

      try {
        // Find director's vision input
        const visionInput = page.locator('textarea[placeholder*="vision" i], textarea[label*="vision" i]').first();
        
        if (await visionInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await visionInput.fill('Emphasize temporal paradoxes through non-linear narrative structure and dreamlike visuals');
          console.log('✅ Directors vision entered');
          await analyzer.captureScreenshot(page, 'phase3-01-vision-entered');
        } else {
          analyzer.addIssue('medium', 'gap', 'Directors vision input not found');
        }

        // Try to generate scenes
        const generateScenesButton = page.locator('button:has-text("Generate Scenes"), button:has-text("Create Scenes")').first();
        
        if (await generateScenesButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          const scenesGenStart = Date.now();
          await generateScenesButton.click();
          console.log('⏳ Generating scenes...');

          // Wait for scenes to appear
          await page.waitForSelector('[data-testid*="scene"], .scene-item, text=/Scene \\d+/i', { timeout: STORY_GENERATION_TIMEOUT });
          
          const scenesGenTime = Date.now() - scenesGenStart;
          console.log(`✅ Scenes generated in ${(scenesGenTime / 1000).toFixed(1)}s`);
          
          await analyzer.captureScreenshot(page, 'phase3-02-scenes-generated');

          // Count scenes
          const sceneCount = await page.locator('[data-testid*="scene"], .scene-item, text=/Scene \\d+/i').count();
          console.log(`✅ Found ${sceneCount} scene(s)`);
          
          if (sceneCount === 0) {
            analyzer.addIssue('high', 'gap', 'No scenes generated or scenes not displayed in UI');
          }

          analyzer.endPhase(sceneCount > 0);
        } else {
          analyzer.addIssue('medium', 'gap', 'Generate Scenes button not found - scenes may auto-generate');
          analyzer.endPhase(true); // Not critical
        }

      } catch (e) {
        analyzer.addIssue('high', 'error', 'Scene generation phase failed', { error: String(e) });
        await analyzer.captureScreenshot(page, 'phase3-error-scene-generation');
        analyzer.endPhase(false);
      }

      // ============================================================
      // PHASE 4: AI Enhancements (InspireMeNow)
      // ============================================================
      analyzer.startPhase('Phase 4: AI Enhancements');

      try {
        const coDirectorButton = page.locator('button:has-text("Co-Director"), button:has-text("Inspire"), button:has-text("AI Assistant")').first();
        
        if (await coDirectorButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await coDirectorButton.click();
          await page.waitForTimeout(1000);
          console.log('✅ Co-Director panel opened');
          await analyzer.captureScreenshot(page, 'phase4-01-co-director-open');

          // Try to request suggestions
          const requestButton = page.locator('button:has-text("Inspire"), button:has-text("Generate"), button:has-text("Request")').first();
          
          if (await requestButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await requestButton.click();
            console.log('⏳ Requesting AI suggestions...');
            await page.waitForTimeout(5000);

            const suggestionCount = await page.locator('[data-testid*="suggestion"], .suggestion').count();
            console.log(`✅ Found ${suggestionCount} suggestion(s)`);
            
            if (suggestionCount === 0) {
              analyzer.addIssue('medium', 'gap', 'No AI suggestions generated');
            }

            await analyzer.captureScreenshot(page, 'phase4-02-suggestions');
          } else {
            analyzer.addIssue('low', 'gap', 'Request suggestions button not found');
          }

          analyzer.endPhase(true);
        } else {
          analyzer.addIssue('low', 'gap', 'Co-Director/InspireMeNow feature not found in UI');
          analyzer.endPhase(true); // Optional feature
        }

      } catch (e) {
        analyzer.addIssue('medium', 'error', 'AI enhancements phase failed', { error: String(e) });
        await analyzer.captureScreenshot(page, 'phase4-error');
        analyzer.endPhase(false);
      }

      // ============================================================
      // PHASE 5: Keyframe Generation (WAN T2I)
      // ============================================================
      analyzer.startPhase('Phase 5: Keyframe Generation (WAN T2I)');

      try {
        // Try to select first scene
        const firstScene = page.locator('[data-testid*="scene"], .scene-item, text=/Scene 1/i').first();
        
        if (await firstScene.isVisible({ timeout: 5000 }).catch(() => false)) {
          await firstScene.click();
          await page.waitForTimeout(1000);
          console.log('✅ First scene selected');
          await analyzer.captureScreenshot(page, 'phase5-01-scene-selected');
        }

        // Find keyframe generation button
        const keyframeButton = page.locator('button:text-matches("Generate \\d+ Keyframes?")').first();
        
        if (await keyframeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          const keyframeStart = Date.now();
          await keyframeButton.click();
          console.log('⏳ Generating keyframe (WAN T2I)...');

          // Wait for image to appear
          await page.waitForSelector('img[src*="data:image"], img[src*="blob:"], [data-testid*="keyframe" i]', { timeout: KEYFRAME_TIMEOUT });
          
          const keyframeTime = Date.now() - keyframeStart;
          console.log(`✅ Keyframe generated in ${(keyframeTime / 1000).toFixed(1)}s`);
          
          if (keyframeTime > 120000) {
            analyzer.addIssue('medium', 'performance', 'Keyframe generation exceeded 2 minute threshold', {
              duration: `${(keyframeTime / 1000).toFixed(1)}s`,
              threshold: '120s'
            });
          }

          await analyzer.captureScreenshot(page, 'phase5-02-keyframe-generated');

          // Verify image exists
          const imageCount = await page.locator('img[src*="data:image"], img[src*="blob:"]').count();
          if (imageCount > 0) {
            console.log(`✅ Keyframe image displayed (${imageCount} image(s) found)`);
          } else {
            analyzer.addIssue('high', 'gap', 'Keyframe image not displayed in UI after generation');
          }

          analyzer.endPhase(imageCount > 0);
        } else {
          analyzer.addIssue('high', 'gap', 'Generate Keyframe button not found - cannot test WAN T2I workflow');
          await analyzer.captureScreenshot(page, 'phase5-error-no-button');
          analyzer.endPhase(false);
        }

      } catch (e) {
        analyzer.addIssue('critical', 'error', 'Keyframe generation failed', { error: String(e) });
        await analyzer.captureScreenshot(page, 'phase5-error-keyframe-generation');
        analyzer.endPhase(false);
      }

      // ============================================================
      // PHASE 6: Video Generation (WAN I2V)
      // ============================================================
      analyzer.startPhase('Phase 6: Video Generation (WAN I2V)');

      try {
        // Find video generation button
        const videoButton = page.locator('button:has-text("Generate Video"), button:has-text("Create Video"), button:has-text("Generate Animation")').first();
        
        if (await videoButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          const videoStart = Date.now();
          await videoButton.click();
          console.log('⏳ Generating video (WAN I2V)... This may take several minutes');

          // Wait for video or completion indicator
          await page.waitForSelector('video, [href*=".mp4"], [data-testid*="video"], text=/video complete|frames/i', { timeout: VIDEO_TIMEOUT });
          
          const videoTime = Date.now() - videoStart;
          console.log(`✅ Video generated in ${(videoTime / 1000).toFixed(1)}s`);
          
          if (videoTime > 300000) {
            analyzer.addIssue('medium', 'performance', 'Video generation exceeded 5 minute threshold', {
              duration: `${(videoTime / 1000).toFixed(1)}s`,
              threshold: '300s'
            });
          }

          await analyzer.captureScreenshot(page, 'phase6-01-video-generated');

          // Verify video element
          const videoCount = await page.locator('video').count();
          const videoLinkCount = await page.locator('[href*=".mp4"]').count();
          
          if (videoCount > 0 || videoLinkCount > 0) {
            console.log(`✅ Video output detected (${videoCount} video element(s), ${videoLinkCount} link(s))`);
          } else {
            analyzer.addIssue('high', 'gap', 'Video not displayed after generation completion');
          }

          analyzer.endPhase(videoCount > 0 || videoLinkCount > 0);
        } else {
          analyzer.addIssue('high', 'gap', 'Generate Video button not found - cannot test WAN I2V workflow');
          await analyzer.captureScreenshot(page, 'phase6-error-no-button');
          analyzer.endPhase(false);
        }

      } catch (e) {
        analyzer.addIssue('critical', 'error', 'Video generation failed', { error: String(e) });
        await analyzer.captureScreenshot(page, 'phase6-error-video-generation');
        analyzer.endPhase(false);
      }

      // ============================================================
      // PHASE 7: Coherence Review & Gating
      // ============================================================
      analyzer.startPhase('Phase 7: Coherence Review & Gating');

      try {
        const reviewButton = page.locator('button:has-text("Review"), button:has-text("Coherence"), button:has-text("Analyze")').first();
        
        if (await reviewButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await reviewButton.click();
          console.log('⏳ Running coherence review...');
          await page.waitForTimeout(10000);

          await analyzer.captureScreenshot(page, 'phase7-01-coherence-review');

          // Look for coherence score
          const scoreText = await page.locator('text=/score|coherence.*\\d+/i').first().textContent({ timeout: 5000 }).catch(() => null);
          
          if (scoreText) {
            console.log(`✅ Coherence score found: ${scoreText}`);
            
            // Check if gate is enforced
            const finalButton = page.locator('button:has-text("Mark Final"), button:has-text("Accept"), button:has-text("Finalize")').first();
            const isEnabled = await finalButton.isEnabled({ timeout: 2000 }).catch(() => false);
            
            console.log(`${isEnabled ? '✅' : '⚠️'} "Mark Final" button ${isEnabled ? 'enabled' : 'disabled'}`);
            
            // Extract numeric score
            const scoreMatch = scoreText.match(/(\d+\.?\d*)/);
            if (scoreMatch) {
              const score = parseFloat(scoreMatch[1]);
              const normalizedScore = score > 1 ? score / 100 : score;
              
              if (normalizedScore < 0.7 && isEnabled) {
                analyzer.addIssue('critical', 'gap', 'Coherence gate NOT enforcing 0.7 threshold - button enabled despite low score', {
                  score: normalizedScore,
                  threshold: 0.7,
                  buttonEnabled: isEnabled
                });
              } else if (normalizedScore >= 0.7 && !isEnabled) {
                analyzer.addIssue('medium', 'gap', 'Coherence gate may be too strict - button disabled despite passing score', {
                  score: normalizedScore,
                  threshold: 0.7,
                  buttonEnabled: isEnabled
                });
              } else {
                console.log(`✅ Coherence gate appears to be functioning correctly`);
              }
            }
          } else {
            analyzer.addIssue('high', 'gap', 'Coherence score not displayed after review');
          }

          analyzer.endPhase(scoreText !== null);
        } else {
          analyzer.addIssue('medium', 'gap', 'Coherence review feature not found in UI');
          await analyzer.captureScreenshot(page, 'phase7-error-no-button');
          analyzer.endPhase(false);
        }

      } catch (e) {
        analyzer.addIssue('high', 'error', 'Coherence review phase failed', { error: String(e) });
        await analyzer.captureScreenshot(page, 'phase7-error');
        analyzer.endPhase(false);
      }

      // ============================================================
      // PHASE 8: Persistence & Export/Import
      // ============================================================
      analyzer.startPhase('Phase 8: Persistence & Export/Import');

      try {
        // Test export
        const exportButton = page.locator('button:has-text("Export"), [data-testid*="export"]').first();
        
        if (await exportButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
          await exportButton.click();
          console.log('⏳ Exporting project...');

          try {
            const download = await downloadPromise;
            const exportPath = path.join(analyzer['reportDir'], 'exported-project.json');
            await download.saveAs(exportPath);
            console.log(`✅ Project exported: ${exportPath}`);
            
            await analyzer.captureScreenshot(page, 'phase8-01-exported');

            // Test reload persistence
            console.log('⏳ Reloading page to test persistence...');
            await page.reload();
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000);

            await analyzer.captureScreenshot(page, 'phase8-02-after-reload');

            // Check if story data persisted
            const storyExists = await page.locator('text=/logline|premise|quantum|character/i').count();
            
            if (storyExists > 0) {
              console.log('✅ Data persisted after page reload');
            } else {
              analyzer.addIssue('high', 'gap', 'Data did not persist after page reload - IndexedDB may not be working');
            }

            // Test import
            const importButton = page.locator('button:has-text("Import"), input[type="file"]').first();
            
            if (await importButton.isVisible({ timeout: 5000 }).catch(() => false)) {
              const inputType = await importButton.getAttribute('type');
              
              if (inputType === 'file') {
                await importButton.setInputFiles(exportPath);
                console.log('⏳ Importing project...');
                await page.waitForTimeout(3000);
                
                const importedData = await page.locator('text=/logline|premise|quantum/i').count();
                
                if (importedData > 0) {
                  console.log('✅ Project imported successfully');
                } else {
                  analyzer.addIssue('high', 'gap', 'Project import did not restore data');
                }

                await analyzer.captureScreenshot(page, 'phase8-03-after-import');
              }
            } else {
              analyzer.addIssue('low', 'gap', 'Import functionality not found');
            }

            analyzer.endPhase(storyExists > 0);
          } catch (e) {
            analyzer.addIssue('medium', 'error', 'Export download failed', { error: String(e) });
            analyzer.endPhase(false);
          }
        } else {
          analyzer.addIssue('medium', 'gap', 'Export button not found');
          await analyzer.captureScreenshot(page, 'phase8-error-no-export');
          analyzer.endPhase(false);
        }

      } catch (e) {
        analyzer.addIssue('high', 'error', 'Persistence/Export phase failed', { error: String(e) });
        await analyzer.captureScreenshot(page, 'phase8-error');
        analyzer.endPhase(false);
      }

      // ============================================================
      // FINAL: Generate Report
      // ============================================================
      await analyzer.captureScreenshot(page, 'final-state');

      const reportPath = await analyzer.generateReport();
      
      console.log(`\n✅ Critical analysis complete!`);
      console.log(`📄 Full report: ${reportPath}\n`);

    } catch (error) {
      console.error('❌ Test failed with error:', error);
      await analyzer.captureScreenshot(page, 'critical-error');
      throw error;
    }
  });
});
