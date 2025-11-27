import React, { useCallback, useState, useRef } from 'react';
import { useVisualBible, VisualBibleSyncToast } from '../utils/hooks';
import { getFeatureFlag } from '../utils/featureFlags';
import { RECOMMENDED_WEIGHTS } from '../services/ipAdapterService';
import type { StoryBible, VisualBible, VisualBibleCharacter } from '../types';

interface VisualBiblePanelProps {
    isOpen?: boolean;
    onClose?: () => void;
    storyBible?: StoryBible | null;
}

/** Badge component to show character sync status */
const SyncStatusBadge: React.FC<{ 
    status: 'storyBible' | 'userEdit' | 'unlinked';
}> = ({ status }) => {
    const config = {
        storyBible: {
            label: 'Synced',
            className: 'bg-green-700/50 text-green-200 border-green-600',
            icon: '✓',
        },
        userEdit: {
            label: 'Custom',
            className: 'bg-amber-700/50 text-amber-200 border-amber-600',
            icon: '✎',
        },
        unlinked: {
            label: 'Unlinked',
            className: 'bg-gray-700/50 text-gray-400 border-gray-600',
            icon: '○',
        },
    };
    
    const { label, className, icon } = config[status];
    
    return (
        <span 
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${className}`}
            title={status === 'storyBible' 
                ? 'Auto-synced from Story Bible' 
                : status === 'userEdit' 
                    ? 'Manually edited (protected from auto-sync)' 
                    : 'Not linked to Story Bible'}
        >
            {icon} {label}
        </span>
    );
};

/** Toast component for sync notifications */
const SyncToast: React.FC<{
    toast: VisualBibleSyncToast;
    onClose: () => void;
    onResyncAll: () => void;
}> = ({ toast, onClose, onResyncAll }) => (
    <div className="fixed bottom-4 right-4 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4 max-w-sm animate-fade-in-right">
        <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-green-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
            </div>
            <div className="flex-1">
                <h4 className="text-sm font-medium text-white">Character Sync Complete</h4>
                <p className="mt-1 text-xs text-gray-400">
                    {toast.synced} synced{toast.skipped > 0 && `, ${toast.skipped} user edits preserved`}
                </p>
                {toast.showResyncAll && (
                    <button
                        onClick={onResyncAll}
                        className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline"
                    >
                        Resync all (override user edits)
                    </button>
                )}
            </div>
            <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-300"
            >
                ×
            </button>
        </div>
    </div>
);

/** Character list item component */
const CharacterListItem: React.FC<{
    character: VisualBibleCharacter;
    syncStatus: 'storyBible' | 'userEdit' | 'unlinked';
    onEdit: (char: VisualBibleCharacter) => void;
    onMarkUserEdit: (charId: string) => void;
    onUpdateCharacter: (char: VisualBibleCharacter) => void;
    showIPAdapterControls: boolean;
}> = ({ character, syncStatus, onEdit, onMarkUserEdit, onUpdateCharacter, showIPAdapterControls }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    
    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploadingImage(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            onUpdateCharacter({
                ...character,
                imageRefs: [base64, ...(character.imageRefs || []).slice(0, 2)], // Keep max 3 refs
                descriptorSource: 'userEdit',
            });
            setIsUploadingImage(false);
        };
        reader.onerror = () => setIsUploadingImage(false);
        reader.readAsDataURL(file);
    }, [character, onUpdateCharacter]);
    
    const handleWeightChange = useCallback((weight: number) => {
        onUpdateCharacter({
            ...character,
            ipAdapterWeight: weight,
            descriptorSource: 'userEdit',
        });
    }, [character, onUpdateCharacter]);
    
    const hasReferenceImage = character.imageRefs && character.imageRefs.length > 0;
    
    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{character.name}</span>
                    <SyncStatusBadge status={syncStatus} />
                </div>
                {character.role && (
                    <span className="text-xs text-gray-500 capitalize">{character.role}</span>
                )}
            </div>
            
            {/* Reference Image Section - Only show if characterConsistency is enabled */}
            {showIPAdapterControls && (
                <div className="mb-3 p-2 bg-gray-900/50 rounded border border-gray-700/50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">Reference Image</span>
                        {hasReferenceImage && (
                            <span className="text-xs text-green-400">✓ Ready</span>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {hasReferenceImage ? (
                            <div className="relative group">
                                <img 
                                    src={character.imageRefs![0]} 
                                    alt={`${character.name} reference`}
                                    className="w-12 h-12 rounded object-cover border border-gray-600"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white rounded transition-opacity"
                                >
                                    Replace
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingImage}
                                className="w-12 h-12 rounded border-2 border-dashed border-gray-600 hover:border-gray-500 flex items-center justify-center text-gray-500 hover:text-gray-400 transition-colors"
                            >
                                {isUploadingImage ? (
                                    <span className="animate-spin">⏳</span>
                                ) : (
                                    <span>+</span>
                                )}
                            </button>
                        )}
                        
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                        />
                        
                        {/* IP-Adapter Weight Slider */}
                        <div className="flex-1">
                            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                                <span>Strength</span>
                                <span>{((character.ipAdapterWeight ?? RECOMMENDED_WEIGHTS.medium) * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={(character.ipAdapterWeight ?? RECOMMENDED_WEIGHTS.medium) * 100}
                                onChange={(e) => handleWeightChange(Number(e.target.value) / 100)}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                title="IP-Adapter strength (0-100%)"
                            />
                        </div>
                    </div>
                </div>
            )}
        
            {character.visualTraits && character.visualTraits.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {character.visualTraits.map((trait, i) => (
                        <span 
                            key={i}
                            className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded"
                        >
                            {trait}
                        </span>
                    ))}
                </div>
            )}
            
            <div className="flex gap-2 mt-2">
                <button
                    onClick={() => onEdit(character)}
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                    Edit
                </button>
                {syncStatus === 'storyBible' && (
                    <button
                        onClick={() => onMarkUserEdit(character.id)}
                        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                        title="Mark as custom to protect from auto-sync"
                    >
                        Mark as Custom
                    </button>
                )}
            </div>
        </div>
    );
};

const VisualBiblePanel: React.FC<VisualBiblePanelProps> = ({ 
    isOpen = false, 
    onClose = () => {},
    storyBible = null,
}) => {
    const { 
        visualBible, 
        setVisualBible,
        handleStoryBibleSave,
        handleResyncAll,
        syncToast,
        clearSyncToast,
        getCharacterSyncStatus,
    } = useVisualBible(storyBible);
    
    const [showResyncConfirm, setShowResyncConfirm] = useState(false);
    
    // Check if IP-Adapter controls should be shown
    const showIPAdapterControls = getFeatureFlag(undefined, 'characterConsistency') === true;
    
    const handleMarkUserEdit = useCallback((characterId: string) => {
        setVisualBible((prev: VisualBible) => ({
            ...prev,
            characters: prev.characters.map(char =>
                char.id === characterId
                    ? { ...char, descriptorSource: 'userEdit' as const }
                    : char
            ),
        }));
    }, [setVisualBible]);
    
    const handleUpdateCharacter = useCallback((updatedCharacter: VisualBibleCharacter) => {
        setVisualBible((prev: VisualBible) => ({
            ...prev,
            characters: prev.characters.map(char =>
                char.id === updatedCharacter.id ? updatedCharacter : char
            ),
        }));
    }, [setVisualBible]);
    
    const handleEditCharacter = useCallback((character: VisualBibleCharacter) => {
        // For now, just mark as user edit - full edit modal can be added later
        handleMarkUserEdit(character.id);
    }, [handleMarkUserEdit]);
    
    const handleResyncAllWithConfirm = useCallback(() => {
        setShowResyncConfirm(false);
        handleResyncAll();
    }, [handleResyncAll]);
    
    if (!isOpen) return null;
    
    const hasCharacters = visualBible.characters.length > 0;
    const hasStoryBible = storyBible !== null;
    
    return (
        <div data-testid="VisualBiblePanel" className="fixed inset-y-0 right-0 w-96 bg-gray-900 border-l border-gray-700 shadow-xl z-40 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Visual Bible</h2>
                <button 
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label="Close panel"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            {/* Toolbar */}
            <div className="p-3 border-b border-gray-700 flex items-center gap-2">
                <button
                    onClick={handleStoryBibleSave}
                    disabled={!hasStoryBible || !hasCharacters}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
                    title="Sync character descriptors from Story Bible"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync from Story Bible
                </button>
                
                <button
                    onClick={() => setShowResyncConfirm(true)}
                    disabled={!hasStoryBible || !hasCharacters}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-amber-600 text-amber-400 hover:bg-amber-600/20 disabled:border-gray-700 disabled:text-gray-500 rounded-lg transition-colors"
                    title="Force resync all characters (overrides user edits)"
                >
                    Resync All
                </button>
            </div>
            
            {/* Character List */}
            <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center justify-between">
                    <span>Characters</span>
                    <span className="text-xs text-gray-500">{visualBible.characters.length}</span>
                </h3>
                
                {hasCharacters ? (
                    <div className="space-y-2">
                        {visualBible.characters.map(char => (
                            <CharacterListItem
                                key={char.id}
                                character={char}
                                syncStatus={getCharacterSyncStatus(char.id)}
                                onEdit={handleEditCharacter}
                                onMarkUserEdit={handleMarkUserEdit}
                                onUpdateCharacter={handleUpdateCharacter}
                                showIPAdapterControls={showIPAdapterControls}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <p className="text-sm">No characters in Visual Bible</p>
                        <p className="text-xs mt-1">Characters will appear here when added</p>
                    </div>
                )}
            </div>
            
            {/* Style Boards section (collapsed) */}
            <div className="p-4 border-t border-gray-700">
                <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center justify-between">
                    <span>Style Boards</span>
                    <span className="text-xs text-gray-500">{visualBible.styleBoards?.length ?? 0}</span>
                </h3>
                <p className="text-xs text-gray-500">
                    Style boards are managed via keyframe generation
                </p>
            </div>
            
            {/* Resync Confirmation Modal */}
            {showResyncConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md mx-4">
                        <h3 className="text-lg font-semibold text-white mb-2">Resync All Characters?</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            This will override all user-edited descriptors with values from the Story Bible.
                            Custom edits will be lost.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowResyncConfirm(false)}
                                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleResyncAllWithConfirm}
                                className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
                            >
                                Resync All
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Sync Toast */}
            {syncToast && (
                <SyncToast
                    toast={syncToast}
                    onClose={clearSyncToast}
                    onResyncAll={() => {
                        clearSyncToast();
                        handleResyncAll();
                    }}
                />
            )}
        </div>
    );
};

export default VisualBiblePanel;
