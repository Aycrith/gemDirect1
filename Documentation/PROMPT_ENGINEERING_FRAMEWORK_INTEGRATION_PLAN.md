# Prompt Engineering Framework Integration Plan

**Version**: 2.0  
**Date**: November 26, 2025  
**Status**: Ready for Implementation  
**Classification**: Technical Design Document

---

## Executive Summary

This document presents a comprehensive plan for integrating a unified prompt engineering framework into the gemDirect1 Story-to-Video pipeline. The framework consolidates prompt assembly, token budgeting, negative prompt management, and feature flag controls into a single, testable architecture that supports gradual rollout across all generation paths (Gemini LLM, ComfyUI image, ComfyUI video, and bookend sequences).

### Key Objectives

1. **Unified Prompt Assembly**: Single canonical assembler (`assemblePromptForProvider`) used by all generation paths
2. **Token Budget Enforcement**: Consistent validation with configurable warn/block modes
3. **Negative Prompt Pipeline**: Deduplicated merge with provenance tracking
4. **Feature Flag Governance**: Progressive rollout with instant rollback capability
5. **Character Descriptor Sync**: Conservative provenance-aware synchronization

### Business Value

| Metric | Expected Impact |
|--------|-----------------|
| Prompt quality consistency | +40% reduction in malformed outputs |
| Development velocity | -30% time debugging prompt issues |
| Rollback time | <1 minute (flag toggle vs deployment) |
| Test coverage | 95%+ for prompt pipeline paths |

---

## Table of Contents

