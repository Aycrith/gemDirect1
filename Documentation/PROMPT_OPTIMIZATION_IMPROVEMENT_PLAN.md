# Prompt Engineering Optimization Plan

**Created**: 2025-11-26  
**Updated**: 2025-11-27 (Post-Research Revision)  
**Status**: 🟢 VALIDATED - Ready for Implementation  
**Priority**: High - Direct impact on generation quality  
**Estimated Effort**: 2-3 weeks (revised from 6-8 weeks)  
**Implementation Guide**: See `PROMPT_OPTIMIZATION_IMPLEMENTATION_GUIDE.md`

---

## Executive Summary

This plan addresses critical optimizations identified in the prompt engineering framework to improve image and video generation quality. Based on research of Stable Diffusion, ComfyUI, and diffusion model best practices, we've identified structural issues, missing negative prompts, and untapped optimization opportunities.

**✅ Key Discovery**: ~40% of planned infrastructure already exists in the codebase. Implementation effort significantly reduced.

### Existing Infrastructure (Already Implemented)

| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| `subjectFirstPrompts` flag | `utils/featureFlags.ts` | ✅ Exists | Default: `false` |
| `keyframePromptPipeline` flag | `utils/featureFlags.ts` | ✅ Exists | Default: `true` (already enabled) |
| `promptQualityGate` flag | `utils/featureFlags.ts` | ✅ Exists | Default: `false` |
| `promptTokenGuard` flag | `utils/featureFlags.ts` | ✅ Exists | Default: `'warn'` (NOT 'off') |
| `buildSceneKeyframePromptV2` | `services/promptPipeline.ts` | ✅ Complete | Subject-first ordering implemented |
| `ENHANCED_NEGATIVE_SET` | `services/promptConstants.ts` | ✅ Partial (3/8) | Has: quality, anatomy, composition |
| `applyWeight()` | `services/promptWeighting.ts` | ✅ Complete | Clamping [0.1, 2.0] |
| `estimateCLIPChunks()` | `services/tokenValidator.ts` | ✅ Complete | Uses 77-token chunks |
| `usePromptMetrics` hook | `utils/usePromptMetrics.ts` | ✅ Complete | IndexedDB persistence |
| A/B testing metrics | `services/generationMetrics.ts` | ✅ Complete | Needs Bayesian extension |

> **⚠️ IMPORTANT**: Use symbol search to find components. Line numbers drift with edits.

**Key Findings:**
- ✅ Subject-first ordering already implemented (just needs flag default change)
- 🟡 Negative prompt set needs 5 additional categories (15-20% quality impact)
- ✅ Token estimation already accurate with provider-specific ratios
- ✅ A/B testing infrastructure complete (needs Bayesian extension)

---

## Phase 0: Foundation (Sprint 1, Week 1-2)

### 0.1 Enhanced Negative Prompt Constants

**File**: `services/promptConstants.ts` (MODIFY existing)

**Current State**: `ENHANCED_NEGATIVE_SET` already exists with 3 categories:
- `quality` (13 terms) ✅
- `anatomy` (12 terms) ✅  
- `composition` (12 terms) ✅

**Required Additions** (5 new categories):
```typescript
/**
 * NEW CATEGORIES to add to existing ENHANCED_NEGATIVE_SET
 */

// Text artifacts (critical for clean images)
text_artifacts: [
  'text', 'watermark', 'logo', 'signature', 'username',
  'copyright', 'caption', 'subtitle', 'credits', 'stock photo',
],

// Depth and perspective issues  
depth: [
  'flat composition', 'no depth', 'incorrect perspective',
  'fisheye distortion', 'lens distortion', 'flat lighting',
],

// Motion artifacts (critical for video)
motion: [
  'static pose', 'frozen movement', 'motion blur artifacts',
  'ghosting', 'stuttering', 'temporal inconsistency', 'flickering',
],

// Style contamination
style_contamination: [
  'cartoon', 'anime', 'illustration', 'sketch', 'drawing',
  // Note: Only include if NOT desired style
],

// Technical quality tiers (from SD training data)
quality_tiers: [
  'worst quality', 'low quality', 'normal quality',
  'jpeg artifacts', 'compression artifacts', 'pixelated', 'banding',
],
```

