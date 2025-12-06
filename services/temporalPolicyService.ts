/**
 * Temporal Policy Service (E2.2 - Path-Guided Temporal Regularization)
 * 
 * Provides intelligent suggestions for temporal regularization parameters
 * based on motion coherence metrics. Uses camera path adherence, jitter scores,
 * and flicker counts to determine optimal smoothing strength and window size.
 * 
 * This is a rule-based policy that maps motion metrics to temporal regularization
 * settings. It does NOT use ML - the rules are transparent and documented.
 * 
 * @module services/temporalPolicyService
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Motion coherence metrics used for policy decisions.
 * These come from the video quality benchmark (E3).
 */
export interface MotionMetrics {
    /**
     * Mean deviation from expected camera path position.
     * Lower = better path adherence.
     * Range: 0 to ~0.5 (normalized screen units)
     */
    pathAdherenceMeanError?: number;

    /**
     * Direction consistency score (0-1).
     * 1 = observed motion always matches expected direction.
     * 0 = perpendicular motion.
     * Negative = opposite direction.
     */
    pathDirectionConsistency?: number;

    /**
     * Motion jitter score from benchmark.
     * Lower = smoother motion.
     * Typical range: 0-10
     */
    jitterScore?: number;

    /**
     * Number of frames with anomalous brightness (potential flicker).
     * Lower = more stable.
     */
    flickerFrameCount?: number;

    /**
     * Frame-to-frame brightness variance.
     * Lower = more temporally stable.
     */
    brightnessVariance?: number;

    /**
     * Maximum brightness jump between consecutive frames.
     * Used for detecting sudden brightness changes.
     */
    maxBrightnessJump?: number;

    /**
     * Overall quality score (0-100) from benchmark.
     */
    overallQuality?: number;
}

/**
 * Base temporal regularization settings to start from.
 */
export interface BaseTemporalSettings {
    /** Whether temporal regularization is enabled */
    enabled?: boolean;
    /** Smoothing strength (0-1) */
    strength: number;
    /** Window size in frames (2-7) */
    windowFrames: number;
}

/**
 * Policy-suggested temporal regularization settings.
 */
export interface TemporalPolicySuggestion {
    /** The suggested temporal regularization settings */
    suggested: {
        /** Whether to enable temporal regularization */
        enabled: boolean;
        /** Suggested smoothing strength (0-1) */
        strength: number;
        /** Suggested window size in frames (2-7) */
        windowFrames: number;
    };
    /** Human-readable reason for the suggestion */
    reason: string;
    /** Confidence level (0-100 percent) */
    confidence: number;
    /** Which metrics drove this decision */
    drivingFactors?: string[];
    /** Motion category classification */
    motionCategory?: 'low' | 'moderate' | 'high';
}

/**
 * Result of analyzing motion metrics.
 */
export interface MotionAnalysis {
    /** Overall motion quality assessment */
    quality: 'excellent' | 'good' | 'acceptable' | 'poor';
    /** Motion intensity category (for E2.2 compatibility) */
    category: 'low' | 'moderate' | 'high';
    /** Whether temporal smoothing is recommended */
    needsSmoothing: boolean;
    /** Whether path adherence is acceptable */
    pathAdherenceOk: boolean;
    /** Whether jitter is within acceptable limits */
    jitterOk: boolean;
    /** Whether flicker is within acceptable limits */
    flickerOk: boolean;
    /** Specific issues detected */
    issues: string[];
    /** Recommendations for improvement */
    recommendations: string[];
}

// ============================================================================
// Constants & Thresholds
// ============================================================================

/**
 * Thresholds for motion quality assessment.
 * Based on empirical analysis from E3 benchmark runs.
 */
export const MOTION_THRESHOLDS = {
    // Path adherence error (normalized units)
    pathError: {
        excellent: 0.1,
        good: 0.2,
        acceptable: 0.3,
    },
    // Direction consistency (0-1)
    directionConsistency: {
        excellent: 0.8,
        good: 0.6,
        acceptable: 0.4,
    },
    // Jitter score
    jitter: {
        excellent: 2,
        good: 4,
        acceptable: 6,
    },
    // Flicker frame count
    flicker: {
        excellent: 2,
        good: 5,
        acceptable: 10,
    },
    // Brightness variance
    brightnessVariance: {
        excellent: 100,
        good: 300,
        acceptable: 500,
    },
} as const;