1. [Background & Research](#1-background--research)
2. [Objectives](#2-objectives)
3. [Architecture Overview](#3-architecture-overview)
4. [Implementation Phases](#4-implementation-phases)
5. [Methodology](#5-methodology)
6. [Potential Challenges & Mitigations](#6-potential-challenges--mitigations)
7. [Benefits Analysis](#7-benefits-analysis)
8. [Testing Strategy](#8-testing-strategy)
9. [Rollout Strategy](#9-rollout-strategy)
10. [Flag Lifecycle Management](#10-flag-lifecycle-management)
11. [API and Data Contracts](#11-api-and-data-contracts)
12. [Token Budget Calibration](#12-token-budget-calibration)
13. [Negative Prompt Policy](#13-negative-prompt-policy)
14. [Observability Plan](#14-observability-plan)
15. [Revised Timeline](#15-revised-timeline)
16. [Documentation Requirements](#16-documentation-requirements)
17. [Recommendations](#17-recommendations)
18. [Appendices](#18-appendices)

---

## 1. Background & Research

### 1.1 Industry Context: Feature Flags

Feature flags (also called feature toggles) are a foundational practice in modern software delivery. According to Martin Fowler's authoritative article on the subject:

> "Feature Toggles are a powerful technique, allowing teams to modify system behavior without changing code. They fall into various usage categories, and it's important to take that categorization into account when implementing and managing toggles."
> — *Pete Hodgson, ThoughtWorks, October 2017*

#### Feature Flag Categories Applied to This Plan

| Category | Our Implementation | Lifespan | Dynamism |
|----------|-------------------|----------|----------|
| **Release Toggles** | `keyframePromptPipeline`, `videoPromptPipeline` | Weeks | Static |
| **Ops Toggles** | `promptTokenGuard`, `sceneListValidationMode` | Months | Dynamic |
| **Experiment Toggles** | `actContextV2`, `sceneListContextV2` | Weeks | Static |

**Key Insight**: Release toggles should be short-lived (weeks, not months). We must plan for flag removal after stabilization.

#### Best Practices Incorporated

From the Martin Fowler article, we adopt:

1. **Decouple Decision Points from Decision Logic**: Our `FeatureDecisions` pattern via `utils/featureFlags.ts`
2. **Inversion of Decision**: Flags injected at construction time, not queried inline
3. **Avoid Conditional Sprawl**: Strategy pattern for long-lived toggles
4. **Flag Expiration**: Metadata includes `stability` field for tracking

### 1.2 Token Management in LLM Applications

The Google Gen AI SDK provides explicit token counting capabilities:

```typescript
// From @google/genai SDK documentation
const response = await ai.models.countTokens({
  model: 'gemini-2.5-flash',
  contents: longText,
  config: {
    systemInstruction: 'You are a helpful assistant',
    tools: [{ functionDeclarations: [{ name: 'search', parameters: { type: 'object' } }] }]
  }
});

console.log('Total tokens:', response.totalTokens);
console.log('Prompt tokens:', response.promptTokens);

const maxTokens = 1000000; // Model limit
if (response.totalTokens > maxTokens) {
  console.warn(`Content exceeds limit by ${response.totalTokens - maxTokens} tokens`);
}
```

**Our Token Budget Strategy**:
- Use 4 chars/token estimation (conservative, model-agnostic)
- Pre-validate before API calls to avoid wasted requests
- Configurable warn/block modes via `promptTokenGuard` flag

#### Current Token Budgets (from `promptRegistry.ts`)

| Section | Budget (tokens) | Chars (~) | Purpose |
|---------|-----------------|-----------|---------|
| `logline` | 500 | 2000 | Story logline |
| `characterProfile` | 400 | 1600 | Per-character |
| `setting` | 600 | 2400 | Setting description |
| `plotScene` | 200 | 800 | Per-scene context |
| `comfyuiShot` | 500 | 2000 | ComfyUI shot prompt |
| `plotOutline` | 800 | 3200 | Full plot outline |
| **`sceneKeyframe`** | 600 | 2400 | **NEW** - Keyframe positive prompt |

### 1.3 Negative Prompts in Image/Video Generation

Research from Stable Diffusion Art demonstrates the critical importance of negative prompts:

> "Using just two to three negative prompts progressively improves the aesthetic of the images. I would say this is pretty near the quality of v1 models."
> — *Andrew, Stable Diffusion Art, 2023*

#### Universal Negative Prompt (Validated)

```
ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, 
out of frame, extra limbs, disfigured, deformed, body out of frame, 
bad anatomy, watermark, signature, cut off, low contrast, underexposed, 
overexposed, bad art, beginner, amateur, distorted face
```

#### Our Current Default (from `payloadService.ts`)

```typescript
export const DEFAULT_NEGATIVE_PROMPT = 
  'blurry, low-resolution, watermark, text, bad anatomy, distorted, ' +
  'unrealistic, oversaturated, undersaturated, motion blur';
```

**Key Finding**: Negative prompts are more important for newer model versions. Our merge strategy must:
1. Preserve prompt.negative (source-specific)
2. Apply scene/timeline negatives (context-specific)
3. Fall back to defaults (safety net)

### 1.4 ComfyUI Workflow Integration

From the official ComfyUI documentation:

```json
// POST /prompt endpoint
{
  "prompt": {
    "1": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": "model.safetensors" }
    }
  },
  "client_id": "client123"
}

// Response
{
  "prompt_id": "abc123def456",
  "number": 1  // Queue position
}
```

Our `assemblePromptForProvider` must produce prompts compatible with this structure, specifically:
- `separateFormat` for ComfyUI (positive/negative as separate fields)
- `inlineFormat` for Gemini (combined with delimiter)

### 1.5 Current Codebase Analysis

#### Existing Strengths

| Component | Status | Quality |
|-----------|--------|---------|
| `featureFlags.ts` | ✅ Complete | 10 flags, metadata, validation |
| `promptRegistry.ts` | ✅ Complete | Token budgets, truncation |
| `promptPipeline.ts` | ⚠️ Partial | `buildComfyUIPrompt` exists, no assembler |
| `migrations.ts` | ✅ Complete | Version 2, extensible |

#### Identified Gaps

| Gap | Impact | Resolution |
|-----|--------|------------|
| No `assemblePromptForProvider` | Medium | CREATE in Phase 1 |
| No `buildSceneKeyframePrompt` | Medium | CREATE in Phase 1 |
| No `pipelineContext.ts` | Low | CREATE in Phase 0 |
| No `sceneListValidator.ts` | Medium | CREATE in Phase 2 |
| Duplicated `getNarrativeContext` | Low | EXTRACT in Phase 3 |
| No `descriptorSource` on types | Medium | ADD in Phase 0 |

---

## 2. Objectives

### 2.1 Primary Objectives

| ID | Objective | Success Criteria | Priority |
|----|-----------|------------------|----------|
| O1 | Unified prompt assembly | Single function for all paths | P0 |
| O2 | Token budget enforcement | <1% overflow in production | P0 |
| O3 | Negative prompt consistency | First-wins dedup across all paths | P1 |
| O4 | Feature flag governance | <1min rollback capability | P0 |
| O5 | Character sync provenance | User edits never overwritten | P1 |

### 2.2 Secondary Objectives

| ID | Objective | Success Criteria | Priority |
|----|-----------|------------------|----------|
| O6 | Scene validation | <3% false positive rate | P2 |
| O7 | Act mapping accuracy | V2 uses actual act numbers | P2 |
| O8 | Test coverage | 95%+ for new code | P1 |
| O9 | Documentation | All flags documented | P2 |

### 2.3 Non-Objectives (Out of Scope)

- Model-specific prompt optimization
- Dynamic negative prompt learning
- Multi-language prompt support
- Prompt caching layer

---

## 3. Architecture Overview

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Application Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   App.tsx   │  │TimelineEdit │  │ SceneGen    │  │GenSceneImg  │ │
│  │             │  │   or.tsx    │  │Pipeline.ts  │  │Button.tsx   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────┬───────┴────────────────┘        │
│                                   │                                  │
│                          ┌────────▼────────┐                        │
│                          │  Service Layer  │                        │
│  ┌───────────────────────┴─────────────────┴───────────────────┐   │
│  │                                                               │   │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌────────────┐  │   │
│  │  │ geminiService   │   │comfyUIService   │   │ payloadSvc │  │   │
│  │  │                 │   │                 │   │            │  │   │
│  │  │ • generateKey   │   │ • generateScene │   │ • build    │  │   │
│  │  │   frame...      │   │   Keyframe...   │   │   Payload  │  │   │
│  │  │ • generateImg   │   │ • generateVideo │   │            │  │   │
│  │  │   ForShot       │   │   FromBookends  │   │            │  │   │
│  │  └────────┬────────┘   └────────┬────────┘   └────────────┘  │   │
│  │           │                     │                             │   │
│  │           └──────────┬──────────┘                             │   │
│  │                      │                                        │   │
│  │             ┌────────▼────────┐                               │   │
│  │             │ promptPipeline  │ ◄─── NEW: assemblePromptFor   │   │
│  │             │                 │      Provider, buildScene     │   │
│  │             │ • buildComfyUI  │      KeyframePrompt           │   │
│  │             │   Prompt        │                               │   │
│  │             │ • syncCharacter │                               │   │
│  │             │   Descriptors   │                               │   │
│  │             └────────┬────────┘                               │   │
│  │                      │                                        │   │
│  │  ┌───────────────────┼───────────────────────────────────┐   │   │
│  │  │                   │        Utility Layer              │   │   │
│  │  │  ┌────────────────▼──────────────┐  ┌──────────────┐  │   │   │
│  │  │  │     promptRegistry.ts         │  │featureFlags  │  │   │   │
│  │  │  │  • estimateTokens             │  │  .ts         │  │   │   │
│  │  │  │  • truncateToTokenLimit       │  │              │  │   │   │
│  │  │  │  • validateTokenBudget        │  │• getFeature  │  │   │   │
│  │  │  │  • DEFAULT_TOKEN_BUDGETS      │  │  Flag        │  │   │   │
│  │  │  └───────────────────────────────┘  │• isFeature   │  │   │   │
│  │  │                                     │  Enabled     │  │   │   │
│  │  │  ┌───────────────────────────────┐  └──────────────┘  │   │   │
│  │  │  │     pipelineContext.ts  NEW   │                    │   │   │
│  │  │  │  • ensureLogApiCall           │  ┌──────────────┐  │   │   │
│  │  │  │  • assertPipelineContext      │  │narrativeCon  │  │   │   │
│  │  │  └───────────────────────────────┘  │text.ts  NEW  │  │   │   │
│  │  │                                     │              │  │   │   │
│  │  │  ┌───────────────────────────────┐  │• getNarrat   │  │   │   │
│  │  │  │     sceneListValidator.ts NEW │  │  iveContext  │  │   │   │
│  │  │  │  • validateSceneSummary       │  └──────────────┘  │   │   │
│  │  │  └───────────────────────────────┘                    │   │   │
│  │  └───────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow: Prompt Assembly

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  StoryBible  │     │    Scene     │     │DirectorsVsn  │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                   ┌────────▼────────┐
                   │ buildScene      │
                   │ KeyframePrompt  │
                   └────────┬────────┘
                            │
                   ┌────────▼────────┐
                   │ ComfyUIPrompt   │
                   │ {positive,      │
                   │  negative,      │
                   │  tokens}        │
                   └────────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│additionalNegs │   │   prompt      │   │ defaultNegs   │
│(scene/timeline)│  │  .negative    │   │(provider)     │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                   ┌────────▼────────┐
                   │ assemblePrompt  │
                   │ ForProvider     │
                   └────────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│ inlineFormat  │   │separateFormat │   │ mergedNegative│
│(Gemini)       │   │(ComfyUI)      │   │(deduplicated) │
└───────────────┘   └───────────────┘   └───────────────┘
```

### 3.3 New Feature Flags

| Flag | Type | Default | Category | Description |
|------|------|---------|----------|-------------|
| `sceneListContextV2` | `boolean` | `false` | pipeline | Use V2 context in scene generation |
| `keyframePromptPipeline` | `boolean` | `false` | pipeline | Use `buildSceneKeyframePrompt` |
| `videoPromptPipeline` | `boolean` | `false` | pipeline | Use assembler for video paths |
| `actContextV2` | `boolean` | `false` | pipeline | Use `plotScene.actNumber` mapping |
| `bibleV2SaveSync` | `boolean` | `false` | pipeline | Auto-sync descriptors on save |
| `sceneListValidationMode` | `'off'\|'warn'\|'block'` | `'off'` | pipeline | Scene summary validator mode |
| `promptTokenGuard` | `'off'\|'warn'\|'block'` | `'off'` | pipeline | Token budget enforcement |

---

## 4. Implementation Phases

### Phase 0: Infrastructure Foundation

**Duration**: 1-2 days  
**Risk**: Low  
**Dependencies**: None

#### Step 1: Extend Feature Flags

**File**: `utils/featureFlags.ts`

Add 7 new flags to `FeatureFlags` interface:

```typescript
export interface FeatureFlags {
  // ... existing flags ...
  
  /** Use V2 context in scene generation */
  sceneListContextV2: boolean;
  /** Use buildSceneKeyframePrompt for keyframe generation */
  keyframePromptPipeline: boolean;
  /** Use assembler for video generation paths */
  videoPromptPipeline: boolean;
  /** Use plotScene.actNumber for act mapping */
  actContextV2: boolean;
  /** Auto-sync descriptors on Story Bible save */
  bibleV2SaveSync: boolean;
  /** Scene summary validator mode */
  sceneListValidationMode: 'off' | 'warn' | 'block';
  /** Token budget enforcement mode */
  promptTokenGuard: 'off' | 'warn' | 'block';
}
```

Add `loadFeatureFlags()` function:

```typescript
export function loadFeatureFlags(
  source?: Partial<FeatureFlags>
): FeatureFlags {
  const flags = mergeFeatureFlags(source);
  
  // Validate union types
  if (flags.sceneListValidationMode && 
      !['off', 'warn', 'block'].includes(flags.sceneListValidationMode)) {
    console.warn(`Invalid sceneListValidationMode: ${flags.sceneListValidationMode}`);
    flags.sceneListValidationMode = 'off';
  }
  
  return flags;
}
```

#### Step 2: CREATE `utils/pipelineContext.ts`

**Purpose**: Centralize pipeline context assertions and fallbacks

```typescript
/**
 * Pipeline Context Utilities
 * 
 * Provides assertion helpers for pipeline context validation.
 * Ensures logApiCall and other required context is available.
 */

import { ApiLogCallback } from '../types';

/**
 * No-op API log callback for fallback scenarios
 */
const noOpLogCallback: ApiLogCallback = () => {};

/**
 * Ensures logApiCall is available, returning no-op if missing
 */
export function ensureLogApiCall(
  logApiCall?: ApiLogCallback
): ApiLogCallback {
  return logApiCall ?? noOpLogCallback;
}

/**
 * Asserts pipeline context is valid.
 * - In CI: throws on missing context
 * - In dev/prod: logs error and continues
 */
export function assertPipelineContext(
  context: { logApiCall?: ApiLogCallback },
  flagName: string
): void {
  const isCI = import.meta.env.VITE_CI_MODE === 'true';
  const isDev = import.meta.env.DEV;
  
  if (!context.logApiCall) {
    const message = `Pipeline context missing logApiCall for ${flagName}`;
    
    if (isCI) {
      throw new Error(message);
    } else if (isDev) {
      console.error(`[Pipeline] ${message}`);
    }
    // In prod: silent (already using ensureLogApiCall fallback)
  }
}
```

#### Step 3: Add `sceneKeyframe` Token Budget

**File**: `services/promptRegistry.ts`

```typescript
export interface PromptTokenBudget {
  // ... existing ...
  /** Scene keyframe positive prompt: max 600 tokens (~2400 chars) */
  sceneKeyframe: number;
}

export const DEFAULT_TOKEN_BUDGETS: PromptTokenBudget = {
  // ... existing ...
  sceneKeyframe: 600,
};
```

#### Step 4: Add `descriptorSource` to Types

**File**: `types.ts`

```typescript
export interface VisualBibleCharacter {
  // ... existing fields ...
  
  /**
   * Source of the character description
   * - 'storyBible': Synced from Story Bible
   * - 'userEdit': Manually edited by user (protected from sync)
   */
  descriptorSource?: 'storyBible' | 'userEdit';
}
```

#### Step 5: Add Migration Helper

**File**: `utils/migrations.ts`

```typescript
/**
 * Migrates Visual Bible to include descriptorSource provenance.
 * Sets 'userEdit' for any character with non-empty description but no source.
 */
export function migrateDescriptorSource(
  visualBible: VisualBible
): VisualBible {
  if (!visualBible?.characters) return visualBible;
  
  return {
    ...visualBible,
    characters: visualBible.characters.map(char => {
      // Already has source: preserve it
      if (char.descriptorSource) return char;
      
      // Has description but no source: treat as user edit
      if (char.description && char.description.trim().length > 0) {
        return { ...char, descriptorSource: 'userEdit' };
      }
      
      // No description: leave unset (will be synced later)
      return char;
    }),
  };
}
```

---

### Phase 1: Prompt Assembly Layer

**Duration**: 2-3 days  
**Risk**: Medium  
**Dependencies**: Phase 0

#### Step 6: CREATE Assembler Functions

**File**: `services/promptPipeline.ts`

```typescript
/**
 * Assembled prompt ready for provider-specific consumption
 */
export interface AssembledPrompt {
  /** Combined format: "positive\n\nNEGATIVE PROMPT:\nnegative" */
  inlineFormat: string;
  /** Separate fields for ComfyUI */
  separateFormat: { positive: string; negative: string };
  /** Merged, deduplicated negative prompt */
  mergedNegative: string;
  /** Token counts */
  tokens: { positive: number; negative: number; total: number };
}

/**
 * Assembles a ComfyUIPrompt into provider-specific formats.
 * 
 * Negative merge order (first-wins deduplication):
 * 1. prompt.negative (source-specific)
 * 2. additionalNegatives (scene/timeline context)
 * 3. defaultNegatives (provider defaults)
 * 
 * @param prompt - Source ComfyUIPrompt
 * @param additionalNegatives - Scene/timeline specific negatives
 * @param defaultNegatives - Provider default negatives
 */
export function assemblePromptForProvider(
  prompt: ComfyUIPrompt,
  additionalNegatives?: string[],
  defaultNegatives?: string[]
): AssembledPrompt {
  // Merge negatives with first-wins deduplication
  const allNegatives = [
    ...(prompt.negative ? prompt.negative.split(',').map(s => s.trim()) : []),
    ...(additionalNegatives || []),
    ...(defaultNegatives || DEFAULT_NEGATIVE_PROMPT.split(',').map(s => s.trim())),
  ];
  
  // Deduplicate (case-insensitive, first wins)
  const seen = new Set<string>();
  const dedupedNegatives = allNegatives.filter(neg => {
    const lower = neg.toLowerCase().trim();
    if (seen.has(lower) || !lower) return false;
    seen.add(lower);
    return true;
  });
  
  const mergedNegative = dedupedNegatives.join(', ');
  
  const positiveTokens = estimateTokens(prompt.positive);
  const negativeTokens = estimateTokens(mergedNegative);
  
  return {
    inlineFormat: `${prompt.positive}\n\nNEGATIVE PROMPT:\n${mergedNegative}`,
    separateFormat: { positive: prompt.positive, negative: mergedNegative },
    mergedNegative,
    tokens: {
      positive: positiveTokens,
      negative: negativeTokens,
      total: positiveTokens + negativeTokens,
    },
  };
}

/**
 * Builds a keyframe-specific prompt from scene context.
 * 
 * Component priority (highest to lowest):
 * 1. Static image instruction
 * 2. Scene summary
 * 3. Top 2 character descriptors
 * 4. Style directives
 * 5. Pruned logline
 */
export function buildSceneKeyframePrompt(
  storyBible: StoryBible,
  scene: Scene,
  directorsVision: string,
  negativePrompts?: string[],
  maxTokens: number = DEFAULT_TOKEN_BUDGETS.sceneKeyframe
): ComfyUIPrompt {
  const warnings: string[] = [];
  
  // Build components with priority ordering
  const components: string[] = [];
  
  // 1. Static image instruction (highest priority)
  components.push('highly detailed still image, no motion blur');
  
  // 2. Scene summary
  const sceneSummary = truncateToTokenLimit(scene.summary, 200);
  if (sceneSummary.truncated) {
    warnings.push('Scene summary truncated to fit budget');
  }
  components.push(sceneSummary.text);
  
  // 3. Top 2 character descriptors
  const characters = getTopCharacterDescriptors(storyBible, scene, 2);
  components.push(...characters);
  
  // 4. Style directives from director's vision
  const style = extractStyleDirectives(directorsVision);
  if (style) components.push(style);
  
  // 5. Pruned logline (lowest priority, fills remaining budget)
  const currentTokens = estimateTokens(components.join(', '));
  const remainingBudget = maxTokens - currentTokens - 20; // 20 token buffer
  
  if (remainingBudget > 50 && storyBible.logline) {
    const prunedLogline = truncateToTokenLimit(storyBible.logline, remainingBudget);
    components.push(prunedLogline.text);
  }
  
  // Validate final budget
  const positive = components.filter(Boolean).join(', ');
  const finalTokens = estimateTokens(positive);
  
  if (finalTokens > maxTokens) {
    warnings.push(`Keyframe prompt exceeded budget (${finalTokens}/${maxTokens})`);
  }
  
  const negative = (negativePrompts || []).join(', ');
  
  return {
    positive,
    negative,
    tokens: {
      positive: finalTokens,
      negative: estimateTokens(negative),
      total: finalTokens + estimateTokens(negative),
    },
    withinBudget: finalTokens <= maxTokens,
    warnings,
  };
}

// Helper functions
function getTopCharacterDescriptors(
  storyBible: StoryBible,
  scene: Scene,
  count: number
): string[] {
  // Extract character names from scene summary
  const sceneText = scene.summary.toLowerCase();
  
  const matches = (storyBible.characters || [])
    .filter(char => sceneText.includes(char.name.toLowerCase()))
    .slice(0, count)
    .map(char => `${char.name}: ${char.physicalDescription || char.appearance || ''}`);
  
  return matches;
}

function extractStyleDirectives(directorsVision: string): string {
  // Extract visual style keywords
  const styleKeywords = [
    'cinematic', 'noir', 'vibrant', 'muted', 'warm', 'cool',
    'high contrast', 'soft lighting', 'dramatic', 'natural'
  ];
  
  const found = styleKeywords.filter(kw => 
    directorsVision.toLowerCase().includes(kw)
  );
  
  return found.join(', ');
}
```

#### Step 7: Update `syncCharacterDescriptors`

**File**: `services/promptPipeline.ts`

```typescript
export interface SyncResult {
  descriptors: Map<string, string>;
  synchronized: string[];
  missing: string[];
  skippedUserEdits: string[];  // NEW
}

export function syncCharacterDescriptors(
  storyBible: StoryBible,
  visualBible: VisualBible
): SyncResult {
  const result: SyncResult = {
    descriptors: new Map(),
    synchronized: [],
    missing: [],
    skippedUserEdits: [],
  };
  
  for (const storyChar of storyBible.characters || []) {
    const visualChar = visualBible.characters.find(
      vc => vc.name.toLowerCase() === storyChar.name.toLowerCase()
    );
    
    if (!visualChar) {
      result.missing.push(storyChar.name);
      continue;
    }
    
    // Conservative sync: respect user edits
    if (visualChar.descriptorSource === 'userEdit') {
      result.skippedUserEdits.push(storyChar.name);
      result.descriptors.set(storyChar.name, visualChar.description || '');
      continue;
    }
    
    // Treat existing non-empty description without source as user edit
    if (visualChar.description && 
        visualChar.description.trim().length > 0 && 
        !visualChar.descriptorSource) {
      result.skippedUserEdits.push(storyChar.name);
      result.descriptors.set(storyChar.name, visualChar.description);
      continue;
    }
    
    // Sync from story bible
    const descriptor = storyChar.physicalDescription || storyChar.appearance || '';
    result.descriptors.set(storyChar.name, descriptor);
    result.synchronized.push(storyChar.name);
  }
  
  return result;
}
```

---

### Phase 2: Scene Validator (Warn-First)

**Duration**: 1-2 days  
**Risk**: Low  
**Dependencies**: Phase 0

#### Step 8: CREATE `services/sceneListValidator.ts`

```typescript
/**
 * Scene List Validator
 * 
 * Validates scene summaries for structural quality.
 * Distinct from sceneProgressionValidator.ts (narrative continuity).
 */

export interface SceneValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  metrics: {
    verbCount: number;
    charCount: number;
    conjunctionCount: number;
    hasCharacterRef: boolean;
    clauseCount: number;
  };
}

export interface ValidationOptions {
  mode: 'off' | 'warn' | 'block';
  characterNames?: string[];
}

const CONJUNCTIONS = ['and', 'but', 'or', 'while', 'as', 'when', 'although'];
const VERB_INDICATORS = /\b(is|are|was|were|has|have|had|does|do|did|will|would|could|should|can|may|might|must)\b/gi;

export function validateSceneSummary(
  summary: string,
  options: ValidationOptions
): SceneValidationResult {
  if (options.mode === 'off') {
    return {
      valid: true,
      warnings: [],
      errors: [],
      metrics: { verbCount: 0, charCount: 0, conjunctionCount: 0, hasCharacterRef: false, clauseCount: 0 },
    };
  }
  
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Calculate metrics
  const words = summary.toLowerCase().split(/\s+/);
  const conjunctionCount = words.filter(w => CONJUNCTIONS.includes(w)).length;
  const verbCount = (summary.match(VERB_INDICATORS) || []).length;
  const charCount = summary.length;
  const clauseCount = summary.split(/[,;]/).length;
  
  const hasCharacterRef = options.characterNames?.some(name => 
    summary.toLowerCase().includes(name.toLowerCase())
  ) ?? false;
  
  // Apply thresholds
  if (conjunctionCount > 1) {
    warnings.push(`High conjunction count (${conjunctionCount}): consider simplifying`);
  }
  
  if (verbCount > 2) {
    warnings.push(`High verb count (${verbCount}): may indicate run-on scene`);
  }
  if (verbCount > 4) {
    errors.push(`Excessive verbs (${verbCount}): scene too complex`);
  }
  
  if (charCount > 150) {
    warnings.push(`Long summary (${charCount} chars): consider condensing`);
  }
  if (charCount > 200) {
    errors.push(`Summary too long (${charCount} chars): exceeds 200 char limit`);
  }
  
  // Determine validity based on mode
  const valid = options.mode === 'warn' || errors.length === 0;
  
  return {
    valid,
    warnings,
    errors,
    metrics: { verbCount, charCount, conjunctionCount, hasCharacterRef, clauseCount },
  };
}
```

#### Step 9: Implement `generateSceneListWithFeedback`

**File**: `services/planExpansionService.ts`

```typescript
export class MaxRetriesExceededError extends Error {
  constructor(
    public attempts: number,
    public lastValidation: SceneValidationResult
  ) {
    super(`Max retries (${attempts}) exceeded for scene generation`);
    this.name = 'MaxRetriesExceededError';
  }
}

export async function generateSceneListWithFeedback(
  plotOutline: string,
  directorsVision: string,
  feedback: string[],
  attempt: number,
  logApiCall: ApiLogCallback,
  onStateChange?: ApiStateChangeCallback
): Promise<{ scenes: Scene[]; validation: SceneValidationResult }> {
  const MAX_RETRIES = 3;
  
  if (attempt > MAX_RETRIES) {
    throw new MaxRetriesExceededError(attempt, {
      valid: false,
      warnings: [],
      errors: ['Max retries exceeded'],
      metrics: { verbCount: 0, charCount: 0, conjunctionCount: 0, hasCharacterRef: false, clauseCount: 0 },
    });
  }
  
  // Build prompt with feedback appended to body
  let prompt = `Generate scenes for the following plot outline:\n\n${plotOutline}`;
  
  if (directorsVision) {
    prompt += `\n\nDirector's Vision:\n${directorsVision}`;
  }
  
  if (feedback.length > 0) {
    prompt += `\n\nPrevious attempt feedback (please address):\n${feedback.join('\n')}`;
  }
  
  // Generate scenes via existing mechanism
  const scenes = await generateSceneList(prompt, logApiCall, onStateChange);
  
  // Validate each scene
  const flags = loadFeatureFlags(); // Get current flag state
  const allValidations = scenes.map(scene => 
    validateSceneSummary(scene.summary, {
      mode: flags.sceneListValidationMode,
      characterNames: [], // Could be enhanced to pass character list
    })
  );
  
  // Aggregate validation
  const aggregateValidation: SceneValidationResult = {
    valid: allValidations.every(v => v.valid),
    warnings: allValidations.flatMap(v => v.warnings),
    errors: allValidations.flatMap(v => v.errors),
    metrics: {
      verbCount: Math.max(...allValidations.map(v => v.metrics.verbCount)),
      charCount: Math.max(...allValidations.map(v => v.metrics.charCount)),
      conjunctionCount: Math.max(...allValidations.map(v => v.metrics.conjunctionCount)),
      hasCharacterRef: allValidations.some(v => v.metrics.hasCharacterRef),
      clauseCount: Math.max(...allValidations.map(v => v.metrics.clauseCount)),
    },
  };
  
  return { scenes, validation: aggregateValidation };
}
```

---

### Phase 3: Act Mapping Extraction

**Duration**: 1 day  
**Risk**: Low  
**Dependencies**: Phase 0

#### Step 10: CREATE `utils/narrativeContext.ts`

```typescript
/**
 * Narrative Context Utility
 * 
 * Unified act mapping and narrative context extraction.
 * Replaces duplicated implementations in TimelineEditor and ContinuityDirector.
 */

import { StoryBible, StoryBibleV2, Scene, isStoryBibleV2 } from '../types';
import { isFeatureEnabled } from './featureFlags';

export interface NarrativeContextResult {
  actKey: 'act i' | 'act ii' | 'act iii' | 'unknown';
  actText: string;
  prevSceneSummary?: string;
  nextSceneSummary?: string;
  sceneFraction: number;
}

export interface NarrativeContextOptions {
  includeAdjacentScenes?: boolean;
  useV2?: boolean;
  flags?: Partial<FeatureFlags>;
}

/**
 * Gets narrative context for a scene.
 * 
 * V2 path (when actContextV2 enabled + isStoryBibleV2 + plotScenes present):
 * - Maps scene index to plotScenes index by ratio
 * - Uses plotScene.actNumber directly
 * 
 * V1 fallback:
 * - Regex-based /act [iI]+/ detection
 */
export function getNarrativeContext(
  storyBible: StoryBible,
  scenes: Scene[],
  sceneId: string,
  options: NarrativeContextOptions = {}
): NarrativeContextResult {
  const { includeAdjacentScenes = false, flags } = options;
  
  const sceneIndex = scenes.findIndex(s => s.id === sceneId);
  const scene = scenes[sceneIndex];
  
  if (sceneIndex === -1 || !scene) {
    return {
      actKey: 'unknown',
      actText: 'No context found',
      sceneFraction: 0,
    };
  }
  
  const sceneFraction = sceneIndex / Math.max(scenes.length - 1, 1);
  
  // V2 path: Use plotScenes if available
  const useV2 = isFeatureEnabled(flags, 'actContextV2') && 
                isStoryBibleV2(storyBible) &&
                (storyBible as StoryBibleV2).plotScenes?.length > 0;
  
  let actKey: NarrativeContextResult['actKey'] = 'unknown';
  let actText = '';
  
  if (useV2) {
    const v2Bible = storyBible as StoryBibleV2;
    const plotScenes = v2Bible.plotScenes!;
    
    // Map scene index to plotScenes by ratio
    const plotIndex = Math.min(
      Math.floor(sceneFraction * plotScenes.length),
      plotScenes.length - 1
    );
    
    const plotScene = plotScenes[plotIndex];
    const actNumber = plotScene.actNumber || 1;
    
    actKey = actNumber === 1 ? 'act i' : actNumber === 2 ? 'act ii' : 'act iii';
    actText = `Act ${actNumber}: ${plotScene.summary || ''}`;
  } else {
    // V1 fallback: Regex-based detection
    const plotLines = storyBible.plotOutline.split('\n');
    
    const actStarts: Record<string, number> = {
      'act i': plotLines.findIndex(l => l.trim().toLowerCase().startsWith('act i')),
      'act ii': plotLines.findIndex(l => l.trim().toLowerCase().startsWith('act ii')),
      'act iii': plotLines.findIndex(l => l.trim().toLowerCase().startsWith('act iii')),
    };
    
    // Determine act by scene fraction
    if (sceneFraction > 0.66 && actStarts['act iii'] >= 0) {
      actKey = 'act iii';
      actText = plotLines.slice(actStarts['act iii']).join('\n');
    } else if (sceneFraction > 0.33 && actStarts['act ii'] >= 0) {
      actKey = 'act ii';
      const endIndex = actStarts['act iii'] >= 0 ? actStarts['act iii'] : plotLines.length;
      actText = plotLines.slice(actStarts['act ii'], endIndex).join('\n');
    } else if (actStarts['act i'] >= 0) {
      actKey = 'act i';
      const endIndex = actStarts['act ii'] >= 0 ? actStarts['act ii'] : plotLines.length;
      actText = plotLines.slice(actStarts['act i'], endIndex).join('\n');
    } else {
      actText = storyBible.plotOutline;
    }
  }
  
  // Optional: Adjacent scene context
  let prevSceneSummary: string | undefined;
  let nextSceneSummary: string | undefined;
  
  if (includeAdjacentScenes) {
    if (sceneIndex > 0) {
      prevSceneSummary = `Previous: ${scenes[sceneIndex - 1].summary}`;
    }
    if (sceneIndex < scenes.length - 1) {
      nextSceneSummary = `Next: ${scenes[sceneIndex + 1].summary}`;
    }
  }
  
  return {
    actKey,
    actText: actText.trim(),
    prevSceneSummary,
    nextSceneSummary,
    sceneFraction,
  };
}
```

#### Step 11: Update Callers

**Files**: `TimelineEditor.tsx`, `ContinuityDirector.tsx`

Replace inline `getNarrativeContext` with:

```typescript
import { getNarrativeContext } from '../utils/narrativeContext';

// In TimelineEditor (~line 405):
const narrativeContext = useMemo(() => {
  return (sceneId: string) => {
    const result = getNarrativeContext(storyBible, scenes, sceneId, {
      flags: settings?.featureFlags,
    });
    return `This scene occurs in: ${result.actText.trim()}`;
  };
}, [storyBible, scenes, settings?.featureFlags]);

// In ContinuityDirector (~line 61):
const narrativeContext = useMemo(() => {
  return (sceneId: string) => {
    const result = getNarrativeContext(storyBible, scenes, sceneId, {
      includeAdjacentScenes: true,
      flags: settings?.featureFlags,
    });
    return `
This scene, "${scenes.find(s => s.id === sceneId)?.title}", occurs within:
${result.actText}

CONTEXT FROM ADJACENT SCENES:
- ${result.prevSceneSummary || 'N/A'}
- ${result.nextSceneSummary || 'N/A'}
    `.trim();
  };
}, [storyBible, scenes, settings?.featureFlags]);
```

---

### Phase 4: Service Signature Updates

**Duration**: 3-4 days  
**Risk**: Medium  
**Dependencies**: Phase 1 (assembler functions)  
**Owner**: Backend/Services Developer  
**Exit Criteria**: All service functions use assembler when flags enabled; unit tests pass

#### Step 12: Extend `MediaGenerationActions` Interface

**File**: `types.ts`

```typescript
export interface MediaGenerationActions {
  // Existing methods...
  
  generateKeyframeForScene(
    scene: Scene,
    directorsVision: string,
    options?: {
      storyBible?: StoryBible;  // NEW: Optional for assembler
      negatives?: string[];      // NEW: Scene-specific negatives
    }
  ): Promise<string>;
  
  generateImageForShot(
    shot: Shot,
    scene: Scene,
    options?: {
      storyBible?: StoryBible;  // NEW
      negatives?: string[];      // NEW
    }
  ): Promise<string>;
}
```

**Acceptance Gate**: Interface compiles; existing callers unaffected (optional params)

#### Step 13: Update Gemini Implementations

**File**: `services/geminiService.ts`

**Changes at ~line 1200 (generateKeyframeForScene)**:

```typescript
export async function generateKeyframeForScene(
  scene: Scene,
  directorsVision: string,
  logApiCall: ApiLogCallback,
  onStateChange?: ApiStateChangeCallback,
  options?: { storyBible?: StoryBible; negatives?: string[] }
): Promise<string> {
  const flags = loadFeatureFlags();
  
  if (isFeatureEnabled(flags, 'keyframePromptPipeline') && options?.storyBible) {
    // NEW: Pipeline path
    assertPipelineContext({ logApiCall }, 'keyframePromptPipeline');
    
    const prompt = buildSceneKeyframePrompt(
      options.storyBible,
      scene,
      directorsVision,
      options.negatives
    );
    
    const assembled = assemblePromptForProvider(
      prompt,
      options.negatives,
      DEFAULT_NEGATIVE_PROMPT.split(',').map(s => s.trim())
    );
    
    // Apply token guard
    if (flags.promptTokenGuard !== 'off') {
      const budget = DEFAULT_TOKEN_BUDGETS.sceneKeyframe;
      if (assembled.tokens.positive > budget) {
        const msg = `Token overflow: ${assembled.tokens.positive}/${budget}`;
        logApiCall?.('keyframe', 'token_overflow', { tokens: assembled.tokens.positive, budget });
        
        if (flags.promptTokenGuard === 'block') {
          throw new Error(msg);
        }
        console.warn(`[TokenGuard] ${msg}`);
      }
    }
    
    // Use inline format for Gemini
    return await generateWithGemini(assembled.inlineFormat, logApiCall, onStateChange);
  }
  
  // LEGACY: Existing behavior (flags off)
  return await legacyGenerateKeyframe(scene, directorsVision, logApiCall, onStateChange);
}
```

**Acceptance Gate**: 
- Legacy path unchanged when `keyframePromptPipeline=false`
- Token guard logs/blocks per mode
- Assembled prompt uses inlineFormat

#### Step 14: Update ComfyUI Implementations

**File**: `services/comfyUIService.ts`

**Functions to update**:

| Function | Line | Changes |
|----------|------|---------|
| `generateSceneKeyframeLocally` | ~2292 | Use assembler when `keyframePromptPipeline` on |
| `generateShotImageLocally` | ~2401 | Add optional `storyBible`, use assembler |
| `generateVideoFromShot` | ~1435 | Add optional `storyBible`, `scene`, use assembler |
| `generateTimelineVideos` | ~2032 | Add optional `storyBible`, use assembler |
| `generateVideoFromBookendsSequential` | ~2620 | Add negatives param, use assembler |

**Example for `generateVideoFromBookendsSequential`**:

```typescript
export async function generateVideoFromBookendsSequential(
  settings: LocalGenerationSettings,
  scene: Scene,
  timeline: TimelineData,
  bookends: { start: string; end: string },
  logApiCall: ApiLogCallback,
  onStateChange: (state: any) => void,
  options?: { storyBible?: StoryBible; negatives?: string[] }  // NEW
): Promise<string> {
  const flags = loadFeatureFlags();
  
  // Build prompt via pipeline when enabled
  let positive: string;
  let negative: string;
  
  if (isFeatureEnabled(flags, 'videoPromptPipeline') && options?.storyBible) {
    assertPipelineContext({ logApiCall }, 'videoPromptPipeline');
    
    const basePrompt = buildComfyUIPrompt(
      options.storyBible,
      scene,
      timeline.shots[0], // First shot for context
      settings.directorsVision || '',
      options.negatives || []
    );
    
    const assembled = assemblePromptForProvider(
      basePrompt,
      options.negatives,
      DEFAULT_NEGATIVE_PROMPT.split(',').map(s => s.trim())
    );
    
    positive = assembled.separateFormat.positive;
    negative = assembled.separateFormat.negative;
    
    // Log telemetry
    logApiCall?.('bookend_video', 'prompt_assembled', {
      tokens: assembled.tokens,
      negativeCount: assembled.mergedNegative.split(',').length,
    });
  } else {
    // Legacy path
    const payloads = buildPayloadsFromTimeline(/* existing params */);
    positive = payloads.text;
    negative = payloads.negativePrompt || DEFAULT_NEGATIVE_PROMPT;
  }
  
  // Continue with existing queue logic using positive/negative
  // ...
}
```

**Acceptance Gate**:
- `separateFormat` used for ComfyUI (not inlineFormat)
- Negatives properly merged and deduplicated
- Token guard applied before queue
- Telemetry logged via `logApiCall`

---

### Phase 5: Caller Updates

**Duration**: 2-3 days  
**Risk**: Low  
**Dependencies**: Phase 4 (service signatures)  
**Owner**: Frontend Developer  
**Exit Criteria**: All generation call sites pass required context; no regression

#### Step 15: Update Component Callers

**Batch by file to minimize context switching:**

**File 1: `App.tsx`**

```typescript
// Around line ~850 (keyframe generation handler)
const handleGenerateKeyframe = async (sceneId: string) => {
  const scene = scenes.find(s => s.id === sceneId);
  if (!scene) return;
  
  await generateKeyframeForScene(scene, directorsVision, {
    storyBible,  // NEW: Pass for assembler
    negatives: currentTimeline?.negativePrompts,  // NEW: Scene negatives
  });
};
```

**File 2: `TimelineEditor.tsx`**

```typescript
// Line ~572 (keyframe generation)
await generateSceneKeyframeLocally(
  settings,
  storyBible,  // Already passed
  scene,
  shot,
  directorsVision,
  sceneNegatives,  // NEW: Pass timeline negatives
);

// Line ~1018 (video generation)
await generateVideoFromShot(settings, scene, shot, keyframe, {
  storyBible,
  negatives: timeline.negativePrompts,
});

// Line ~1125 (timeline videos)
await generateTimelineVideos(settings, timeline, {
  storyBible,
  negatives: timeline.negativePrompts,
});
```

**File 3: `sceneGenerationPipeline.ts`**

```typescript
// Line ~141
await generateSceneKeyframeLocally(settings, storyBible, scene, /* ... */, {
  negatives: globalNegatives,
});

// Line ~228
await generateVideoFromBookendsSequential(settings, scene, timeline, bookends, logApiCall, onStateChange, {
  storyBible,
  negatives: timeline.negativePrompts,
});
```

**File 4: `GenerateSceneImagesButton.tsx`**

```typescript
// In generation loop
for (const scene of scenes) {
  await generateKeyframeForScene(scene, directorsVision, {
    storyBible,
    negatives: globalSettings.negativePrompts,
  });
}
```

**Acceptance Gate**:
- All callers compile without errors
- Optional params don't break existing behavior
- `storyBible` available at all call sites (may require prop drilling)

---

### Phase 6: Visual Bible UI & Sync

**Duration**: 2-3 days  
**Risk**: Medium (user-facing, data integrity)  
**Dependencies**: Phase 0 (descriptorSource type), Phase 1 (sync function)  
**Owner**: Frontend Developer  
**Exit Criteria**: User edits protected; sync works; toast notification functional

#### Step 16: Update `useVisualBible` Hook

**File**: `utils/hooks.ts` (~line 1422)

```typescript
export function useVisualBible(
  storyBible: StoryBible,
  settings: LocalGenerationSettings
): UseVisualBibleResult {
  const [visualBible, setVisualBible] = usePersistentState<VisualBible>(
    'visualBible',
    defaultVisualBible
  );
  const [syncToast, setSyncToast] = useState<SyncToastState | null>(null);
  const flags = loadFeatureFlags();
  
  // Migration on first load
  useEffect(() => {
    if (visualBible && !visualBible._migrated) {
      const migrated = migrateDescriptorSource(visualBible);
      setVisualBible({ ...migrated, _migrated: true });
    }
  }, [visualBible?._migrated]);
  
  // Auto-sync on Story Bible save (when flag enabled)
  const handleStoryBibleSave = useCallback(() => {
    if (!isFeatureEnabled(flags, 'bibleV2SaveSync')) return;
    
    const syncResult = syncCharacterDescriptors(storyBible, visualBible);
    
    // Apply sync to visual bible (respecting provenance)
    const updated = {
      ...visualBible,
      characters: visualBible.characters.map(char => {
        const synced = syncResult.descriptors.get(char.name);
        if (synced !== undefined && !syncResult.skippedUserEdits.includes(char.name)) {
          return { ...char, description: synced, descriptorSource: 'storyBible' as const };
        }
        return char;
      }),
    };
    
    setVisualBible(updated);
    
    // Show toast
    setSyncToast({
      synced: syncResult.synchronized.length,
      skipped: syncResult.skippedUserEdits.length,
      showResyncAll: syncResult.skippedUserEdits.length > 0,
    });
  }, [storyBible, visualBible, flags]);
  
  // Resync All action (overrides provenance)
  const handleResyncAll = useCallback(() => {
    const updated = {
      ...visualBible,
      characters: visualBible.characters.map(char => ({
        ...char,
        descriptorSource: 'storyBible' as const,
      })),
    };
    
    const syncResult = syncCharacterDescriptors(storyBible, updated);
    // Apply all syncs...
    
    setSyncToast({ synced: syncResult.synchronized.length, skipped: 0, showResyncAll: false });
  }, [storyBible, visualBible]);
  
  return { visualBible, setVisualBible, handleStoryBibleSave, handleResyncAll, syncToast };
}
```

#### Step 17: Add Resync UI Components

**File**: `components/VisualBibleEditor.tsx`

```typescript
// Add resync button in character list header
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    if (confirm('Resync all characters from Story Bible? This will overwrite user edits.')) {
      handleResyncAll();
    }
  }}
  disabled={!storyBible?.characters?.length}
>
  <RefreshCw className="w-4 h-4 mr-2" />
  Resync from Story Bible
</Button>

// Toast component
{syncToast && (
  <Toast
    title="Character Sync Complete"
    description={`${syncToast.synced} synced, ${syncToast.skipped} user edits preserved`}
    action={syncToast.showResyncAll && (
      <ToastAction onClick={handleResyncAll}>Resync All</ToastAction>
    )}
    onClose={() => setSyncToast(null)}
  />
)}
```

**Acceptance Gate**:
- User edits (descriptorSource='userEdit') never overwritten by auto-sync
- Confirmation dialog before Resync All
- Toast shows correct counts
- Migration runs once on load

---

### Phase 7: Testing Implementation

**Duration**: 4-5 days (parallel with Phases 4-6)  
**Risk**: Low  
**Dependencies**: Phases 0-1 (testable code exists)  
**Owner**: QA/Developer  
**Exit Criteria**: All test categories pass per coverage targets

#### Step 18: Flag-Off Parity Tests

**File**: `services/__tests__/promptPipeline.parity.test.ts`

```typescript
describe('Flag-Off Parity', () => {
  const legacyFlags = { ...DEFAULT_FEATURE_FLAGS }; // All false
  
  describe('assemblePromptForProvider', () => {
    it('returns prompt unchanged when no additional negatives', () => {
      const prompt = createMockPrompt({ positive: 'test', negative: 'blur' });
      const result = assemblePromptForProvider(prompt, [], []);
      
      expect(result.separateFormat.positive).toBe('test');
      expect(result.separateFormat.negative).toBe('blur');
    });
    
    it('matches legacy behavior for all generation paths', () => {
      const scenarios = [
        { path: 'keyframe', scene: mockScene },
        { path: 'shot', shot: mockShot },
        { path: 'video', timeline: mockTimeline },
        { path: 'bookend', bookends: mockBookends },
      ];
      
      for (const scenario of scenarios) {
        const legacyResult = legacyGeneratePrompt(scenario);
        const newResult = generateWithAssembler(scenario, legacyFlags);
        
        expect(newResult.positive).toEqual(legacyResult.positive);
        expect(newResult.negative).toEqual(legacyResult.negative);
      }
    });
  });
  
  describe('generateSceneKeyframeLocally', () => {
    it('uses legacy path when keyframePromptPipeline=false', async () => {
      const spy = vi.spyOn(legacyModule, 'legacyBuildPrompt');
      
      await generateSceneKeyframeLocally(settings, bible, scene, shot, vision, [], legacyFlags);
      
      expect(spy).toHaveBeenCalled();
    });
  });
});
```

#### Step 19: Pipeline-On Content Tests

**File**: `services/__tests__/promptPipeline.content.test.ts`

```typescript
describe('Pipeline-On Content', () => {
  const pipelineFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    keyframePromptPipeline: true,
    videoPromptPipeline: true,
    promptTokenGuard: 'warn' as const,
  };
  
  describe('Negative Merge', () => {
    it('deduplicates case-insensitively, first-wins', () => {
      const prompt = createMockPrompt({ negative: 'blur, WATERMARK' });
      const additional = ['Blur', 'text', 'watermark'];
      const defaults = ['blur', 'bad anatomy'];
      
      const result = assemblePromptForProvider(prompt, additional, defaults);
      
      // 'blur' from prompt wins (first occurrence)
      // 'WATERMARK' from prompt wins
      // 'text' from additional is new
      // 'bad anatomy' from defaults is new
      expect(result.mergedNegative).toBe('blur, WATERMARK, text, bad anatomy');
    });
    
    it('preserves order within each source', () => {
      const prompt = createMockPrompt({ negative: 'a, b' });
      const result = assemblePromptForProvider(prompt, ['c', 'd'], ['e', 'f']);
      
      expect(result.mergedNegative).toBe('a, b, c, d, e, f');
    });
  });
  
  describe('Token Budget', () => {
    it('warns but allows when promptTokenGuard=warn', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const oversizedPrompt = createMockPrompt({ positive: 'x'.repeat(3000) }); // ~750 tokens
      
      const result = assemblePromptForProvider(oversizedPrompt, [], []);
      
      expect(result.tokens.positive).toBeGreaterThan(600);
      // Token guard warning would be logged by calling service
    });
    
    it('includes character descriptors when storyBible provided', () => {
      const bible = createMockBible({
        characters: [
          { name: 'Alice', physicalDescription: 'tall, blonde hair' },
        ],
      });
      const scene = createMockScene({ summary: 'Alice walks through the forest' });
      
      const prompt = buildSceneKeyframePrompt(bible, scene, 'cinematic');
      
      expect(prompt.positive).toContain('Alice');
      expect(prompt.positive).toContain('tall');
    });
  });
  
  describe('Token Guard', () => {
    it('logs overflow via logApiCall', async () => {
      const logSpy = vi.fn();
      const oversizedScene = createMockScene({ summary: 'x'.repeat(3000) });
      
      await generateKeyframeForScene(oversizedScene, 'vision', logSpy, undefined, {
        storyBible: mockBible,
      });
      
      expect(logSpy).toHaveBeenCalledWith(
        'keyframe',
        'token_overflow',
        expect.objectContaining({ tokens: expect.any(Number), budget: 600 })
      );
    });
  });
});
```

#### Step 20: Validator Behavior Tests

**File**: `services/__tests__/sceneListValidator.test.ts`

```typescript
describe('validateSceneSummary', () => {
  describe('mode=off', () => {
    it('returns valid=true with empty metrics', () => {
      const result = validateSceneSummary('any text', { mode: 'off' });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });
  
  describe('mode=warn', () => {
    it('logs warnings but returns valid=true', () => {
      const longSummary = 'x'.repeat(180); // Over 150 char warning threshold
      const result = validateSceneSummary(longSummary, { mode: 'warn' });
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(expect.stringContaining('Long summary'));
    });
    
    it('collects all heuristic violations', () => {
      const badSummary = 'Alice is running and Bob is jumping while Carol is dancing and Dave is singing';
      const result = validateSceneSummary(badSummary, { mode: 'warn' });
      
      expect(result.warnings.length).toBeGreaterThan(1);
      expect(result.metrics.conjunctionCount).toBe(3);
      expect(result.metrics.verbCount).toBeGreaterThan(4);
    });
  });
  
  describe('mode=block', () => {
    it('returns valid=false when errors present', () => {
      const tooLong = 'x'.repeat(250); // Over 200 char error threshold
      const result = validateSceneSummary(tooLong, { mode: 'block' });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('exceeds 200'));
    });
  });
  
  describe('generateSceneListWithFeedback', () => {
    it('retries up to 3 times with feedback', async () => {
      const generateSpy = vi.fn()
        .mockResolvedValueOnce([{ summary: 'bad'.repeat(100) }])  // Fail
        .mockResolvedValueOnce([{ summary: 'bad'.repeat(100) }])  // Fail
        .mockResolvedValueOnce([{ summary: 'good scene' }]);       // Pass
      
      vi.spyOn(module, 'generateSceneList').mockImplementation(generateSpy);
      
      const result = await generateSceneListWithFeedback(
        'outline', 'vision', [], 1, mockLogApiCall
      );
      
      expect(generateSpy).toHaveBeenCalledTimes(3);
      expect(result.validation.valid).toBe(true);
    });
    
    it('throws MaxRetriesExceededError after 3 failures', async () => {
      vi.spyOn(module, 'generateSceneList').mockResolvedValue([{ summary: 'x'.repeat(300) }]);
      
      await expect(
        generateSceneListWithFeedback('outline', 'vision', [], 1, mockLogApiCall)
      ).rejects.toThrow(MaxRetriesExceededError);
    });
  });
});
```

#### Step 21: Act Mapping Tests

**File**: `utils/__tests__/narrativeContext.test.ts`

```typescript
describe('getNarrativeContext', () => {
  describe('V2 path', () => {
    it('uses plotScene.actNumber when actContextV2 enabled', () => {
      const v2Bible = createV2Bible({
        plotScenes: [
          { summary: 'Opening', actNumber: 1 },
          { summary: 'Midpoint', actNumber: 2 },
          { summary: 'Climax', actNumber: 3 },
        ],
      });
      const scenes = [
        { id: '1', summary: 'Scene 1' },
        { id: '2', summary: 'Scene 2' },
        { id: '3', summary: 'Scene 3' },
      ];
      
      const result = getNarrativeContext(v2Bible, scenes, '3', {
        flags: { actContextV2: true },
      });
      
      expect(result.actKey).toBe('act iii');
      expect(result.actText).toContain('Climax');
    });
  });
  
  describe('V1 fallback', () => {
    it('uses regex detection when actContextV2 disabled', () => {
      const v1Bible = createV1Bible({
        plotOutline: 'Act I: Setup\nAct II: Conflict\nAct III: Resolution',
      });
      const scenes = [{ id: '1' }, { id: '2' }, { id: '3' }];
      
      const result = getNarrativeContext(v1Bible, scenes, '3', {
        flags: { actContextV2: false },
      });
      
      expect(result.actKey).toBe('act iii');
    });
  });
  
  describe('Adjacent scenes', () => {
    it('includes prev/next summaries when requested', () => {
      const result = getNarrativeContext(mockBible, scenes, '2', {
        includeAdjacentScenes: true,
      });
      
      expect(result.prevSceneSummary).toBeDefined();
      expect(result.nextSceneSummary).toBeDefined();
    });
  });
});
```

#### Step 22: Resync UX Tests

**File**: `utils/__tests__/useVisualBible.test.ts`

```typescript
describe('useVisualBible', () => {
  describe('descriptorSource respect', () => {
    it('skips userEdit characters during auto-sync', () => {
      const { result } = renderHook(() => useVisualBible(mockBible, mockSettings));
      
      act(() => {
        result.current.setVisualBible({
          characters: [
            { name: 'Alice', description: 'custom', descriptorSource: 'userEdit' },
          ],
        });
      });
      
      act(() => {
        result.current.handleStoryBibleSave();
      });
      
      expect(result.current.visualBible.characters[0].description).toBe('custom');
    });
  });
  
  describe('Resync All', () => {
    it('overwrites userEdit when explicitly requested', () => {
      const { result } = renderHook(() => useVisualBible(mockBible, mockSettings));
      
      act(() => {
        result.current.handleResyncAll();
      });
      
      expect(result.current.visualBible.characters[0].descriptorSource).toBe('storyBible');
    });
  });
  
  describe('Toast notifications', () => {
    it('shows sync counts after save', () => {
      const { result } = renderHook(() => useVisualBible(mockBible, mockSettings));
      
      act(() => {
        result.current.handleStoryBibleSave();
      });
      
      expect(result.current.syncToast).toMatchObject({
        synced: expect.any(Number),
        skipped: expect.any(Number),
      });
    });
  });
});
```

#### Step 23: Bookend Integration Tests

**File**: `services/__tests__/generateVideoFromBookendsSequential.test.ts`

```typescript
describe('generateVideoFromBookendsSequential', () => {
  const pipelineFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    videoPromptPipeline: true,
  };
  
  describe('Assembler integration', () => {
    it('uses assemblePromptForProvider when flag enabled', async () => {
      const assembleSpy = vi.spyOn(module, 'assemblePromptForProvider');
      
      await generateVideoFromBookendsSequential(
        settings, scene, timeline, bookends, mockLog, mockState,
        { storyBible: mockBible, negatives: ['blur'] }
      );
      
      expect(assembleSpy).toHaveBeenCalled();
    });
    
    it('uses separateFormat for ComfyUI queue', async () => {
      const queueSpy = vi.spyOn(comfyModule, 'queuePrompt');
      
      await generateVideoFromBookendsSequential(
        settings, scene, timeline, bookends, mockLog, mockState,
        { storyBible: mockBible }
      );
      
      const queueCall = queueSpy.mock.calls[0][0];
      expect(queueCall.positive).toBeDefined();
      expect(queueCall.negative).toBeDefined();
      expect(queueCall.inlineFormat).toBeUndefined(); // Not used for ComfyUI
    });
    
    it('propagates negatives through merge', async () => {
      await generateVideoFromBookendsSequential(
        settings, scene, timeline, bookends, mockLog, mockState,
        { storyBible: mockBible, negatives: ['custom_negative'] }
      );
      
      // Verify negative appears in queued prompt
      const queueCall = queueSpy.mock.calls[0][0];
      expect(queueCall.negative).toContain('custom_negative');
    });
  });
  
  describe('Flag-off parity', () => {
    it('uses legacy path when videoPromptPipeline=false', async () => {
      const legacySpy = vi.spyOn(module, 'buildPayloadsFromTimeline');
      
      await generateVideoFromBookendsSequential(
        settings, scene, timeline, bookends, mockLog, mockState
        // No options = legacy path
      );
      
      expect(legacySpy).toHaveBeenCalled();
    });
  });
});
```

#### Step 24: E2E/Playwright Tests

**File**: `tests/e2e/prompt-pipeline.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Prompt Pipeline E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Enable pipeline flags
    await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem('localGenSettings') || '{}');
      settings.featureFlags = {
        ...settings.featureFlags,
        keyframePromptPipeline: true,
        videoPromptPipeline: true,
        promptTokenGuard: 'warn',
      };
      localStorage.setItem('localGenSettings', JSON.stringify(settings));
    });
    
    await page.goto('/');
  });
  
  test('ComfyUI queue receives assembled prompt', async ({ page }) => {
    // Intercept ComfyUI queue call
    const queuePromise = page.waitForRequest(req => 
      req.url().includes('/prompt') && req.method() === 'POST'
    );
    
    // Trigger keyframe generation
    await page.click('[data-testid="generate-keyframe-btn"]');
    
    const request = await queuePromise;
    const payload = JSON.parse(request.postData() || '{}');
    
    // Verify structure
    expect(payload.prompt).toBeDefined();
    
    // Find CLIP text encode node
    const clipNode = Object.values(payload.prompt).find(
      (n: any) => n.class_type === 'CLIPTextEncode'
    );
    
    expect(clipNode).toBeDefined();
    expect(clipNode.inputs.text).toContain('highly detailed');
  });
  
  test('Negative prompts deduplicated in payload', async ({ page }) => {
    // Set scene with duplicate negatives
    await page.fill('[data-testid="negative-prompts"]', 'blur, Blur, BLUR, watermark');
    
    const queuePromise = page.waitForRequest(req => 
      req.url().includes('/prompt') && req.method() === 'POST'
    );
    
    await page.click('[data-testid="generate-keyframe-btn"]');
    
    const request = await queuePromise;
    const payload = JSON.parse(request.postData() || '{}');
    
    // Find negative CLIP node
    const negNode = Object.values(payload.prompt).find(
      (n: any) => n.class_type === 'CLIPTextEncode' && 
                  n.inputs.text?.toLowerCase().includes('blur')
    );
    
    // Should only have one 'blur' (case variations deduplicated)
    const blurCount = (negNode.inputs.text.match(/blur/gi) || []).length;
    expect(blurCount).toBe(1);
  });
});
```

---

### Phase 8: Documentation & Cleanup

**Duration**: 1-2 days  
**Risk**: Low  
**Dependencies**: All other phases  
**Owner**: Tech Lead  
**Exit Criteria**: All docs updated; no stale flags; code review complete

#### Step 25: Update README.md

Add Pipeline Flags section with complete flag table and rollback instructions.

#### Step 26: Create FEATURE_FLAGS.md

Comprehensive reference with per-flag documentation including expiration dates.

#### Step 27: Flag Cleanup Verification

Verify no stale flags from previous iterations; schedule removal for stabilized flags.

---

## 5. Methodology

### 5.1 Development Approach

| Principle | Application |
|-----------|-------------|
| **Feature Flags First** | All new behavior gated by flags before code changes |
| **Backward Compatibility** | Flags off = legacy behavior, no data migration |
| **Test-Driven** | Write tests before implementation for critical paths |
| **Incremental Rollout** | Stage-by-stage enablement with metrics gates |

### 5.2 Code Quality Standards

```typescript
// ✅ CORRECT: Use assembler for all paths
const assembled = assemblePromptForProvider(prompt, sceneNegatives);
await queueComfyUI(assembled.separateFormat);

// ❌ WRONG: Direct prompt usage without assembly
await queueComfyUI({ positive: prompt.positive, negative: prompt.negative });
```

### 5.3 Testing Pyramid

**Test Distribution by Layer**:

| Layer | Percentage | Scope | Tools |
|-------|------------|-------|-------|
| **E2E Tests** | 10% | Full user flows, ComfyUI queue interception | Playwright |
| **Integration Tests** | 30% | Service + ComfyUI interaction, multi-component flows | Vitest + mocks |
| **Unit Tests** | 60% | `promptPipeline`, `featureFlags`, validators, utilities | Vitest |

**Rationale**: Unit tests provide fast feedback; integration tests validate service contracts; E2E tests confirm critical user journeys.

---

## 6. Potential Challenges & Mitigations

### 6.1 Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Token estimation inaccuracy | Medium | Low | Use conservative 4 char/token; add buffer |
| Negative dedup breaks prompts | Low | High | Preserve order; first-wins; case-insensitive |
| Flag sprawl over time | High | Medium | Enforce expiration metadata; quarterly review |
| User edit sync conflicts | Medium | High | Conservative provenance; confirmation dialogs |
| Validation false positives | Medium | Medium | Default to 'warn' mode; telemetry gates |
| **countTokens API cost/latency** | Medium | Medium | Cache results; use heuristic for <80% budget; 500ms timeout |
| **Gemini rate limits (429s)** | Medium | High | `withRetry` with exponential backoff; degrade to heuristic |
| **ComfyUI queue saturation** | High | High | Monitor queue depth; pause rollout if >10 pending; implement backpressure |
| **countTokens unavailable in dev** | High | Low | Fallback to 3.5 chars/token heuristic; env flag to skip API |

### 6.2 ComfyUI Queue Saturation Mitigation

**Monitoring**:
```typescript
async function checkQueueHealth(): Promise<QueueHealth> {
  const queue = await fetch('http://127.0.0.1:8188/queue').then(r => r.json());
  const pending = queue.queue_pending?.length ?? 0;
  const running = queue.queue_running?.length ?? 0;
  
  return {
    healthy: pending < 10,
    pending,
    running,
    recommendation: pending >= 10 ? 'PAUSE_ROLLOUT' : 'OK',
  };
}
```

**Rollout Gate**: Before enabling `videoPromptPipeline` in production:
1. Check queue depth < 5 pending
2. Verify average queue wait time < 30s
3. Enable for 10% of users, monitor for 1 hour
4. If queue depth spikes > 10, auto-disable flag

### 6.3 Rollback Procedures

**Immediate Rollback** (< 1 minute):
1. Set offending flag to `false` or `'off'` in Settings
2. Refresh page (flags stored in IndexedDB)

**Full Rollback** (< 5 minutes):
1. Revert git commit
2. Deploy previous version
3. No data migration needed (types extend, not replace)

---

## 7. Benefits Analysis

### 7.1 Quantitative Benefits

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Prompt assembly code paths | 4+ | 1 | -75% |
| Negative deduplication | Manual | Automatic | +100% |
| Token overflow incidents | ~5%/week | <1%/month | -80% |
| Rollback time | 10-30 min | <1 min | -95% |
| Test coverage (prompts) | ~60% | >95% | +35% |

### 7.2 Qualitative Benefits

- **Consistency**: Single source of truth for prompt assembly
- **Maintainability**: Flag-gated changes reduce merge conflicts
- **Observability**: logApiCall integration provides telemetry
- **Developer Experience**: Clear contracts, typed interfaces

---

## 8. Testing Strategy

### 8.1 Test Categories

| Category | Count | Coverage Target | Priority |
|----------|-------|-----------------|----------|
| Flag-off parity | 10+ | 100% | P0 |
| Pipeline-on content | 15+ | 95% | P0 |
| Validator behavior | 8+ | 90% | P1 |
| Act mapping | 6+ | 95% | P1 |
| Resync UX | 4+ | 80% | P2 |
| Bookend integration | 6+ | 90% | P1 |
| E2E/Playwright | 5+ | Critical paths | P0 |

### 8.2 Test File Structure

```
services/__tests__/
├── promptPipeline.test.ts           # Unit: assembler, keyframe builder
├── sceneListValidator.test.ts       # Unit: validation heuristics
├── generateVideoFromBookendsSequential.test.ts  # NEW: Integration
└── ...

utils/__tests__/
├── narrativeContext.test.ts         # Unit: act mapping
├── pipelineContext.test.ts          # Unit: assertions
└── ...

tests/e2e/
├── prompt-pipeline.spec.ts          # E2E: ComfyUI queue interception
└── ...
```

### 8.3 Key Test Patterns

```typescript
// Flag-off parity test pattern
describe('assemblePromptForProvider', () => {
  it('behaves identically with all flags off', () => {
    const flags = { ...DEFAULT_FEATURE_FLAGS }; // All false
    const result = assemblePromptForProvider(prompt, [], [], flags);
    expect(result.separateFormat).toEqual({
      positive: prompt.positive,
      negative: prompt.negative,
    });
  });
});

// Pipeline-on content test pattern
describe('buildSceneKeyframePrompt', () => {
  it('includes merged deduplicated negatives', () => {
    const prompt = buildSceneKeyframePrompt(bible, scene, vision, ['blur', 'BLUR', 'text']);
    const assembled = assemblePromptForProvider(prompt, ['watermark']);
    
    // Deduplication: 'blur' appears once (first wins, case-insensitive)
    expect(assembled.mergedNegative.match(/blur/gi)?.length).toBe(1);
    expect(assembled.mergedNegative).toContain('watermark');
  });
});
```

---

## 9. Rollout Strategy

### 9.1 Staged Rollout

| Stage | Flags Enabled | Gate Criteria | Duration |
|-------|---------------|---------------|----------|
| 0 | All off | Tests pass, build green | - |
| 1 | `sceneListContextV2`, `actContextV2` | Smoke test 10 scenes | 1 day |
| 2 | `sceneListValidationMode: 'warn'` | 100+ validations, <10% FP | 3 days |
| 3 | `keyframePromptPipeline` | 10 keyframe QA pass | 2 days |
| 4 | `videoPromptPipeline` | Video output review | 2 days |
| 5 | `promptTokenGuard: 'warn'` | Overflow rate <5% | 3 days |
| 6 | `bibleV2SaveSync` | Resync UX test pass | 1 day |
| 7 | `sceneListValidationMode: 'block'` | FP rate <3% | After telemetry |
| 8 | `promptTokenGuard: 'block'` | Overflow rate <1% | After telemetry |

### 9.2 Rollback Decision Tree

**When an issue is detected**:

1. **Assess Severity**:
   - **Critical** (data loss, crash, security): Immediate flag toggle to `false`/`'off'` + create incident ticket
   - **Non-critical**: Proceed to step 2

2. **Collect Telemetry** (15-30 minutes):
   - Check error rate, affected user percentage, reproduction steps

3. **Evaluate Impact**:
   - **>5% users affected**: Flag rollback + prioritize fix
   - **<5% users affected**: Deploy hotfix, keep flag enabled

4. **Post-Incident**:
   - Document root cause
   - Add regression test
   - Update risk matrix if new risk category identified

---

## 10. Flag Lifecycle Management

### 10.1 Flag Expiration Policy

Every feature flag MUST have:
- An owner responsible for removal
- An expiration date (max 90 days from creation)
- Telemetry requirements that gate promotion/removal

| Flag | Owner | Backup | Created | Expires | Removal Criteria |
|------|-------|--------|---------|---------|------------------|
| `sceneListContextV2` | @lead-dev | @backend-dev | Sprint 48 (Dec 2) | Sprint 52 (Dec 30) | 1000+ uses, 0 errors → remove flag, keep V2 |
| `actContextV2` | @lead-dev | @frontend-dev | Sprint 48 (Dec 2) | Sprint 52 (Dec 30) | 1000+ uses, act mapping accuracy >98% |
| `sceneListValidationMode` | @qa-lead | @lead-dev | Sprint 48 (Dec 2) | Sprint 54 (Jan 13) | FP rate <3% for 14 days → promote to 'block' default |
| `keyframePromptPipeline` | @backend-dev | @lead-dev | Sprint 49 (Dec 9) | Sprint 53 (Jan 6) | 500+ keyframes, token overflow <2% |
| `videoPromptPipeline` | @backend-dev | @frontend-dev | Sprint 49 (Dec 9) | Sprint 53 (Jan 6) | 200+ videos, no quality regressions |
| `promptTokenGuard` | @backend-dev | @qa-lead | Sprint 50 (Dec 16) | Sprint 54 (Jan 13) | Block mode stable 30 days → remove flag, keep block |
| `bibleV2SaveSync` | @frontend-dev | @backend-dev | Sprint 51 (Dec 23) | Sprint 55 (Jan 20) | 100+ syncs, no data loss reports |

**Availability Confirmation**: Sprint dates assume Dec 23-Jan 1 holiday freeze. Backups activated if primary unavailable >2 days.

### 10.2 Flag Telemetry Requirements

Each flag must emit telemetry via `logApiCall` when:
1. Flag is read (first time per session)
2. Feature path is taken (pipeline vs legacy)
3. Error occurs in gated code path
4. Rollback is triggered

**Telemetry Schema**:

```typescript
interface FlagTelemetryEvent {
  flag: string;                    // Flag name
  value: boolean | string;         // Current value
  event: 'read' | 'path_taken' | 'error' | 'rollback';
  context?: {
    path: 'pipeline' | 'legacy';   // Which code path executed
    error?: string;                // Error message if event='error'
    sessionId: string;             // For deduplication
    timestamp: number;
  };
}

// Usage in service
function generateKeyframe(...) {
  const flags = loadFeatureFlags();
  logApiCall?.('flag_telemetry', 'read', { flag: 'keyframePromptPipeline', value: flags.keyframePromptPipeline });
  
  if (isFeatureEnabled(flags, 'keyframePromptPipeline')) {
    logApiCall?.('flag_telemetry', 'path_taken', { flag: 'keyframePromptPipeline', path: 'pipeline' });
    // ... pipeline code
  } else {
    logApiCall?.('flag_telemetry', 'path_taken', { flag: 'keyframePromptPipeline', path: 'legacy' });
    // ... legacy code
  }
}
```

### 10.3 Flag Consolidation Strategy

To prevent flag sprawl:

1. **Quarterly Review** (every 12 weeks):
   - Review all flags older than 60 days
   - Remove flags meeting removal criteria
   - Extend flags with documented justification

2. **Maximum Active Flags**: 15
   - If adding new flag would exceed limit, must remove one first
   - Exception: Critical rollback flags

3. **Flag Naming Convention**:
   ```
   <feature><Version><Variant>
   
   Examples:
   - sceneListContextV2      (feature + version)
   - promptTokenGuard        (feature only, has modal values)
   - bibleV2SaveSync         (compound feature)
   ```

### 10.4 Flag Cleanup Enforcement

**Recurring Ticket Template** (create in project tracker):

```
Title: [RECURRING] Feature Flag 90-Day Review
Schedule: Every 4 weeks (Fridays)
Assignee: Rotate: Lead Dev → QA Lead → Backend Dev
Duration: 1 hour

Checklist:
□ Query all flags with expiration < 14 days
□ For each expiring flag:
  □ Check telemetry: Has removal criteria been met?
  □ If YES: Create removal ticket, assign owner
  □ If NO: Document reason for extension, update expiration +30 days max
□ Verify no flags exceed 90-day hard limit
□ Update FEATURE_FLAGS.md with current states
□ Archive removed flag documentation
```

**Flag Removal Checklist** (per flag):

```markdown
## Flag Removal: `<flagName>`

Date: ____
Owner: ____

### Pre-Removal
- [ ] Telemetry confirms removal criteria met
- [ ] All tests pass with flag hardcoded to final value
- [ ] No active incidents related to this flag

### Code Removal
- [ ] Remove flag from `FeatureFlags` interface in `featureFlags.ts`
- [ ] Remove flag from `DEFAULT_FEATURE_FLAGS`
- [ ] Remove flag from `loadFeatureFlags()` return
- [ ] Search codebase: `isFeatureEnabled(*, '<flagName>')`
  - [ ] Replace with unconditional final behavior
  - [ ] Remove dead legacy code paths
- [ ] Remove flag-specific tests (or convert to regular tests)
- [ ] Update `FEATURE_FLAGS.md` (move to "Retired Flags" section)

### Post-Removal
- [ ] Verify build passes
- [ ] Verify all tests pass
- [ ] Deploy to staging, smoke test
- [ ] Deploy to production
- [ ] Close removal ticket
```

**Enforcement Automation** (optional):

```typescript
// Add to CI/build script
function checkFlagExpirations(): void {
  const flags = Object.entries(FLAG_METADATA);
  const now = new Date();
  
  for (const [name, meta] of flags) {
    const expiry = new Date(meta.expires);
    const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysUntilExpiry < 0) {
      console.error(`❌ Flag '${name}' EXPIRED on ${meta.expires}. Remove immediately.`);
      process.exit(1); // Fail build
    } else if (daysUntilExpiry < 14) {
      console.warn(`⚠️ Flag '${name}' expires in ${Math.ceil(daysUntilExpiry)} days.`);
    }
  }
}
```

---

## 11. API and Data Contracts

### 11.1 `assemblePromptForProvider` Contract

**Input Schema**:

```typescript
interface AssemblePromptInput {
  /**
   * Base prompt from buildSceneKeyframePrompt or buildComfyUIPrompt
   */
  basePrompt: {
    positive: string;       // Required: Main prompt text
    negative?: string;      // Optional: Base negative prompt
    metadata?: {
      sceneId?: string;     // For telemetry correlation
      shotId?: string;
      source: 'keyframe' | 'shot' | 'video' | 'bookend';
    };
  };
  
  /**
   * Additional scene-specific negatives (from user/timeline)
   */
  additionalNegatives?: string[];
  
  /**
   * System default negatives (from DEFAULT_NEGATIVE_PROMPT)
   */
  defaultNegatives?: string[];
  
  /**
   * Optional feature flags override (for testing)
   */
  flags?: Partial<FeatureFlags>;
}
```

**Output Schema**:

```typescript
interface AssemblePromptOutput {
  /**
   * For Gemini (single combined prompt)
   */
  inlineFormat: string;  // `${positive}\n\nNegative: ${negative}`
  
  /**
   * For ComfyUI (separate fields)
   */
  separateFormat: {
    positive: string;
    negative: string;
  };
  
  /**
   * Merged, deduplicated negative prompt
   * Order: basePrompt.negative → additionalNegatives → defaultNegatives
   * Deduplication: case-insensitive, first-wins
   */
  mergedNegative: string;
  
  /**
   * Token estimates (using 4 chars/token heuristic)
   */
  tokens: {
    positive: number;
    negative: number;
    total: number;
  };
  
  /**
   * Metadata passthrough for telemetry
   */
  metadata?: AssemblePromptInput['basePrompt']['metadata'];
}
```

**Invariants**:
- `separateFormat.positive === basePrompt.positive` (never modified)
- `mergedNegative` contains no duplicate terms (case-insensitive)
- `tokens.total === tokens.positive + tokens.negative`
- When flags are off, output matches legacy behavior exactly

### 11.2 ComfyUI Payload Structure

**POST /prompt Request**:

```typescript
interface ComfyUIPromptPayload {
  prompt: {
    [nodeId: string]: {
      class_type: string;
      inputs: Record<string, any>;
    };
  };
  client_id?: string;  // For WebSocket callback routing
}

// Example for keyframe generation:
{
  "prompt": {
    "3": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": assembledOutput.separateFormat.positive,  // Positive prompt
        "clip": ["4", 0]
      }
    },
    "7": {
      "class_type": "CLIPTextEncode", 
      "inputs": {
        "text": assembledOutput.separateFormat.negative,  // Negative prompt
        "clip": ["4", 0]
      }
    }
    // ... other nodes
  }
}
```

### 11.3 `descriptorSource` Migration Contract

**Before Migration**:
```typescript
interface VisualBibleCharacter {
  name: string;
  description: string;
  // No descriptorSource field
}
```

**After Migration**:
```typescript
interface VisualBibleCharacter {
  name: string;
  description: string;
  descriptorSource: 'storyBible' | 'userEdit';  // Required
}
```

**Migration Rules**:
1. If `descriptorSource` missing: Default to `'storyBible'`
2. Migration is idempotent (can run multiple times safely)
3. Migration runs on first load after update
4. `_migrated` flag tracks completion

**Backfill Query**:
```typescript
function migrateDescriptorSource(bible: VisualBible): VisualBible {
  return {
    ...bible,
    characters: bible.characters.map(char => ({
      ...char,
      descriptorSource: char.descriptorSource ?? 'storyBible',
    })),
  };
}
```

---

## 12. Token Budget Calibration

### 12.1 Current Budgets (Heuristic-Based)

| Budget Key | Chars/Token | Max Tokens | Max Chars | Usage |
|------------|-------------|------------|-----------|-------|
| `logline` | 4 | 500 | 2000 | Story logline |
| `characterProfile` | 4 | 400 | 1600 | Per-character description |
| `setting` | 4 | 600 | 2400 | World/setting details |
| `plotScene` | 4 | 200 | 800 | Scene summary |
| `comfyuiShot` | 4 | 500 | 2000 | Shot prompt for ComfyUI |
| `plotOutline` | 4 | 800 | 3200 | Full plot outline |
| `sceneKeyframe` | 4 | 600 | 2400 | **NEW**: Keyframe prompt |

### 12.2 Calibration Strategy

**Phase 1: Baseline Collection** (Week 1-2)
1. Enable `promptTokenGuard: 'warn'` to log without blocking
2. Collect 100+ real prompts per category
3. Use Gemini `countTokens` API for ground truth

```typescript
// Calibration data collection
async function calibrateTokens(prompt: string, category: string): Promise<void> {
  const heuristicTokens = Math.ceil(prompt.length / 4);
  const actualTokens = await ai.models.countTokens({ model: 'gemini-2.0-flash', contents: prompt });
  
  logApiCall?.('token_calibration', 'sample', {
    category,
    heuristic: heuristicTokens,
    actual: actualTokens.totalTokens,
    ratio: actualTokens.totalTokens / heuristicTokens,
    promptLength: prompt.length,
  });
}
```

**Phase 2: Analysis** (Week 2-3)
- Calculate average chars/token per category
- Identify outliers (>2σ deviation)
- Adjust budgets based on P95 usage

**Phase 3: Budget Adjustment** (Week 3-4)

| Category | Current Ratio | Measured Ratio | New Budget |
|----------|---------------|----------------|------------|
| `logline` | 4.0 | TBD | TBD |
| `characterProfile` | 4.0 | TBD | TBD |
| `sceneKeyframe` | 4.0 | TBD | TBD |
| ... | ... | ... | ... |

### 12.3 Provider & Environment Parity

**Pinned Versions** (must match deployed environment):

| Component | Version | Verification Command |
|-----------|---------|----------------------|
| ComfyUI | v0.3.x | `GET /system_stats` → `comfyui_version` |
| ComfyUI Node Graph | Custom nodes v1.2.0+ | Check `custom_nodes/` manifest |
| Gemini Model | `gemini-2.0-flash` | Hardcoded in `services/geminiService.ts` |
| @google/genai SDK | `^1.0.0` | `package.json` dependency |
| WAN2 Workflow | `video_wan2_2_5B_ti2v.json` v2 | Workflow `_meta.version` field |

**countTokens Fallback Strategy**:

If `countTokens` API is slow (>500ms) or unavailable in lower environments:

```typescript
const TOKEN_API_TIMEOUT_MS = 500;
const FALLBACK_CHARS_PER_TOKEN = 3.5; // Conservative estimate

async function countTokensWithFallback(
  prompt: string,
  model: string = 'gemini-2.0-flash'
): Promise<{ tokens: number; source: 'api' | 'heuristic' }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TOKEN_API_TIMEOUT_MS);
    
    const result = await ai.models.countTokens({ model, contents: prompt });
    clearTimeout(timeoutId);
    
    return { tokens: result.totalTokens, source: 'api' };
  } catch (error) {
    // Fallback to conservative heuristic
    console.warn('[TokenGuard] countTokens unavailable, using heuristic');
    return { 
      tokens: Math.ceil(prompt.length / FALLBACK_CHARS_PER_TOKEN), 
      source: 'heuristic' 
    };
  }
}
```

**Lower Environment Configuration**:
- Dev/Test: Set `VITE_TOKEN_API_ENABLED=false` to skip API calls entirely
- Staging: Use API with 500ms timeout
- Production: Use API with 2000ms timeout (more tolerance for latency)

### 12.4 Dynamic Token Guard

For prompts that may exceed budgets, use dynamic measurement with the fallback wrapper:

```typescript
async function guardTokenBudget(
  prompt: string,
  budgetKey: keyof typeof DEFAULT_TOKEN_BUDGETS,
  flags: FeatureFlags,
  logApiCall?: ApiLogCallback
): Promise<{ allowed: boolean; tokens: number; budget: number; source: 'api' | 'heuristic' }> {
  const budget = DEFAULT_TOKEN_BUDGETS[budgetKey];
  
  // Fast path: heuristic estimate for prompts well under budget
  const heuristicTokens = Math.ceil(prompt.length / 4);
  
  if (heuristicTokens <= budget * 0.8) {
    // Under 80% of budget, skip API call entirely
    return { allowed: true, tokens: heuristicTokens, budget, source: 'heuristic' };
  }
  
  // Near budget: use countTokensWithFallback (includes timeout + heuristic fallback)
  const { tokens: actualTokens, source } = await countTokensWithFallback(prompt);
  
  const allowed = flags.promptTokenGuard !== 'block' || actualTokens <= budget;
  
  logApiCall?.('token_guard', 'check', {
    budgetKey,
    heuristic: heuristicTokens,
    actual: actualTokens,
    budget,
    allowed,
    source,  // Track whether API or heuristic was used
  });
  
  return { allowed, tokens: actualTokens, budget, source };
}
```

**Note**: The `countTokensWithFallback` function (defined in section 12.3) handles:
- 500ms timeout in staging, 2000ms in production
- Automatic fallback to 3.5 chars/token heuristic on timeout/error
- Environment-based disable via `VITE_TOKEN_API_ENABLED=false`
```

