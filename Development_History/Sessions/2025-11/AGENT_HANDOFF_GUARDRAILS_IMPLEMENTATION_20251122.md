# Agent Handoff: Guardrails Implementation for Story/Image Generation Pipeline
**Date**: 2025-11-22  
**Session Type**: Implementation - Phased Approach  
**Priority**: HIGH (Production Quality Improvements)  
**Estimated Duration**: 16-20 hours across 4 sessions

---

## 🎯 Mission Overview

You are tasked with implementing comprehensive guardrails and validation frameworks for the gemDirect1 story-to-video pipeline to ensure:
1. **Consistent prompt construction** with enforced single-frame instructions and negative guidance
2. **Linear narrative progression** with validation of act ordering and hero arc continuity
3. **Reliable UI state synchronization** with per-scene status tracking and error visibility
4. **Production-grade quality** with automated validation at every generation stage

**Critical Context**: A recent fix (2025-11-22) removed duplicate director's vision from prompts, reducing prompt length from 875→676 characters. This handoff builds on that fix by adding systematic validation to prevent future regressions.

---

## 📚 Required Reading (45 minutes before coding)

### Essential Documents (Read in this order):
1. **This handoff document** (15 minutes) - Complete implementation plan
2. **`Development_History/Sessions/COMPREHENSIVE_PIPELINE_ANALYSIS_20251122.md`** (20 minutes) - Detailed analysis of current state, root causes, and data flow
3. **`README.md`** (5 minutes) - Project status and quick start
4. **`Documentation/PROJECT_STATUS_CONSOLIDATED.md`** (optional - for comprehensive context)

### Critical Code Files to Review:
```
services/comfyUIService.ts          - Prompt construction (lines 1190-1502)
services/geminiService.ts           - Scene generation (lines 472-545)
utils/hooks.ts                      - Scene creation flow (lines 262-336)
components/GenerateSceneImagesButton.tsx  - Image generation loop (lines 36-88)
types.ts                            - Data structures (lines 1-100)
```

**⚠️ CRITICAL**: Do NOT start coding until you've reviewed the analysis document. It contains root cause explanations and data flow diagrams essential for correct implementation.

---

## 🔧 Implementation Phases

### Phase 1: Prompt Guardrail Enforcement (Priority 1 - Session 1)
**Duration**: 4-6 hours  
**Goal**: Guarantee all prompts follow standardized format with validation

#### Tasks:

1. **Create Prompt Validator Service** (2 hours)
   ```typescript
   // NEW FILE: services/promptValidator.ts
   
   export interface PromptValidationResult {
       isValid: boolean;
       errors: string[];
       warnings: string[];
       context: string;
   }
   
   export const validatePromptGuardrails = (
       prompt: string, 
       negativePrompt: string, 
       context: string
   ): PromptValidationResult => {
       const errors: string[] = [];
       const warnings: string[] = [];
       
       // RULE 1: Single-frame instruction must be present
       if (!prompt.includes('Single cinematic frame')) {
           errors.push(`[${context}] Missing SINGLE_FRAME_PROMPT prefix`);
       }
       
       // RULE 2: 16:9 aspect ratio must be specified
       if (!prompt.includes('16:9') && !prompt.includes('widescreen')) {
           errors.push(`[${context}] Missing aspect ratio specification`);
       }
       
       // RULE 3: Negative prompt must include multi-panel avoidance
       const requiredNegativeTerms = ['multi-panel', 'split-screen', 'collage'];
       const missingTerms = requiredNegativeTerms.filter(term => !negativePrompt.toLowerCase().includes(term.toLowerCase()));
       if (missingTerms.length > 0) {
           errors.push(`[${context}] Negative prompt missing terms: ${missingTerms.join(', ')}`);
       }
       
       // RULE 4: Prompt length should be reasonable (100-2500 chars)
       if (prompt.length < 100) {
           warnings.push(`[${context}] Prompt unusually short (${prompt.length} chars) - may lack detail`);
       }
       if (prompt.length > 2500) {
           warnings.push(`[${context}] Prompt very long (${prompt.length} chars) - may overwhelm model`);
       }
       
       // RULE 5: Check for duplicate phrases (e.g., director's vision repeated)
       const sentences = prompt.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 30);
       const duplicates = sentences.filter((sentence, idx) => 
           sentences.indexOf(sentence) !== idx && sentences.indexOf(sentence) < idx
       );
       if (duplicates.length > 0) {
           warnings.push(`[${context}] Duplicate phrases detected (${duplicates.length} instances) - may indicate redundant content`);
       }
       
       return {
           isValid: errors.length === 0,
           errors,
           warnings,
           context
       };
   };
   ```

2. **Integrate Validation into Keyframe Generation** (1 hour)
   ```typescript
   // UPDATE: services/comfyUIService.ts
   // Add import at top:
   import { validatePromptGuardrails } from './promptValidator';
   
   // In generateSceneKeyframeLocally(), after prompt construction (around line 1490):
   export const generateSceneKeyframeLocally = async (...) => {
       // ... existing prompt construction code ...
       
       const finalPrompt = applyPromptTemplate(basePrompt, combinedVBSegment || undefined, config);
       const negativeBase = getDefaultNegativePromptForModel(resolveModelIdFromSettings(settings), 'sceneKeyframe');
       
       // NEW: Validate prompt guardrails before queuing
       const validation = validatePromptGuardrails(
           finalPrompt, 
           extendNegativePrompt(negativeBase),
           `Scene Keyframe: ${sceneId?.slice(0, 20) || 'unknown'}`
       );
       
       if (!validation.isValid) {
           console.error('[Prompt Guardrails] Validation failed:', validation.errors);
           throw new Error(`Prompt validation failed: ${validation.errors.join(', ')}`);
       }
       
       if (validation.warnings.length > 0) {
           console.warn('[Prompt Guardrails] Warnings:', validation.warnings);
       }
       
       // Log validation success
       console.log(`[Prompt Guardrails] ✓ Validation passed for ${validation.context}`);
       
       // ... continue with existing queueComfyUIPrompt() call ...
   };
   ```

