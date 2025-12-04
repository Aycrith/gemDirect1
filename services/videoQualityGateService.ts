/**
 * Video Quality Gate Service
 * 
 * Enforces video quality thresholds by evaluating generated videos against
 * configurable quality standards. Uses videoFeedbackService for analysis
 * and provides pass/fail/warning decisions.
 * 
 * ## Quality Thresholds (Defaults)
 * - minVideoOverallScore: 70 - Overall quality must exceed this
 * - minStartFrameMatch: 30 - Start frame must match keyframe at this level (calibrated for FLF2V ~35-40%)
 * - minEndFrameMatch: 30 - End frame must match keyframe at this level (calibrated for FLF2V ~35-40%)
 * 
 * ## Coherence Thresholds (Bookend QA Mode)
 * When bookendQAMode is enabled, additional coherence checks are enforced:
 * - minOverall: 80 - From vision-thresholds.json globalDefaults
 * - minFocusStability: 85 - Measures if main subject stays in focus
 * - maxArtifactSeverity: 40 - Maximum artifact level (0=none, 100=severe)
 * - minObjectConsistency: 85 - Objects maintain identity throughout
 * 
 * ## Usage
 * ```typescript
 * import { evaluateVideoQuality, QualityGateDecision } from './videoQualityGateService';
 * 
 * const result = await evaluateVideoQuality(videoBase64, request, settings);
 * if (result.decision === 'fail') {
 *   console.log('Video rejected:', result.reason);
 *   // Optionally regenerate or show user feedback
 * }
 * ```
 * 
 * @module services/videoQualityGateService
 */

import type { LocalGenerationSettings } from '../types';
import type { VideoAnalysisRequest, VideoFeedbackResult } from './videoFeedbackService';
import { analyzeVideo } from './videoFeedbackService';
import { 
    getRuntimeCoherenceThresholds, 
    checkCoherenceThresholds, 
    type CoherenceThresholds,
    type CoherenceViolation,
    type CoherenceCheckResult
} from './visionThresholdConfig';

// ============================================================================
// Types
// ============================================================================

/**
 * Quality thresholds for video evaluation
 */
export interface QualityThresholds {
    /** Minimum overall quality score (0-100). Default: 70 */
    minVideoOverallScore: number;
    /** Minimum start frame match score (0-100). Default: 75 */
    minStartFrameMatch: number;
    /** Minimum end frame match score (0-100). Default: 75 */
    minEndFrameMatch: number;
    /** Minimum motion quality score (0-100). Default: 60 */
    minMotionQuality: number;
    /** Minimum prompt adherence score (0-100). Default: 60 */
    minPromptAdherence: number;
}

/**
 * Quality gate decision
 */
export type QualityGateDecision = 'pass' | 'fail' | 'warning';

/**
 * Result of quality gate evaluation
 */
export interface QualityGateResult {
    /** Pass/fail/warning decision */
    decision: QualityGateDecision;
    /** Human-readable reason for the decision */
    reason: string;
    /** Detailed scores from video analysis */
    scores: {
        overall: number;
        startFrameMatch: number;
        endFrameMatch: number;
        motionQuality: number;
        promptAdherence: number;
    };
    /** Which thresholds were violated (if any) */
    violations: QualityViolation[];
    /** The full video feedback result */
    feedbackResult: VideoFeedbackResult;
    /** Thresholds used for evaluation */
    thresholdsUsed: QualityThresholds;
    /** Whether video should be auto-rejected */
    shouldReject: boolean;
    /** Suggested action */
    suggestedAction: 'accept' | 'regenerate' | 'manual-review';
    /** Coherence check result (only present when bookendQAMode is active) */
    coherenceResult?: CoherenceCheckResult;
    /** Coherence thresholds used (only present when bookendQAMode is active) */
    coherenceThresholdsUsed?: CoherenceThresholds;
}

/**
 * A specific quality threshold violation
 */
