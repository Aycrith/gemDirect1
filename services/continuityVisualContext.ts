import type { Scene, SceneContinuityScore, VisualBible } from '../types';

export interface CharacterContinuityIssue {
    characterId: string;
    characterName: string;
    scenes: string[];
    message: string;
    severity: 'low' | 'medium' | 'high';
}

export interface SceneVisualBibleContext {
    styleBoards: string[];
    tags: string[];
    keyframes: string[];
}

function normalizeVisualBible(visualBible?: VisualBible | null): Required<VisualBible> {
    const base: Required<VisualBible> = {
        characters: [],
        styleBoards: [],
        sceneKeyframes: {},
        shotReferences: {},
        sceneCharacters: {},
        shotCharacters: {},
    };
    if (!visualBible) {
        return base;
    }
    return {
        ...base,
        ...visualBible,
        characters: visualBible.characters ?? [],
        styleBoards: visualBible.styleBoards ?? [],
        sceneKeyframes: visualBible.sceneKeyframes ?? {},
        shotReferences: visualBible.shotReferences ?? {},
        sceneCharacters: visualBible.sceneCharacters ?? {},
        shotCharacters: visualBible.shotCharacters ?? {},
    };
}

export function getSceneVisualBibleContext(
    visualBible: VisualBible | undefined,
    sceneId: string
): SceneVisualBibleContext {
    const vb = normalizeVisualBible(visualBible);
    const styleBoards = vb.styleBoards ?? [];
    const tags = Array.from(new Set(styleBoards.flatMap((board) => board.tags ?? []))).filter(Boolean);
    const titles = styleBoards.map((board) => board.title).filter(Boolean);
    const keyframes = vb.sceneKeyframes?.[sceneId] ?? [];

    return {
        styleBoards: titles,
        tags,
        keyframes,
    };
}

export function computeSceneContinuityScore(
    visualBible: VisualBible | undefined,
    scene: Scene,
    allScenes: Scene[]
): SceneContinuityScore {
    const vb = normalizeVisualBible(visualBible);
    const keyframes = vb.sceneKeyframes?.[scene.id] ?? [];
    const shotLinks = Object.keys(vb.shotReferences ?? {}).filter((shotId) => shotId.startsWith(scene.id)).length;
    const visualCoverage = Math.min(1, (keyframes.length + shotLinks) / Math.max(1, scene.timeline.shots.length || 1));

    const styleBoardReuseCount = vb.styleBoards.length;
    const structuralContinuity = Math.min(1, 0.4 + (scene.timeline.shots.length > 0 ? scene.timeline.shots.length / 12 : 0));
    const transitionQuality = Math.min(1, 0.5 + (scene.timeline.transitions.length / 10));
    const durationConsistency = Math.min(1, 0.5 + scene.timeline.shots.length / Math.max(6, allScenes.length || 1));

    const availableScores = [visualCoverage, structuralContinuity, transitionQuality, durationConsistency];
    const overallScore = availableScores.reduce((sum, val) => sum + val, 0) / availableScores.length;

    return {
        visualBibleConsistency: visualCoverage,
        styleBoardReuseCount,
        structuralContinuity,
        transitionQuality,
        durationConsistency,
        overallScore,
    };
}

export function findCharacterContinuityIssues(
    visualBible: VisualBible | undefined,
    scenes: Scene[]
): CharacterContinuityIssue[] {
    const vb = normalizeVisualBible(visualBible);
    if (!scenes.length || Object.keys(vb.sceneCharacters ?? {}).length === 0) {
        return [];
    }

    const sceneOrder = scenes.map((scene, index) => ({ id: scene.id, index }));
    const indexLookup = new Map(sceneOrder.map((entry) => [entry.id, entry.index]));

    const appearancesByCharacter = new Map<string, string[]>();
    Object.entries(vb.sceneCharacters ?? {}).forEach(([sceneId, characterIds]) => {
        (characterIds ?? []).forEach((characterId) => {
            const list = appearancesByCharacter.get(characterId) ?? [];
            list.push(sceneId);
            appearancesByCharacter.set(characterId, list);
        });
    });

    const issues: CharacterContinuityIssue[] = [];

    appearancesByCharacter.forEach((sceneIds, characterId) => {
        const character = vb.characters.find((c) => c.id === characterId);
        if (!character || sceneIds.length <= 1) {
            return;
        }

        const orderedScenes = sceneIds
            .map((id) => ({ id, index: indexLookup.get(id) ?? Number.MAX_SAFE_INTEGER }))
            .filter((entry) => entry.index !== Number.MAX_SAFE_INTEGER)
            .sort((a, b) => a.index - b.index);

        if (orderedScenes.length <= 1) {
            return;
        }

        const gaps: string[] = [];
        for (let i = 0; i < orderedScenes.length - 1; i += 1) {
            const current = orderedScenes[i];
            const next = orderedScenes[i + 1];
            if (next.index - current.index > 1) {
                for (let pointer = current.index + 1; pointer < next.index; pointer += 1) {
                    const missingScene = scenes[pointer];
                    if (missingScene) {
                        gaps.push(missingScene.id);
                    }
                }
            }
        }

        if (gaps.length > 0) {
            issues.push({
                characterId,
                characterName: character.name,
                scenes: Array.from(new Set(gaps)),
                message: `${character.name} disappears for ${gaps.length} scene(s); consider reinforcing their presence for continuity.`,
                severity: gaps.length > 2 ? 'high' : 'medium',
            });
        }
    });

    return issues;
}
