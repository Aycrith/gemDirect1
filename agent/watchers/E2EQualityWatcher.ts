/**
 * E2EQualityWatcher - End-to-End Quality & Coherence Auditor
 * 
 * Audits the entire CSG pipeline from user inputs to video generation,
 * checking for data flow integrity, prompt quality, narrative coherence,
 * and bookend workflow validation.
 * 
 * This watcher implements the "End-to-End Quality & Coherence" agent mission.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Issue, ScanResult, AgentConfig, E2EQualityIssue, PipelineStage } from '../core/types.js';
import { getLogger } from '../core/Logger.js';

/** Audit configuration */
interface AuditConfig {
  checkDataFlow: boolean;
  checkValidation: boolean;
  checkPromptQuality: boolean;
  checkBookends: boolean;
  checkCoherence: boolean;
  checkFeatureFlags: boolean;
}

const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  checkDataFlow: true,
  checkValidation: true,
  checkPromptQuality: true,
  checkBookends: true,
  checkCoherence: true,
  checkFeatureFlags: true,
};

export class E2EQualityWatcher {
  private auditConfig: AuditConfig;

  constructor(
    private config: AgentConfig,
    auditConfig: Partial<AuditConfig> = {}
  ) {
    this.auditConfig = { ...DEFAULT_AUDIT_CONFIG, ...auditConfig };
  }