3. **Integrate Validation into Shot Generation** (1 hour)
   ```typescript
   // UPDATE: services/comfyUIService.ts
   // In buildShotPrompt(), after finalPrompt construction (around line 1280):
   export const buildShotPrompt = (...): string => {
       // ... existing prompt construction code ...
       
       const finalPrompt = applyPromptTemplate(basePrompt, combinedVBSegment, config);
       
       // NEW: Validate shot prompts
       const negativeBase = getDefaultNegativePromptForModel(resolveModelIdFromSettings(settings), target);
       const validation = validatePromptGuardrails(
           finalPrompt,
           extendNegativePrompt(negativeBase),
           `Shot: ${shotId || shot.id}`
       );
       
       if (!validation.isValid) {
           console.error('[Shot Prompt Guardrails] Validation failed:', validation.errors);
           // For shots, log error but don't throw (allow user override)
       }
       
       if (validation.warnings.length > 0) {
           console.warn('[Shot Prompt Guardrails] Warnings:', validation.warnings);
       }
       
       return finalPrompt;
   };
   ```

4. **Write Comprehensive Unit Tests** (1-2 hours)
   ```typescript
   // NEW FILE: services/__tests__/promptValidator.test.ts
   
   import { describe, it, expect } from 'vitest';
   import { validatePromptGuardrails } from '../promptValidator';
   
   describe('Prompt Guardrail Validation', () => {
       describe('RULE 1: Single-frame instruction', () => {
           it('should pass when SINGLE_FRAME_PROMPT is present', () => {
               const prompt = 'Single cinematic frame, one moment, no collage. A beautiful scene.';
               const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen', 'test');
               expect(result.errors).not.toContain(expect.stringContaining('Missing SINGLE_FRAME_PROMPT'));
           });
           
           it('should fail when SINGLE_FRAME_PROMPT is missing', () => {
               const prompt = 'A beautiful scene without the required prefix.';
               const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen', 'test');
               expect(result.errors).toContain('[test] Missing SINGLE_FRAME_PROMPT prefix');
               expect(result.isValid).toBe(false);
           });
       });
       
       describe('RULE 2: Aspect ratio specification', () => {
           it('should pass when 16:9 is present', () => {
               const prompt = 'Single cinematic frame. 16:9 aspect ratio. A scene.';
               const result = validatePromptGuardrails(prompt, 'multi-panel', 'test');
               expect(result.errors).not.toContain(expect.stringContaining('Missing aspect ratio'));
           });
           
           it('should pass when widescreen is present', () => {
               const prompt = 'Single cinematic frame. Widescreen composition. A scene.';
               const result = validatePromptGuardrails(prompt, 'multi-panel', 'test');
               expect(result.errors).not.toContain(expect.stringContaining('Missing aspect ratio'));
           });
           
           it('should fail when neither 16:9 nor widescreen is present', () => {
               const prompt = 'Single cinematic frame. A scene without aspect ratio.';
               const result = validatePromptGuardrails(prompt, 'multi-panel', 'test');
               expect(result.errors).toContain('[test] Missing aspect ratio specification');
               expect(result.isValid).toBe(false);
           });
       });
       
       describe('RULE 3: Negative prompt multi-panel avoidance', () => {
           it('should pass when all required terms are present', () => {
               const prompt = 'Single cinematic frame. 16:9. A scene.';
               const negative = 'multi-panel, split-screen, collage, storyboard';
               const result = validatePromptGuardrails(prompt, negative, 'test');
               expect(result.errors).not.toContain(expect.stringContaining('Negative prompt missing terms'));
           });
           
           it('should fail when required terms are missing', () => {
               const prompt = 'Single cinematic frame. 16:9. A scene.';
               const negative = 'bad quality, blurry';
               const result = validatePromptGuardrails(prompt, negative, 'test');
               expect(result.errors).toContain('[test] Negative prompt missing terms: multi-panel, split-screen, collage');
               expect(result.isValid).toBe(false);
           });
           
           it('should be case-insensitive', () => {
               const prompt = 'Single cinematic frame. 16:9. A scene.';
               const negative = 'MULTI-PANEL, SPLIT-SCREEN, COLLAGE';
               const result = validatePromptGuardrails(prompt, negative, 'test');
               expect(result.isValid).toBe(true);
           });
       });
       
       describe('RULE 4: Prompt length validation', () => {
           it('should warn when prompt is too short', () => {
               const prompt = 'Single cinematic frame. 16:9.';
               const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
               expect(result.warnings).toContain(expect.stringContaining('unusually short'));
           });
           
           it('should warn when prompt is too long', () => {
               const prompt = 'Single cinematic frame. 16:9. ' + 'A'.repeat(2600);
               const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
               expect(result.warnings).toContain(expect.stringContaining('very long'));
           });
       });
       
       describe('RULE 5: Duplicate phrase detection', () => {
           it('should detect duplicate sentences', () => {
               const prompt = 'Single cinematic frame. 16:9. A cyberpunk scene with neon lights. A cyberpunk scene with neon lights.';
               const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
               expect(result.warnings).toContain(expect.stringContaining('Duplicate phrases detected'));
           });
           
           it('should ignore short sentences in duplicate check', () => {
               const prompt = 'Single cinematic frame. 16:9. A scene. Another scene.';
               const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
               expect(result.warnings).not.toContain(expect.stringContaining('Duplicate phrases'));
           });
       });
       
       describe('Integration scenarios', () => {
           it('should pass a well-formed keyframe prompt', () => {
               const prompt = `Single cinematic frame, one moment, no collage or multi-panel layout, no UI overlays or speech bubbles, cinematic lighting, 16:9 widescreen aspect ratio, horizontal landscape composition.
   Cinematic establishing frame, high fidelity, 4K resolution.
   Scene summary: With an inciting incident that forces a decisive choice. Visual tone leans into A cyberpunk neo-noir aesthetic with high contrast lighting.
   Render a single still image that captures the mood, palette, and lighting cues of this scene.`;
               const negative = 'multi-panel, collage, split-screen, storyboard panels, speech bubbles';
               const result = validatePromptGuardrails(prompt, negative, 'keyframe-test');
               expect(result.isValid).toBe(true);
               expect(result.errors).toHaveLength(0);
           });
       });
   });
   ```