export interface QualityViolation {
    /** Which metric was violated */
    metric: keyof QualityThresholds | string;
    /** The actual score */
    actual: number | boolean;
    /** The required threshold */
    required: number | boolean;
    /** Severity: error if way below, warning if close */
    severity: 'error' | 'warning';
    /** Human-readable message */
    message: string;
}

// Re-export coherence types for consumers
export type { CoherenceThresholds, CoherenceViolation, CoherenceCheckResult };

// ============================================================================
// Default Thresholds
// ============================================================================

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
    minVideoOverallScore: 70,
    minStartFrameMatch: 30,  // Calibrated for FLF2V model (~35-40% typical similarity)
    minEndFrameMatch: 30,    // Calibrated for FLF2V model (~35-40% typical similarity)
    minMotionQuality: 60,
    minPromptAdherence: 60,
};

/**
 * Warning margin - if score is within this margin of threshold, it's a warning not failure
 */
const WARNING_MARGIN = 10;

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Evaluate video quality against thresholds
 * 
 * This is the main entry point for the quality gate. It:
 * 1. Runs video analysis via videoFeedbackService
 * 2. Compares scores against thresholds
 * 3. If bookendQAMode is active, also checks coherence thresholds
 * 4. Returns a pass/fail/warning decision with detailed reasoning
 * 
 * @param videoBase64 - Base64-encoded video data
 * @param request - Video analysis request with scene/keyframe context
 * @param settings - LocalGenerationSettings (optional, for custom thresholds)
 * @returns QualityGateResult with decision and details
 */
export async function evaluateVideoQuality(
    videoBase64: string,
    request: VideoAnalysisRequest,
    settings?: LocalGenerationSettings
): Promise<QualityGateResult> {
    // Get thresholds from settings or use defaults
    const thresholds = getThresholdsFromSettings(settings);
    
    // Run video analysis
    const feedbackResult = await analyzeVideo(
        { ...request, videoBase64 },
        settings
    );
    
    // Check for basic quality violations
    const violations = checkViolations(feedbackResult.scores, thresholds);
    
    // Check if bookendQAMode is active - if so, apply coherence thresholds
    const bookendQAModeActive = isBookendQAModeActive(settings);
    let coherenceResult: CoherenceCheckResult | undefined;
    let coherenceThresholds: CoherenceThresholds | undefined;
    
    if (bookendQAModeActive) {
        coherenceThresholds = getRuntimeCoherenceThresholds();
        
        // Map VideoFeedbackResult scores to coherence metrics
        // Note: VideoFeedbackResult may not have all coherence metrics yet
        // We use available scores and proxies where needed
        const coherenceMetrics = mapFeedbackToCoherenceMetrics(feedbackResult);
        
        coherenceResult = checkCoherenceThresholds(coherenceMetrics, coherenceThresholds);
        
        // Add coherence violations to the violations list
        if (coherenceResult.violations.length > 0) {
            for (const cv of coherenceResult.violations) {
                violations.push({
                    metric: `coherence:${cv.metric}`,
                    actual: cv.actual,
                    required: cv.threshold,
                    severity: cv.severity,
                    message: `Coherence: ${cv.message}`,
                });
            }
        }
    }
    
    // Determine decision (now includes coherence violations)
    const { decision, reason, shouldReject, suggestedAction } = determineDecision(
        violations,
        feedbackResult,
        bookendQAModeActive
    );
    
    return {
        decision,
        reason,
        scores: feedbackResult.scores,
        violations,
        feedbackResult,
        thresholdsUsed: thresholds,
        shouldReject,
        suggestedAction,
        coherenceResult,
        coherenceThresholdsUsed: coherenceThresholds,
    };
}

/**
 * Quick check if video passes quality gate (without full analysis details)
 * 
 * @param feedbackResult - Pre-computed VideoFeedbackResult
 * @param settings - LocalGenerationSettings (optional)
 * @returns true if video passes quality thresholds
 */