---

## 13. Negative Prompt Policy

### 13.1 Allowed Negative Categories

Based on Stable Diffusion best practices and provider constraints:

| Category | Examples | Provider Support |
|----------|----------|------------------|
| **Quality** | blur, low quality, pixelated, jpeg artifacts | All |
| **Anatomy** | bad anatomy, deformed, extra limbs | All |
| **Text/Watermarks** | text, watermark, signature, logo | All |
| **Artifacts** | noise, grain, chromatic aberration | All |
| **Composition** | cropped, out of frame, cut off | All |
| **Style** | cartoon, anime, 3d render *(if unwanted)* | Context-dependent |

### 13.2 Restricted Negatives

The following are **NOT ALLOWED** in negative prompts:

| Category | Reason | Enforcement |
|----------|--------|-------------|
| **Hate speech** | Policy violation | Block + error |
| **NSFW terms** | Policy violation | Block + error |
| **Violence** | May trigger provider filters | Warn |
| **Real names** | Privacy/legal concerns | Warn |
| **Copyrighted terms** | Legal concerns | Warn |

**Validation Function**:

```typescript
const BLOCKED_TERMS = new Set(['[redacted - hate speech]', '[redacted - nsfw]']);
const WARNED_TERMS = new Set(['blood', 'gore', 'violence', 'death']);

function validateNegatives(negatives: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const term of negatives) {
    const lower = term.toLowerCase().trim();
    
    if (BLOCKED_TERMS.has(lower)) {
      errors.push(`Blocked term in negative prompt: "${term}"`);
    }
    if (WARNED_TERMS.has(lower)) {
      warnings.push(`Potentially problematic term: "${term}"`);
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}
```