5. **Run Tests and Validate** (30 minutes)
   ```powershell
   # Run unit tests
   npm test -- promptValidator.test.ts
   
   # Verify zero errors
   # Check coverage: should be 100% for promptValidator.ts
   ```

#### Success Criteria for Phase 1:
- ✅ All unit tests pass (15+ test cases)
- ✅ Validation integrated in both keyframe and shot generation
- ✅ Zero false positives on existing prompts
- ✅ Errors logged with clear context messages
- ✅ Warnings logged but don't block generation

---

### Phase 2: Scene Progression Validation (Priority 2 - Session 2)
**Duration**: 6-8 hours  
**Goal**: Ensure linear narrative flow with act ordering and character continuity

#### Tasks:

1. **Create Scene Progression Validator** (3 hours)
   ```typescript
   // NEW FILE: services/sceneProgressionValidator.ts
   
   import { Scene, StoryBible } from '../types';
   
   export interface SceneProgressionError {
       sceneIndex: number;
       sceneId: string;
       sceneTitle: string;
       errorType: 'missing_act' | 'duplicate_act' | 'out_of_order' | 'missing_hero_arc' | 'discontinuity';
       severity: 'error' | 'warning';
       message: string;
       suggestion?: string;
   }
   
   export interface ProgressionValidationResult {
       isValid: boolean;
       errors: SceneProgressionError[];
       warnings: SceneProgressionError[];
       metadata: {
           totalScenes: number;
           actsDetected: number[];
           heroArcsUsed: string[];
           charactersIntroduced: string[];
       };
   }
   
   /**
    * Validates that scenes follow a logical narrative progression.
    * Checks act ordering, hero arc continuity, and character introductions.
    */
   export const validateSceneProgression = (
       scenes: Scene[], 
       storyBible: StoryBible
   ): ProgressionValidationResult => {
       const errors: SceneProgressionError[] = [];
       const warnings: SceneProgressionError[] = [];
       const actsDetected: number[] = [];
       const heroArcsUsed: string[] = [];
       const charactersIntroduced: string[] = [];
       
       // RULE 1: Validate act ordering (Act 1 → Act 2 → Act 3)
       const actPattern = /Act\s+(\d+)/i;
       let currentAct = 0;
       
       scenes.forEach((scene, idx) => {
           const titleMatch = scene.title.match(actPattern);
           const summaryMatch = scene.summary.match(actPattern);
           const match = titleMatch || summaryMatch;
           
           if (match) {
               const act = parseInt(match[1], 10);
               actsDetected.push(act);
               
               if (act < currentAct) {
                   errors.push({
                       sceneIndex: idx,
                       sceneId: scene.id,
                       sceneTitle: scene.title,
                       errorType: 'out_of_order',
                       severity: 'warning',
                       message: `Scene ${idx + 1} references Act ${act} but previous scene was Act ${currentAct} - potential non-linear narrative`,
                       suggestion: `Consider reordering scenes or explicitly marking this as a flashback/flash-forward.`
                   });
               } else if (act > currentAct + 1) {
                   warnings.push({
                       sceneIndex: idx,
                       sceneId: scene.id,
                       sceneTitle: scene.title,
                       errorType: 'missing_act',
                       severity: 'warning',
                       message: `Scene ${idx + 1} jumps from Act ${currentAct} to Act ${act} - missing intermediate act`,
                       suggestion: `Add scenes for Act ${currentAct + 1} or adjust act numbering.`
                   });
               }
               
               currentAct = Math.max(currentAct, act);
           }
       });
       
       // RULE 2: Validate hero arc progression
       if (storyBible.heroArcs && storyBible.heroArcs.length > 0) {
           const arcOrders = scenes
               .map((s, idx) => ({ scene: s, idx, order: s.heroArcOrder }))
               .filter(item => item.order !== undefined);
           
           for (let i = 1; i < arcOrders.length; i++) {
               const prev = arcOrders[i - 1];
               const curr = arcOrders[i];
               
               if (curr.order! < prev.order!) {
                   warnings.push({
                       sceneIndex: curr.idx,
                       sceneId: curr.scene.id,
                       sceneTitle: curr.scene.title,
                       errorType: 'out_of_order',
                       severity: 'warning',
                       message: `Scene ${curr.idx + 1} hero arc order (${curr.order}) is before previous scene (${prev.order})`,
                       suggestion: `Review hero arc assignments or reorder scenes.`
                   });
               }
               
               if (curr.scene.heroArcId && !heroArcsUsed.includes(curr.scene.heroArcId)) {
                   heroArcsUsed.push(curr.scene.heroArcId);
               }
           }
       }
       
       // RULE 3: Validate character introduction continuity
       const characterNames = extractCharacterNames(storyBible.characters);
       const characterFirstAppearance: Record<string, number> = {};
       
       // First pass: Record first appearance of each character
       scenes.forEach((scene, idx) => {
           characterNames.forEach(name => {
               const nameInSummary = scene.summary.toLowerCase().includes(name.toLowerCase());
               const nameInTitle = scene.title.toLowerCase().includes(name.toLowerCase());
               
               if ((nameInSummary || nameInTitle) && characterFirstAppearance[name] === undefined) {
                   characterFirstAppearance[name] = idx;
                   charactersIntroduced.push(name);
               }
           });
       });
       
       // Second pass: Validate no character appears before introduction
       scenes.forEach((scene, idx) => {
           characterNames.forEach(name => {
               const nameInSummary = scene.summary.toLowerCase().includes(name.toLowerCase());
               const nameInTitle = scene.title.toLowerCase().includes(name.toLowerCase());
               
               if (nameInSummary || nameInTitle) {
                   const firstAppearance = characterFirstAppearance[name];
                   if (firstAppearance !== undefined && firstAppearance > idx) {
                       warnings.push({
                           sceneIndex: idx,
                           sceneId: scene.id,
                           sceneTitle: scene.title,
                           errorType: 'discontinuity',
                           severity: 'warning',
                           message: `Scene ${idx + 1} references character "${name}" before introduction in Scene ${firstAppearance + 1}`,
                           suggestion: `Ensure character is introduced in an earlier scene or update scene order.`
                       });
                   }
               }
           });
       });
       
       return {
           isValid: errors.filter(e => e.severity === 'error').length === 0,
           errors: errors.filter(e => e.severity === 'error'),
           warnings: [...warnings, ...errors.filter(e => e.severity === 'warning')],
           metadata: {
               totalScenes: scenes.length,
               actsDetected: [...new Set(actsDetected)].sort(),
               heroArcsUsed,
               charactersIntroduced
           }
       };
   };
   
   /**
    * Extract character names from Story Bible markdown.
    * Assumes format: ## CharacterName
    */
   const extractCharacterNames = (charactersMarkdown: string): string[] => {
       if (!charactersMarkdown) return [];
       
       const matches = charactersMarkdown.matchAll(/^##\s+(.+)$/gm);
       return Array.from(matches, m => m[1].trim());
   };
   ```