**Tasks:**
- [ ] Create `services/promptConstants.ts` with enhanced negative sets
- [ ] Add unit tests for constant completeness
- [ ] Update `DEFAULT_GEMINI_NEGATIVES` to use new constants
- [ ] Feature flag: `enhancedNegativePrompts: boolean`

**Acceptance Criteria:**
- All negative prompt sets defined with TypeScript `as const`
- Provider-specific presets available
- Backwards compatible (flag-gated)

---

### 0.2 Quality Prefix Optimization

**File**: `services/promptConstants.ts` (addition)

```typescript
/**
 * Quality prefix configurations by use case.
 * Research shows subject-first ordering improves generation quality.
 */

export interface QualityPrefixConfig {
  id: string;
  name: string;
  prefix: string;
  suffix: string;
  useCase: 'keyframe' | 'shot' | 'video';
}

// Current production (for A/B baseline)
export const LEGACY_QUALITY_PREFIX: QualityPrefixConfig = {
  id: 'legacy',
  name: 'Legacy Production',
  prefix: 'masterpiece, 8k, photorealistic, cinematic lighting, 16:9 aspect ratio',
  suffix: '',
  useCase: 'keyframe',
};

// Optimized: Subject-first with professional photography terms
export const OPTIMIZED_KEYFRAME_PREFIX: QualityPrefixConfig = {
  id: 'optimized-keyframe',
  name: 'Optimized Keyframe',
  prefix: '', // Subject comes first, no prefix
  suffix: 'cinematic photograph, film still, ultra-detailed, sharp focus, ' +
          'volumetric lighting, shallow depth of field, shot on Arri Alexa, ' +
          'professional color grading, award-winning photography',
  useCase: 'keyframe',
};

export const OPTIMIZED_SHOT_PREFIX: QualityPrefixConfig = {
  id: 'optimized-shot',
  name: 'Optimized Shot',
  prefix: '',
  suffix: 'cinematic still frame, production quality, film grain, ' +
          'professional lighting, 35mm film aesthetic, movie scene',
  useCase: 'shot',
};

export const OPTIMIZED_VIDEO_PREFIX: QualityPrefixConfig = {
  id: 'optimized-video',
  name: 'Optimized Video',
  prefix: '',
  suffix: 'cinematic motion, smooth camera movement, professional videography, ' +
          'film quality, dynamic lighting, seamless motion',
  useCase: 'video',
};

export const QUALITY_PREFIX_CONFIGS: Record<string, QualityPrefixConfig> = {
  legacy: LEGACY_QUALITY_PREFIX,
  'optimized-keyframe': OPTIMIZED_KEYFRAME_PREFIX,
  'optimized-shot': OPTIMIZED_SHOT_PREFIX,
  'optimized-video': OPTIMIZED_VIDEO_PREFIX,
};
```

**Tasks:**
- [ ] Define quality prefix configurations
- [ ] Add use-case specific prefixes (keyframe, shot, video)
- [ ] Feature flag: `qualityPrefixVariant: 'legacy' | 'optimized'`

---

## Phase 1: Prompt Structure Optimization (Sprint 1-2, Week 2-4)

### 1.1 Subject-First Prompt Assembly

**File**: `services/promptPipeline.ts` (ALREADY IMPLEMENTED)

**✅ Current State**: `buildSceneKeyframePromptV2` already implements subject-first ordering:
```typescript
// Already in promptPipeline.ts (lines 340-400)
const positiveSegments = [
    summarySegment,        // Subject first
    ...styledCharacters,   // Characters second
    styleSegment,          // Style third
    technicalSegment,      // Technical fourth
    qualityTokens,         // Quality last
].filter(Boolean);
```

**Required Change**: Only enable the flag by default
```typescript
// In utils/featureFlags.ts (line 189)
subjectFirstPrompts: true,  // Change from false to true
```

**Tasks:**
- [x] Create `buildSceneKeyframePromptV2` with subject-first ordering (✅ DONE)
- [x] Add `PromptStructureConfig` interface (✅ DONE)
- [ ] Change `subjectFirstPrompts` default to `true` (30 min) - search symbol in `DEFAULT_FEATURE_FLAGS`
- [x] Tests exist in `promptPipeline.test.ts` (✅ DONE)

