/**
 * Scene Progression Validator - Ensures narrative continuity and logical flow
 * 
 * Validates:
 * - Act ordering (Act 1 → Act 2 → Act 3)
 * - Hero arc continuity
 * - Character introduction sequences
 * 
 * @module services/sceneProgressionValidator
 */

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
                warnings.push({
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
