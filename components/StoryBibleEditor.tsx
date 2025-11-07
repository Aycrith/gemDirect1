
import React, { useState, useCallback } from 'react';
import { StoryBible } from '../types';
import { marked } from 'marked';
import { refineEntireStoryBible, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';
import BookOpenIcon from './icons/BookOpenIcon';
import SparklesIcon from './icons/SparklesIcon';
import SaveIcon from './icons/SaveIcon';
import ClapperboardIcon from './icons/ClapperboardIcon';

interface StoryBibleEditorProps {
    storyBible: StoryBible;
    onUpdate: (bible: StoryBible) => void;
    onGenerateScenes: () => void;
    isLoading: boolean;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
}

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'}`}
    >
        {children}
    </button>
);


const EditableField: React.FC<{ label: string; description: string; value: string; onChange: (value: string) => void; rows?: number }> = ({ label, description, value, onChange, rows = 3 }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300">{label}</label>
        <p className="text-xs text-gray-400 mt-1 mb-2">{description}</p>
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:shadow-indigo-500/30 shadow-black/30 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3 transition-all duration-300"
        />
    </div>
);

const StoryBibleEditor: React.FC<StoryBibleEditorProps> = ({ storyBible, onUpdate, onGenerateScenes, isLoading, onApiStateChange, onApiLog }) => {
    const [editableBible, setEditableBible] = useState(storyBible);
    const [isRefining, setIsRefining] = useState(false);
    const [charTab, setCharTab] = useState<'edit' | 'preview'>('edit');
    const [plotTab, setPlotTab] = useState<'edit' | 'preview'>('edit');


    const handleFieldChange = (field: keyof StoryBible, value: string) => {
        setEditableBible(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onUpdate(editableBible);
    };

    const handleRefine = async () => {
        setIsRefining(true);
        try {
            const refinedBible = await refineEntireStoryBible(editableBible, onApiLog, onApiStateChange);
            setEditableBible(refinedBible);
            onUpdate(refinedBible); // Also update parent state
        } catch (e) {
            console.error(e);
            // Error toast is handled by the service
        } finally {
            setIsRefining(false);
        }
    };
    
    const createMarkup = (markdown: string) => {
        const rawMarkup = marked.parse(markdown);
        return { __html: rawMarkup as string };
    };

    const hasChanges = JSON.stringify(storyBible) !== JSON.stringify(editableBible);

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
                <BookOpenIcon className="w-12 h-12 mx-auto text-indigo-400 mb-4" />
                <h2 className="text-3xl font-bold text-gray-100">Your Story Bible</h2>
                <p className="text-gray-400 mt-2">This is the narrative foundation of your project. Refine it here before generating scenes.</p>
            </div>

            <div className="glass-card p-8 rounded-xl space-y-6">
                <EditableField 
                    label="Logline" 
                    description="A single, powerful sentence that captures your entire story. This is your north star."
                    value={editableBible.logline} 
                    onChange={(v) => handleFieldChange('logline', v)} 
                    rows={2} 
                />
                
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <div>
                             <label className="block text-sm font-medium text-gray-300">Characters</label>
                             <p className="text-xs text-gray-400 mt-1">Introduce your key players. Give them a compelling hook.</p>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-lg">
                            <TabButton active={charTab === 'edit'} onClick={() => setCharTab('edit')}>Edit</TabButton>
                            <TabButton active={charTab === 'preview'} onClick={() => setCharTab('preview')}>Preview</TabButton>
                        </div>
                    </div>
                    {charTab === 'edit' ? (
                        <textarea
                            value={editableBible.characters}
                            onChange={(e) => handleFieldChange('characters', e.target.value)}
                            rows={8}
                            className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-200 p-3"
                        />
                    ) : (
                         <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300 bg-gray-900/50 p-4 rounded-md border border-gray-700/50 min-h-[210px]">
                            <div dangerouslySetInnerHTML={createMarkup(editableBible.characters)} />
                        </div>
                    )}
                </div>

                <EditableField 
                    label="Setting" 
                    description="Describe the world, time, and atmosphere. What does it feel like to be there?"
                    value={editableBible.setting} 
                    onChange={(v) => handleFieldChange('setting', v)} 
                    rows={4} 
                />
                
                <div>
                    <div className="flex justify-between items-center mb-2">
                         <div>
                            <label className="block text-sm font-medium text-gray-300">Plot Outline (The Hero's Journey)</label>
                            <p className="text-xs text-gray-400 mt-1">Structure your narrative. Using a classic structure like the Hero's Journey creates a resonant story.</p>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-lg">
                           <TabButton active={plotTab === 'edit'} onClick={() => setPlotTab('edit')}>Edit</TabButton>
                           <TabButton active={plotTab === 'preview'} onClick={() => setPlotTab('preview')}>Preview</TabButton>
                        </div>
                    </div>
                     {plotTab === 'edit' ? (
                        <textarea
                            value={editableBible.plotOutline}
                            onChange={(e) => handleFieldChange('plotOutline', e.target.value)}
                            rows={10}
                            className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-200 p-3"
                        />
                    ) : (
                        <div className="mt-4 prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300 bg-gray-900/50 p-4 rounded-md border border-gray-700/50 min-h-[260px] max-h-80 overflow-y-auto">
                            <div dangerouslySetInnerHTML={createMarkup(editableBible.plotOutline)} />
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-gray-700/50">
                    <button
                        onClick={handleRefine}
                        disabled={isLoading || isRefining}
                        className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-yellow-600 text-white font-semibold rounded-full shadow-sm transition-colors hover:bg-yellow-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                         {isRefining ? 'Refining...' : <><SparklesIcon className="mr-2 h-5 w-5" /> Refine with AI</>}
                    </button>
                    <div className="flex gap-4">
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges || isLoading}
                            className="inline-flex items-center justify-center px-6 py-2 bg-gray-600 text-white font-semibold rounded-full shadow-sm transition-colors hover:bg-gray-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                        >
                            <SaveIcon className="mr-2 h-5 w-5" />
                            Save Changes
                        </button>
                        <button
                            onClick={onGenerateScenes}
                            disabled={isLoading || hasChanges}
                            className="inline-flex items-center justify-center px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transform hover:scale-105"
                        >
                            <ClapperboardIcon className="mr-2 h-5 w-5" />
                            Set Vision & Generate Scenes
                        </button>
                    </div>
                </div>
                 {hasChanges && <p className="text-center text-yellow-400 text-sm mt-2">You have unsaved changes. Please save before proceeding.</p>}
            </div>
        </div>
    );
};

export default StoryBibleEditor;