### 13.3 Default Negative Prompt

The universal negative prompt applied to all generations:

```typescript
export const DEFAULT_NEGATIVE_PROMPT = [
  // Quality
  'blur', 'blurry', 'low quality', 'worst quality', 'jpeg artifacts', 'pixelated',
  
  // Anatomy  
  'bad anatomy', 'bad hands', 'bad proportions', 'deformed', 'extra limbs',
  'fused fingers', 'malformed limbs', 'missing arms', 'missing legs',
  
  // Artifacts
  'watermark', 'text', 'signature', 'logo', 'username',
  
  // Composition
  'cropped', 'out of frame', 'cut off',
  
  // Technical
  'oversaturated', 'overexposed', 'underexposed',
].join(', ');
```

### 13.4 Provider-Specific Constraints

| Provider | Max Negative Length | Format | Notes |
|----------|---------------------|--------|-------|
| ComfyUI (CLIP) | ~77 tokens | Comma-separated | Standard CLIP limitation |
| Gemini | N/A | Inline text | Uses "Negative:" prefix |
| DALL-E | Not supported | N/A | Ignore negative prompts |

**Truncation Strategy** (for CLIP):

```typescript
function truncateForCLIP(negative: string, maxTokens: number = 77): string {
  const terms = negative.split(',').map(s => s.trim());
  const result: string[] = [];
  let tokenCount = 0;
  
  for (const term of terms) {
    const termTokens = Math.ceil(term.length / 4) + 1; // +1 for comma
    if (tokenCount + termTokens > maxTokens) break;
    result.push(term);
    tokenCount += termTokens;
  }
  
  return result.join(', ');
}
```