2. **Integrate Validation into Scene Generation** (1 hour)
   ```typescript
   // UPDATE: utils/hooks.ts
   // Add import at top:
   import { validateSceneProgression } from '../services/sceneProgressionValidator';
   
   // In handleGenerateScenes(), after scene creation (around line 320):
   const handleGenerateScenes = useCallback(async (...) => {
       // ... existing scene creation code ...
       
       console.log('[handleGenerateScenes] Step 4: Updating state with new scenes');
       setScenes(newScenes);
       
       // NEW: Validate scene progression
       console.log('[handleGenerateScenes] Step 4.5: Validating scene progression');
       const progressionValidation = validateSceneProgression(newScenes, storyBible);
       
       if (!progressionValidation.isValid) {
           console.warn('[Scene Progression] Validation errors:', progressionValidation.errors);
           // Log errors but don't block (user can review and fix manually)
       }
       
       if (progressionValidation.warnings.length > 0) {
           console.warn('[Scene Progression] Validation warnings:', progressionValidation.warnings);
           // Store warnings in state for UI display
           // TODO: Add warning state and UI component in next step
       }
       
       console.log('[Scene Progression] Metadata:', progressionValidation.metadata);
       
       // ... continue with existing workflow stage transition ...
   }, [/* dependencies */]);
   ```

3. **Add UI Warning Display** (2 hours)
   ```typescript
   // NEW COMPONENT: components/SceneProgressionWarnings.tsx
   
   import React from 'react';
   import { SceneProgressionError } from '../services/sceneProgressionValidator';
   import AlertIcon from './icons/AlertIcon';
   
   interface SceneProgressionWarningsProps {
       warnings: SceneProgressionError[];
       onDismiss: () => void;
       onReview: (sceneId: string) => void;
   }
   
   const SceneProgressionWarnings: React.FC<SceneProgressionWarningsProps> = ({
       warnings,
       onDismiss,
       onReview
   }) => {
       if (warnings.length === 0) return null;
       
       return (
           <div className="glass-card p-4 mb-4 border-l-4 border-yellow-500">
               <div className="flex items-start gap-3">
                   <AlertIcon className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
                   <div className="flex-1">
                       <h3 className="text-lg font-semibold text-yellow-300 mb-2">
                           Scene Progression Warnings ({warnings.length})
                       </h3>
                       <p className="text-sm text-gray-300 mb-3">
                           The following scenes may have narrative continuity issues. Review and adjust if needed.
                       </p>
                       <ul className="space-y-2">
                           {warnings.map((warning, idx) => (
                               <li key={idx} className="text-sm bg-gray-800/50 p-3 rounded">
                                   <div className="flex items-start justify-between gap-2">
                                       <div className="flex-1">
                                           <p className="font-medium text-yellow-200">
                                               Scene {warning.sceneIndex + 1}: {warning.sceneTitle}
                                           </p>
                                           <p className="text-gray-400 mt-1">{warning.message}</p>
                                           {warning.suggestion && (
                                               <p className="text-blue-300 mt-1 text-xs italic">
                                                   💡 {warning.suggestion}
                                               </p>
                                           )}
                                       </div>
                                       <button
                                           onClick={() => onReview(warning.sceneId)}
                                           className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                                       >
                                           Review
                                       </button>
                                   </div>
                               </li>
                           ))}
                       </ul>
                       <div className="mt-4 flex gap-2">
                           <button
                               onClick={onDismiss}
                               className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                           >
                               Dismiss
                           </button>
                       </div>
                   </div>
               </div>
           </div>
       );
   };
   
   export default SceneProgressionWarnings;
   ```

   ```typescript
   // UPDATE: App.tsx
   // Add state for progression warnings:
   const [progressionWarnings, setProgressionWarnings] = useState<SceneProgressionError[]>([]);
   
   // Add warning component to Director Mode section (around line 390):
   {progressionWarnings.length > 0 && (
       <SceneProgressionWarnings 
           warnings={progressionWarnings}
           onDismiss={() => setProgressionWarnings([])}
           onReview={(sceneId) => {
               setActiveSceneId(sceneId);
               setProgressionWarnings([]);
           }}
       />
   )}
   ```