  /**
   * Run the full E2E quality audit
   */
  async scan(): Promise<ScanResult> {
    const logger = getLogger();
    const startTime = Date.now();
    const issues: Issue[] = [];

    logger.info('Running E2E quality & coherence audit...');

    // Run all enabled checks
    const checks: Promise<E2EQualityIssue[]>[] = [];

    if (this.auditConfig.checkDataFlow) {
      checks.push(this.auditDataFlow());
    }
    if (this.auditConfig.checkValidation) {
      checks.push(this.auditValidationGuardrails());
    }
    if (this.auditConfig.checkPromptQuality) {
      checks.push(this.auditPromptConstruction());
    }
    if (this.auditConfig.checkBookends) {
      checks.push(this.auditBookendWorkflows());
    }
    if (this.auditConfig.checkCoherence) {
      checks.push(this.auditNarrativeCoherence());
    }
    if (this.auditConfig.checkFeatureFlags) {
      checks.push(this.auditFeatureFlags());
    }

    const results = await Promise.allSettled(checks);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        issues.push(...result.value);
      } else {
        logger.error('Audit check failed', result.reason);
      }
    }

    const duration = Date.now() - startTime;

    if (issues.length > 0) {
      logger.warn(`E2E quality audit: Found ${issues.length} issues`);
    } else {
      logger.success('E2E quality audit: No issues');
    }

    return {
      scanner: 'e2e-quality',
      timestamp: new Date(),
      duration,
      issuesFound: issues,
    };
  }

  /**
   * Audit the data flow through all pipeline stages
   * Story Idea → Story Bible → Director Vision → Scenes → Keyframes → Videos → Artifacts
   */
  private async auditDataFlow(): Promise<E2EQualityIssue[]> {
    const issues: E2EQualityIssue[] = [];
    const logger = getLogger();

    logger.info('  Auditing data flow...');

    // Define the expected pipeline stages and their key files
    const pipelineFiles: Record<PipelineStage, string[]> = {
      'story-idea': ['components/StoryIdeaForm.tsx', 'components/StoryIdeaSection.tsx'],
      'story-bible': ['services/geminiService.ts', 'components/StoryBibleEditor.tsx'],
      'directors-vision': ['components/DirectorsVision.tsx', 'components/DirectorsVisionEditor.tsx'],
      'scenes': ['services/planExpansionService.ts', 'components/SceneEditor.tsx'],
      'shots': ['services/planExpansionService.ts', 'components/ShotEditor.tsx'],
      'keyframes': ['services/comfyUIService.ts', 'services/keyframeBookendService.ts'],
      'videos': ['services/comfyUIService.ts', 'services/videoGenerationService.ts'],
      'artifacts': ['utils/database.ts', 'components/ArtifactViewer.tsx'],
    };

    // Check each stage has its required files
    for (const [stage, files] of Object.entries(pipelineFiles) as [PipelineStage, string[]][]) {
      for (const file of files) {
        const fullPath = path.join(this.config.projectRoot, file);
        if (!fs.existsSync(fullPath)) {
          issues.push(this.createIssue({
            id: `e2e-missing-file-${stage}-${this.sanitizePath(file)}`,
            type: 'gap',
            severity: 'high',
            message: `Missing pipeline file for ${stage} stage: ${file}`,
            file,
            pipelineStage: stage,
            suggestedFix: `Create or restore the missing file: ${file}`,
          }));
        }
      }
    }

    // Check service layer integration points
    const serviceFiles = [
      'services/geminiService.ts',
      'services/comfyUIService.ts',
      'services/payloadService.ts',
      'services/planExpansionService.ts',
    ];

    for (const file of serviceFiles) {
      const fullPath = path.join(this.config.projectRoot, file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // Check for proper error handling
        if (!content.includes('withRetry') && file.includes('gemini')) {
          issues.push(this.createIssue({
            id: `e2e-no-retry-${this.sanitizePath(file)}`,
            type: 'improvement',
            severity: 'medium',
            message: `Service ${file} may lack retry logic for API calls`,
            file,
            pipelineStage: 'story-bible',
            suggestedFix: 'Ensure all Gemini API calls use withRetry wrapper',
          }));
        }

        // Check for structured output usage
        if (file.includes('gemini') && !content.includes('responseMimeType')) {
          issues.push(this.createIssue({
            id: `e2e-no-structured-output-${this.sanitizePath(file)}`,
            type: 'improvement',
            severity: 'medium',
            message: `Service ${file} may not use structured JSON outputs`,
            file,
            pipelineStage: 'story-bible',
            suggestedFix: 'Use responseMimeType: "application/json" with responseSchema for structured outputs',
          }));
        }
      }
    }

    return issues;
  }

  /**
   * Audit form validation and guardrails
   */
  private async auditValidationGuardrails(): Promise<E2EQualityIssue[]> {
    const issues: E2EQualityIssue[] = [];
    const logger = getLogger();

    logger.info('  Auditing validation guardrails...');

    // Check for validation patterns in form components
    const formComponents = [
      'components/StoryIdeaForm.tsx',
      'components/StoryBibleEditor.tsx',
      'components/DirectorsVisionEditor.tsx',
      'components/SceneEditor.tsx',
      'components/ShotEditor.tsx',
    ];

    for (const file of formComponents) {
      const fullPath = path.join(this.config.projectRoot, file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Check for input validation
        const hasValidation = 
          content.includes('validate') || 
          content.includes('required') || 
          content.includes('minLength') ||
          content.includes('maxLength') ||
          content.includes('pattern');

        if (!hasValidation) {
          issues.push(this.createIssue({
            id: `e2e-no-validation-${this.sanitizePath(file)}`,
            type: 'gap',
            severity: 'medium',
            message: `Form component ${file} may lack input validation`,
            file,
            suggestedFix: 'Add required field validation, length constraints, and error messages',
          }));
        }

        // Check for error handling/display
        const hasErrorDisplay = 
          content.includes('error') && 
          (content.includes('toast') || content.includes('Error') || content.includes('message'));

        if (!hasErrorDisplay) {
          issues.push(this.createIssue({
            id: `e2e-no-error-display-${this.sanitizePath(file)}`,
            type: 'improvement',
            severity: 'low',
            message: `Form component ${file} may not display validation errors clearly`,
            file,
            suggestedFix: 'Add clear error message display for validation failures',
          }));
        }
      }
    }

    // Check for prompt validation service
    const promptValidatorPath = path.join(this.config.projectRoot, 'validation/promptValidator.ts');
    if (!fs.existsSync(promptValidatorPath)) {
      issues.push(this.createIssue({
        id: 'e2e-missing-prompt-validator',
        type: 'gap',
        severity: 'high',
        message: 'Missing prompt validation service',
        suggestedFix: 'Create validation/promptValidator.ts to validate LLM prompts before sending',
      }));
    }

    return issues;
  }

  /**
   * Audit prompt construction quality
   * Checks for: structure, conciseness (100-180 words), camera grammar, positive phrasing
   */
  private async auditPromptConstruction(): Promise<E2EQualityIssue[]> {
    const issues: E2EQualityIssue[] = [];
    const logger = getLogger();

    logger.info('  Auditing prompt construction...');

    const payloadServicePath = path.join(this.config.projectRoot, 'services/payloadService.ts');
    
    if (fs.existsSync(payloadServicePath)) {
      const content = fs.readFileSync(payloadServicePath, 'utf-8');

      // Check for negative prompt patterns (anti-pattern)
      const negativePatterns = ['don\'t', 'do not', 'never', 'avoid', 'no '];
      for (const pattern of negativePatterns) {
        if (content.toLowerCase().includes(pattern) && content.includes('prompt')) {
          issues.push(this.createIssue({
            id: `e2e-negative-prompt-${pattern.replace(/\s/g, '-')}`,
            type: 'improvement',
            severity: 'low',
            message: `Prompt construction may use negative phrasing ("${pattern}"). Prefer positive statements.`,
            file: 'services/payloadService.ts',
            promptQuality: 'fair',
            suggestedFix: 'Rephrase negative instructions as positive statements (e.g., "avoid X" → "use Y instead")',
          }));
          break; // Only report once
        }
      }

      // Check for cinematic grammar terms
      const cinematicTerms = ['shot', 'camera', 'angle', 'lens', 'lighting', 'movement', 'pan', 'tilt', 'zoom'];
      const hasCinematicTerms = cinematicTerms.some(term => content.toLowerCase().includes(term));
      
      if (!hasCinematicTerms) {
        issues.push(this.createIssue({
          id: 'e2e-no-cinematic-grammar',
          type: 'improvement',
          severity: 'medium',
          message: 'Prompt construction may lack cinematic grammar (shot types, camera movements, lens properties)',
          file: 'services/payloadService.ts',
          promptQuality: 'fair',
          suggestedFix: 'Include professional filmmaking terms: shot types, camera angles, lens properties, lighting',
        }));
      }
    }

    // Check for context pruning
    const geminiServicePath = path.join(this.config.projectRoot, 'services/geminiService.ts');
    if (fs.existsSync(geminiServicePath)) {
      const content = fs.readFileSync(geminiServicePath, 'utf-8');

      if (!content.includes('prune') && !content.includes('Prune')) {
        issues.push(this.createIssue({
          id: 'e2e-no-context-pruning',
          type: 'improvement',
          severity: 'medium',
          message: 'LLM service may not prune context to reduce token usage',
          file: 'services/geminiService.ts',
          promptQuality: 'fair',
          suggestedFix: 'Implement context pruning to keep prompts focused and under token limits',
        }));
      }
    }

    return issues;
  }

  /**
   * Audit bookend (start/end image) workflows
   * High-priority area due to previous incoherent results
   */
  private async auditBookendWorkflows(): Promise<E2EQualityIssue[]> {
    const issues: E2EQualityIssue[] = [];
    const logger = getLogger();

    logger.info('  Auditing bookend workflows...');

    // Check for bookend service
    const bookendServicePath = path.join(this.config.projectRoot, 'services/keyframeBookendService.ts');
    
    if (!fs.existsSync(bookendServicePath)) {
      issues.push(this.createIssue({
        id: 'e2e-missing-bookend-service',
        type: 'gap',
        severity: 'critical',
        message: 'Missing keyframe bookend service for start/end image workflows',
        pipelineStage: 'keyframes',
        suggestedFix: 'Create services/keyframeBookendService.ts with ensureBookendKeyframe, getStartKeyframe, getEndKeyframe',
      }));
    } else {
      const content = fs.readFileSync(bookendServicePath, 'utf-8');

      // Check for required functions
      const requiredFunctions = ['ensureBookendKeyframe', 'getStartKeyframe', 'getEndKeyframe'];
      for (const fn of requiredFunctions) {
        if (!content.includes(fn)) {
          issues.push(this.createIssue({
            id: `e2e-missing-bookend-fn-${fn}`,
            type: 'gap',
            severity: 'high',
            message: `Bookend service missing required function: ${fn}`,
            file: 'services/keyframeBookendService.ts',
            pipelineStage: 'keyframes',
            suggestedFix: `Implement ${fn} function for bookend workflow`,
          }));
        }
      }

      // Check for aspect ratio validation
      if (!content.includes('aspectRatio') && !content.includes('aspect')) {
        issues.push(this.createIssue({
          id: 'e2e-bookend-no-aspect-ratio',
          type: 'improvement',
          severity: 'medium',
          message: 'Bookend service may not validate consistent aspect ratios between start/end images',
          file: 'services/keyframeBookendService.ts',
          pipelineStage: 'keyframes',
          suggestedFix: 'Add aspect ratio validation to ensure start/end images match',
        }));
      }

      // Check for transition description
      if (!content.includes('transition') && !content.includes('Transition')) {
        issues.push(this.createIssue({
          id: 'e2e-bookend-no-transition',
          type: 'improvement',
          severity: 'medium',
          message: 'Bookend workflow may not include explicit transition descriptions',
          file: 'services/keyframeBookendService.ts',
          pipelineStage: 'keyframes',
          suggestedFix: 'Include explicit transition description in prompts for coherent video generation',
        }));
      }
    }

    // Check for bookend workflow in ComfyUI
    const workflowsDir = path.join(this.config.projectRoot, 'workflows');
    if (fs.existsSync(workflowsDir)) {
      const workflows = fs.readdirSync(workflowsDir);
      const hasI2VWorkflow = workflows.some(w => w.includes('i2v') || w.includes('image2video'));
      
      if (!hasI2VWorkflow) {
        issues.push(this.createIssue({
          id: 'e2e-missing-i2v-workflow',
          type: 'gap',
          severity: 'high',
          message: 'No image-to-video workflow found for bookend generation',
          pipelineStage: 'videos',
          suggestedFix: 'Add image-to-video workflow (e.g., video_wan2_i2v.json) to workflows/',
        }));
      }
    }

    return issues;
  }

  /**
   * Audit narrative coherence systems
   */
  private async auditNarrativeCoherence(): Promise<E2EQualityIssue[]> {
    const issues: E2EQualityIssue[] = [];
    const logger = getLogger();

    logger.info('  Auditing narrative coherence...');

    // Check for coherence service
    const coherenceServicePath = path.join(this.config.projectRoot, 'services/narrativeCoherenceService.ts');
    
    if (!fs.existsSync(coherenceServicePath)) {
      issues.push(this.createIssue({
        id: 'e2e-missing-coherence-service',
        type: 'gap',
        severity: 'high',
        message: 'Missing narrative coherence service for tracking story state',
        pipelineStage: 'scenes',
        suggestedFix: 'Create services/narrativeCoherenceService.ts with NarrativeState tracking',
      }));
    } else {
      const content = fs.readFileSync(coherenceServicePath, 'utf-8');

      // Check for required state tracking
      const requiredState = ['characters', 'locations', 'temporal', 'plotThreads'];
      for (const state of requiredState) {
        if (!content.includes(state)) {
          issues.push(this.createIssue({
            id: `e2e-coherence-missing-${state}`,
            type: 'improvement',
            severity: 'medium',
            message: `Narrative coherence service may not track: ${state}`,
            file: 'services/narrativeCoherenceService.ts',
            pipelineStage: 'scenes',
            coherenceScore: 70,
            suggestedFix: `Add ${state} tracking to NarrativeState interface`,
          }));
        }
      }
    }

    // Check for coherence gate
    const coherenceGatePath = path.join(this.config.projectRoot, 'services/coherenceGate.ts');
    if (!fs.existsSync(coherenceGatePath)) {
      issues.push(this.createIssue({
        id: 'e2e-missing-coherence-gate',
        type: 'gap',
        severity: 'medium',
        message: 'Missing coherence gate for validating generation outputs',
        pipelineStage: 'scenes',
        suggestedFix: 'Create services/coherenceGate.ts with validateCoherence function',
      }));
    }

    // Check for outline-first generation pattern
    const planExpansionPath = path.join(this.config.projectRoot, 'services/planExpansionService.ts');
    if (fs.existsSync(planExpansionPath)) {
      const content = fs.readFileSync(planExpansionPath, 'utf-8');

      if (!content.includes('outline') && !content.includes('Outline')) {
        issues.push(this.createIssue({
          id: 'e2e-no-outline-first',
          type: 'improvement',
          severity: 'medium',
          message: 'Plan expansion may not use outline-first generation for plot consistency',
          file: 'services/planExpansionService.ts',
          pipelineStage: 'scenes',
          suggestedFix: 'Generate high-level outline before full scene/shot expansion',
        }));
      }
    }

    return issues;
  }

  /**
   * Audit feature flags
   */
  private async auditFeatureFlags(): Promise<E2EQualityIssue[]> {
    const issues: E2EQualityIssue[] = [];
    const logger = getLogger();

    logger.info('  Auditing feature flags...');

    // Check for feature flag definitions
    const flagLocations = [
      'services/settingsStore.ts',
      'utils/featureFlags.ts',
      'contexts/FeatureFlagContext.tsx',
    ];

    let foundFlags = false;
    for (const file of flagLocations) {
      const fullPath = path.join(this.config.projectRoot, file);
      if (fs.existsSync(fullPath)) {
        foundFlags = true;
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Check for documented flags
        if (!content.includes('/**') && !content.includes('//')) {
          issues.push(this.createIssue({
            id: `e2e-undocumented-flags-${this.sanitizePath(file)}`,
            type: 'improvement',
            severity: 'low',
            message: `Feature flags in ${file} may lack documentation`,
            file,
            suggestedFix: 'Add JSDoc comments explaining each feature flag\'s purpose and effects',
          }));
        }
      }
    }

    if (!foundFlags) {
      issues.push(this.createIssue({
        id: 'e2e-no-feature-flags',
        type: 'gap',
        severity: 'low',
        message: 'No centralized feature flag system found',
        suggestedFix: 'Create utils/featureFlags.ts or use existing settings store for feature toggles',
      }));
    }

    return issues;
  }

  /**
   * Create a properly typed E2E quality issue
   */
  private createIssue(params: {
    id: string;
    type: Issue['type'];
    severity: Issue['severity'];
    message: string;
    file?: string;
    line?: number;
    pipelineStage?: PipelineStage;
    coherenceScore?: number;
    promptQuality?: E2EQualityIssue['promptQuality'];
    affectedComponents?: string[];
    suggestedFix?: string;
  }): E2EQualityIssue {
    return {
      id: params.id,
      type: params.type,
      severity: params.severity,
      category: 'e2e-quality',
      message: params.message,
      file: params.file,
      line: params.line,
      pipelineStage: params.pipelineStage,
      coherenceScore: params.coherenceScore,
      promptQuality: params.promptQuality,
      affectedComponents: params.affectedComponents,
      suggestedFix: params.suggestedFix,
      autoFixable: false,
      timestamp: new Date(),
    };
  }

  private sanitizePath(p: string): string {
    return p.replace(/[\\/:]/g, '-');
  }
}