---

## 14. Observability Plan

### 14.1 Metrics to Collect

| Metric | Type | Dimensions | Purpose |
|--------|------|------------|---------|
| `flag_state` | Gauge | `flag_name`, `value` | Current flag states |
| `flag_read` | Counter | `flag_name` | How often each flag is checked |
| `path_taken` | Counter | `flag_name`, `path` | Pipeline vs legacy usage |
| `token_overflow` | Counter | `budget_key`, `mode` | Overflow frequency |
| `validation_result` | Counter | `mode`, `valid` | Scene validation outcomes |
| `negative_merge` | Histogram | `source_count` | Negative sources merged |
| `sync_operation` | Counter | `result` | Bible sync outcomes |
| `generation_latency` | Histogram | `type`, `flag_state` | Time to generate (with/without flags) |

### 14.2 Events to Log

All events logged via `logApiCall` for consistent format:

```typescript
// Event categories and payloads
type ObservabilityEvent = 
  | { category: 'flag'; action: 'read' | 'toggle' | 'rollback'; flag: string; value: any }
  | { category: 'token'; action: 'check' | 'overflow' | 'truncate'; tokens: number; budget: number }
  | { category: 'validation'; action: 'run' | 'retry' | 'fail'; mode: string; result: any }
  | { category: 'sync'; action: 'start' | 'complete' | 'skip'; synced: number; skipped: number }
  | { category: 'prompt'; action: 'assemble' | 'queue'; tokens: any; negatives: number }
  | { category: 'error'; action: 'caught' | 'unhandled'; error: string; stack?: string };

// Usage
logApiCall?.('observability', 'event', {
  category: 'token',
  action: 'overflow',
  tokens: 750,
  budget: 600,
  budgetKey: 'sceneKeyframe',
  mode: 'warn',
});
```