/**
 * Temporal regularization parameter bounds.
 */
export const TEMPORAL_BOUNDS = {
    strength: {
        min: 0.2,
        max: 0.7,
        default: 0.3,
    },
    windowFrames: {
        min: 2,
        max: 5,
        default: 3,
    },
} as const;

/**
 * Adjustment factors for policy decisions.
 */
const ADJUSTMENT_FACTORS = {
    // How much to increase strength per "issue level"
    strengthIncrease: {
        mild: 0.05,
        moderate: 0.1,
        severe: 0.15,
    },
    // How much to decrease strength when quality is good
    strengthDecrease: {
        excellent: 0.1,
        good: 0.05,
    },
    // Window frame adjustments
    windowIncrease: 1,
    windowDecrease: 1,
};

// ============================================================================
// Motion Analysis
// ============================================================================

/**
 * Analyze motion metrics to determine quality and issues.
 */
export function analyzeMotionMetrics(metrics: MotionMetrics): MotionAnalysis {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Analyze path adherence
    let pathAdherenceOk = true;
    if (metrics.pathAdherenceMeanError !== undefined) {
        if (metrics.pathAdherenceMeanError > MOTION_THRESHOLDS.pathError.acceptable) {
            pathAdherenceOk = false;
            issues.push(`High path deviation (${metrics.pathAdherenceMeanError.toFixed(3)})`);
            recommendations.push('Consider stronger temporal smoothing to reduce path deviation');
        } else if (metrics.pathAdherenceMeanError > MOTION_THRESHOLDS.pathError.good) {
            issues.push(`Moderate path deviation (${metrics.pathAdherenceMeanError.toFixed(3)})`);
        }
    }

    if (metrics.pathDirectionConsistency !== undefined) {
        if (metrics.pathDirectionConsistency < MOTION_THRESHOLDS.directionConsistency.acceptable) {
            pathAdherenceOk = false;
            issues.push(`Low direction consistency (${metrics.pathDirectionConsistency.toFixed(2)})`);
            recommendations.push('Motion direction inconsistent with expected path');
        }
    }

    // Analyze jitter
    let jitterOk = true;
    if (metrics.jitterScore !== undefined) {
        if (metrics.jitterScore > MOTION_THRESHOLDS.jitter.acceptable) {
            jitterOk = false;
            issues.push(`High jitter (${metrics.jitterScore.toFixed(2)})`);
            recommendations.push('Increase smoothing strength to reduce jitter');
        } else if (metrics.jitterScore > MOTION_THRESHOLDS.jitter.good) {
            issues.push(`Moderate jitter (${metrics.jitterScore.toFixed(2)})`);
        }
    }

    // Analyze flicker
    let flickerOk = true;
    if (metrics.flickerFrameCount !== undefined) {
        if (metrics.flickerFrameCount > MOTION_THRESHOLDS.flicker.acceptable) {
            flickerOk = false;
            issues.push(`High flicker (${metrics.flickerFrameCount} frames)`);
            recommendations.push('Increase window size to reduce flicker');
        } else if (metrics.flickerFrameCount > MOTION_THRESHOLDS.flicker.good) {
            issues.push(`Moderate flicker (${metrics.flickerFrameCount} frames)`);
        }
    }

    if (metrics.brightnessVariance !== undefined) {
        if (metrics.brightnessVariance > MOTION_THRESHOLDS.brightnessVariance.acceptable) {
            flickerOk = false;
            issues.push(`High brightness variance (${metrics.brightnessVariance.toFixed(0)})`);
        }
    }

    // Determine overall quality
    let quality: MotionAnalysis['quality'];
    if (!pathAdherenceOk || !jitterOk || !flickerOk) {
        quality = 'poor';
    } else if (issues.length === 0) {
        quality = 'excellent';
    } else if (issues.length <= 2) {
        quality = 'good';
    } else {
        quality = 'acceptable';
    }

    // Determine motion category (for E2.2 compatibility)
    let category: MotionAnalysis['category'];
    if (quality === 'excellent' || quality === 'good') {
        category = 'low';
    } else if (quality === 'poor') {
        category = 'high';
    } else {
        category = 'moderate';
    }

    // Determine if smoothing is needed
    const needsSmoothing = !pathAdherenceOk || !jitterOk || !flickerOk || issues.length > 0;

    return {
        quality,
        category,
        needsSmoothing,
        pathAdherenceOk,
        jitterOk,
        flickerOk,
        issues,
        recommendations,
    };
}

