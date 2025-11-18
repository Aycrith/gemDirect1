import type { VisualBible } from '../types';

type Subscriber = (state: VisualBible) => void;

const defaultState: VisualBible = {
    characters: [],
    styleBoards: [],
    sceneKeyframes: {},
    shotReferences: {},
    sceneCharacters: {},
    shotCharacters: {},
};

let visualBibleState: VisualBible = { ...defaultState };
const subscribers = new Set<Subscriber>();

export function getVisualBible(): VisualBible {
    return visualBibleState;
}

export function setVisualBible(next: VisualBible): void {
    visualBibleState = {
        ...defaultState,
        ...next,
        characters: next.characters ?? [],
        styleBoards: next.styleBoards ?? [],
        sceneKeyframes: next.sceneKeyframes ?? {},
        shotReferences: next.shotReferences ?? {},
        sceneCharacters: next.sceneCharacters ?? {},
        shotCharacters: next.shotCharacters ?? {},
    };
    subscribers.forEach((cb) => cb(visualBibleState));
}

export function subscribeToVisualBible(callback: Subscriber): () => void {
    subscribers.add(callback);
    return () => {
        subscribers.delete(callback);
    };
}

export function resetVisualBible(): void {
    visualBibleState = { ...defaultState };
    subscribers.clear();
}