### 14.3 Alerting Thresholds

| Condition | Severity | Action |
|-----------|----------|--------|
| Token overflow rate > 10%/hour | Warning | Investigate prompt sizes |
| Token overflow rate > 25%/hour | Critical | Consider flag rollback |
| Validation failure rate > 20% | Warning | Review validation rules |
| Flag rollback triggered | Warning | Investigate root cause |
| Sync data loss detected | Critical | Immediate investigation |
| Generation error rate > 5% | Critical | Check ComfyUI/Gemini health |

### 14.4 Dashboard Requirements

**Primary Dashboard: Pipeline Health**

The dashboard should display the following panels:

| Panel | Metrics | Refresh Rate |
|-------|---------|--------------|
| **Flag States** | Current value of each pipeline flag (ON/OFF/warn/block) | Real-time |
| **Token Health** | Overflow rate %, average budget utilization % | 1 minute |
| **Generation Latency** | P50, P95, P99 latency by generation type | 1 minute |
| **Pipeline vs Legacy** | Percentage of requests using each path (last 24h) | 5 minutes |
| **Validation Results** | Valid/Warned/Blocked counts and percentages (last 7d) | 5 minutes |
| **Recent Events** | Scrolling log of last 20 telemetry events | Real-time |

**Sample Event Log Entries**:
- `10:32 [token] overflow - sceneKeyframe 612/600 (warn)`
- `10:28 [sync] complete - synced: 3, skipped: 1`
- `10:25 [flag] read - promptTokenGuard = 'warn'`
- `10:22 [prompt] assemble - tokens: {pos: 450, neg: 85}`