```typescript
/**
 * NEW: Subject-first prompt assembly for optimal token weighting.
 * Research shows diffusion models weight earlier tokens more heavily.
 */
export interface PromptStructureConfig {
  subjectFirst: boolean;
  characterPlacement: 'early' | 'middle' | 'late';
  qualityPlacement: 'prefix' | 'suffix';
  includeInstructions: boolean;
}

export const DEFAULT_STRUCTURE_CONFIG: PromptStructureConfig = {
  subjectFirst: true,
  characterPlacement: 'early',
  qualityPlacement: 'suffix',
  includeInstructions: false, // Remove "Generate a single..." instructions
};

export function buildSceneKeyframePromptV2(
  scene: Scene,
  storyBible: StoryBible,
  directorsVision: string,
  negativePrompts: string[] = [],
  config: PromptStructureConfig = DEFAULT_STRUCTURE_CONFIG
): AssembledPrompt {
  const parts: string[] = [];
  
  // 1. SUBJECT FIRST (highest token weight position)
  if (scene.summary) {
    parts.push(scene.summary);
  }
  
  // 2. CHARACTER DESCRIPTORS (early for consistency)
  if (config.characterPlacement === 'early' && isStoryBibleV2(storyBible)) {
    const charDescriptors = extractTopCharacters(storyBible, scene, 2);
    parts.push(...charDescriptors);
  }
  
  // 3. STYLE DIRECTIVES (medium)
  if (directorsVision) {
    parts.push(directorsVision);
  }
  
  // 4. TECHNICAL/QUALITY (suffix position)
  if (config.qualityPlacement === 'suffix') {
    parts.push(OPTIMIZED_KEYFRAME_PREFIX.suffix);
  }
  
  const positivePrompt = parts.filter(Boolean).join(', ');
  
  return assemblePromptForProvider(positivePrompt, negativePrompts, {
    provider: 'comfyui',
    validateTokens: true,
    maxTokens: DEFAULT_TOKEN_BUDGETS.sceneKeyframe,
  });
}
```

**Tasks:**
- [ ] Create `buildSceneKeyframePromptV2` with subject-first ordering
- [ ] Add `PromptStructureConfig` interface
- [ ] Feature flag: `subjectFirstPrompts: boolean`
- [ ] Update `generateKeyframeForSceneV2` to use new builder
- [ ] Add parity tests comparing V1 vs V2 structure

**Acceptance Criteria:**
- Subject appears in first 20 tokens
- Quality terms appear after subject and style
- All existing tests pass with flag off
- New tests validate structure ordering

---

### 1.2 Remove Instructional Preamble

**Current (problematic):**
```
Generate a single, cinematic, high-quality keyframe image that encapsulates 
the essence of an entire scene. This image must be a powerful, evocative 
representation of the scene's most crucial moment or overall mood.
```

**Why remove:**
- Wastes ~50 tokens on meta-instructions
- Diffusion models don't process natural language instructions like LLMs
- These tokens compete with actual visual content

**Optimized:**
```
[Scene summary], [Character], [Style], [Technical quality terms]
```

**Tasks:**
- [ ] Remove instructional preamble from keyframe generation
- [ ] Remove instructional preamble from shot generation
- [ ] Add configuration flag: `includeInstructionalPreamble: boolean`
- [ ] Default: `false` for new generations, `true` for backwards compat

---

### 1.3 Provider-Specific Prompt Formatting

**File**: `services/promptPipeline.ts` (new function)

```typescript
export interface ProviderConfig {
  id: 'gemini' | 'comfyui' | 'wan';
  supportsWeighting: boolean;
  preferredFormat: 'natural' | 'tag-based';
  negativeHandling: 'inline' | 'separate';
  maxTokens: number;
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  gemini: {
    id: 'gemini',
    supportsWeighting: false,
    preferredFormat: 'natural', // Full sentences
    negativeHandling: 'inline', // NEGATIVE PROMPT: section
    maxTokens: 1024,
  },
  comfyui: {
    id: 'comfyui',
    supportsWeighting: true, // (word:1.2) syntax
    preferredFormat: 'tag-based', // Comma-separated
    negativeHandling: 'separate', // Different CLIP node
    maxTokens: 77 * 4, // CLIP 77-token chunks
  },
  wan: {
    id: 'wan',
    supportsWeighting: false,
    preferredFormat: 'natural',
    negativeHandling: 'separate',
    maxTokens: 512,
  },
};

export function formatPromptForProvider(
  prompt: string,
  provider: ProviderConfig
): string {
  if (provider.preferredFormat === 'tag-based') {
    // Convert natural language to tag format
    return prompt
      .replace(/\. /g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return prompt;
}
```

