import type { VisualBible, Shot } from '../types';

export interface VisualBibleStyleContext {
    styleBoardTitles: string[];
    styleBoardTags: string[];
    keyframes: string[];
}

export interface VisualBibleCharacterContext {
    characterNames: string[];
    identityTags: string[];
    visualTraits: string[];
}

const emptyStyleContext: VisualBibleStyleContext = {
    styleBoardTitles: [],
    styleBoardTags: [],
    keyframes: [],
};

const emptyCharacterContext: VisualBibleCharacterContext = {
    characterNames: [],
    identityTags: [],
    visualTraits: [],
};

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

function collectTags(styleBoards: Required<VisualBible>['styleBoards'], boardIds?: string[]): string[] {
    if (!boardIds || boardIds.length === 0) {
        return Array.from(new Set(styleBoards.flatMap((board) => board.tags ?? []))).filter(Boolean);
    }
    return Array.from(
        new Set(
            boardIds
                .map((id) => styleBoards.find((board) => board.id === id))
                .filter((board): board is typeof styleBoards[number] => Boolean(board))
                .flatMap((board) => board.tags ?? [])
        )
    ).filter(Boolean);
}

function collectTitles(styleBoards: Required<VisualBible>['styleBoards'], boardIds?: string[]): string[] {
    if (!boardIds || boardIds.length === 0) {
        return styleBoards.map((board) => board.title).filter(Boolean);
    }
    return boardIds
        .map((id) => styleBoards.find((board) => board.id === id))
        .filter((board): board is typeof styleBoards[number] => Boolean(board))
        .map((board) => board.title)
        .filter(Boolean);
}

function collectKeyframes(store: Record<string, string[]>, key: string | undefined): string[] {
    if (!key) {
        return [];
    }
    return store[key] ?? [];
}

function resolveCharacterContext(
    visualBible: Required<VisualBible>,
    ids: string[] | undefined
): VisualBibleCharacterContext {
    if (!ids || ids.length === 0) {
        return emptyCharacterContext;
    }

    const characters = visualBible.characters.filter((character) => ids.includes(character.id));
    if (characters.length === 0) {
        return emptyCharacterContext;
    }

    return {
        characterNames: characters.map((c) => c.name).filter(Boolean),
        identityTags: Array.from(new Set(characters.flatMap((c) => c.identityTags ?? []))).filter(Boolean),
        visualTraits: Array.from(new Set(characters.flatMap((c) => c.visualTraits ?? []))).filter(Boolean),
    };
}

export function getVisualContextForScene(
    visualBible?: VisualBible | null,
    sceneId?: string
): VisualBibleStyleContext {
    if (!sceneId) {
        return emptyStyleContext;
    }
    const vb = normalizeVisualBible(visualBible);
    return {
        styleBoardTitles: collectTitles(vb.styleBoards),
        styleBoardTags: collectTags(vb.styleBoards),
        keyframes: collectKeyframes(vb.sceneKeyframes, sceneId),
    };
}

export function getVisualContextForShot(
    visualBible?: VisualBible | null,
    sceneId?: string,
    shotId?: string
): VisualBibleStyleContext {
    if (!shotId && !sceneId) {
        return emptyStyleContext;
    }
    const vb = normalizeVisualBible(visualBible);
    return {
        styleBoardTitles: collectTitles(vb.styleBoards),
        styleBoardTags: collectTags(vb.styleBoards),
        keyframes: shotId ? collectKeyframes(vb.shotReferences, shotId) : collectKeyframes(vb.sceneKeyframes, sceneId ?? ''),
    };
}

export function getCharacterContextForScene(
    visualBible?: VisualBible | null,
    sceneId?: string
): VisualBibleCharacterContext {
    if (!sceneId) {
        return emptyCharacterContext;
    }
    const vb = normalizeVisualBible(visualBible);
    const ids = vb.sceneCharacters?.[sceneId];
    return resolveCharacterContext(vb, ids);
}

export function getCharacterContextForShot(
    visualBible?: VisualBible | null,
    sceneId?: string,
    shotId?: string
): VisualBibleCharacterContext {
    if (!shotId && !sceneId) {
        return emptyCharacterContext;
    }
    const vb = normalizeVisualBible(visualBible);
    const ids = shotId ? vb.shotCharacters?.[shotId] : sceneId ? vb.sceneCharacters?.[sceneId] : undefined;
    return resolveCharacterContext(vb, ids);
}

export function attachShotToScene(
    visualBible: VisualBible,
    sceneId: string,
    shot: Shot,
    imageData: string
): VisualBible {
    const next = normalizeVisualBible(visualBible);
    const updated = { ...next.shotReferences };
    const existing = updated[shot.id] ?? [];
    updated[shot.id] = existing.includes(imageData) ? existing : [...existing, imageData];
    return {
        ...next,
        shotReferences: updated,
    };
}
