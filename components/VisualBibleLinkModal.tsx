import React, { useMemo, useState } from 'react';
import type { VisualBible } from '../types';
import { useVisualBible } from '../utils/hooks';

interface VisualBibleLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageData: string;
    sceneId: string;
    shotId?: string;
}

const VisualBibleLinkModal: React.FC<VisualBibleLinkModalProps> = ({ isOpen, onClose, imageData, sceneId, shotId }) => {
    const { visualBible, setVisualBible } = useVisualBible();
    const [selectedBoardId, setSelectedBoardId] = useState<string>('');
    const [boardTitle, setBoardTitle] = useState('');
    const [boardTags, setBoardTags] = useState('');
    const [notes, setNotes] = useState('');

    const previewUrl = useMemo(() => `data:image/jpeg;base64,${imageData}`, [imageData]);

    if (!isOpen) {
        return null;
    }

    const upsertStyleBoard = (state: VisualBible): VisualBible => {
        const tags = boardTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        if (!boardTitle && !selectedBoardId) {
            return state;
        }

        const boards = state.styleBoards ?? [];
        if (selectedBoardId) {
            return {
                ...state,
                styleBoards: boards.map((board) =>
                    board.id === selectedBoardId
                        ? { ...board, tags: tags.length > 0 ? tags : board.tags }
                        : board
                ),
            };
        }

        const id = `vb-board-${Date.now()}`;
        return {
            ...state,
            styleBoards: [
                ...boards,
                {
                    id,
                    title: boardTitle.trim(),
                    description: notes.trim(),
                    tags,
                },
            ],
        };
    };

    const handleSave = () => {
        setVisualBible((prev: VisualBible) => {
            const base: VisualBible = {
                characters: prev?.characters ?? [],
                styleBoards: prev?.styleBoards ?? [],
                sceneKeyframes: prev?.sceneKeyframes ?? {},
                shotReferences: prev?.shotReferences ?? {},
                sceneCharacters: prev?.sceneCharacters ?? {},
                shotCharacters: prev?.shotCharacters ?? {},
            };

            const updatedBoards = upsertStyleBoard(base);
            const sceneKeyframes = { ...updatedBoards.sceneKeyframes };
            const shotReferences = { ...updatedBoards.shotReferences };

            if (shotId) {
                const existing = shotReferences[shotId] ?? [];
                shotReferences[shotId] = existing.includes(imageData)
                    ? existing
                    : [...existing, imageData];
            } else {
                const existing = sceneKeyframes[sceneId] ?? [];
                sceneKeyframes[sceneId] = existing.includes(imageData)
                    ? existing
                    : [...existing, imageData];
            }

            return {
                ...updatedBoards,
                sceneKeyframes,
                shotReferences,
            };
        });

        onClose();
    };

    const existingBoards = visualBible?.styleBoards ?? [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-6">
                <div className="flex items-start gap-4">
                    <img src={previewUrl} alt="Visual Bible" className="w-32 h-32 object-cover rounded-lg border border-gray-700" />
                    <div>
                        <h3 className="text-xl font-semibold text-white">Add to Visual Bible</h3>
                        <p className="text-sm text-gray-400">
                            The frame will be stored as a reference for scene {sceneId}
                            {shotId ? ` · shot ${shotId}` : ''}.
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-200">Link to Style Board</label>
                    <select
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-gray-100"
                        value={selectedBoardId}
                        onChange={(event) => setSelectedBoardId(event.target.value)}
                    >
                        <option value="">Create new style board…</option>
                        {existingBoards.map((board) => (
                            <option key={board.id} value={board.id}>
                                {board.title}
                            </option>
                        ))}
                    </select>
                </div>

                {!selectedBoardId && (
                    <>
                        <div>
                            <label className="block text-sm font-semibold text-gray-200">Style Board Title</label>
                            <input
                                type="text"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-gray-100"
                                value={boardTitle}
                                onChange={(event) => setBoardTitle(event.target.value)}
                                placeholder="e.g., Neon rain alley"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-200">Tags</label>
                            <input
                                type="text"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-gray-100"
                                value={boardTags}
                                onChange={(event) => setBoardTags(event.target.value)}
                                placeholder="cyberpunk, rain, neon"
                            />
                        </div>
                    </>
                )}

                <div>
                    <label className="block text-sm font-semibold text-gray-200">Notes</label>
                    <textarea
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-gray-100"
                        rows={3}
                        placeholder="Describe how this reference should be used in future prompts"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                    />
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 rounded-full bg-amber-600 text-white font-semibold hover:bg-amber-500"
                    >
                        Save Reference
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VisualBibleLinkModal;