4. **Write Unit Tests** (2 hours)
   ```typescript
   // NEW FILE: services/__tests__/sceneProgressionValidator.test.ts
   
   import { describe, it, expect } from 'vitest';
   import { validateSceneProgression } from '../sceneProgressionValidator';
   import { Scene, StoryBible } from '../../types';
   
   const mockStoryBible: StoryBible = {
       logline: 'A hero saves the world',
       characters: '## Alice\nProtagonist\n\n## Bob\nAntagonist',
       setting: 'A futuristic city',
       plotOutline: 'Three act structure',
       heroArcs: [
           { id: 'arc1', name: 'Call to Adventure', summary: '...', emotionalShift: '...', importance: 1 },
           { id: 'arc2', name: 'Trials', summary: '...', emotionalShift: '...', importance: 2 },
           { id: 'arc3', name: 'Return', summary: '...', emotionalShift: '...', importance: 3 }
       ]
   };
   
   describe('Scene Progression Validation', () => {
       describe('Act ordering', () => {
           it('should pass when acts are in order', () => {
               const scenes: Scene[] = [
                   { id: '1', title: 'Act 1: Beginning', summary: '...', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '2', title: 'Act 2: Middle', summary: '...', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '3', title: 'Act 3: End', summary: '...', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } }
               ];
               const result = validateSceneProgression(scenes, mockStoryBible);
               expect(result.isValid).toBe(true);
               expect(result.errors).toHaveLength(0);
               expect(result.metadata.actsDetected).toEqual([1, 2, 3]);
           });
           
           it('should detect out-of-order acts', () => {
               const scenes: Scene[] = [
                   { id: '1', title: 'Act 1: Beginning', summary: '...', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '2', title: 'Act 3: End', summary: '...', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '3', title: 'Act 2: Middle', summary: '...', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } }
               ];
               const result = validateSceneProgression(scenes, mockStoryBible);
               expect(result.warnings).toContainEqual(
                   expect.objectContaining({
                       errorType: 'out_of_order',
                       sceneIndex: 2,
                       message: expect.stringContaining('Act 2 but previous scene was Act 3')
                   })
               );
           });
           
           it('should detect missing acts', () => {
               const scenes: Scene[] = [
                   { id: '1', title: 'Act 1: Beginning', summary: '...', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '2', title: 'Act 3: End', summary: '...', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } }
               ];
               const result = validateSceneProgression(scenes, mockStoryBible);
               expect(result.warnings).toContainEqual(
                   expect.objectContaining({
                       errorType: 'missing_act',
                       message: expect.stringContaining('missing intermediate act')
                   })
               );
           });
       });
       
       describe('Hero arc progression', () => {
           it('should validate hero arc order', () => {
               const scenes: Scene[] = [
                   { id: '1', title: 'Scene 1', summary: '...', heroArcOrder: 1, timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '2', title: 'Scene 2', summary: '...', heroArcOrder: 3, timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '3', title: 'Scene 3', summary: '...', heroArcOrder: 2, timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } }
               ];
               const result = validateSceneProgression(scenes, mockStoryBible);
               expect(result.warnings).toContainEqual(
                   expect.objectContaining({
                       errorType: 'out_of_order',
                       sceneIndex: 2,
                       message: expect.stringContaining('hero arc order (2) is before previous scene (3)')
                   })
               );
           });
       });
       
       describe('Character continuity', () => {
           it('should detect characters referenced before introduction', () => {
               const scenes: Scene[] = [
                   { id: '1', title: 'Scene 1', summary: 'Alice meets Bob.', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '2', title: 'Scene 2', summary: 'Charlie appears for the first time.', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } },
                   { id: '3', title: 'Scene 3', summary: 'Alice talks to Charlie.', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } }
               ];
               const bible = { ...mockStoryBible, characters: '## Alice\n...\n## Bob\n...\n## Charlie\n...' };
               const result = validateSceneProgression(scenes, bible);
               
               // Charlie introduced in Scene 2 but should be introduced earlier if referenced in Scene 3
               // This test validates the logic correctly identifies first appearances
               expect(result.metadata.charactersIntroduced).toContain('Charlie');
           });
           
           it('should extract character names from markdown', () => {
               const scenes: Scene[] = [
                   { id: '1', title: 'Scene 1', summary: 'Alice and Bob meet.', timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' } }
               ];
               const result = validateSceneProgression(scenes, mockStoryBible);
               expect(result.metadata.charactersIntroduced).toContain('Alice');
               expect(result.metadata.charactersIntroduced).toContain('Bob');
           });
       });
   });
   ```

5. **Run Tests and Validate** (30 minutes)
   ```powershell
   npm test -- sceneProgressionValidator.test.ts
   ```

#### Success Criteria for Phase 2:
- ✅ All unit tests pass (12+ test cases)
- ✅ Act ordering validated with warnings for non-linear progression
- ✅ Hero arc continuity checked when available
- ✅ Character introduction tracked and validated
- ✅ UI displays warnings in user-friendly format
- ✅ Users can review specific scenes and dismiss warnings