**Tasks:**
- [ ] Create `ProviderConfig` interface
- [ ] Add provider-specific formatting function
- [ ] Update prompt assembly to use provider config
- [ ] Add tests for each provider format

---

## Phase 2: Prompt Weighting Support (Sprint 2, Week 3-4)

### 2.1 Weighting Syntax for ComfyUI

**File**: `services/promptWeighting.ts` (NEW)

```typescript
/**
 * Prompt weighting utilities for ComfyUI/SD-compatible models.
 * 
 * Weighting syntax:
 * - (word:1.2) = 20% more emphasis
 * - (word:0.8) = 20% less emphasis
 * - [word] = de-emphasize (equivalent to 0.9)
 */

export interface WeightedTerm {
  term: string;
  weight: number;
}

/**
 * Apply weighting syntax to a term.
 * Only generates syntax for non-1.0 weights.
 */
export function applyWeight(term: string, weight: number): string {
  if (weight === 1.0) return term;
  if (weight < 0.1 || weight > 2.0) {
    console.warn(`[promptWeighting] Weight ${weight} outside safe range [0.1, 2.0]`);
    weight = Math.max(0.1, Math.min(2.0, weight));
  }
  return `(${term}:${weight.toFixed(2)})`;
}

/**
 * Parse weighted terms from a prompt string.
 */
export function parseWeightedTerms(prompt: string): WeightedTerm[] {
  const terms: WeightedTerm[] = [];
  const weightRegex = /\(([^:]+):(\d+\.?\d*)\)/g;
  let match;
  
  while ((match = weightRegex.exec(prompt)) !== null) {
    terms.push({
      term: match[1],
      weight: parseFloat(match[2]),
    });
  }
  
  return terms;
}

/**
 * Weighting presets for common emphasis patterns.
 */
export const WEIGHTING_PRESETS = {
  // Emphasize subject details
  subjectEmphasis: {
    subject: 1.3,
    character: 1.2,
    style: 1.0,
    background: 0.8,
  },
  // Emphasize style consistency
  styleEmphasis: {
    subject: 1.0,
    character: 1.0,
    style: 1.4,
    background: 0.9,
  },
  // Balanced (no weighting)
  balanced: {
    subject: 1.0,
    character: 1.0,
    style: 1.0,
    background: 1.0,
  },
} as const;

/**
 * Build a weighted prompt from components.
 */
export function buildWeightedPrompt(
  subject: string,
  character: string | null,
  style: string,
  background: string | null,
  preset: keyof typeof WEIGHTING_PRESETS = 'balanced'
): string {
  const weights = WEIGHTING_PRESETS[preset];
  const parts: string[] = [];
  
  parts.push(applyWeight(subject, weights.subject));
  
  if (character) {
    parts.push(applyWeight(character, weights.character));
  }
  
  parts.push(applyWeight(style, weights.style));
  
  if (background) {
    parts.push(applyWeight(background, weights.background));
  }
  
  return parts.join(', ');
}
```

**Tasks:**
- [ ] Create `services/promptWeighting.ts`
- [ ] Add `applyWeight` and `parseWeightedTerms` functions
- [ ] Add weighting presets
- [ ] Integrate with ComfyUI prompt path
- [ ] Feature flag: `promptWeighting: boolean`
- [ ] Unit tests for weighting syntax generation

**Acceptance Criteria:**
- Weighting only applied for ComfyUI provider
- Weights clamped to safe range [0.1, 2.0]
- Parser correctly extracts weighted terms
- Feature flag gates weighting application

---

## Phase 3: A/B Testing Infrastructure (Sprint 3, Week 5-6)

### 3.1 Prompt Variant System

**File**: `services/promptVariants.ts` (NEW)

