import React, { useCallback, useState } from 'react';
import SparklesIcon from './icons/SparklesIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';

interface StructuredPayloadItem {
    shotNumber: number;
    text: string;
    image: string | null;
    transition: string | null;
}

interface FinalPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    payloads: { json: string; text: string; structured: StructuredPayloadItem[] } | null;
}

const FinalPromptModal: React.FC<FinalPromptModalProps> = ({ isOpen, onClose, payloads }) => {
    const [copied, setCopied] = useState(false);
    const [view, setView] = useState<'text' | 'json'>('text');

    const handleCopy = useCallback(() => {
        if (payloads) {
            const contentToCopy = view === 'json' ? payloads.json : payloads.text;
            navigator.clipboard.writeText(contentToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [payloads, view]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4 fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-dialog-title"
        >
            <div 
                className="bg-gray-800/90 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 flex-grow overflow-y-auto">
                    <h3 id="prompt-dialog-title" className="flex items-center text-lg font-bold text-amber-400 mb-4">
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        Exported Scene Prompts
                    </h3>
                    
                    <div className="mb-4 bg-gray-900/50 p-1 rounded-lg inline-flex" role="tablist">
                         <button
                            onClick={() => setView('text')}
                            role="tab"
                            aria-selected={view === 'text'}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                                view === 'text' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                            }`}
                        >
                            Visual Shot List
                        </button>
                        <button
                            onClick={() => setView('json')}
                            role="tab"
                            aria-selected={view === 'json'}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                                view === 'json' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                            }`}
                        >
                            JSON Payload
                        </button>
                    </div>

                    {view === 'json' ? (
                        <>
                            <p className="text-sm text-gray-400 mb-4">
                                Use this JSON payload with a local model runner like LM Studio or a custom workflow in ComfyUI.
                            </p>
                            <div className="bg-gray-900/70 rounded-md border border-gray-700 max-h-96 overflow-y-auto">
                               <pre className="text-xs text-gray-300 p-4 whitespace-pre-wrap break-all">
                                   <code>{payloads?.json}</code>
                               </pre>
                            </div>
                        </>
                    ) : (
                         <>
                            <p className="text-sm text-gray-400 mb-4">
                                A complete, human-readable prompt including generated keyframes for each shot.
                            </p>
                            <div className="bg-gray-900/70 rounded-md border border-gray-700 max-h-[60vh] overflow-y-auto p-4 space-y-6">
                               <div className="p-4 bg-gray-800 rounded-md border border-gray-600">
                                   <h4 className="font-bold text-amber-300">Full Scene Prompt</h4>
                                   <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{payloads?.text}</p>
                               </div>
                               {payloads?.structured.map(item => (
                                    <div key={item.shotNumber} className="p-4 bg-gray-800 rounded-md border border-gray-600">
                                        <p className="whitespace-pre-wrap font-semibold text-gray-200">{item.text}</p>
                                        {item.image ? (
                                            <img src={`data:image/jpeg;base64,${item.image}`} className="mt-4 rounded-lg border border-gray-600 max-w-xs mx-auto" alt={`Shot ${item.shotNumber}`} />
                                        ) : (
                                            <div className="mt-4 rounded-lg border border-dashed border-gray-600 max-w-xs mx-auto aspect-video flex items-center justify-center bg-gray-900">
                                                <p className="text-xs text-gray-500">No Image Generated</p>
                                            </div>
                                        )}
                                        {item.transition && (
                                            <div className="text-center text-amber-400 font-mono text-sm my-4">--[{item.transition}]--&gt;</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row justify-end items-center gap-4 p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg mt-auto">
                    <button 
                        type="button" 
                        onClick={handleCopy}
                        className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-2 bg-amber-600 text-white font-semibold rounded-md shadow-sm transition-colors hover:bg-amber-700 disabled:bg-gray-500"
                        disabled={!payloads || copied}
                    >
                        {copied ? (
                            <>
                                <ClipboardCheckIcon className="mr-2 h-5 w-5" />
                                Copied!
                            </>
                        ) : 'Copy to Clipboard'}
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