### 14.5 Telemetry Privacy & Sampling

**PII Avoidance Checklist**:

All `logApiCall` payloads MUST NOT include:
- ❌ Full prompt text (may contain user-generated content)
- ❌ Character names from Story Bible
- ❌ File paths with usernames
- ❌ API keys or tokens
- ❌ Session IDs that could be correlated to users

**Allowed in Payloads**:
- ✅ Token counts (numeric only)
- ✅ Flag names and values
- ✅ Error types (not full stack traces in prod)
- ✅ Timing metrics (latency, duration)
- ✅ Validation results (valid/invalid, category)
- ✅ Hash of prompt (for deduplication, not content)

**Sanitization Function**:

```typescript
function sanitizeTelemetryPayload(payload: Record<string, any>): Record<string, any> {
  const REDACTED_KEYS = ['prompt', 'text', 'content', 'description', 'name', 'path'];
  const result = { ...payload };
  
  for (const key of REDACTED_KEYS) {
    if (key in result && typeof result[key] === 'string') {
      result[key] = `[REDACTED:${result[key].length}chars]`;
    }
  }
  
  return result;
}
```

**Sampling Guidance** (to prevent log overload):

| Event Type | Frequency | Sampling Rate | Max Events/Hour | Bypass Sampling? |
|------------|-----------|---------------|------------------|-------------------|
| `flag.read` | Every session start | 100% | ~100 | - |
| `flag.path_taken` | Every generation | 100% | ~500 | - |
| `token.check` | Every prompt near budget | **10%** | ~50 | - |
| `token.overflow` | On overflow only | **100%** | ~20 | ✅ Always log |
| `validation.run` | Every scene validation | **25%** | ~100 | - |
| `validation.fail` | On failure only | **100%** | ~10 | ✅ Always log |
| `prompt.assemble` | Every assembly | **5%** | ~25 | - |
| `error.*` | All errors | **100%** | Unbounded | ✅ Always log |

**Sampling Implementation**:

```typescript
const SAMPLING_RATES: Record<string, number> = {
  'token.check': 0.1,
  'validation.run': 0.25,
  'prompt.assemble': 0.05,
};

// Events that ALWAYS bypass sampling (critical for debugging)
const ALWAYS_LOG_EVENTS = new Set([
  'token.overflow',
  'validation.fail', 
  'error.caught',
  'error.unhandled',
  'flag.rollback',
  'sync.error',
]);

function shouldSample(eventType: string): boolean {
  // Critical events always logged regardless of sampling
  if (ALWAYS_LOG_EVENTS.has(eventType)) {
    return true;
  }
  
  const rate = SAMPLING_RATES[eventType] ?? 1.0;
  return Math.random() < rate;
}

// Usage
if (shouldSample('token.check')) {
  logApiCall?.('token', 'check', sanitizeTelemetryPayload(payload));
}
```
```

### 14.6 Local Storage Telemetry

For development/debugging, store events locally:

```typescript
const TELEMETRY_KEY = 'pipeline_telemetry';
const MAX_EVENTS = 1000;

function storeTelemetryEvent(event: ObservabilityEvent): void {
  const events = JSON.parse(localStorage.getItem(TELEMETRY_KEY) || '[]');
  events.push({ ...event, timestamp: Date.now() });
  
  // Keep last N events
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  
  localStorage.setItem(TELEMETRY_KEY, JSON.stringify(events));
}

// Export for debugging
window.__getPipelineTelemetry = () => 
  JSON.parse(localStorage.getItem(TELEMETRY_KEY) || '[]');