export function videoPassesQualityGate(
    feedbackResult: VideoFeedbackResult,
    settings?: LocalGenerationSettings
): boolean {
    const thresholds = getThresholdsFromSettings(settings);
    const violations = checkViolations(feedbackResult.scores, thresholds);
    
    // If bookendQAMode is active, also check coherence thresholds
    if (isBookendQAModeActive(settings)) {
        const coherenceThresholds = getRuntimeCoherenceThresholds();
        const coherenceMetrics = mapFeedbackToCoherenceMetrics(feedbackResult);
        const coherenceResult = checkCoherenceThresholds(coherenceMetrics, coherenceThresholds);
        
        if (!coherenceResult.passes) {
            return false;
        }
    }
    
    // Pass if no error-level violations
    return !violations.some(v => v.severity === 'error');
}

/**
 * Check if quality gate is enabled in settings
 * 
 * @param settings - LocalGenerationSettings
 * @returns true if quality gate should be enforced
 */
export function isQualityGateEnabled(settings?: LocalGenerationSettings): boolean {
    if (!settings?.featureFlags) {
        return false;
    }
    // Respect bookendQAMode master switch: forces videoQualityGateEnabled when bookendQAMode is on
    if (settings.featureFlags.bookendQAMode === true) {
        return true;
    }
    return settings.featureFlags.videoQualityGateEnabled === true;
}

/**
 * Check if bookendQAMode is active (triggers coherence threshold enforcement)
 * 
 * @param settings - LocalGenerationSettings
 * @returns true if bookendQAMode is enabled
 */
export function isBookendQAModeActive(settings?: LocalGenerationSettings): boolean {
    return settings?.featureFlags?.bookendQAMode === true;
}

/**
 * Get quality gate status message for UI display
 * 
 * @param result - QualityGateResult from evaluateVideoQuality
 * @returns Formatted status message with emoji
 */
export function getQualityGateStatusMessage(result: QualityGateResult): string {
    const { decision, scores, violations, coherenceResult } = result;
    
    // Include coherence info if present
    const coherenceNote = coherenceResult 
        ? ` | Coherence: ${coherenceResult.decision.toUpperCase()}`
        : '';
    
    switch (decision) {
        case 'pass':
            return `✅ Quality gate passed (score: ${scores.overall}/100)${coherenceNote}`;
        case 'warning':
            return `⚠️ Quality gate warning: ${violations.map(v => v.message).join(', ')} (score: ${scores.overall}/100)${coherenceNote}`;
        case 'fail':
            return `❌ Quality gate failed: ${violations.filter(v => v.severity === 'error').map(v => v.message).join(', ')} (score: ${scores.overall}/100)${coherenceNote}`;
    }
}

/**
 * Get the coherence thresholds currently in use for runtime QA.
 * Useful for displaying thresholds in the UI.
 */