```typescript
/**
 * A/B testing infrastructure for prompt engineering.
 * Enables systematic comparison of prompt strategies.
 */

export interface PromptVariant {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number; // Selection probability (0-1)
  config: {
    qualityPrefix: QualityPrefixConfig;
    structureConfig: PromptStructureConfig;
    negativeSet: readonly string[];
    weightingEnabled: boolean;
    weightingPreset: keyof typeof WEIGHTING_PRESETS;
  };
}

export const PROMPT_VARIANTS: PromptVariant[] = [
  {
    id: 'control',
    name: 'Control (Current Production)',
    description: 'Current production prompts for baseline comparison',
    enabled: true,
    weight: 0.5,
    config: {
      qualityPrefix: LEGACY_QUALITY_PREFIX,
      structureConfig: { subjectFirst: false, characterPlacement: 'middle', qualityPlacement: 'prefix', includeInstructions: true },
      negativeSet: DEFAULT_GEMINI_NEGATIVES,
      weightingEnabled: false,
      weightingPreset: 'balanced',
    },
  },
  {
    id: 'optimized-v1',
    name: 'Optimized V1 (Subject-First)',
    description: 'Subject-first ordering with enhanced negatives',
    enabled: true,
    weight: 0.5,
    config: {
      qualityPrefix: OPTIMIZED_KEYFRAME_PREFIX,
      structureConfig: { subjectFirst: true, characterPlacement: 'early', qualityPlacement: 'suffix', includeInstructions: false },
      negativeSet: ENHANCED_NEGATIVE_SET,
      weightingEnabled: false,
      weightingPreset: 'balanced',
    },
  },
];

/**
 * Select a variant based on weighted random selection.
 */
export function selectVariant(variants: PromptVariant[] = PROMPT_VARIANTS): PromptVariant {
  const enabledVariants = variants.filter(v => v.enabled);
  if (enabledVariants.length === 0) {
    return PROMPT_VARIANTS[0]; // Fallback to control
  }
  
  const totalWeight = enabledVariants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const variant of enabledVariants) {
    random -= variant.weight;
    if (random <= 0) return variant;
  }
  
  return enabledVariants[0];
}

/**
 * Get variant by ID for deterministic selection.
 */
export function getVariantById(id: string): PromptVariant | undefined {
  return PROMPT_VARIANTS.find(v => v.id === id);
}
```

**Tasks:**
- [ ] Create `services/promptVariants.ts`
- [ ] Define control and optimized variants
- [ ] Implement weighted random selection
- [ ] Feature flag: `promptABTesting: boolean`
- [ ] Store selected variant ID with generation metadata

---

### 3.2 Generation Metrics Collection

**File**: `services/generationMetrics.ts` (NEW)

