/**
 * Generation Metrics Service
 * 
 * Collects and aggregates metrics for prompt optimization A/B testing.
 * Provides statistical analysis for variant comparison.
 * 
 * @module services/generationMetrics
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Metrics collected for each generation attempt.
 */
export interface GenerationMetrics {
    /** Unique generation identifier */
    generationId: string;
    /** ISO timestamp of generation */
    timestamp: string;
    /** Session identifier for grouping */
    sessionId: string;
    
    // Prompt metadata
    /** Selected prompt variant ID */
    promptVariantId: string;
    /** Human-readable variant label */
    promptVariantLabel?: string;
    /** Total prompt length in characters */
    promptLength: number;
    /** Estimated positive prompt tokens */
    positiveTokens: number;
    /** Estimated negative prompt tokens */
    negativeTokens: number;
    
    // Generation performance
    /** Time to complete generation (ms) */
    generationTimeMs: number;
    /** Time spent in queue (ms), if applicable */
    queueWaitTimeMs?: number;
    /** Provider used (gemini, comfyui, etc.) */
    provider: string;
    
    // Outcome
    /** Whether generation succeeded */
    success: boolean;
    /** Finish reason from provider */
    finishReason: string;
    /** Whether safety filter was triggered */
    safetyFilterTriggered: boolean;
    
    // User signals (optional)
    /** Number of times user regenerated */
    regenerationCount?: number;
    /** User rating 1-5 */
    userRating?: 1 | 2 | 3 | 4 | 5;
    /** Optional user feedback text */
    userFeedback?: string;
}

/**
 * Aggregated summary for a single variant.
 */
export interface MetricsSummary {
    variantId: string;
    variantLabel?: string;
    sampleSize: number;
    successRate: number;
    avgGenerationTimeMs: number;
    avgPositiveTokens: number;
    avgNegativeTokens: number;
    safetyFilterRate: number;
    regenerationRate: number;
    avgUserRating: number | null;
    ratingCount: number;
}

/**
 * Statistical comparison between two variants.
 */
export interface VariantComparison {
    controlId: string;
    treatmentId: string;
    metric: string;
    controlValue: number;
    treatmentValue: number;
    absoluteDiff: number;
    relativeDiff: number;
    isSignificant: boolean;
    sampleSizeControl: number;
    sampleSizeTreatment: number;
}

// ============================================================================
// Metrics Collection
// ============================================================================

/**
 * Generate a unique ID for a generation.
 */
export const generateMetricId = (): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `gen-${timestamp}-${random}`;
};

/**
 * Create a new metrics entry with defaults.
 */
export const createMetrics = (
    partial: Partial<GenerationMetrics> & Pick<GenerationMetrics, 'promptVariantId' | 'provider'>
): GenerationMetrics => {
    return {
        generationId: generateMetricId(),
        timestamp: new Date().toISOString(),
        sessionId: getSessionId(),
        promptLength: 0,
        positiveTokens: 0,
        negativeTokens: 0,
        generationTimeMs: 0,
        success: false,
        finishReason: 'unknown',
        safetyFilterTriggered: false,
        ...partial,
    };
};

// Session ID management
let currentSessionId: string | null = null;

/**
 * Get or create a session ID for grouping metrics.
 */