export function getActiveCoherenceThresholds(): CoherenceThresholds {
    return getRuntimeCoherenceThresholds();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract thresholds from settings or return defaults
 * Note: Currently uses default thresholds. Future enhancement could add
 * configurable thresholds to LocalGenerationSettings.
 */
function getThresholdsFromSettings(_settings?: LocalGenerationSettings): QualityThresholds {
    // For now, return default thresholds
    // Future: Could add threshold configuration to LocalGenerationSettings
    return { ...DEFAULT_QUALITY_THRESHOLDS };
}

/**
 * Map VideoFeedbackResult to coherence metrics expected by checkCoherenceThresholds.
 * 
 * VideoFeedbackResult currently has:
 * - scores.overall
 * - scores.startFrameMatch, endFrameMatch
 * - scores.motionQuality
 * - scores.promptAdherence
 * 
 * For coherence checking we need:
 * - overall (direct mapping)
 * - focusStability (proxy: use motionQuality as indicator of focus)
 * - artifactSeverity (proxy: derive from issues count and severity)
 * - objectConsistency (proxy: average of frame matches indicates object stability)
 * - hasBlackFrames (check issues for specific patterns)
 * - hasHardFlicker (check issues for specific patterns)
 */
function mapFeedbackToCoherenceMetrics(result: VideoFeedbackResult): {
    overall?: number;
    focusStability?: number;
    artifactSeverity?: number;
    objectConsistency?: number;
    hasBlackFrames?: boolean;
    hasHardFlicker?: boolean;
} {
    // Direct mapping for overall
    const overall = result.scores.overall;
    
    // Proxy for focus stability: motion quality indicates focus maintenance
    // Higher motion quality → better focus stability
    const focusStability = result.scores.motionQuality;
    
    // Proxy for artifact severity: count error/warning issues as artifacts
    // Issues are categorized as 'artifact', 'motion', 'temporal', etc.
    const artifactIssues = result.issues.filter(i => 
        i.category === 'artifact' || 
        i.category === 'motion' ||
        i.category === 'temporal'
    );
    const errorCount = artifactIssues.filter(i => i.severity === 'error').length;
    const warningCount = artifactIssues.filter(i => i.severity === 'warning').length;
    // Scale: 0 issues = 0 severity, each error = 20, each warning = 10
    const artifactSeverity = Math.min(100, errorCount * 20 + warningCount * 10);
    
    // Proxy for object consistency: average of start/end frame matches
    // If frames match well, objects are consistent
    const objectConsistency = Math.round(
        (result.scores.startFrameMatch + result.scores.endFrameMatch) / 2
    );
    
    // Check for black frames in issues
    const hasBlackFrames = result.issues.some(i => 
        i.message.toLowerCase().includes('black frame') ||
        i.message.toLowerCase().includes('blank frame')
    );
    
    // Check for flicker in issues
    const hasHardFlicker = result.issues.some(i => 
        i.message.toLowerCase().includes('flicker') ||
        i.message.toLowerCase().includes('strobe') ||
        i.message.toLowerCase().includes('flash')
    );
    
    return {
        overall,
        focusStability,
        artifactSeverity,
        objectConsistency,
        hasBlackFrames,
        hasHardFlicker,
    };
}

/**
 * Check which thresholds are violated
 */
function checkViolations(
    scores: VideoFeedbackResult['scores'],
    thresholds: QualityThresholds
): QualityViolation[] {
    const violations: QualityViolation[] = [];
    
    // Check overall score
    if (scores.overall < thresholds.minVideoOverallScore) {
        violations.push({
            metric: 'minVideoOverallScore',
            actual: scores.overall,
            required: thresholds.minVideoOverallScore,
            severity: scores.overall < thresholds.minVideoOverallScore - WARNING_MARGIN ? 'error' : 'warning',
            message: `Overall score ${scores.overall} below threshold ${thresholds.minVideoOverallScore}`,
        });
    }
    
    // Check start frame match
    if (scores.startFrameMatch < thresholds.minStartFrameMatch) {
        violations.push({
            metric: 'minStartFrameMatch',
            actual: scores.startFrameMatch,
            required: thresholds.minStartFrameMatch,
            severity: scores.startFrameMatch < thresholds.minStartFrameMatch - WARNING_MARGIN ? 'error' : 'warning',
            message: `Start frame match ${scores.startFrameMatch} below threshold ${thresholds.minStartFrameMatch}`,
        });
    }
    
    // Check end frame match
    if (scores.endFrameMatch < thresholds.minEndFrameMatch) {
        violations.push({
            metric: 'minEndFrameMatch',
            actual: scores.endFrameMatch,
            required: thresholds.minEndFrameMatch,
            severity: scores.endFrameMatch < thresholds.minEndFrameMatch - WARNING_MARGIN ? 'error' : 'warning',
            message: `End frame match ${scores.endFrameMatch} below threshold ${thresholds.minEndFrameMatch}`,
        });
    }
    
    // Check motion quality
    if (scores.motionQuality < thresholds.minMotionQuality) {
        violations.push({
            metric: 'minMotionQuality',
            actual: scores.motionQuality,
            required: thresholds.minMotionQuality,
            severity: scores.motionQuality < thresholds.minMotionQuality - WARNING_MARGIN ? 'error' : 'warning',
            message: `Motion quality ${scores.motionQuality} below threshold ${thresholds.minMotionQuality}`,
        });
    }
    
    // Check prompt adherence
    if (scores.promptAdherence < thresholds.minPromptAdherence) {
        violations.push({
            metric: 'minPromptAdherence',
            actual: scores.promptAdherence,
            required: thresholds.minPromptAdherence,
            severity: scores.promptAdherence < thresholds.minPromptAdherence - WARNING_MARGIN ? 'error' : 'warning',
            message: `Prompt adherence ${scores.promptAdherence} below threshold ${thresholds.minPromptAdherence}`,
        });
    }
    
    return violations;
}

/**
 * Determine overall decision based on violations
 */
function determineDecision(
    violations: QualityViolation[],
    feedbackResult: VideoFeedbackResult,
    bookendQAModeActive: boolean = false
): {
    decision: QualityGateDecision;
    reason: string;
    shouldReject: boolean;
    suggestedAction: 'accept' | 'regenerate' | 'manual-review';
} {
    const errorViolations = violations.filter(v => v.severity === 'error');
    const warningViolations = violations.filter(v => v.severity === 'warning');
    
    // Separate coherence violations for clearer messaging
    const coherenceErrors = errorViolations.filter(v => String(v.metric).startsWith('coherence:'));
    const qualityErrors = errorViolations.filter(v => !String(v.metric).startsWith('coherence:'));
    
    // No violations = pass
    if (violations.length === 0) {
        const modeNote = bookendQAModeActive ? ' (Bookend QA Mode)' : '';
        return {
            decision: 'pass',
            reason: `Video meets all quality thresholds (overall: ${feedbackResult.scores.overall}/100)${modeNote}`,
            shouldReject: false,
            suggestedAction: 'accept',
        };
    }
    
    // Has error-level violations = fail
    if (errorViolations.length > 0) {
        const issueMessages = errorViolations.map(v => v.message);
        
        // Check for specific failure patterns
        const hasFrameMatchFailure = qualityErrors.some(
            v => v.metric === 'minStartFrameMatch' || v.metric === 'minEndFrameMatch'
        );
        const hasCoherenceFailure = coherenceErrors.length > 0;
        
        // Provide more specific failure reason
        let failureType = '';
        if (hasCoherenceFailure && qualityErrors.length === 0) {
            failureType = 'Coherence gate failed';
        } else if (hasFrameMatchFailure) {
            failureType = 'Frame matching failed';
        } else {
            failureType = 'Quality gate failed';
        }
        
        return {
            decision: 'fail',
            reason: `${failureType}: ${issueMessages.join('; ')}`,
            shouldReject: true,
            suggestedAction: hasFrameMatchFailure || hasCoherenceFailure ? 'regenerate' : 'manual-review',
        };
    }
    
    // Only warnings = warning (allow with caution)
    return {
        decision: 'warning',
        reason: `Quality gate passed with warnings: ${warningViolations.map(v => v.message).join('; ')}`,
        shouldReject: false,
        suggestedAction: 'manual-review',
    };
}

/**
 * Format quality gate result for logging
 */
export function formatQualityGateResult(result: QualityGateResult): string {
    const lines: string[] = [
        `Quality Gate: ${result.decision.toUpperCase()}`,
        `Overall Score: ${result.scores.overall}/100`,
        `Reason: ${result.reason}`,
    ];
    
    if (result.violations.length > 0) {
        lines.push('Violations:');
        result.violations.forEach(v => {
            lines.push(`  - [${v.severity}] ${v.message}`);
        });
    }
    
    if (result.coherenceResult) {
        lines.push(`Coherence Gate: ${result.coherenceResult.decision.toUpperCase()}`);
        if (result.coherenceResult.violations.length > 0) {
            lines.push('Coherence Violations:');
            result.coherenceResult.violations.forEach(v => {
                lines.push(`  - [${v.severity}] ${v.message}`);
            });
        }
    }
    
    lines.push(`Suggested Action: ${result.suggestedAction}`);
    
    return lines.join('\n');
}
