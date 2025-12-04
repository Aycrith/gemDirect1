/**
 * E2EAuditTaskRunner - Task runner for E2E Quality & Coherence Audits
 * 
 * Orchestrates the full audit workflow and generates deliverables:
 * - Data flow documentation
 * - Validation & guardrail audit report
 * - Bookend workflow report
 * - Prompt & story coherence guidelines
 * - Test matrix & results
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AgentConfig, ScanResult, E2EQualityIssue } from '../core/types.js';
import { StateManager } from '../core/StateManager.js';
import { E2EQualityWatcher, generateE2EAuditReport } from '../watchers/E2EQualityWatcher.js';
import { getLogger } from '../core/Logger.js';

export interface E2EAuditResult {
  scanResult: ScanResult;
  reports: {
    dataFlow: string;
    validation: string;
    bookends: string;
    coherence: string;
    testMatrix: string;
    summary: string;
  };
  savedTo: string[];
}

export class E2EAuditTaskRunner {
  private watcher: E2EQualityWatcher;
  private reportsDir: string;

  constructor(
    config: AgentConfig,
    private stateManager: StateManager
  ) {
    this.watcher = new E2EQualityWatcher(config);
    this.reportsDir = path.join(config.projectRoot, 'agent', 'reports', 'e2e-audit');
  }

  /**
   * Run the full E2E audit and generate all deliverables
   */
  async runFullAudit(): Promise<E2EAuditResult> {
    const logger = getLogger();
    
    logger.section('E2E QUALITY & COHERENCE AUDIT');
    logger.info('Starting comprehensive pipeline audit...');

    // Ensure reports directory exists
    fs.mkdirSync(this.reportsDir, { recursive: true });

    // Run the scan
    const scanResult = await this.watcher.scan();

    // Add issues to state manager
    for (const issue of scanResult.issuesFound) {
      this.stateManager.addIssue(issue);
    }

    // Generate reports
    const reports = {
      dataFlow: this.generateDataFlowReport(scanResult),
      validation: this.generateValidationReport(scanResult),
      bookends: this.generateBookendReport(scanResult),
      coherence: this.generateCoherenceReport(scanResult),
      testMatrix: this.generateTestMatrix(scanResult),
      summary: generateE2EAuditReport(scanResult),
    };

    // Save reports
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const savedTo: string[] = [];

    const reportFiles: [string, string][] = [
      ['data-flow', reports.dataFlow],
      ['validation', reports.validation],
      ['bookends', reports.bookends],
      ['coherence', reports.coherence],
      ['test-matrix', reports.testMatrix],
      ['summary', reports.summary],
    ];

    for (const [name, content] of reportFiles) {
      const filename = `${name}-${timestamp}.md`;
      const filepath = path.join(this.reportsDir, filename);
      fs.writeFileSync(filepath, content, 'utf-8');
      savedTo.push(filepath);
    }

    // Save latest versions
    for (const [name, content] of reportFiles) {
      const latestPath = path.join(this.reportsDir, `${name}-latest.md`);
      fs.writeFileSync(latestPath, content, 'utf-8');
    }

    // Log summary
    this.logAuditSummary(scanResult);

    return {
      scanResult,
      reports,
      savedTo,
    };
  }

  /**
   * Generate data flow documentation
   */
  private generateDataFlowReport(scanResult: ScanResult): string {
    const issues = scanResult.issuesFound as E2EQualityIssue[];
    const dataFlowIssues = issues.filter(i => 
      i.message.includes('pipeline') || 
      i.message.includes('data flow') ||
      i.message.includes('Missing pipeline file')
    );

    return `# Data Flow Documentation

## Pipeline Overview

The CSG pipeline consists of 7 stages:

\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│ Story Idea  │ ──▶ │ Story Bible │ ──▶ │ Director Vision │
└─────────────┘     └─────────────┘     └─────────────────┘
                                                  │
                    ┌─────────────────────────────┘
                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Scenes    │ ──▶ │    Shots    │ ──▶ │  Keyframes  │
└─────────────┘     └─────────────┘     └─────────────┘
                                                  │
                    ┌─────────────────────────────┘
                    ▼
┌─────────────┐     ┌─────────────┐
│   Videos    │ ──▶ │  Artifacts  │
└─────────────┘     └─────────────┘
\`\`\`

## Stage Details

### 1. Story Idea
- **Input**: User text, genre selection, themes
- **Output**: Structured story concept
- **Key Files**: \`components/StoryIdeaForm.tsx\`, \`components/StoryIdeaSection.tsx\`

### 2. Story Bible
- **Input**: Story idea
- **Output**: Complete story bible with characters, setting, themes
- **Key Files**: \`services/geminiService.ts\`, \`components/StoryBibleEditor.tsx\`
- **LLM**: Gemini with structured JSON output

### 3. Director's Vision
- **Input**: Story bible
- **Output**: Visual style, tone, cinematography guidelines
- **Key Files**: \`components/DirectorsVision.tsx\`, \`components/DirectorsVisionEditor.tsx\`

### 4. Scenes
- **Input**: Story bible, director's vision
- **Output**: Scene breakdown with descriptions
- **Key Files**: \`services/planExpansionService.ts\`, \`components/SceneEditor.tsx\`

### 5. Shots
- **Input**: Scenes, narrative context
- **Output**: Shot-by-shot breakdown with camera directions
- **Key Files**: \`services/planExpansionService.ts\`, \`components/ShotEditor.tsx\`

### 6. Keyframes
- **Input**: Shots, visual prompts
- **Output**: Reference images for each shot
- **Key Files**: \`services/comfyUIService.ts\`, \`services/keyframeBookendService.ts\`
- **Generation**: ComfyUI T2I workflow

### 7. Videos
- **Input**: Keyframes, shot descriptions
- **Output**: Generated video clips
- **Key Files**: \`services/comfyUIService.ts\`, \`services/videoGenerationService.ts\`
- **Generation**: ComfyUI I2V workflow

### 8. Artifacts
- **Input**: All generated content
- **Output**: Persistent storage, export options
- **Key Files**: \`utils/database.ts\`, \`components/ArtifactViewer.tsx\`

## Identified Issues

${dataFlowIssues.length > 0 ? dataFlowIssues.map(i => `- **${i.severity.toUpperCase()}**: ${i.message}`).join('\n') : '✅ No data flow issues detected'}

---
*Generated by E2E Audit Task Runner*
`;
  }

  /**
   * Generate validation audit report
   */
  private generateValidationReport(scanResult: ScanResult): string {
    const issues = scanResult.issuesFound as E2EQualityIssue[];
    const validationIssues = issues.filter(i => 
      i.message.includes('validation') || 
      i.message.includes('guardrail') ||
      i.message.includes('error')
    );

    return `# Validation & Guardrail Audit Report

## Form Validation Checklist

| Component | Required Fields | Length Constraints | Error Display | Status |
|-----------|-----------------|-------------------|---------------|--------|
| StoryIdeaForm | ⚠️ Audit | ⚠️ Audit | ⚠️ Audit | Needs Review |
| StoryBibleEditor | ⚠️ Audit | ⚠️ Audit | ⚠️ Audit | Needs Review |
| DirectorsVisionEditor | ⚠️ Audit | ⚠️ Audit | ⚠️ Audit | Needs Review |
| SceneEditor | ⚠️ Audit | ⚠️ Audit | ⚠️ Audit | Needs Review |
| ShotEditor | ⚠️ Audit | ⚠️ Audit | ⚠️ Audit | Needs Review |

## Prompt Guardrails

- [ ] Input sanitization
- [ ] Prompt length validation (100-180 words recommended)
- [ ] Content safety filters
- [ ] Structured output schemas

## Identified Issues

${validationIssues.length > 0 ? validationIssues.map(i => `
### ${i.severity === 'critical' ? '🚨' : i.severity === 'high' ? '⚠️' : '📝'} ${i.message}
- **File**: ${i.file || 'N/A'}
- **Fix**: ${i.suggestedFix || 'Manual review required'}
`).join('\n') : '✅ No validation issues detected'}

## Recommendations

1. Implement consistent validation patterns across all form components
2. Add real-time validation feedback
3. Create validation utility functions for reuse
4. Document validation rules in component JSDoc

---
*Generated by E2E Audit Task Runner*
`;
  }

  /**
   * Generate bookend workflow report
   */
  private generateBookendReport(scanResult: ScanResult): string {
    const issues = scanResult.issuesFound as E2EQualityIssue[];
    const bookendIssues = issues.filter(i => 
      i.message.includes('bookend') || 
      i.message.includes('start/end') ||
      i.message.includes('i2v') ||
      i.pipelineStage === 'keyframes'
    );

    return `# Bookend Workflow Report

## Overview

The bookend workflow generates videos that bridge a specified start image and end image.
This is a HIGH-PRIORITY area due to previous issues with incoherent results.

## Quality Requirements

1. **High-quality images**: Start and end frames must be clear and detailed
2. **Consistent aspect ratios**: Both images must match (e.g., 16:9, 4:3)
3. **Clear prompts**: Include explicit transition descriptions
4. **Narrative arc**: Lock both ends to improve control and flow

## Current Implementation Status

### Service Layer
- \`services/keyframeBookendService.ts\`: ${bookendIssues.some(i => i.message.includes('Missing keyframe bookend')) ? '❌ Missing' : '✅ Present'}

### Required Functions
- \`ensureBookendKeyframe()\`: ${bookendIssues.some(i => i.message.includes('ensureBookendKeyframe')) ? '❌ Missing' : '✅ Present'}
- \`getStartKeyframe()\`: ${bookendIssues.some(i => i.message.includes('getStartKeyframe')) ? '❌ Missing' : '✅ Present'}
- \`getEndKeyframe()\`: ${bookendIssues.some(i => i.message.includes('getEndKeyframe')) ? '❌ Missing' : '✅ Present'}

### Workflow Files
- I2V Workflow: ${bookendIssues.some(i => i.message.includes('i2v-workflow')) ? '❌ Missing' : '✅ Present'}

## Identified Issues

${bookendIssues.length > 0 ? bookendIssues.map(i => `
### ${i.severity === 'critical' ? '🚨' : i.severity === 'high' ? '⚠️' : '📝'} ${i.message}
- **Severity**: ${i.severity}
- **Fix**: ${i.suggestedFix || 'Manual review required'}
`).join('\n') : '✅ No bookend workflow issues detected'}

## Testing Recommendations

1. Test with simple, clear start/end images
2. Verify video starts aligned with first image
3. Verify video ends aligned with last image
4. Check transition smoothness
5. Measure coherence between frames

---
*Generated by E2E Audit Task Runner*
`;
  }

  /**
   * Generate coherence guidelines report
   */
  private generateCoherenceReport(scanResult: ScanResult): string {
    const issues = scanResult.issuesFound as E2EQualityIssue[];
    const coherenceIssues = issues.filter(i => 
      i.message.includes('coherence') || 
      i.message.includes('narrative') ||
      i.message.includes('prompt') ||
      i.promptQuality !== undefined
    );

    return `# Prompt & Story Coherence Guidelines

## Prompt Quality Standards

### Optimal Prompt Structure (100-180 words)
1. **Subject**: Who/what is in the frame
2. **Action**: What is happening
3. **Setting**: Where it takes place
4. **Mood/Tone**: Emotional quality
5. **Camera**: Shot type, angle, movement
6. **Lighting**: Quality and direction

### Positive Phrasing
❌ Avoid: "Don't show violence", "No blurry images"
✅ Use: "Show peaceful scene", "Sharp, focused image"

### Cinematic Grammar
Include professional filmmaking terms:
- Shot types: wide, medium, close-up, extreme close-up
- Camera movements: pan, tilt, dolly, crane, handheld
- Lens properties: focal length, depth of field
- Lighting: key, fill, back, natural, dramatic

## Story Coherence Checklist

- [ ] Consistent character names and descriptions
- [ ] Temporal continuity (time progression)
- [ ] Location consistency
- [ ] Plot thread tracking
- [ ] Emotional arc progression

## Outline-First Generation

Generate high-level outline before full expansion:
1. Story beats
2. Scene summaries
3. Character arcs
4. Thematic elements

Then expand each section with full detail.

## Identified Issues

${coherenceIssues.length > 0 ? coherenceIssues.map(i => `
### ${i.severity === 'critical' ? '🚨' : i.severity === 'high' ? '⚠️' : '📝'} ${i.message}
${i.promptQuality ? `- **Prompt Quality**: ${i.promptQuality}` : ''}
${i.coherenceScore !== undefined ? `- **Coherence Score**: ${i.coherenceScore}/100` : ''}
- **Fix**: ${i.suggestedFix || 'Manual review required'}
`).join('\n') : '✅ No coherence issues detected'}

---
*Generated by E2E Audit Task Runner*
`;
  }

  /**
   * Generate test matrix
   */
  private generateTestMatrix(scanResult: ScanResult): string {
    const issues = scanResult.issuesFound as E2EQualityIssue[];

    return `# Test Matrix & Results

## Workflow Test Coverage

| Workflow | Typical Input | Edge Case | Invalid Input | Status |
|----------|--------------|-----------|---------------|--------|
| Story Idea → Bible | ⚠️ TODO | ⚠️ TODO | ⚠️ TODO | Needs Tests |
| Story Bible → Vision | ⚠️ TODO | ⚠️ TODO | ⚠️ TODO | Needs Tests |
| Vision → Scenes | ⚠️ TODO | ⚠️ TODO | ⚠️ TODO | Needs Tests |
| Scenes → Shots | ⚠️ TODO | ⚠️ TODO | ⚠️ TODO | Needs Tests |
| Shots → Keyframes | ⚠️ TODO | ⚠️ TODO | ⚠️ TODO | Needs Tests |
| Keyframes → Videos | ⚠️ TODO | ⚠️ TODO | ⚠️ TODO | Needs Tests |
| Bookend Start/End | ⚠️ TODO | ⚠️ TODO | ⚠️ TODO | Needs Tests |

## Quality Metrics to Track

1. **Subject Fidelity**: Does output match prompt subject?
2. **Motion Quality**: Smooth, natural movements?
3. **Frame Accuracy**: Start/end alignment (bookends)?
4. **Lighting Consistency**: Coherent across shots?
5. **Character Consistency**: Same appearance throughout?

## Audit Results Summary

| Category | Issues Found | Critical | High | Medium | Low |
|----------|-------------|----------|------|--------|-----|
| Data Flow | ${issues.filter(i => i.message.includes('pipeline') || i.message.includes('Missing')).length} | ${issues.filter(i => i.severity === 'critical' && i.message.includes('pipeline')).length} | ${issues.filter(i => i.severity === 'high' && i.message.includes('pipeline')).length} | ${issues.filter(i => i.severity === 'medium' && i.message.includes('pipeline')).length} | ${issues.filter(i => i.severity === 'low' && i.message.includes('pipeline')).length} |
| Validation | ${issues.filter(i => i.message.includes('validation')).length} | ${issues.filter(i => i.severity === 'critical' && i.message.includes('validation')).length} | ${issues.filter(i => i.severity === 'high' && i.message.includes('validation')).length} | ${issues.filter(i => i.severity === 'medium' && i.message.includes('validation')).length} | ${issues.filter(i => i.severity === 'low' && i.message.includes('validation')).length} |
| Bookends | ${issues.filter(i => i.message.includes('bookend') || i.pipelineStage === 'keyframes').length} | ${issues.filter(i => i.severity === 'critical' && (i.message.includes('bookend') || i.pipelineStage === 'keyframes')).length} | ${issues.filter(i => i.severity === 'high' && (i.message.includes('bookend') || i.pipelineStage === 'keyframes')).length} | ${issues.filter(i => i.severity === 'medium' && (i.message.includes('bookend') || i.pipelineStage === 'keyframes')).length} | ${issues.filter(i => i.severity === 'low' && (i.message.includes('bookend') || i.pipelineStage === 'keyframes')).length} |
| Coherence | ${issues.filter(i => i.message.includes('coherence')).length} | ${issues.filter(i => i.severity === 'critical' && i.message.includes('coherence')).length} | ${issues.filter(i => i.severity === 'high' && i.message.includes('coherence')).length} | ${issues.filter(i => i.severity === 'medium' && i.message.includes('coherence')).length} | ${issues.filter(i => i.severity === 'low' && i.message.includes('coherence')).length} |
| **TOTAL** | **${issues.length}** | **${issues.filter(i => i.severity === 'critical').length}** | **${issues.filter(i => i.severity === 'high').length}** | **${issues.filter(i => i.severity === 'medium').length}** | **${issues.filter(i => i.severity === 'low').length}** |

## Reusable Test Templates

Save successful prompts and configurations as templates:
- \`test-templates/story-idea-typical.json\`
- \`test-templates/bookend-simple.json\`
- \`test-templates/multi-shot-sequence.json\`

---
*Generated by E2E Audit Task Runner*
`;
  }

  /**
   * Log audit summary to console
   */
  private logAuditSummary(scanResult: ScanResult): void {
    const logger = getLogger();
    const issues = scanResult.issuesFound as E2EQualityIssue[];

    logger.section('E2E AUDIT SUMMARY');

    console.log(`  📊 Issues Found: ${issues.length}`);
    console.log(`     🚨 Critical: ${issues.filter(i => i.severity === 'critical').length}`);
    console.log(`     ⚠️  High: ${issues.filter(i => i.severity === 'high').length}`);
    console.log(`     📝 Medium: ${issues.filter(i => i.severity === 'medium').length}`);
    console.log(`     ℹ️  Low: ${issues.filter(i => i.severity === 'low').length}`);
    console.log('');
    console.log('  📁 Reports saved to:');
    console.log(`     ${this.reportsDir}/`);
    console.log('');
    console.log('  📋 NEXT STEPS:');
    console.log('     1. Review reports in agent/reports/e2e-audit/');
    console.log('     2. Address critical and high-severity issues first');
    console.log('     3. Run audit again after fixes: npm run guardian:e2e-audit');
    console.log('     4. Generate fix prompts: npm run guardian -- -g');
    console.log('');
  }
}
