import React, { useState, useEffect } from 'react';
import { getAllManifestsFromDB } from '../utils/database';
import { GenerationManifest } from '../services/generationManifestService';
import { replayManifestInBrowser } from '../services/browserReplayService';
import { useLocalGenerationSettings } from '../contexts/LocalGenerationSettingsContext';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { KeyframeData, getActiveKeyframeImage } from '../types';

interface ManifestHistoryProps {
    onClose: () => void;
    addToast: (message: string, type: 'success' | 'error' | 'info') => void;
    generatedImages: Record<string, KeyframeData>;
}

const ManifestHistory: React.FC<ManifestHistoryProps> = ({ onClose, addToast, generatedImages }) => {
    const [manifests, setManifests] = useState<GenerationManifest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedManifest, setSelectedManifest] = useState<GenerationManifest | null>(null);
    const [replaying, setReplaying] = useState(false);
    
    const { settings } = useLocalGenerationSettings();
    const { updateApiStatus } = useApiStatus();

    useEffect(() => {
        loadManifests();
    }, []);

    const loadManifests = async () => {
        try {
            setLoading(true);
            const data = await getAllManifestsFromDB();
            // Sort by timestamp descending (newest first)
            const sorted = data.sort((a, b) => {
                const timeA = new Date(a.git?.commitDate || 0).getTime();
                const timeB = new Date(b.git?.commitDate || 0).getTime();
                return timeB - timeA;
            });
            setManifests(sorted);
        } catch (err) {
            console.error('Failed to load manifests:', err);
            addToast('Failed to load history', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleReplay = async (manifest: GenerationManifest) => {
        if (replaying) return;
        
        try {
            setReplaying(true);
            addToast(`Starting replay for ${manifest.manifestId}...`, 'info');
            
            // For I2V, we need the keyframe image.
            // The manifest stores the sceneId/shotId, so we can try to look it up in the current project.
            // Limitation: If the user cleared the project, we might not have the image.
            // Future improvement: Store the base64 image in the manifest (large!) or a persistent asset store.
            
            let base64Image = '';
            if (manifest.generationType === 'video' && manifest.sceneId) {
                // Try to find the image in the current project state
                // Note: generatedImages is keyed by sceneId
                const sceneImage = generatedImages[manifest.sceneId];
                const activeImage = getActiveKeyframeImage(sceneImage);
                
                if (activeImage) {
                    base64Image = activeImage;
                } else {
                    // If not found, we can't replay I2V
                    // Unless it's T2V (text-to-video) which doesn't need an image
                    // But our current pipeline is mostly I2V.
                    // Let's warn the user if we can't find it.
                    if (manifest.workflow.profileId.includes('i2v')) {
                         if (!confirm('Original keyframe image not found in current session. Replay might fail if the workflow requires an image. Continue?')) {
                             setReplaying(false);
                             return;
                         }
                    }
                }
            }

            await replayManifestInBrowser(
                manifest,
                settings,
                base64Image,
                (progress, message) => {
                    updateApiStatus('loading', message || `Replaying... ${Math.round(progress * 100)}%`);
                }
            );
            
            addToast('Replay completed successfully!', 'success');
            updateApiStatus('idle', '');
            
        } catch (err) {
            console.error('Replay failed:', err);
            addToast(`Replay failed: ${(err as Error).message}`, 'error');
            updateApiStatus('error', (err as Error).message);
        } finally {
            setReplaying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-amber-500">📜</span> Generation History
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex">
                    {/* List */}
                    <div className="w-1/3 border-r border-gray-800 overflow-y-auto p-2 space-y-2">
                        {loading ? (
                            <div className="text-center p-4 text-gray-500">Loading...</div>
                        ) : manifests.length === 0 ? (
                            <div className="text-center p-4 text-gray-500">No history found.</div>
                        ) : (
                            manifests.map(m => (
                                <div 
                                    key={m.manifestId}
                                    onClick={() => setSelectedManifest(m)}
                                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                        selectedManifest?.manifestId === m.manifestId 
                                            ? 'bg-amber-900/30 border border-amber-700/50' 
                                            : 'bg-gray-800/50 hover:bg-gray-800 border border-transparent'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                            m.generationType === 'video' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'
                                        }`}>
                                            {m.generationType}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {new Date(m.git?.commitDate || Date.now()).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="text-sm font-medium text-gray-300 truncate">
                                        {m.workflow.label || m.workflow.profileId}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                        {m.manifestId.slice(0, 8)}...
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-900/50">
                        {selectedManifest ? (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium text-white mb-1">
                                        {selectedManifest.workflow.label || selectedManifest.workflow.profileId}
                                    </h3>
                                    <div className="flex gap-4 text-sm text-gray-400">
                                        <span>ID: {selectedManifest.manifestId}</span>
                                        <span>•</span>
                                        <span>Seed: {selectedManifest.determinism.seed}</span>
                                    </div>
                                </div>

                                <div className="bg-gray-800 rounded p-3 border border-gray-700">
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Prompt</div>
                                    <p className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                                        {selectedManifest.inputs.prompt || '(No prompt recorded)'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-800 rounded p-3 border border-gray-700">
                                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Workflow</div>
                                        <div className="text-sm text-gray-300">
                                            <div>Profile: {selectedManifest.workflow.profileId}</div>
                                            <div>Version: {selectedManifest.workflow.version || 'N/A'}</div>
                                        </div>
                                    </div>
                                    <div className="bg-gray-800 rounded p-3 border border-gray-700">
                                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Environment</div>
                                        <div className="text-sm text-gray-300">
                                            <div>Commit: {selectedManifest.git?.commitHash || 'Unknown'}</div>
                                            <div>Branch: {selectedManifest.git?.branch || 'Unknown'}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4 border-t border-gray-800">
                                    <button
                                        onClick={() => handleReplay(selectedManifest)}
                                        disabled={replaying}
                                        className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                                            replaying 
                                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                                                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20'
                                        }`}
                                    >
                                        {replaying ? (
                                            <>
                                                <span className="animate-spin">↻</span> Replaying...
                                            </>
                                        ) : (
                                            <>
                                                <span>↺</span> Replay Generation
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-500">
                                Select a generation to view details
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManifestHistory;
