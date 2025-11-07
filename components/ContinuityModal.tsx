import React, { useState, useCallback } from 'react';
import FilmIcon from './icons/FilmIcon';

interface ContinuityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (direction: string) => void;
    lastFrame: string;
    isLoading: boolean;
}

const ContinuityModal: React.FC<ContinuityModalProps> = ({ isOpen, onClose, onSubmit, lastFrame, isLoading }) => {
    const [direction, setDirection] = useState('');

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (direction.trim()) {
            onSubmit(direction);
        }
    }, [direction, onSubmit]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="continuity-dialog-title"
        >
            <div 
                className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl" 
                onClick={(e) => e.stopPropagation()}
            >
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 id="continuity-dialog-title" className="flex items-center text-lg font-bold text-yellow-400 mb-4">
                            <FilmIcon className="w-5 h-5 mr-2" />
                            Extend Timeline
                        </h3>
                        
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="md:w-1/3">
                                <p className="text-sm font-semibold text-gray-300 mb-2">Last Scene Frame</p>
                                {lastFrame ? (
                                    <img 
                                        src={`data:image/jpeg;base64,${lastFrame}`} 
                                        alt="Last frame of previous scene" 
                                        className="rounded-lg w-full aspect-video object-cover border border-gray-600"
                                    />
                                ) : (
                                    <div className="rounded-lg w-full aspect-video bg-gray-900 flex items-center justify-center border border-gray-600">
                                        <p className="text-xs text-gray-500">No Frame</p>
                                    </div>
                                )}
                            </div>

                            <div className="md:w-2/3 flex flex-col">
                                <label htmlFor="direction" className="text-sm font-semibold text-gray-300 mb-2">What happens next?</label>
                                <textarea
                                    id="direction"
                                    rows={4}
                                    value={direction}
                                    onChange={(e) => setDirection(e.target.value)}
                                    className="flex-grow bg-gray-900 border border-gray-600 rounded-md shadow-sm focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm text-gray-200 p-3"
                                    placeholder="e.g., The hero escapes into a crowded market..."
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-gray-700">
                             <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors">
                                Cancel
                            </button>
                            <button type="submit" disabled={isLoading || !direction.trim()} className="px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                                {isLoading ? 'Generating...' : 'Generate Next Scene'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ContinuityModal;