export const getSessionId = (): string => {
    if (!currentSessionId) {
        currentSessionId = `session-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    }
    return currentSessionId;
};

/**
 * Reset session ID (e.g., on app restart).
 */
export const resetSessionId = (): void => {
    currentSessionId = null;
};

// ============================================================================
// Metrics Aggregation
// ============================================================================

/**
 * Aggregate metrics by variant for A/B analysis.
 */
export const summarizeMetricsByVariant = (
    metrics: GenerationMetrics[]
): Map<string, MetricsSummary> => {
    const byVariant = new Map<string, GenerationMetrics[]>();
    
    // Group by variant
    for (const m of metrics) {
        const list = byVariant.get(m.promptVariantId) || [];
        list.push(m);
        byVariant.set(m.promptVariantId, list);
    }
    
    const summaries = new Map<string, MetricsSummary>();
    
    for (const [variantId, variantMetrics] of byVariant) {
        const n = variantMetrics.length;
        if (n === 0) continue;
        
        const successes = variantMetrics.filter(m => m.success).length;
        const safetyFiltered = variantMetrics.filter(m => m.safetyFilterTriggered).length;
        const totalRegenerations = variantMetrics.reduce(
            (sum, m) => sum + (m.regenerationCount || 0),
            0
        );
        const ratings = variantMetrics
            .filter(m => m.userRating !== undefined)
            .map(m => m.userRating!);
        
        const totalGenTime = variantMetrics.reduce((sum, m) => sum + m.generationTimeMs, 0);
        const totalPosTokens = variantMetrics.reduce((sum, m) => sum + m.positiveTokens, 0);
        const totalNegTokens = variantMetrics.reduce((sum, m) => sum + m.negativeTokens, 0);
        
        summaries.set(variantId, {
            variantId,
            variantLabel: variantMetrics[0]?.promptVariantLabel,
            sampleSize: n,
            successRate: successes / n,
            avgGenerationTimeMs: totalGenTime / n,
            avgPositiveTokens: totalPosTokens / n,
            avgNegativeTokens: totalNegTokens / n,
            safetyFilterRate: safetyFiltered / n,
            regenerationRate: totalRegenerations / n,
            avgUserRating: ratings.length > 0
                ? ratings.reduce((a, b) => a + b, 0) / ratings.length
                : null,
            ratingCount: ratings.length,
        });
    }
    
    return summaries;
};

/**
 * Get summary for a specific variant.
 */
export const getVariantSummary = (
    metrics: GenerationMetrics[],
    variantId: string
): MetricsSummary | null => {
    const summaries = summarizeMetricsByVariant(metrics);
    return summaries.get(variantId) || null;
};

// ============================================================================
// Statistical Analysis
// ============================================================================

/**
 * Minimum sample size for statistical significance.
 */
export const MIN_SAMPLE_SIZE = 30;

/**
 * Minimum sample size for Bayesian analysis.
 * Bayesian methods can work with fewer samples due to prior information.
 */
export const MIN_BAYESIAN_SAMPLE_SIZE = 10;

/**
 * Minimum relative difference to consider significant.
 */
export const MIN_RELATIVE_DIFF = 0.1; // 10%

/**
 * Check if difference between two values is statistically significant.
 * Uses simplified heuristic: >10% relative difference with n≥30.
 * 
 * For production use, consider implementing proper t-test or chi-square.
 */
export const isSignificantDifference = (
    controlValue: number,
    treatmentValue: number,
    controlN: number,
    treatmentN: number
): boolean => {
    // Require minimum sample sizes
    if (controlN < MIN_SAMPLE_SIZE || treatmentN < MIN_SAMPLE_SIZE) {
        return false;
    }
    
    // Handle edge cases
    if (controlValue === 0 && treatmentValue === 0) {
        return false;
    }
    
    if (controlValue === 0) {
        // Any non-zero treatment is significant if control is 0
        return treatmentN >= MIN_SAMPLE_SIZE;
    }
    
    // Calculate relative difference
    const relativeDiff = Math.abs(treatmentValue - controlValue) / Math.abs(controlValue);
    return relativeDiff >= MIN_RELATIVE_DIFF;
};

/**
 * Compare two variants on a specific metric.
 */
export const compareVariants = (
    control: MetricsSummary,
    treatment: MetricsSummary,
    metric: keyof Pick<MetricsSummary, 'successRate' | 'avgGenerationTimeMs' | 'avgUserRating' | 'safetyFilterRate' | 'regenerationRate'>
): VariantComparison | null => {
    const controlValue = control[metric];
    const treatmentValue = treatment[metric];
    
    if (controlValue === null || treatmentValue === null) {
        return null;
    }
    
    const absoluteDiff = treatmentValue - controlValue;
    const relativeDiff = controlValue !== 0
        ? absoluteDiff / Math.abs(controlValue)
        : treatmentValue !== 0 ? Infinity : 0;
    
    return {
        controlId: control.variantId,
        treatmentId: treatment.variantId,
        metric,
        controlValue,
        treatmentValue,
        absoluteDiff,
        relativeDiff,
        isSignificant: isSignificantDifference(
            controlValue,
            treatmentValue,
            control.sampleSize,
            treatment.sampleSize
        ),
        sampleSizeControl: control.sampleSize,
        sampleSizeTreatment: treatment.sampleSize,
    };
};

/**
 * Generate full comparison report between control and treatment variants.
 */
export const generateComparisonReport = (
    metrics: GenerationMetrics[],
    controlId: string,
    treatmentId: string
): {
    control: MetricsSummary | null;
    treatment: MetricsSummary | null;
    comparisons: VariantComparison[];
    overallWinner: string | null;
    confidence: 'low' | 'medium' | 'high';
} => {
    const summaries = summarizeMetricsByVariant(metrics);
    const control = summaries.get(controlId) || null;
    const treatment = summaries.get(treatmentId) || null;
    
    if (!control || !treatment) {
        return {
            control,
            treatment,
            comparisons: [],
            overallWinner: null,
            confidence: 'low',
        };
    }
    
    const metricsToCompare: (keyof Pick<MetricsSummary, 'successRate' | 'avgGenerationTimeMs' | 'safetyFilterRate' | 'regenerationRate'>)[] = [
        'successRate',
        'avgGenerationTimeMs',
        'safetyFilterRate',
        'regenerationRate',
    ];
    
    const comparisons: VariantComparison[] = [];
    let treatmentWins = 0;
    let significantCount = 0;
    
    for (const metric of metricsToCompare) {
        const comparison = compareVariants(control, treatment, metric);
        if (comparison) {
            comparisons.push(comparison);
            
            if (comparison.isSignificant) {
                significantCount++;
                
                // Determine winner based on metric direction
                // Higher is better: successRate
                // Lower is better: avgGenerationTimeMs, safetyFilterRate, regenerationRate
                const higherIsBetter = metric === 'successRate';
                const treatmentIsBetter = higherIsBetter
                    ? comparison.treatmentValue > comparison.controlValue
                    : comparison.treatmentValue < comparison.controlValue;
                
                if (treatmentIsBetter) {
                    treatmentWins++;
                }
            }
        }
    }
    
    // Determine confidence level
    const minSample = Math.min(control.sampleSize, treatment.sampleSize);
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (minSample >= 100 && significantCount >= 2) {
        confidence = 'high';
    } else if (minSample >= 50 && significantCount >= 1) {
        confidence = 'medium';
    }
    
    // Determine overall winner
    let overallWinner: string | null = null;
    if (significantCount > 0) {
        overallWinner = treatmentWins > significantCount / 2 ? treatmentId : controlId;
    }
    
    return {
        control,
        treatment,
        comparisons,
        overallWinner,
        confidence,
    };
};

// ============================================================================
// Bayesian A/B Testing
// ============================================================================

/**
 * Parameters for a Beta distribution.
 * Beta(alpha, beta) where alpha = successes + prior_alpha, beta = failures + prior_beta.
 */
export interface BetaDistribution {
    alpha: number;
    beta: number;
}

/**
 * Result of Bayesian A/B comparison.
 */
export interface BayesianComparison {
    controlId: string;
    treatmentId: string;
    metric: string;
    probabilityTreatmentBetter: number;
    controlSuccessRate: number;
    treatmentSuccessRate: number;
    credibleIntervalControl: [number, number];  // 95% credible interval
    credibleIntervalTreatment: [number, number];
    sampleSizeControl: number;
    sampleSizeTreatment: number;
    hasMinSamples: boolean;
}

/**
 * Create Beta distribution parameters from success/failure counts.
 * Uses Jeffrey's prior (Beta(0.5, 0.5)) as a weakly informative prior.
 * 
 * @param successes Number of successful outcomes
 * @param failures Number of failed outcomes
 * @returns Beta distribution parameters
 */
export const createBetaDistribution = (
    successes: number,
    failures: number
): BetaDistribution => {
    // Jeffrey's prior: Beta(0.5, 0.5) - minimally informative
    const priorAlpha = 0.5;
    const priorBeta = 0.5;
    
    return {
        alpha: successes + priorAlpha,
        beta: failures + priorBeta,
    };
};

/**
 * Calculate mean of Beta distribution.
 */
export const betaMean = (dist: BetaDistribution): number => {
    return dist.alpha / (dist.alpha + dist.beta);
};

/**
 * Calculate variance of Beta distribution.
 */
export const betaVariance = (dist: BetaDistribution): number => {
    const a = dist.alpha;
    const b = dist.beta;
    return (a * b) / ((a + b) ** 2 * (a + b + 1));
};

/**
 * Approximate the Beta CDF using the regularized incomplete beta function.
 * Uses numerical approximation suitable for A/B testing.
 * 
 * Based on continued fraction expansion from Numerical Recipes.
 */
const betaCDF = (x: number, a: number, b: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    
    // Use symmetry: I_x(a,b) = 1 - I_{1-x}(b,a)
    if (x > (a + 1) / (a + b + 2)) {
        return 1 - betaCDF(1 - x, b, a);
    }
    
    // Compute log(Beta(a,b)) using log-gamma approximation
    const logBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
    
    // Continued fraction for regularized incomplete beta
    const front = Math.exp(
        a * Math.log(x) + b * Math.log(1 - x) - logBeta
    ) / a;
    
    // Continued fraction expansion (Lentz's algorithm)
    let f = 1;
    let c = 1;
    let d = 0;
    
    for (let m = 1; m <= 200; m++) {
        const m2 = 2 * m;
        
        // Even step
        let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        f *= c * d;
        
        // Odd step
        aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
        d = 1 + aa * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const delta = c * d;
        f *= delta;
        
        if (Math.abs(delta - 1) < 1e-10) break;
    }
    
    return front * f;
};

/**
 * Lanczos approximation for log-gamma function.
 */
const logGamma = (z: number): number => {
    // Lanczos coefficients for g=7
    const g = 7;
    const c = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];
    
    if (z < 0.5) {
        // Reflection formula: Gamma(z) = pi / (sin(pi*z) * Gamma(1-z))
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
    }
    
    z -= 1;
    let x = c[0]!;
    for (let i = 1; i < g + 2; i++) {
        x += c[i]! / (z + i);
    }
    
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};

/**
 * Approximate quantile (inverse CDF) of Beta distribution using bisection.
 */
const betaQuantile = (p: number, a: number, b: number): number => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    
    // Bisection search
    let low = 0;
    let high = 1;
    let mid: number;
    
    for (let i = 0; i < 50; i++) {
        mid = (low + high) / 2;
        const cdf = betaCDF(mid, a, b);
        
        if (Math.abs(cdf - p) < 1e-10) {
            return mid;
        }
        
        if (cdf < p) {
            low = mid;
        } else {
            high = mid;
        }
    }
    
    return (low + high) / 2;
};

/**
 * Calculate 95% credible interval for Beta distribution.
 */
export const betaCredibleInterval = (dist: BetaDistribution): [number, number] => {
    return [
        betaQuantile(0.025, dist.alpha, dist.beta),
        betaQuantile(0.975, dist.alpha, dist.beta),
    ];
};

/**
 * Calculate P(treatment > control) using Monte Carlo simulation.
 * This is the probability that a randomly sampled treatment success rate
 * is higher than a randomly sampled control success rate.
 * 
 * Uses numerical integration for accuracy.
 */
export const probabilityTreatmentBetter = (
    control: BetaDistribution,
    treatment: BetaDistribution
): number => {
    // Numerical integration using the closed-form solution.
    // P(B > A) = integral over x of [P(A=x) * P(B>x)] dx
    // where P(B>x) is the survival function (1 - CDF) of Beta distribution B
    
    // Use numerical integration with Simpson's rule
    const n = 1000; // number of integration points
    const h = 1 / n;
    let sum = 0;
    
    for (let i = 0; i <= n; i++) {
        const x = i * h;
        
        // PDF of control at x
        const pdfControl = betaPDF(x, control.alpha, control.beta);
        
        // P(treatment > x) = 1 - CDF(x)
        const survivalTreatment = 1 - betaCDF(x, treatment.alpha, treatment.beta);
        
        // Simpson's rule weights: 1, 4, 2, 4, 2, ..., 4, 1
        let weight = 1;
        if (i > 0 && i < n) {
            weight = i % 2 === 0 ? 2 : 4;
        }
        
        sum += weight * pdfControl * survivalTreatment;
    }
    
    return Math.min(1, Math.max(0, (h / 3) * sum));
};

/**
 * Beta PDF (probability density function).
 */
const betaPDF = (x: number, a: number, b: number): number => {
    if (x <= 0 || x >= 1) return 0;
    
    const logBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
    const logPdf = (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta;
    
    return Math.exp(logPdf);
};

/**
 * Perform Bayesian A/B comparison between two variants.
 * Uses Beta-Binomial model for success rate comparison.
 * 
 * @param control Control variant summary
 * @param treatment Treatment variant summary
 * @returns Bayesian comparison result with probability that treatment is better
 */
export const bayesianCompareVariants = (
    control: MetricsSummary,
    treatment: MetricsSummary
): BayesianComparison => {
    // Extract success/failure counts from success rate and sample size
    const controlSuccesses = Math.round(control.successRate * control.sampleSize);
    const controlFailures = control.sampleSize - controlSuccesses;
    const treatmentSuccesses = Math.round(treatment.successRate * treatment.sampleSize);
    const treatmentFailures = treatment.sampleSize - treatmentSuccesses;
    
    // Build Beta distributions
    const controlDist = createBetaDistribution(controlSuccesses, controlFailures);
    const treatmentDist = createBetaDistribution(treatmentSuccesses, treatmentFailures);
    
    // Calculate P(treatment > control)
    const pTreatmentBetter = probabilityTreatmentBetter(controlDist, treatmentDist);
    
    return {
        controlId: control.variantId,
        treatmentId: treatment.variantId,
        metric: 'successRate',
        probabilityTreatmentBetter: pTreatmentBetter,
        controlSuccessRate: control.successRate,
        treatmentSuccessRate: treatment.successRate,
        credibleIntervalControl: betaCredibleInterval(controlDist),
        credibleIntervalTreatment: betaCredibleInterval(treatmentDist),
        sampleSizeControl: control.sampleSize,
        sampleSizeTreatment: treatment.sampleSize,
        hasMinSamples: control.sampleSize >= MIN_BAYESIAN_SAMPLE_SIZE && 
                       treatment.sampleSize >= MIN_BAYESIAN_SAMPLE_SIZE,
    };
};

// ============================================================================
// Export Utilities
// ============================================================================

/**
 * Export metrics to JSON string for external analysis.
 */
export const exportMetricsToJson = (metrics: GenerationMetrics[]): string => {
    return JSON.stringify(metrics, null, 2);
};

/**
 * Export metrics to CSV format.
 */
export const exportMetricsToCsv = (metrics: GenerationMetrics[]): string => {
    if (metrics.length === 0) return '';
    
    const headers = [
        'generationId',
        'timestamp',
        'sessionId',
        'promptVariantId',
        'promptVariantLabel',
        'promptLength',
        'positiveTokens',
        'negativeTokens',
        'generationTimeMs',
        'queueWaitTimeMs',
        'provider',
        'success',
        'finishReason',
        'safetyFilterTriggered',
        'regenerationCount',
        'userRating',
    ];
    
    const rows = metrics.map(m => [
        m.generationId,
        m.timestamp,
        m.sessionId,
        m.promptVariantId,
        m.promptVariantLabel || '',
        m.promptLength,
        m.positiveTokens,
        m.negativeTokens,
        m.generationTimeMs,
        m.queueWaitTimeMs || '',
        m.provider,
        m.success,
        m.finishReason,
        m.safetyFilterTriggered,
        m.regenerationCount || '',
        m.userRating || '',
    ]);
    
    return [
        headers.join(','),
        ...rows.map(row => row.map(v => `"${v}"`).join(',')),
    ].join('\n');
};
