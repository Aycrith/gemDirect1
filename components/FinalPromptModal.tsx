import React, { useCallback, useState } from 'react';
import SparklesIcon from './icons/SparklesIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';

interface FinalPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    jsonPayload: string | null;
}

const FinalPromptModal: React.FC<FinalPromptModalProps> = ({ isOpen, onClose, jsonPayload }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        if (jsonPayload) {
            navigator.clipboard.writeText(jsonPayload);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [jsonPayload]);

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
                className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 overflow-y-auto">
                    <h3 id="prompt-dialog-title" className="flex items-center text-lg font-bold text-indigo-400 mb-4">
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        Video Generation Request Payload
                    </h3>
                    <p className="text-sm text-gray-400 mb-4">
                        Use this JSON payload with a local model runner like LM Studio or a custom workflow in ComfyUI to generate your video.
                    </p>
                    <div className="bg-gray-900/70 rounded-md border border-gray-600 max-h-96 overflow-y-auto">
                       <pre className="text-xs text-gray-300 p-4 whitespace-pre-wrap break-all">
                           <code>{jsonPayload}</code>
                       </pre>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end items-center gap-4 p-4 bg-gray-800/50 border-t border-gray-700 rounded-b-lg mt-auto">
                    <button 
                        type="button" 
                        onClick={handleCopy}
                        className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-2 bg-green-600 text-white font-semibold rounded-md shadow-sm transition-colors hover:bg-green-700 disabled:bg-gray-500"
                        disabled={!jsonPayload || copied}
                    >
                        {copied ? (
                            <>
                                <ClipboardCheckIcon className="mr-2 h-5 w-5" />
                                Copied!
                            </>
                        ) : (
                            'Copy to Clipboard'
                        )}
                    </button>
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors w-full sm:w-auto">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FinalPromptModal;