// ============================================================================
// Policy Suggestion
// ============================================================================

/**
 * Suggest temporal regularization settings based on motion metrics.
 * 
 * Policy rules:
 * 1. If path adherence is poor or jitter is high → increase strength
 * 2. If flicker is high → increase window size
 * 3. If all metrics are excellent → decrease strength to preserve detail
 * 4. Always clamp to safe ranges
 * 
 * @param metrics Motion coherence metrics from video analysis
 * @param base Base settings to adjust from (typically preset defaults)
 * @returns Suggested settings with explanation
 */
export function suggestTemporalRegularization(
    metrics: MotionMetrics,
    base: BaseTemporalSettings
): TemporalPolicySuggestion {
    const analysis = analyzeMotionMetrics(metrics);
    const drivingFactors: string[] = [];
    
    let strength = base.strength;
    let windowFrames = base.windowFrames;
    let confidence = 0.5; // Base confidence
    
    // Start building reason
    const reasonParts: string[] = [];
    
    // === Rule 1: Adjust for path adherence ===
    if (metrics.pathAdherenceMeanError !== undefined) {
        if (metrics.pathAdherenceMeanError > MOTION_THRESHOLDS.pathError.acceptable) {
            strength += ADJUSTMENT_FACTORS.strengthIncrease.severe;
            drivingFactors.push('pathAdherenceMeanError');
            reasonParts.push('high path deviation');
        } else if (metrics.pathAdherenceMeanError > MOTION_THRESHOLDS.pathError.good) {
            strength += ADJUSTMENT_FACTORS.strengthIncrease.moderate;
            drivingFactors.push('pathAdherenceMeanError');
            reasonParts.push('moderate path deviation');
        } else if (metrics.pathAdherenceMeanError <= MOTION_THRESHOLDS.pathError.excellent) {
            strength -= ADJUSTMENT_FACTORS.strengthDecrease.excellent;
            drivingFactors.push('pathAdherenceMeanError');
            reasonParts.push('excellent path adherence');
            confidence += 0.1;
        }
    }
    
    // === Rule 2: Adjust for direction consistency ===
    if (metrics.pathDirectionConsistency !== undefined) {
        if (metrics.pathDirectionConsistency < MOTION_THRESHOLDS.directionConsistency.acceptable) {
            strength += ADJUSTMENT_FACTORS.strengthIncrease.moderate;
            drivingFactors.push('pathDirectionConsistency');
            reasonParts.push('inconsistent motion direction');
        } else if (metrics.pathDirectionConsistency >= MOTION_THRESHOLDS.directionConsistency.excellent) {
            confidence += 0.1;
        }
    }
    
    // === Rule 3: Adjust for jitter ===
    if (metrics.jitterScore !== undefined) {
        if (metrics.jitterScore > MOTION_THRESHOLDS.jitter.acceptable) {
            strength += ADJUSTMENT_FACTORS.strengthIncrease.severe;
            drivingFactors.push('jitterScore');
            reasonParts.push('high jitter');
        } else if (metrics.jitterScore > MOTION_THRESHOLDS.jitter.good) {
            strength += ADJUSTMENT_FACTORS.strengthIncrease.mild;
            drivingFactors.push('jitterScore');
            reasonParts.push('moderate jitter');
        } else if (metrics.jitterScore <= MOTION_THRESHOLDS.jitter.excellent) {
            strength -= ADJUSTMENT_FACTORS.strengthDecrease.good;
            confidence += 0.1;
        }
    }
    
    // === Rule 4: Adjust window for flicker ===
    if (metrics.flickerFrameCount !== undefined) {
        if (metrics.flickerFrameCount > MOTION_THRESHOLDS.flicker.acceptable) {
            windowFrames += ADJUSTMENT_FACTORS.windowIncrease;
            drivingFactors.push('flickerFrameCount');
            reasonParts.push('high flicker');
        } else if (metrics.flickerFrameCount <= MOTION_THRESHOLDS.flicker.excellent) {
            windowFrames -= ADJUSTMENT_FACTORS.windowDecrease;
            confidence += 0.1;
        }
    }
    
    // === Rule 5: Brightness variance affects window ===
    if (metrics.brightnessVariance !== undefined) {
        if (metrics.brightnessVariance > MOTION_THRESHOLDS.brightnessVariance.acceptable) {
            windowFrames += ADJUSTMENT_FACTORS.windowIncrease;
            drivingFactors.push('brightnessVariance');
            reasonParts.push('high brightness variance');
        }
    }
    
    // === Clamp to safe ranges ===
    strength = Math.max(TEMPORAL_BOUNDS.strength.min, Math.min(TEMPORAL_BOUNDS.strength.max, strength));
    windowFrames = Math.max(TEMPORAL_BOUNDS.windowFrames.min, Math.min(TEMPORAL_BOUNDS.windowFrames.max, windowFrames));
    windowFrames = Math.round(windowFrames);
    
    // Round strength to 2 decimal places
    strength = Math.round(strength * 100) / 100;
    
    // Clamp confidence
    confidence = Math.max(0.3, Math.min(1.0, confidence));
    
    // Build final reason
    let reason: string;
    if (reasonParts.length === 0) {
        reason = 'No significant issues detected; using base settings';
    } else if (analysis.quality === 'excellent') {
        reason = `Reduced smoothing: ${reasonParts.join(', ')}`;
    } else {
        reason = `Adjusted for: ${reasonParts.join(', ')}`;
    }

    // Determine motion category
    let motionCategory: 'low' | 'moderate' | 'high' = 'moderate';
    if (analysis.quality === 'excellent' || analysis.quality === 'good') {
        motionCategory = 'low';
    } else if (analysis.quality === 'poor') {
        motionCategory = 'high';
    }

    // Determine if regularization should be enabled
    const enabled = !(analysis.quality === 'excellent' && reasonParts.length === 0);

    return {
        suggested: {
            enabled,
            strength,
            windowFrames,
        },
        reason,
        confidence: Math.round(confidence * 100), // Convert to percentage
        drivingFactors,
        motionCategory,
    };
}