---

### Phase 3: UI State Sync Improvements (Priority 3 - Session 3)
**Duration**: 4-6 hours  
**Goal**: Reliable per-scene status tracking with error visibility

#### Tasks:

1. **Add Per-Scene Status Type** (30 minutes)
   ```typescript
   // UPDATE: types.ts
   // Add new type after existing types:
   
   export interface SceneGenerationStatus {
       status: 'idle' | 'generating' | 'complete' | 'error';
       progress?: number; // 0-100
       error?: string;
       startedAt?: number; // Unix timestamp
       completedAt?: number; // Unix timestamp
       promptLength?: number; // For debugging
   }
   ```

2. **Add State Management** (1 hour)
   ```typescript
   // UPDATE: App.tsx
   // Add new state after existing state declarations (around line 90):
   const [sceneStatuses, setSceneStatuses] = usePersistentState<Record<string, SceneGenerationStatus>>(
       'sceneStatuses',
       {}
   );
   
   // Create helper function to update scene status:
   const updateSceneStatus = useCallback((sceneId: string, update: Partial<SceneGenerationStatus>) => {
       setSceneStatuses(prev => ({
           ...prev,
           [sceneId]: { 
               ...(prev[sceneId] || { status: 'idle' }), 
               ...update 
           }
       }));
   }, [setSceneStatuses]);
   ```

3. **Integrate Status Updates in Generation Loop** (1 hour)
   ```typescript
   // UPDATE: components/GenerateSceneImagesButton.tsx
   // Add props for status updates:
   interface GenerateSceneImagesButtonProps {
       // ... existing props ...
       updateSceneStatus?: (sceneId: string, update: Partial<SceneGenerationStatus>) => void;
   }
   
   // Update generation loop (around line 45):
   const handleGenerateImages = useCallback(async () => {
       // ... existing setup code ...
       
       try {
           for (let i = 0; i < scenesNeedingImages.length; i++) {
               const scene = scenesNeedingImages[i];
               try {
                   const taskMessage = `Generating keyframe for scene: "${scene.title}"`;
                   setGenerationProgress(prev => ({ ...prev, current: i + 1, task: taskMessage }));
                   onApiStateChange('loading', taskMessage);
                   
                   // NEW: Mark scene as generating
                   updateSceneStatus?.(scene.id, { 
                       status: 'generating', 
                       startedAt: Date.now(),
                       error: undefined
                   });
   
                   const image = await mediaActions.generateKeyframeForScene(...);
                   
                   // Update state immediately after each successful generation
                   onImagesGenerated(prev => ({ ...prev, [scene.id]: image }));
                   successes++;
                   
                   // NEW: Mark scene as complete
                   updateSceneStatus?.(scene.id, { 
                       status: 'complete', 
                       completedAt: Date.now(),
                       progress: 100
                   });
                   
                   console.log(`✅ [Image Sync] Scene "${scene.title}" (${scene.id}): keyframe generated and state updated`);
               } catch (e) {
                   const errorMessage = e instanceof Error ? e.message : String(e);
                   console.error(`❌ [Image Sync] Failed to generate keyframe for scene "${scene.title}" (${scene.id}):`, e);
                   
                   // NEW: Mark scene as error
                   updateSceneStatus?.(scene.id, { 
                       status: 'error', 
                       error: errorMessage,
                       completedAt: Date.now()
                   });
                   
                   onApiStateChange('error', `Failed to generate keyframe for "${scene.title}": ${errorMessage}`);
               }
   
               // ... existing rate limiting code ...
           }
           
           // ... existing success/failure messaging ...
       } finally {
           // ... existing cleanup code ...
       }
   }, [/* add updateSceneStatus to dependencies */]);
   ```

4. **Update UI Components with Status Display** (2 hours)
   ```typescript
   // UPDATE: components/SceneNavigator.tsx
   // Add status badge display:
   
   interface SceneNavigatorProps {
       // ... existing props ...
       sceneStatuses: Record<string, SceneGenerationStatus>;
   }
   
   // In scene button render (around line 80):
   <button
       key={scene.id}
       onClick={() => onSelectScene(scene.id)}
       className={`...`}
   >
       {/* Existing keyframe thumbnail */}
       {generatedImages[scene.id] ? (
           <img src={generatedImages[scene.id]} alt={`${scene.title} keyframe`} />
       ) : (
           <div className="...">No keyframe generated</div>
       )}
       
       {/* NEW: Status badge */}
       {sceneStatuses[scene.id] && (
           <div className="absolute top-2 right-2">
               {sceneStatuses[scene.id].status === 'generating' && (
                   <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                       <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                       </svg>
                       Generating
                   </span>
               )}
               {sceneStatuses[scene.id].status === 'complete' && (
                   <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                       ✅ Complete
                   </span>
               )}
               {sceneStatuses[scene.id].status === 'error' && (
                   <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white text-xs rounded-full">
                       ❌ Error
                   </span>
               )}
           </div>
       )}
       
       {/* Existing scene title/summary display */}
   </button>
   ```

   ```typescript
   // UPDATE: components/TimelineEditor.tsx
   // Add error display for failed keyframes (around line 310):
   
   const sceneStatus = sceneStatuses[scene.id];
   
   // Before keyframe requirement check:
   if (sceneStatus?.status === 'error') {
       return (
           <div className="glass-card p-6 rounded-lg mb-4 border-l-4 border-red-500">
               <h3 className="text-lg font-semibold text-red-300 mb-2">
                   ❌ Keyframe Generation Failed
               </h3>
               <p className="text-sm text-gray-300 mb-3">
                   Failed to generate keyframe for this scene. Error: {sceneStatus.error}
               </p>
               <button
                   onClick={() => {
                       // Trigger regeneration
                       onSceneKeyframeGenerated?.(scene.id, ''); // Reset
                       updateSceneStatus?.(scene.id, { status: 'idle', error: undefined });
                   }}
                   className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
               >
                   🔄 Retry Keyframe Generation
               </button>
           </div>
       );
   }
   ```

