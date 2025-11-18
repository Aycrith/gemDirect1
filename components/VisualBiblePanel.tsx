import React, { useState } from 'react';
import { VisualBible, VisualBibleCharacter, VisualBibleStyleBoard } from '../types';
import { useVisualBible } from '../utils/hooks';
import PlusIcon from './icons/PlusIcon';
import TrashIcon from './icons/TrashIcon';

interface VisualBiblePanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const VisualBiblePanel: React.FC<VisualBiblePanelProps> = ({ isOpen, onClose }) => {
    const { visualBible, setVisualBible } = useVisualBible();
    const [activeTab, setActiveTab] = useState<'characters' | 'styleBoards'>('characters');
    const [newCharacter, setNewCharacter] = useState({ name: '', description: '' });
    const [newStyleBoard, setNewStyleBoard] = useState({ title: '', description: '', tags: '' });
    const [editingCharacter, setEditingCharacter] = useState<VisualBibleCharacter | null>(null);
    const [editingStyleBoard, setEditingStyleBoard] = useState<VisualBibleStyleBoard | null>(null);

    if (!isOpen) return null;

    const handleAddCharacter = () => {
        if (!newCharacter.name.trim()) return;
        const character: VisualBibleCharacter = {
            id: `vb_char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: newCharacter.name,
            description: newCharacter.description,
            imageRefs: []
        };
        setVisualBible(prev => ({
            ...prev,
            characters: [...prev.characters, character]
        }));
        setNewCharacter({ name: '', description: '' });
    };

    const handleAddStyleBoard = () => {
        if (!newStyleBoard.title.trim()) return;
        const styleBoard: VisualBibleStyleBoard = {
            id: `vb_sb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            title: newStyleBoard.title,
            description: newStyleBoard.description,
            tags: newStyleBoard.tags.split(',').map(t => t.trim()).filter(t => t),
            imageRefs: []
        };
        setVisualBible(prev => ({
            ...prev,
            styleBoards: [...prev.styleBoards, styleBoard]
        }));
        setNewStyleBoard({ title: '', description: '', tags: '' });
    };

    const handleSaveCharacter = (character: VisualBibleCharacter) => {
        setVisualBible(prev => ({
            ...prev,
            characters: prev.characters.map(c => c.id === character.id ? character : c)
        }));
        setEditingCharacter(null);
    };

    const handleSaveStyleBoard = (styleBoard: VisualBibleStyleBoard) => {
        setVisualBible(prev => ({
            ...prev,
            styleBoards: prev.styleBoards.map(sb => sb.id === styleBoard.id ? styleBoard : sb)
        }));
        setEditingStyleBoard(null);
    };

    const handleDeleteCharacter = (id: string) => {
        setVisualBible(prev => ({
            ...prev,
            characters: prev.characters.filter(c => c.id !== id)
        }));
    };

    const handleDeleteStyleBoard = (id: string) => {
        setVisualBible(prev => ({
            ...prev,
            styleBoards: prev.styleBoards.filter(sb => sb.id !== id)
        }));
    };

    const handleAddImageToCharacter = (characterId: string, imageUrl: string) => {
        if (!imageUrl.trim()) return;
        setVisualBible(prev => ({
            ...prev,
            characters: prev.characters.map(c =>
                c.id === characterId
                    ? { ...c, imageRefs: [...(c.imageRefs || []), imageUrl] }
                    : c
            )
        }));
    };