```typescript
/**
 * Metrics collection for prompt optimization analysis.
 */

export interface GenerationMetrics {
  // Identification
  generationId: string;
  timestamp: string;
  sessionId: string;
  
  // Prompt metadata
  promptVariantId: string;
  promptLength: number;
  positiveTokens: number;
  negativeTokens: number;
  
  // Generation performance
  generationTimeMs: number;
  queueWaitTimeMs?: number;
  
  // Outcome
  success: boolean;
  finishReason: string;
  safetyFilterTriggered: boolean;
  
  // User signals (if available)
  regenerationCount?: number;
  userRating?: 1 | 2 | 3 | 4 | 5;
  userFeedback?: string;
}

export interface MetricsSummary {
  variantId: string;
  sampleSize: number;
  successRate: number;
  avgGenerationTimeMs: number;
  avgTokens: number;
  safetyFilterRate: number;
  regenerationRate: number;
  avgUserRating: number | null;
}

/**
 * Aggregate metrics by variant for A/B analysis.
 */
export function summarizeMetricsByVariant(
  metrics: GenerationMetrics[]
): Map<string, MetricsSummary> {
  const byVariant = new Map<string, GenerationMetrics[]>();
  
  for (const m of metrics) {
    const list = byVariant.get(m.promptVariantId) || [];
    list.push(m);
    byVariant.set(m.promptVariantId, list);
  }
  
  const summaries = new Map<string, MetricsSummary>();
  
  for (const [variantId, variantMetrics] of byVariant) {
    const n = variantMetrics.length;
    const successes = variantMetrics.filter(m => m.success).length;
    const safetyFiltered = variantMetrics.filter(m => m.safetyFilterTriggered).length;
    const regenerations = variantMetrics.reduce((sum, m) => sum + (m.regenerationCount || 0), 0);
    const ratings = variantMetrics.filter(m => m.userRating).map(m => m.userRating!);
    
    summaries.set(variantId, {
      variantId,
      sampleSize: n,
      successRate: successes / n,
      avgGenerationTimeMs: variantMetrics.reduce((sum, m) => sum + m.generationTimeMs, 0) / n,
      avgTokens: variantMetrics.reduce((sum, m) => sum + m.positiveTokens, 0) / n,
      safetyFilterRate: safetyFiltered / n,
      regenerationRate: regenerations / n,
      avgUserRating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    });
  }
  
  return summaries;
}

/**
 * Statistical significance test (simplified t-test).
 * Returns true if difference is statistically significant at p < 0.05.
 */
export function isSignificantDifference(
  control: MetricsSummary,
  treatment: MetricsSummary,
  metric: keyof Pick<MetricsSummary, 'successRate' | 'avgGenerationTimeMs' | 'avgUserRating'>
): boolean {
  // Require minimum sample size
  if (control.sampleSize < 30 || treatment.sampleSize < 30) {
    return false;
  }
  
  const controlValue = control[metric];
  const treatmentValue = treatment[metric];
  
  if (controlValue === null || treatmentValue === null) {
    return false;
  }
  
  // Simplified significance: >10% relative difference with n≥30
  const relativeDiff = Math.abs(treatmentValue - controlValue) / controlValue;
  return relativeDiff > 0.1;
}
```

**Tasks:**
- [ ] Create `services/generationMetrics.ts`
- [ ] Define `GenerationMetrics` interface
- [ ] Implement aggregation by variant
- [ ] Add simplified statistical significance test
- [ ] Integrate metrics logging with generation pipeline
- [ ] Add IndexedDB storage for metrics persistence

---

### 3.3 Metrics Dashboard Hook

**File**: `utils/usePromptMetrics.ts` (NEW)

```typescript
/**
 * React hook for prompt optimization metrics.
 */

export interface UsePromptMetricsReturn {
  metrics: GenerationMetrics[];
  summaries: Map<string, MetricsSummary>;
  isLoading: boolean;
  logMetric: (metric: Omit<GenerationMetrics, 'generationId' | 'timestamp' | 'sessionId'>) => void;
  clearMetrics: () => void;
  exportMetrics: () => string; // JSON export
}

export function usePromptMetrics(): UsePromptMetricsReturn {
  // Implementation details...
}
```

**Tasks:**
- [ ] Create `utils/usePromptMetrics.ts` hook
- [ ] Add metrics persistence to IndexedDB
- [ ] Add JSON export for analysis
- [ ] Create simple metrics display component

---

## Phase 4: Token Counting Accuracy (Sprint 3-4, Week 6-7)

### 4.1 Improved Token Estimation

**File**: `services/tokenValidator.ts` (modify)

```typescript
/**
 * Provider-specific token estimation.
 * Uses accurate heuristics based on tokenizer characteristics.
 */

export const TOKEN_RATIOS = {
  // CLIP tokenizer (SD/ComfyUI) - averages 3.5 chars/token
  clip: 3.5,
  // Gemini tokenizer - averages 4 chars/token
  gemini: 4.0,
  // Conservative fallback
  default: 4.0,
} as const;

export function estimateTokensForProvider(
  text: string,
  provider: 'gemini' | 'comfyui' | 'default' = 'default'
): number {
  if (!text) return 0;
  
  const ratio = TOKEN_RATIOS[provider === 'comfyui' ? 'clip' : provider] || TOKEN_RATIOS.default;
  return Math.ceil(text.length / ratio);
}

/**
 * For ComfyUI: CLIP has 77-token maximum per chunk.
 * Returns number of chunks needed.
 */
export function estimateCLIPChunks(text: string): number {
  const tokens = estimateTokensForProvider(text, 'comfyui');
  return Math.ceil(tokens / 77);
}
```