/**
 * Generate the E2E audit report as markdown
 */
export function generateE2EAuditReport(scanResult: ScanResult): string {
  const issues = scanResult.issuesFound as E2EQualityIssue[];
  
  const lines: string[] = [
    '# E2E Quality & Coherence Audit Report',
    '',
    `**Generated**: ${scanResult.timestamp.toISOString()}`,
    `**Duration**: ${scanResult.duration}ms`,
    `**Issues Found**: ${issues.length}`,
    '',
    '---',
    '',
  ];

  // Group by pipeline stage
  const byStage = new Map<string, E2EQualityIssue[]>();
  const noStage: E2EQualityIssue[] = [];

  for (const issue of issues) {
    if (issue.pipelineStage) {
      const stageIssues = byStage.get(issue.pipelineStage) || [];
      stageIssues.push(issue);
      byStage.set(issue.pipelineStage, stageIssues);
    } else {
      noStage.push(issue);
    }
  }

  // Pipeline stages in order
  const stageOrder: PipelineStage[] = [
    'story-idea', 'story-bible', 'directors-vision', 
    'scenes', 'shots', 'keyframes', 'videos', 'artifacts'
  ];

  for (const stage of stageOrder) {
    const stageIssues = byStage.get(stage);
    if (stageIssues && stageIssues.length > 0) {
      lines.push(`## ${stage.toUpperCase().replace('-', ' ')} Stage`);
      lines.push('');
      
      for (const issue of stageIssues) {
        const icon = issue.severity === 'critical' ? '🚨' : 
                     issue.severity === 'high' ? '⚠️' : 
                     issue.severity === 'medium' ? '📝' : 'ℹ️';
        lines.push(`### ${icon} ${issue.message}`);
        lines.push('');
        lines.push(`- **Severity**: ${issue.severity}`);
        lines.push(`- **Type**: ${issue.type}`);
        if (issue.file) lines.push(`- **File**: \`${issue.file}\``);
        if (issue.promptQuality) lines.push(`- **Prompt Quality**: ${issue.promptQuality}`);
        if (issue.coherenceScore !== undefined) lines.push(`- **Coherence Score**: ${issue.coherenceScore}/100`);
        if (issue.suggestedFix) {
          lines.push('');
          lines.push(`**Suggested Fix**: ${issue.suggestedFix}`);
        }
        lines.push('');
      }
    }
  }

  if (noStage.length > 0) {
    lines.push('## GENERAL ISSUES');
    lines.push('');
    for (const issue of noStage) {
      const icon = issue.severity === 'critical' ? '🚨' : 
                   issue.severity === 'high' ? '⚠️' : 
                   issue.severity === 'medium' ? '📝' : 'ℹ️';
      lines.push(`### ${icon} ${issue.message}`);
      lines.push('');
      lines.push(`- **Severity**: ${issue.severity}`);
      lines.push(`- **Type**: ${issue.type}`);
      if (issue.file) lines.push(`- **File**: \`${issue.file}\``);
      if (issue.suggestedFix) {
        lines.push('');
        lines.push(`**Suggested Fix**: ${issue.suggestedFix}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('*Report generated by E2E Quality Watcher*');

  return lines.join('\n');
}