    const handleAddImageToStyleBoard = (styleBoardId: string, imageUrl: string) => {
        if (!imageUrl.trim()) return;
        setVisualBible(prev => ({
            ...prev,
            styleBoards: prev.styleBoards.map(sb =>
                sb.id === styleBoardId
                    ? { ...sb, imageRefs: [...(sb.imageRefs || []), imageUrl] }
                    : sb
            )
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800/90 rounded-lg border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">Visual Bible</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex border-b border-gray-700">
                    <button
                        onClick={() => setActiveTab('characters')}
                        className={`px-4 py-2 font-medium transition-colors ${
                            activeTab === 'characters'
                                ? 'text-amber-400 border-b-2 border-amber-400'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        Characters ({visualBible.characters.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('styleBoards')}
                        className={`px-4 py-2 font-medium transition-colors ${
                            activeTab === 'styleBoards'
                                ? 'text-amber-400 border-b-2 border-amber-400'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        Style Boards ({visualBible.styleBoards.length})
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'characters' && (
                        <div className="space-y-4">
                            {/* Add Character Form */}
                            <div className="bg-gray-700/50 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-white mb-3">Add Character</h3>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Character name"
                                        value={newCharacter.name}
                                        onChange={(e) => setNewCharacter(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                    />
                                    <textarea
                                        placeholder="Character description"
                                        value={newCharacter.description}
                                        onChange={(e) => setNewCharacter(prev => ({ ...prev, description: e.target.value }))}
                                        rows={2}
                                        className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                    />
                                    <button
                                        onClick={handleAddCharacter}
                                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Add Character
                                    </button>
                                </div>
                            </div>

                            {/* Character List */}
                            <div className="space-y-3">
                                {visualBible.characters.map(character => (
                                    <div key={character.id} className="bg-gray-700/50 rounded-lg p-4">
                                        {editingCharacter?.id === character.id ? (
                                            <div className="space-y-3">
                                                <input
                                                    type="text"
                                                    value={editingCharacter.name}
                                                    onChange={(e) => setEditingCharacter(prev => prev ? { ...prev, name: e.target.value } : null)}
                                                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                                />
                                                <textarea
                                                    value={editingCharacter.description || ''}
                                                    onChange={(e) => setEditingCharacter(prev => prev ? { ...prev, description: e.target.value } : null)}
                                                    rows={3}
                                                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                                />
                                                <select
                                                    value={editingCharacter.role || ''}
                                                    onChange={(e) => setEditingCharacter(prev => prev ? { ...prev, role: e.target.value as any || undefined } : null)}
                                                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                                >
                                                    <option value="">Select Role</option>
                                                    <option value="protagonist">Protagonist</option>
                                                    <option value="antagonist">Antagonist</option>
                                                    <option value="supporting">Supporting</option>
                                                    <option value="background">Background</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="Visual traits (comma-separated)"
                                                    value={editingCharacter.visualTraits?.join(', ') || ''}
                                                    onChange={(e) => setEditingCharacter(prev => prev ? { ...prev, visualTraits: e.target.value.split(',').map(t => t.trim()).filter(t => t) } : null)}
                                                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Identity tags (comma-separated)"
                                                    value={editingCharacter.identityTags?.join(', ') || ''}
                                                    onChange={(e) => setEditingCharacter(prev => prev ? { ...prev, identityTags: e.target.value.split(',').map(t => t.trim()).filter(t => t) } : null)}
                                                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleSaveCharacter(editingCharacter)}
                                                        className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingCharacter(null)}
                                                        className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h4 className="text-lg font-semibold text-white">{character.name}</h4>
                                                        <p className="text-gray-300 text-sm">{character.description}</p>
                                                        {character.role && (
                                                            <p className="text-xs text-amber-400 mt-1">Role: {character.role}</p>
                                                        )}
                                                        {character.visualTraits && character.visualTraits.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {character.visualTraits.map(trait => (
                                                                    <span key={trait} className="px-2 py-1 bg-blue-600/20 text-blue-300 rounded-full text-xs">
                                                                        {trait}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {character.identityTags && character.identityTags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {character.identityTags.map(tag => (
                                                                    <span key={tag} className="px-2 py-1 bg-purple-600/20 text-purple-300 rounded-full text-xs">
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setEditingCharacter(character)}
                                                            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteCharacter(character.id)}
                                                            className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="mb-3">
                                                    <input
                                                        type="text"
                                                        placeholder="Add image URL"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                handleAddImageToCharacter(character.id, (e.target as HTMLInputElement).value);
                                                                (e.target as HTMLInputElement).value = '';
                                                            }
                                                        }}
                                                        className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white text-sm"
                                                    />
                                                </div>
                                                {character.imageRefs && character.imageRefs.length > 0 && (
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {character.imageRefs.map((ref, index) => (
                                                            <img
                                                                key={index}
                                                                src={`data:image/jpeg;base64,${ref}`}
                                                                alt={`${character.name} ${index + 1}`}
                                                                className="w-full h-20 object-cover rounded-md border border-gray-600"
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'styleBoards' && (
                        <div className="space-y-4">
                            {/* Add Style Board Form */}
                            <div className="bg-gray-700/50 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-white mb-3">Add Style Board</h3>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Style board title"
                                        value={newStyleBoard.title}
                                        onChange={(e) => setNewStyleBoard(prev => ({ ...prev, title: e.target.value }))}
                                        className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                    />
                                    <textarea
                                        placeholder="Style board description"
                                        value={newStyleBoard.description}
                                        onChange={(e) => setNewStyleBoard(prev => ({ ...prev, description: e.target.value }))}
                                        rows={2}
                                        className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Tags (comma-separated)"
                                        value={newStyleBoard.tags}
                                        onChange={(e) => setNewStyleBoard(prev => ({ ...prev, tags: e.target.value }))}
                                        className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                    />
                                    <button
                                        onClick={handleAddStyleBoard}
                                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Add Style Board
                                    </button>
                                </div>
                            </div>

                            {/* Style Board List */}
                            <div className="space-y-3">
                                {visualBible.styleBoards.map(styleBoard => (
                                    <div key={styleBoard.id} className="bg-gray-700/50 rounded-lg p-4">
                                        {editingStyleBoard?.id === styleBoard.id ? (
                                            <div className="space-y-3">
                                                <input
                                                    type="text"
                                                    value={editingStyleBoard.title}
                                                    onChange={(e) => setEditingStyleBoard(prev => prev ? { ...prev, title: e.target.value } : null)}
                                                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                                />
                                                <textarea
                                                    value={editingStyleBoard.description || ''}
                                                    onChange={(e) => setEditingStyleBoard(prev => prev ? { ...prev, description: e.target.value } : null)}
                                                    rows={3}
                                                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                                />
                                                <input
                                                    type="text"
                                                    value={editingStyleBoard.tags?.join(', ') || ''}
                                                    onChange={(e) => setEditingStyleBoard(prev => prev ? { ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) } : null)}
                                                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white"
                                                    placeholder="Tags (comma-separated)"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleSaveStyleBoard(editingStyleBoard)}
                                                        className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingStyleBoard(null)}
                                                        className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h4 className="text-lg font-semibold text-white">{styleBoard.title}</h4>
                                                        <p className="text-gray-300 text-sm">{styleBoard.description}</p>
                                                        {styleBoard.tags && styleBoard.tags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {styleBoard.tags.map(tag => (
                                                                    <span key={tag} className="px-2 py-1 bg-amber-600/20 text-amber-300 rounded-full text-xs">
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setEditingStyleBoard(styleBoard)}
                                                            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteStyleBoard(styleBoard.id)}
                                                            className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="mb-3">
                                                    <input
                                                        type="text"
                                                        placeholder="Add image URL"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                handleAddImageToStyleBoard(styleBoard.id, (e.target as HTMLInputElement).value);
                                                                (e.target as HTMLInputElement).value = '';
                                                            }
                                                        }}
                                                        className="w-full bg-gray-900/70 border border-gray-600 rounded-md px-3 py-2 text-white text-sm"
                                                    />
                                                </div>
                                                {styleBoard.imageRefs && styleBoard.imageRefs.length > 0 && (
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {styleBoard.imageRefs.map((ref, index) => (
                                                            <img
                                                                key={index}
                                                                src={`data:image/jpeg;base64,${ref}`}
                                                                alt={`${styleBoard.title} ${index + 1}`}
                                                                className="w-full h-20 object-cover rounded-md border border-gray-600"
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VisualBiblePanel;