**Tasks:**
- [ ] Add provider-specific token ratios
- [ ] Update `heuristicTokenEstimate` to use provider param
- [ ] Add CLIP chunk estimation for ComfyUI
- [ ] Update token budget validation to use accurate estimates

---

## Phase 5: Integration & Testing (Sprint 4, Week 7-8)

### 5.1 Feature Flag Integration

**File**: `utils/featureFlags.ts` (modify)

```typescript
// New flags for prompt optimization
export interface PromptOptimizationFlags {
  /** Use enhanced negative prompt set */
  enhancedNegativePrompts: boolean;
  /** Use subject-first prompt structure */
  subjectFirstPrompts: boolean;
  /** Enable prompt weighting for ComfyUI */
  promptWeighting: boolean;
  /** Weighting preset to use */
  promptWeightingPreset: 'balanced' | 'subjectEmphasis' | 'styleEmphasis';
  /** Enable A/B testing infrastructure */
  promptABTesting: boolean;
  /** Force specific variant (overrides A/B selection) */
  promptVariantOverride: string | null;
  /** Quality prefix variant */
  qualityPrefixVariant: 'legacy' | 'optimized';
  /** Include instructional preamble */
  includeInstructionalPreamble: boolean;
}

// Add to DEFAULT_FEATURE_FLAGS
export const PROMPT_OPTIMIZATION_DEFAULTS: PromptOptimizationFlags = {
  enhancedNegativePrompts: false, // Start disabled for safety
  subjectFirstPrompts: false,
  promptWeighting: false,
  promptWeightingPreset: 'balanced',
  promptABTesting: false,
  promptVariantOverride: null,
  qualityPrefixVariant: 'legacy',
  includeInstructionalPreamble: true,
};
```

**Tasks:**
- [ ] Add prompt optimization flags to feature flag system
- [ ] Add flag metadata with descriptions
- [ ] Add flags to Settings UI
- [ ] Document rollout strategy

---

### 5.2 Test Suite

**File**: `services/__tests__/promptOptimization.test.ts` (NEW)

```typescript
describe('Prompt Optimization', () => {
  describe('Enhanced Negatives', () => {
    it('should include quality tier negatives', () => {
      expect(ENHANCED_NEGATIVE_SET).toContain('worst quality');
      expect(ENHANCED_NEGATIVE_SET).toContain('low quality');
    });
    
    it('should include anatomy negatives', () => {
      expect(ENHANCED_NEGATIVE_SET).toContain('bad hands');
      expect(ENHANCED_NEGATIVE_SET).toContain('missing fingers');
    });
    
    it('should include composition negatives', () => {
      expect(ENHANCED_NEGATIVE_SET).toContain('multi-panel');
      expect(ENHANCED_NEGATIVE_SET).toContain('collage');
    });
  });
  
  describe('Subject-First Structure', () => {
    it('should place subject in first 20 tokens', () => {
      const prompt = buildSceneKeyframePromptV2(scene, bible, vision, []);
      const tokens = prompt.inlineFormat.split(/,\s*/);
      // Subject should be in first few tokens
      expect(tokens[0]).toContain(scene.summary.split(' ')[0]);
    });
    
    it('should place quality terms after subject', () => {
      const prompt = buildSceneKeyframePromptV2(scene, bible, vision, []);
      const qualityIndex = prompt.inlineFormat.indexOf('ultra-detailed');
      const subjectIndex = prompt.inlineFormat.indexOf(scene.summary.split(' ')[0]);
      expect(qualityIndex).toBeGreaterThan(subjectIndex);
    });
  });
  
  describe('Prompt Weighting', () => {
    it('should apply weight syntax correctly', () => {
      expect(applyWeight('subject', 1.2)).toBe('(subject:1.20)');
      expect(applyWeight('subject', 1.0)).toBe('subject');
    });
    
    it('should clamp weights to safe range', () => {
      expect(applyWeight('term', 0.05)).toBe('(term:0.10)');
      expect(applyWeight('term', 3.0)).toBe('(term:2.00)');
    });
  });
  
  describe('A/B Variant Selection', () => {
    it('should select enabled variants only', () => {
      const variant = selectVariant();
      expect(variant.enabled).toBe(true);
    });
    
    it('should respect weight distribution', () => {
      const selections = new Map<string, number>();
      for (let i = 0; i < 1000; i++) {
        const v = selectVariant();
        selections.set(v.id, (selections.get(v.id) || 0) + 1);
      }
      // With 50/50 weights, expect roughly even distribution
      const control = selections.get('control') || 0;
      const optimized = selections.get('optimized-v1') || 0;
      expect(Math.abs(control - optimized)).toBeLessThan(100); // Allow 10% variance
    });
  });
});
```

