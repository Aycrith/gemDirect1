import React, { useState, useCallback } from 'react';
import SparklesIcon from './icons/SparklesIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';

interface FinalPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    prompt: string;
    isLoading: boolean;
}

const FinalPromptModal: React.FC<FinalPromptModalProps> = ({ isOpen, onClose, prompt, isLoading }) => {
    const [hasCopied, setHasCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(prompt).then(() => {
            setHasCopied(true);
            setTimeout(() => setHasCopied(false), 2000);
        });
    }, [prompt]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-dialog-title"
        >
            <div 
                className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <h3 id="prompt-dialog-title" className="flex items-center text-lg font-bold text-green-400 mb-4">
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        Your Final Cinematic Prompt is Ready
                    </h3>
                    
                    <div className="bg-gray-900/70 p-4 rounded-md border border-gray-600 max-h-80 overflow-y-auto">
                       {isLoading ? (
                           <p className="text-gray-400">Generating...</p>
                       ) : (
                           <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{prompt}</pre>
                       )}
                    </div>
                </div>

                <div className="flex justify-end gap-4 p-4 bg-gray-800/50 border-t border-gray-700 rounded-b-lg">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors">
                        Close
                    </button>
                    <button 
                        type="button" 
                        onClick={handleCopy} 
                        disabled={!prompt || hasCopied}
                        className="px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {hasCopied ? <CheckCircleIcon className="w-5 h-5" /> : null}
                        {hasCopied ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FinalPromptModal;