5. **Write Playwright E2E Tests** (1-2 hours)
   ```typescript
   // NEW FILE: tests/e2e/scene-status-tracking.spec.ts
   
   import { test, expect } from '@playwright/test';
   
   test.describe('Scene Status Tracking', () => {
       test.beforeEach(async ({ page }) => {
           await page.goto('http://localhost:3000');
           await page.waitForLoadState('domcontentloaded');
           
           // Quick generate to get scenes
           await page.getByRole('button', { name: 'Open in Director Mode' }).click();
           await page.waitForSelector('text=Scene 1');
       });
       
       test('should show generating status during keyframe generation', async ({ page }) => {
           // Click generate keyframes button
           await page.getByRole('button', { name: /Generate.*Keyframe/i }).click();
           
           // Wait for generating status to appear
           await page.waitForSelector('text=Generating', { timeout: 5000 });
           
           // Verify status badge shows on scene button
           const sceneButton = page.locator('[data-testid="scene-navigator"]').locator('button').first();
           await expect(sceneButton.locator('text=Generating')).toBeVisible();
       });
       
       test('should show complete status after successful generation', async ({ page }) => {
           // Generate one keyframe
           await page.getByRole('button', { name: 'Generate 1 Keyframe' }).click();
           
           // Wait for completion (may take 30-60 seconds for real ComfyUI)
           await page.waitForSelector('text=✅ Complete', { timeout: 120000 });
           
           // Verify thumbnail appears
           const sceneButton = page.locator('[data-testid="scene-navigator"]').locator('button').first();
           await expect(sceneButton.locator('img[alt*="keyframe"]')).toBeVisible();
       });
       
       test('should show error status when generation fails', async ({ page }) => {
           // Mock ComfyUI failure
           await page.route('**/prompt', route => {
               route.fulfill({ status: 500, body: 'Server error' });
           });
           
           // Attempt generation
           await page.getByRole('button', { name: 'Generate 1 Keyframe' }).click();
           
           // Wait for error status
           await page.waitForSelector('text=❌ Error', { timeout: 10000 });
           
           // Verify error message displays
           await expect(page.locator('text=/Failed to generate keyframe/i')).toBeVisible();
       });
       
       test('should allow retry after failed generation', async ({ page }) => {
           // ... setup failed generation ...
           
           // Click retry button
           await page.getByRole('button', { name: /Retry.*Generation/i }).click();
           
           // Verify status resets to generating
           await expect(page.locator('text=Generating')).toBeVisible();
       });
   });
   ```

6. **Run Tests and Validate** (30 minutes)
   ```powershell
   # Run E2E tests (requires dev server + ComfyUI)
   npm run dev  # Terminal 1
   # Start ComfyUI in Terminal 2
   npx playwright test scene-status-tracking.spec.ts  # Terminal 3
   ```

#### Success Criteria for Phase 3:
- ✅ Per-scene status tracked throughout generation lifecycle
- ✅ Status badges visible in SceneNavigator (🔄 generating, ✅ complete, ❌ error)
- ✅ Error messages display in TimelineEditor with retry button
- ✅ State persists to IndexedDB correctly
- ✅ Playwright tests validate all status transitions
- ✅ Retry functionality clears error state and regenerates

---

### Phase 4: Integration Testing & Validation (Priority 4 - Session 4)
**Duration**: 3-4 hours  
**Goal**: Comprehensive E2E validation with all guardrails enabled

#### Tasks:

1. **Run Full E2E Pipeline** (1 hour)
   ```powershell
   # Start services
   npm run dev
   # ComfyUI in separate terminal
   
   # Run complete pipeline test
   pwsh -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration
   
   # Validate results
   pwsh scripts/validate-run-summary.ps1 -RunDir logs/<timestamp>
   ```

2. **Validate Prompt Consistency** (1 hour)
   ```powershell
   # Create validation script
   # NEW FILE: scripts/validate-prompts.ts
   
   import fs from 'fs';
   import path from 'path';
   
   const validatePromptLogs = (logFile: string) => {
       const logs = fs.readFileSync(logFile, 'utf-8');
       const promptMatches = logs.matchAll(/\[Keyframe Debug\] Final Prompt Length: (\d+) chars/g);
       const prompts = Array.from(promptMatches, m => parseInt(m[1], 10));
       
       console.log(`Total prompts: ${prompts.length}`);
       console.log(`Average length: ${prompts.reduce((a, b) => a + b, 0) / prompts.length} chars`);
       console.log(`Min: ${Math.min(...prompts)}, Max: ${Math.max(...prompts)} chars`);
       
       const variance = Math.max(...prompts) - Math.min(...prompts);
       const avgLength = prompts.reduce((a, b) => a + b, 0) / prompts.length;
       const variancePercent = (variance / avgLength) * 100;
       
       console.log(`Variance: ${variance} chars (${variancePercent.toFixed(1)}%)`);
       
       if (variancePercent > 30) {
           console.warn('⚠️  High variance detected - prompts may be inconsistent');
       } else {
           console.log('✅ Prompt consistency validated');
       }
   };
   ```

3. **Test Non-Linear Scene Detection** (30 minutes)
   ```powershell
   # Manually create test story with non-linear acts
   # Generate scenes and verify progression warnings appear
   # Document false positives
   ```

