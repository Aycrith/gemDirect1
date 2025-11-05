import React, { useState, useCallback } from 'react';
import { StoryBible } from '../types';
import BookOpenIcon from './icons/BookOpenIcon';
import SparklesIcon from './icons/SparklesIcon';
import { refineStoryBibleField, ApiStateChangeCallback } from '../services/geminiService';
import Tooltip from './Tooltip';


interface StoryBibleEditorProps {
    storyBible: StoryBible;
    setStoryBible: React.Dispatch<React.SetStateAction<StoryBible | null>>;
    onContinue: () => void;
    isLoading: boolean;
    onApiStateChange: ApiStateChangeCallback;
}

const EditableSection: React.FC<{ 
    title: string; 
    content: string; 
    fieldKey: keyof StoryBible;
    onChange: (value: string) => void; 
    onRefine: (field: keyof StoryBible) => void;
    isRefining: boolean;
    rows?: number; 
}> = ({ title, content, fieldKey, onChange, onRefine, isRefining, rows = 3 }) => {
    
    const getTextAreaHeight = (content: string, baseRows: number) => {
        const newlines = (content.match(/\n/g) || []).length;
        return Math.max(baseRows, newlines + 2);
    }

    return (
        <div className="bg-gray-800/50 p-4 rounded-md border border-gray-700">
            <div className="flex justify-between items-center mb-2">
                 <label className="block text-sm font-bold text-indigo-400">{title}</label>
                 <Tooltip text="Refine with AI">
                     <button
                        onClick={() => onRefine(fieldKey)}
                        disabled={isRefining}
                        className="p-1.5 text-yellow-400 hover:text-yellow-300 disabled:text-gray-500 disabled:cursor-wait transition-colors"
                    >
                         {isRefining ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <SparklesIcon className="w-4 h-4" />
                        )}
                    </button>
                 </Tooltip>
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

const StoryBibleEditor: React.FC<StoryBibleEditorProps> = ({ storyBible, setStoryBible, onContinue, isLoading, onApiStateChange }) => {
    const [refiningField, setRefiningField] = useState<keyof StoryBible | null>(null);

    const handleFieldChange = useCallback((field: keyof StoryBible, value: string) => {
        setStoryBible(prev => prev ? { ...prev, [field]: value } : null);
    }, [setStoryBible]);
    
    const handleRefine = useCallback(async (field: keyof StoryBible) => {
        if (!storyBible) return;
        setRefiningField(field);
        try {
            const refinedText = await refineStoryBibleField(field, storyBible, onApiStateChange);
            handleFieldChange(field, refinedText);
        } catch (e) {
            console.error(e);
        } finally {
            setRefiningField(null);
        }
    }, [storyBible, handleFieldChange, onApiStateChange]);

    if (!storyBible) return null;

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="flex items-center text-2xl font-bold text-gray-200 mb-6">
                <BookOpenIcon className="w-7 h-7 mr-3 text-indigo-400" />
                Your Story Bible
            </h2>

            <div className="space-y-6">
                <EditableSection title="Logline" content={storyBible.logline} fieldKey="logline" onChange={v => handleFieldChange('logline', v)} onRefine={handleRefine} isRefining={refiningField === 'logline'} rows={2} />
                <EditableSection title="Characters" content={storyBible.characters} fieldKey="characters" onChange={v => handleFieldChange('characters', v)} onRefine={handleRefine} isRefining={refiningField === 'characters'} rows={5} />
                <EditableSection title="Setting" content={storyBible.setting} fieldKey="setting" onChange={v => handleFieldChange('setting', v)} onRefine={handleRefine} isRefining={refiningField === 'setting'} rows={5} />
                <EditableSection title="Plot Outline (3 Acts)" content={storyBible.plotOutline} fieldKey="plotOutline" onChange={v => handleFieldChange('plotOutline', v)} onRefine={handleRefine} isRefining={refiningField === 'plotOutline'} rows={8} />
            </div>

            <div className="mt-8 text-center">
                <button
                    onClick={onContinue}
                    disabled={isLoading || !!refiningField}
                    className="inline-flex items-center justify-center px-8 py-3 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                >
                    {isLoading ? 'Processing...' : "Continue to Director's Vision"}
                </button>
            </div>
        </div>
    );
};

export default StoryBibleEditor;