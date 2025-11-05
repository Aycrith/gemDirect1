import React, { useState, useCallback } from 'react';
import { StoryBible } from '../types';
import BookOpenIcon from './icons/BookOpenIcon';
import SparklesIcon from './icons/SparklesIcon';
import { refineEntireStoryBible, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';

interface StoryBibleEditorProps {
    storyBible: StoryBible;
    setStoryBible: React.Dispatch<React.SetStateAction<StoryBible | null>>;
    onContinue: () => void;
    isLoading: boolean;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
}

const EditableSection: React.FC<{ 
    title: string; 
    content: string; 
    fieldKey: keyof StoryBible;
    onChange: (value: string) => void; 
    rows?: number; 
}> = ({ title, content, onChange, rows = 3 }) => {
    
    const getTextAreaHeight = (content: string, baseRows: number) => {
        const newlines = (content.match(/\n/g) || []).length;
        return Math.max(baseRows, newlines + 2);
    }

    return (
        <div className="bg-gray-800/50 p-4 rounded-md border border-gray-700">
            <div className="flex justify-between items-center mb-2">
                 <label className="block text-sm font-bold text-indigo-400">{title}</label>
            </div>
            <textarea
                value={content}
                onChange={(e) => onChange(e.target.value)}
                rows={getTextAreaHeight(content, rows)}
                className="w-full bg-gray-900/50 p-2 border border-gray-600 rounded-md focus:ring-1 focus:ring-indigo-500 text-sm text-gray-300 leading-relaxed"
            />
        </div>
    );
};

const StoryBibleEditor: React.FC<StoryBibleEditorProps> = ({ storyBible, setStoryBible, onContinue, isLoading, onApiStateChange, onApiLog }) => {
    const [isRefining, setIsRefining] = useState(false);

    const handleFieldChange = useCallback((field: keyof StoryBible, value: string) => {
        setStoryBible(prev => prev ? { ...prev, [field]: value } : null);
    }, [setStoryBible]);
    
    const handleRefineBible = useCallback(async () => {
        if (!storyBible) return;
        setIsRefining(true);
        try {
            const refinedBible = await refineEntireStoryBible(storyBible, onApiLog, onApiStateChange);
            setStoryBible(refinedBible);
        } catch (e) {
            console.error(e);
        } finally {
            setIsRefining(false);
        }
    }, [storyBible, setStoryBible, onApiStateChange, onApiLog]);

    if (!storyBible) return null;

    return (
        <div className="max-w-4xl mx-auto">
            <header className="mb-8">
                <h2 className="flex items-center text-3xl font-bold text-gray-200 mb-2">
                    <BookOpenIcon className="w-8 h-8 mr-3 text-indigo-400" />
                    Your Story Bible
                </h2>
                <p className="text-gray-400">This is the foundational document for your entire story. Edit the fields below, or use the AI to refine the entire document in one go.</p>
            </header>

            <div className="space-y-6">
                <EditableSection title="Logline" content={storyBible.logline} fieldKey="logline" onChange={v => handleFieldChange('logline', v)} rows={2} />
                <EditableSection title="Characters" content={storyBible.characters} fieldKey="characters" onChange={v => handleFieldChange('characters', v)} rows={5} />
                <EditableSection title="Setting" content={storyBible.setting} fieldKey="setting" onChange={v => handleFieldChange('setting', v)} rows={5} />
                <EditableSection title="Plot Outline (3 Acts)" content={storyBible.plotOutline} fieldKey="plotOutline" onChange={v => handleFieldChange('plotOutline', v)} rows={8} />
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700/50 flex flex-col sm:flex-row justify-center items-center gap-4">
                 <button
                    onClick={handleRefineBible}
                    disabled={isRefining || isLoading}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-yellow-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-yellow-700 focus:outline-none focus:ring-4 focus:ring-yellow-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                >
                    {isRefining ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Refining...
                        </>
                    ) : (
                        <>
                            <SparklesIcon className="mr-2 h-5 w-5" />
                            Refine Entire Bible with AI
                        </>
                    )}
                </button>
                <button
                    onClick={onContinue}
                    disabled={isLoading || isRefining}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                >
                    {isLoading ? 'Processing...' : "Continue to Director's Vision"}
                </button>
            </div>
        </div>
    );
};

export default StoryBibleEditor;