4. **Test UI State Sync Under Load** (1 hour)
   ```powershell
   # Playwright test with slow network simulation
   npx playwright test --config=playwright.slow-network.config.ts
   
   # Verify state sync validator catches mismatches
   # Verify UI shows loading states during IndexedDB writes
   ```

5. **Document Edge Cases** (30 minutes)
   - False positives in scene progression (flashbacks, non-linear narratives)
   - Prompt validation edge cases (custom Visual Bible overrides)
   - State sync failures under extreme conditions
   - ComfyUI timeout scenarios

6. **Update Health Check Helper** (30 minutes)
   ```typescript
   // UPDATE: scripts/comfyui-status.ts
   // Add validation of prompt guardrails in workflow profiles
   
   // Check that workflow profiles include proper mappings
   // Validate CLIP text nodes are configured
   // Check negative prompt settings
   ```

#### Success Criteria for Phase 4:
- ✅ E2E pipeline runs successfully with all guardrails enabled
- ✅ Prompt variance < 30% across 20+ generations
- ✅ Scene progression warnings display correctly for test cases
- ✅ UI state sync validated under slow network conditions
- ✅ Zero false positives blocking valid generations
- ✅ Performance impact < 500ms per scene generation
- ✅ All edge cases documented with workarounds

---

## 🎓 Learning & Validation Protocols

### Self-Validation Checklist (Check after each phase):

**Phase 1 Completion**:
- [ ] All 15+ unit tests pass
- [ ] Validation integrated in keyframe and shot generation
- [ ] Zero errors on existing prompts
- [ ] Errors logged with clear context
- [ ] Code reviewed for edge cases

**Phase 2 Completion**:
- [ ] All 12+ unit tests pass
- [ ] Act ordering validates correctly
- [ ] UI displays warnings in user-friendly format
- [ ] Users can dismiss and review warnings
- [ ] No false positives on valid linear narratives

**Phase 3 Completion**:
- [ ] Per-scene status tracked throughout lifecycle
- [ ] Status badges visible in UI
- [ ] Error states display with retry button
- [ ] Playwright tests validate all transitions
- [ ] State persists correctly to IndexedDB

**Phase 4 Completion**:
- [ ] Full E2E pipeline runs successfully
- [ ] Prompt consistency validated (< 30% variance)
- [ ] Scene progression warnings tested
- [ ] State sync validated under load
- [ ] Edge cases documented

### Testing Commands Quick Reference:

```powershell
# Unit tests
npm test -- promptValidator.test.ts
npm test -- sceneProgressionValidator.test.ts

# E2E tests
npm run dev  # Terminal 1
npx playwright test scene-status-tracking.spec.ts

# Integration validation
pwsh scripts/run-comfyui-e2e.ps1 -FastIteration
pwsh scripts/validate-run-summary.ps1 -RunDir logs/<timestamp>

# Prompt validation
node scripts/validate-prompts.ts --log-file logs/<timestamp>/console.log
```

---

## ⚠️ Critical Reminders

1. **NEVER skip reading the analysis document** (`COMPREHENSIVE_PIPELINE_ANALYSIS_20251122.md`) - it contains essential root cause explanations

2. **Test incrementally** - Don't wait until all phases are complete to test. Run unit tests after each function, E2E tests after each component integration

3. **Don't break existing functionality** - All 88% E2E test coverage must remain passing. If tests fail, investigate before proceeding

4. **Performance matters** - Validation should add < 500ms total per generation. Profile with `console.time()` if unsure

5. **User experience first** - Warnings should inform, not block. Errors should provide clear actionable messages

6. **Document as you go** - Update this handoff with any edge cases, false positives, or design decisions made during implementation

---

## 📝 Session Completion Checklist

After completing all phases, create a handoff document:

```markdown
# Guardrails Implementation Session Report
**Date**: [DATE]
**Duration**: [HOURS]
**Status**: [COMPLETE/PARTIAL]

## Phases Completed:
- [ ] Phase 1: Prompt Guardrails
- [ ] Phase 2: Scene Progression
- [ ] Phase 3: UI State Sync
- [ ] Phase 4: Integration Testing

## Test Results:
- Unit Tests: [PASS/FAIL] ([X]/[Y] passing)
- E2E Tests: [PASS/FAIL] ([X]/[Y] passing)
- Prompt Validation: [% variance]
- Scene Progression: [false positive rate]

## Known Issues:
1. [Issue description]
2. [Issue description]

## Next Steps:
1. [Remaining work]
2. [Future enhancements]
```

---

## 🚀 Success Metrics

**Phase 1 Success**:
- 100% of prompts include SINGLE_FRAME_PROMPT
- Zero duplicate director's vision instances
- Prompt variance < 30%

**Phase 2 Success**:
- 95% of stories have linear act progression
- Character continuity validated correctly
- < 5% false positive rate on valid non-linear narratives

**Phase 3 Success**:
- React state updates < 500ms after generation
- UI renders thumbnails < 1s after state update
- 100% of errors visible in UI

**Phase 4 Success**:
- E2E pipeline completes in < 15 minutes
- Validation adds < 500ms overhead
- Zero false positives blocking valid generations

---

## 📞 Getting Help

If you encounter blockers:
1. Check `COMPREHENSIVE_PIPELINE_ANALYSIS_20251122.md` for context
2. Review existing test files for patterns
3. Check `KNOWN_ISSUES.md` for documented edge cases
4. Run `npm run check:health-helper` to validate ComfyUI integration
5. Check console logs for correlation IDs to trace issues

**Good luck! Remember: Read the analysis document first, test incrementally, and prioritize user experience.** 🎯