```

---

## 15. Revised Timeline

### 15.1 Realistic Estimates

Based on complexity analysis and buffer for unknowns:

| Phase | Optimistic | Realistic | Pessimistic | Depends On |
|-------|------------|-----------|-------------|------------|
| Phase 0: Infrastructure | 1 day | 2 days | 3 days | - |
| Phase 1: Assembler Functions | 2 days | 3 days | 5 days | Phase 0 |
| Phase 2: Scene List Validation | 2 days | 3 days | 4 days | Phase 0 |
| Phase 3: Narrative Context | 1 day | 2 days | 3 days | Phase 0 |
| Phase 4: Service Signatures | 2 days | 3-4 days | 5 days | Phase 1 |
| Phase 5: Caller Updates | 1 day | 2-3 days | 4 days | Phase 4 |
| Phase 6: Visual Bible UI | 2 days | 2-3 days | 4 days | Phase 0 |
| Phase 7: Testing | 3 days | 4-5 days | 7 days | Phases 0-3 (parallel) |
| Phase 8: Documentation | 1 day | 1-2 days | 2 days | All |
| **Total** | **15 days** | **22-27 days** | **37 days** | - |

### 15.2 Sprint Allocation (2-week sprints)

**Sprint 1** (Days 1-10):
- Phase 0: Infrastructure ✓
- Phase 1: Assembler Functions ✓
- Phase 2: Scene List Validation ✓
- Phase 3: Narrative Context ✓
- Phase 7: Unit tests (parallel) ✓
- **Exit Criteria**: All flags defined, assembler working, validators implemented

**Sprint 2** (Days 11-20):
- Phase 4: Service Signatures ✓
- Phase 5: Caller Updates ✓
- Phase 6: Visual Bible UI ✓
- Phase 7: Integration tests ✓
- **Exit Criteria**: All generation paths updated, sync working

**Sprint 3** (Days 21-27):
- Phase 7: E2E tests ✓
- Phase 8: Documentation ✓
- Staged rollout (Stages 1-4) ✓
- **Exit Criteria**: All tests pass, docs complete, warn mode enabled

### 15.3 Risk Buffer

| Risk | Likelihood | Impact | Buffer Days |
|------|------------|--------|-------------|
| Token calibration takes longer | Medium | Low | +2 |
| ComfyUI API changes | Low | High | +3 |
| Test flakiness in CI | Medium | Medium | +2 |
| Unforeseen type conflicts | Medium | Medium | +2 |
| **Total Buffer** | - | - | **+9 days** |

**With buffer**: 27 + 9 = **36 days maximum** (vs 22-27 realistic)

### 15.4 Milestone Gates

| Milestone | Target Date | Gate Criteria |
|-----------|-------------|---------------|
| M1: Infrastructure Complete | Day 2 | All flags compile, tests scaffold ready |
| M2: Core Functions Complete | Day 8 | Assembler, validators, context all unit tested |
| M3: Services Updated | Day 15 | All services use assembler when flagged |
| M4: Callers Updated | Day 18 | All components pass storyBible |
| M5: Tests Complete | Day 23 | 95%+ test coverage, CI green |
| M6: Docs Complete | Day 25 | README, FEATURE_FLAGS.md, JSDoc updated |
| M7: Rollout Stage 4 | Day 27 | Video pipeline validated in production |

### 15.5 Phase Acceptance Criteria (Detailed)

| Phase | Measurable Gate | Verification Method | Sign-off |
|-------|-----------------|---------------------|----------|
| Phase 0 | 7 flags defined, `loadFeatureFlags()` returns correct defaults | Unit test suite, manual spot check | Lead Dev |
| Phase 1 | `assemblePromptForProvider` P95 token accuracy ±5% vs `countTokens` | 50-sample calibration run | Backend Dev |
| Phase 2 | Validator FP rate <10% on 100 synthetic scenes | Automated test with labeled dataset | QA Lead |
| Phase 3 | `getNarrativeContext` returns identical output to legacy for 20 sample scenes | Diff comparison script | Lead Dev |
| Phase 4 | ComfyUI prompt parity: 10 keyframe comparison (see rubric below) | Visual QA review, screenshot archive | QA Lead |
| Phase 5 | All 8 caller sites compile, no TypeScript errors | `tsc --noEmit` in CI | Backend Dev |
| Phase 6 | Visual Bible resync UX: 3 scenarios pass (see rubric below) | UX walkthrough checklist | Frontend Dev |
| Phase 7 | 95%+ line coverage, all E2E tests green | Vitest coverage report, Playwright results | QA Lead |
| Phase 8 | README, FEATURE_FLAGS.md reviewed, no broken links | Doc review checklist | Lead Dev |

#### Phase 4 Visual Parity Rubric (Keyframe Screenshots)

For each of 10 test scenes, compare pipeline vs legacy keyframe:

| Criterion | Pass | Fail |
|-----------|------|------|
| Subject present | Main subject clearly visible | Subject missing or unrecognizable |
| Style consistency | Matches director's vision aesthetic | Noticeably different style/mood |
| Composition | Similar framing and layout | Significantly different composition |
| Quality | No new artifacts, blur, or distortion | Introduces quality degradation |
| Negative effectiveness | Unwanted elements absent | Watermarks, text, or blocked elements appear |

**Pass threshold**: 8/10 scenes pass all 5 criteria; remaining 2 may have 1 minor deviation each.

#### Phase 6 Visual Bible Resync Rubric

| Scenario | Steps | Expected Result |
|----------|-------|------------------|
| Auto-sync respects user edits | 1. Edit character description manually 2. Save Story Bible 3. Check Visual Bible | User-edited character unchanged; others synced |
| Resync All overwrites | 1. Edit character 2. Click "Resync All" 3. Confirm dialog | All characters match Story Bible; toast shows count |
| Toast notification | 1. Add new character to Story Bible 2. Save | Toast shows "X synced, Y preserved"; counts correct |

---

## 16. Documentation Requirements

### 16.1 README.md Updates

Add section:

```markdown
## Pipeline Flags (v2.x)

This project uses feature flags to progressively enable new prompt pipeline capabilities.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `sceneListContextV2` | boolean | false | Use V2 context in scene generation |
| `keyframePromptPipeline` | boolean | false | Use buildSceneKeyframePrompt |
| `videoPromptPipeline` | boolean | false | Use assembler for video paths |
| `promptTokenGuard` | 'off'\|'warn'\|'block' | 'off' | Token budget enforcement |
| ... | ... | ... | ... |

### Rollback

Set any flag to `false` or `'off'` to immediately revert to legacy behavior.
No data migration required.
```

### 16.2 FEATURE_FLAGS.md

Create comprehensive reference:

```markdown
# Feature Flags Reference

## Pipeline Flags

### sceneListContextV2
- **Type**: `boolean`
- **Default**: `false`
- **Stability**: experimental
- **Description**: Use V2 context in scene generation
- **Rollback**: Set to `false`

### promptTokenGuard
- **Type**: `'off' | 'warn' | 'block'`
- **Default**: `'off'`
- **Stability**: experimental
- **Description**: Token budget enforcement mode
  - `off`: No enforcement
  - `warn`: Log overflow, allow generation
  - `block`: Reject generation if over budget
- **Rollback**: Set to `'off'`

...
```

---

## 17. Recommendations

### 17.1 Priority Order

1. **Phase 0** (Infrastructure) — Must complete first; unblocks all other phases
2. **Phase 1** (Assembler) — Highest value; centralizes prompt logic
3. **Phase 7** (Testing) — Run in parallel with implementation
4. **Phases 2-6** — Can be parallelized where dependencies allow

### 17.2 Quick Wins (Phase 0.5)

For faster initial value, implement:
- Steps 1-5: Flags, pipelineContext, registry budget, descriptorSource + migration
- Steps 6-7: Assembler + keyframe prompt + sync update
- Step 10-11: Extract `getNarrativeContext` utility
- Steps 18-19: Flag-off parity + pipeline tests

### 17.3 Technical Debt to Address

| Debt | Resolution | Priority |
|------|------------|----------|
| Duplicated `getNarrativeContext` | Phase 3 extraction | P1 |
| Missing bookend tests | Phase 7 step 23 | P1 |
| Inline negative handling | Phase 1 assembler | P0 |

### 17.4 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| All tests pass | 100% | CI pipeline |
| Token overflow rate | <1% | telemetry |
| Rollback latency | <1 min | manual test |
| False positive rate | <3% | validator logs |

### 17.5 Test Infrastructure Verification

**Required Test Harness Components** (must exist before Phase 7):

| Component | Status | Owner | Due Date | Location | Action Required |
|-----------|--------|-------|----------|----------|------------------|
| Playwright fixtures | Ready | - | - | `tests/fixtures/` | None |
| ComfyUI mock server | Partial | @backend-dev | Day 3 | `tests/mocks/comfyui.ts` | Add `/prompt`, `/history` stubs |
| Token API stubbing | Missing | @backend-dev | Day 5 | `tests/mocks/gemini.ts` | Create `mockCountTokens()` |
| Feature flag helpers | Partial | @lead-dev | Day 4 | `tests/helpers/flags.ts` | Add `withFlags()` wrapper |
| Visual Bible fixtures | Ready | - | - | `tests/fixtures/visualBible.json` | None |
| Scene dataset (labeled) | Missing | @qa-lead | Day 6 | `tests/fixtures/scenes-validation.json` | Create 100 labeled scenes |

**Status Legend**: Ready = no work needed | Partial = enhancement required | Missing = must create

**Pre-Phase 7 Setup Tasks**:

```typescript
// tests/mocks/comfyui.ts - Required stubs
export const mockComfyUIServer = {
  '/prompt': (req: Request) => {
    return { prompt_id: 'mock-' + Date.now(), number: 1 };
  },
  '/history': (promptId: string) => {
    return { [promptId]: { status: { completed: true }, outputs: {} } };
  },
  '/system_stats': () => {
    return { comfyui_version: '0.3.0', devices: [] };
  },
};

// tests/mocks/gemini.ts - Token API stub
export function mockCountTokens(promptLength: number): CountTokensResponse {
  return { totalTokens: Math.ceil(promptLength / 4) };
}

// tests/helpers/flags.ts - Flag override wrapper
export function withFlags<T>(
  flags: Partial<FeatureFlags>,
  fn: () => T
): T {
  const original = loadFeatureFlags();
  vi.spyOn(module, 'loadFeatureFlags').mockReturnValue({ ...original, ...flags });
  try {
    return fn();
  } finally {
    vi.restoreAllMocks();
  }
}
```

**Timeline Impact Assessment**:
- If ComfyUI mocks incomplete: +1 day to Phase 7
- If Token API stub missing: +0.5 day to Phase 7
- If labeled scene dataset missing: +1 day to Phase 2 (validation testing)

---

## 18. Appendices

### Appendix A: Migration Safety Protocol

**Pre-Migration Checklist**:

1. **Rehearsal on Prod-Like Snapshot**:
   - Export production IndexedDB to JSON snapshot
   - Run migration in isolated test environment
   - Validate: All characters have `descriptorSource` field
   - Validate: No data loss (character count matches)
   - Validate: Default value is `'storyBible'` for existing entries

2. **Rollback Procedure** (if migration fails):

```typescript
// Emergency rollback: Remove descriptorSource field
function rollbackDescriptorSourceMigration(bible: VisualBible): VisualBible {
  return {
    ...bible,
    _migrated: false,
    characters: bible.characters.map(char => {
      const { descriptorSource, ...rest } = char;
      return rest;
    }),
  };
}

// Trigger via console in emergency
window.__rollbackMigration = async () => {
  const db = await openDatabase();
  const bible = await db.get('visualBible');
  const rolledBack = rollbackDescriptorSourceMigration(bible);
  await db.put('visualBible', rolledBack);
  location.reload();
};
```

3. **Corrupt Entry Handling**:

```typescript
function migrateDescriptorSourceSafe(bible: VisualBible): MigrationResult {
  const errors: string[] = [];
  const migrated: VisualBible = {
    ...bible,
    characters: bible.characters.map((char, idx) => {
      // Skip/mask corrupt entries
      if (!char || typeof char.name !== 'string') {
        errors.push(`Corrupt entry at index ${idx}, skipping`);
        return null; // Will be filtered
      }
      
      return {
        ...char,
        descriptorSource: char.descriptorSource ?? 'storyBible',
      };
    }).filter(Boolean) as VisualBibleCharacter[],
  };
  
  return { 
    bible: migrated, 
    errors,
    skipped: bible.characters.length - migrated.characters.length,
  };
}
```

4. **Migration Verification Query**:

```typescript
// Run after migration to verify
async function verifyMigration(): Promise<MigrationVerification> {
  const bible = await loadVisualBible();
  const issues: string[] = [];
  
  for (const char of bible.characters) {
    if (!char.descriptorSource) {
      issues.push(`Missing descriptorSource: ${char.name}`);
    }
    if (!['storyBible', 'userEdit'].includes(char.descriptorSource)) {
      issues.push(`Invalid descriptorSource: ${char.name} = ${char.descriptorSource}`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    totalCharacters: bible.characters.length,
  };
}
```

---

### Appendix B: New Files Summary

| File | Phase | Purpose |
|------|-------|---------|
| `utils/pipelineContext.ts` | 0 | `ensureLogApiCall`, `assertPipelineContext` |
| `utils/narrativeContext.ts` | 3 | Shared `getNarrativeContext` utility |
| `services/sceneListValidator.ts` | 2 | Structural scene validation |
| `services/__tests__/generateVideoFromBookendsSequential.test.ts` | 7 | Bookend pipeline tests |

### Appendix C: Modified Files Summary

| File | Phases | Changes |
|------|--------|---------|
| `utils/featureFlags.ts` | 0 | +7 flags, +loadFeatureFlags |
| `services/promptRegistry.ts` | 0 | +sceneKeyframe budget |
| `types.ts` | 0 | +descriptorSource field |
| `utils/migrations.ts` | 0 | +migrateDescriptorSource |
| `services/promptPipeline.ts` | 1 | +assembler, +buildSceneKeyframePrompt |
| `services/planExpansionService.ts` | 2 | +generateSceneListWithFeedback |
| `components/TimelineEditor.tsx` | 3, 5 | Use shared utility, pass storyBible |
| `components/ContinuityDirector.tsx` | 3 | Use shared utility |
| `services/geminiService.ts` | 4 | Use assembler when flag on |
| `services/comfyUIService.ts` | 4 | Use assembler when flag on |
| `App.tsx` | 5 | Pass storyBible to generation |
| `utils/hooks.ts` | 6 | migrateDescriptorSource on load |

### Appendix D: References

1. **Feature Toggles**: Hodgson, P. (2017). *Feature Toggles (aka Feature Flags)*. Martin Fowler. https://martinfowler.com/articles/feature-toggles.html

2. **Google Gen AI SDK**: Google. (2025). *@google/genai Documentation*. https://github.com/googleapis/js-genai

3. **Negative Prompts**: Andrew. (2023). *How to use negative prompts?* Stable Diffusion Art. https://stable-diffusion-art.com/how-to-use-negative-prompts/

4. **ComfyUI API**: ComfyOrg. (2025). *ComfyUI Server API Reference*. https://github.com/comfy-org/docs

---

**Document Prepared By**: GitHub Copilot (Claude Opus 4.5)  
**Review Status**: Ready for Implementation  
**Next Action**: Begin Phase 0 infrastructure setup