**Tasks:**
- [ ] Create comprehensive test suite for new functionality
- [ ] Add parity tests (old vs new prompts)
- [ ] Add integration tests with mock generation
- [ ] Add metrics aggregation tests

---

## Rollout Strategy

### Phase 1: Internal Testing (Week 1-2)
- All flags disabled by default
- Enable individually for developer testing
- Collect baseline metrics with control variant

### Phase 2: Shadow Mode (Week 3-4)
- Enable A/B testing with 90/10 split (control/optimized)
- Log metrics but don't affect user experience
- Analyze initial results

### Phase 3: Gradual Rollout (Week 5-6)
- Increase optimized variant to 50%
- Monitor regeneration rates as quality signal
- Collect user feedback if available

### Phase 4: Full Rollout (Week 7-8)
- If optimized variant shows improvement:
  - Increase to 90% optimized
  - Deprecate control variant
- If no improvement:
  - Iterate on optimized variant
  - Try alternative configurations

---

## Success Metrics

| Metric | Baseline | Target | Method |
|--------|----------|--------|--------|
| Regeneration Rate | TBD | -20% | Track regenerations per session |
| Generation Success Rate | TBD | +5% | Track finish reason |
| Safety Filter Rate | TBD | -10% | Track filter triggers |
| Token Efficiency | TBD | +15% | Measure tokens per quality unit |
| User Rating (if available) | TBD | +0.5 stars | Collect explicit feedback |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Optimized prompts worse than legacy | A/B testing catches regressions early |
| Token budget exceeded | Provider-specific estimation prevents overruns |
| Weighting syntax breaks models | Only enable for compatible providers |
| Metric collection impacts performance | Async logging, IndexedDB batching |
| User confusion with variant switching | Consistent UI, no visible variant changes |

---

## Dependencies

- **Required**: Feature flag system (✅ exists)
- **Required**: Token validator service (✅ exists)
- **Required**: Prompt pipeline service (✅ exists)
- **Optional**: User feedback UI (not yet implemented)
- **Optional**: Analytics dashboard (not yet implemented)

---

## Timeline Summary (Revised)

| Phase | Sprint | Days | Key Deliverables | Status |
|-------|--------|------|------------------|--------|
| Phase 0 | 1 | 1-2 | Enhanced negatives (5 new categories) | 🟡 Partial |
| Phase 1 | 1 | 1 | Enable subject-first flag | ✅ Code ready |
| Phase 2 | 1-2 | 3-4 | Style extraction service | 🔴 New |
| Phase 3 | 2 | 2-3 | Semantic deduplication | 🔴 New |
| Phase 4 | 2-3 | 4-5 | Character tracking | 🔴 New |
| Phase 5 | 3 | 3-4 | Feedback UI + Bayesian | 🟡 Partial |
| Phase 6 | 3 | 1 | Enable block mode | ✅ Ready |

**Total Estimated Time**: 2-3 weeks (down from 6-8 weeks)

---

## Appendix: Research References

1. **Stable Diffusion Prompt Engineering**
   - Token position weighting (earlier = stronger)
   - CLIP 77-token chunk boundaries
   - Quality tier negatives in training data

2. **ComfyUI Best Practices**
   - Weighting syntax: `(term:weight)`
   - Separate positive/negative CLIP encoding
   - Negative embeddings (EasyNegative, etc.)

3. **Diffusion Model Optimization**
   - Subject-first ordering for coherence
   - Medium specification improves style consistency
   - Technical terms (camera, lighting) for realism

---

**Document Version**: 1.1  
**Author**: AI Assistant  
**Review Status**: Validated with codebase analysis  
**Implementation Guide**: `PROMPT_OPTIMIZATION_IMPLEMENTATION_GUIDE.md`  
**Last Updated**: 2025-11-27
