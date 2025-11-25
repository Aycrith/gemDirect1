import React from 'react';
import { SceneProgressionError } from '../services/sceneProgressionValidator';

interface SceneProgressionWarningsProps {
    warnings: SceneProgressionError[];
    onDismiss: () => void;
    onReview: (sceneId: string) => void;
}

const SceneProgressionWarnings: React.FC<SceneProgressionWarningsProps> = ({
    warnings,
    onDismiss,
    onReview
}) => {
    if (warnings.length === 0) return null;

    return (
        <div className="glass-card p-4 mb-4 border-l-4 border-yellow-500">
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                    <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-yellow-300 mb-2">
                        Scene Progression Warnings ({warnings.length})
                    </h3>
                    <p className="text-sm text-gray-300 mb-3">
                        The following scenes may have narrative continuity issues. Review and adjust if needed.
                    </p>
                    <ul className="space-y-2 max-h-96 overflow-y-auto">
                        {warnings.map((warning, idx) => (
                            <li key={idx} className="text-sm bg-gray-800/50 p-3 rounded">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2 py-0.5 bg-yellow-600/30 text-yellow-200 rounded text-xs font-medium">
                                                {warning.errorType.replace(/_/g, ' ').toUpperCase()}
                                            </span>
                                            <p className="font-medium text-yellow-200">
                                                Scene {warning.sceneIndex + 1}: {warning.sceneTitle}
                                            </p>
                                        </div>
                                        <p className="text-gray-400 mt-1">{warning.message}</p>
                                        {warning.suggestion && (
                                            <p className="text-blue-300 mt-1 text-xs italic flex items-start gap-1">
                                                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                </svg>
                                                {warning.suggestion}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => onReview(warning.sceneId)}
                                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap"
                                    >
                                        Review
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-4 flex gap-2">
                        <button
                            onClick={onDismiss}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-sm"
                        >
                            Dismiss All
                        </button>
                        <span className="text-xs text-gray-400 flex items-center">
                            These warnings won't block generation but may affect story coherence.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SceneProgressionWarnings;