// ============================================================================
// Comparison Utilities
// ============================================================================

/**
 * Compare two sets of settings and describe the difference.
 */
export function describeSettingsDelta(
    before: BaseTemporalSettings,
    after: TemporalPolicySuggestion
): string {
    const parts: string[] = [];

    // Check enabled state change
    if (before.enabled !== undefined && before.enabled !== after.suggested.enabled) {
        parts.push(after.suggested.enabled ? 'enabled temporal regularization' : 'disabled temporal regularization');
    }
    
    const strengthDelta = after.suggested.strength - before.strength;
    if (Math.abs(strengthDelta) >= 0.01) {
        const direction = strengthDelta > 0 ? 'increased' : 'decreased';
        parts.push(`strength ${direction} by ${Math.abs(strengthDelta).toFixed(2)} (${before.strength} → ${after.suggested.strength})`);
    }
    
    const windowDelta = after.suggested.windowFrames - before.windowFrames;
    if (windowDelta !== 0) {
        const direction = windowDelta > 0 ? 'increased' : 'decreased';
        parts.push(`window ${direction} by ${Math.abs(windowDelta)} (${before.windowFrames} → ${after.suggested.windowFrames})`);
    }
    
    if (parts.length === 0) {
        return 'No changes from base settings';
    }
    
    return parts.join('; ');
}

/**
 * Generate a summary report for adaptive temporal regularization.
 */
export interface AdaptiveSummary {
    baseSettings: BaseTemporalSettings;
    adaptiveSettings: TemporalPolicySuggestion;
    delta: string;
    analysis: MotionAnalysis;
}

export function generateAdaptiveSummary(
    metrics: MotionMetrics,
    base: BaseTemporalSettings
): AdaptiveSummary {
    const analysis = analyzeMotionMetrics(metrics);
    const suggestion = suggestTemporalRegularization(metrics, base);
    const delta = describeSettingsDelta(base, suggestion);
    
    return {
        baseSettings: base,
        adaptiveSettings: suggestion,
        delta,
        analysis,
    };
}

export default {
    analyzeMotionMetrics,
    suggestTemporalRegularization,
    describeSettingsDelta,
    generateAdaptiveSummary,
    MOTION_THRESHOLDS,
    TEMPORAL_BOUNDS,
};
