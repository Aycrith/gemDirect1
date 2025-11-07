
import React, { useState, useCallback } from 'react';
import { StoryBible } from '../types';
import { marked } from 'marked';
import { refineStoryBibleSection, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';
import BookOpenIcon from './icons/BookOpenIcon';
import SparklesIcon from './icons/SparklesIcon';
import SaveIcon from './icons/SaveIcon';
import ClapperboardIcon from './icons/ClapperboardIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';
import { useInteractiveSpotlight } from '../utils/hooks';
import GuideCard from './GuideCard';

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
        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${active ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'}`}
    >
        {children}
    </button>
);


const EditableField: React.FC<{ label: string; description: string; value: string; onChange: (value: string) => void; rows?: number }> = ({ label, description, value, onChange, rows = 3 }) => {
    
    const getPlaceholder = () => {
        switch (label) {
            case 'Logline':
                return "e.g., A retired detective is pulled back for one last case that threatens to unravel his past.";
            case 'Setting':
                return "e.g., A rain-slicked, neon-lit metropolis in the year 2049, where technology and decay coexist.";
            default:
                return `Describe the ${label.toLowerCase()} here...`;
        }
    };
    
    return (
        <div>
            <label className="block text-sm font-medium text-gray-300">{label}</label>
            <p className="text-xs text-gray-400 mt-1 mb-2">{description}</p>
            <textarea
                value={value}
                placeholder={getPlaceholder()}
                onChange={(e) => onChange(e.target.value)}
                rows={rows}
                className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:shadow-indigo-500/30 shadow-black/30 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3 transition-all duration-300"
            />
        </div>
    );
};

const StoryBibleEditor: React.FC<StoryBibleEditorProps> = ({ storyBible, onUpdate, onGenerateScenes, isLoading, onApiStateChange, onApiLog }) => {
    const [editableBible, setEditableBible] = useState(storyBible);
    const [charTab, setCharTab] = useState<'edit' | 'preview'>('edit');
    const [plotTab, setPlotTab] = useState<'edit' | 'preview'>('edit');
    const spotlightRef = useInteractiveSpotlight<HTMLDivElement>();

    const [previewContent, setPreviewContent] = useState({ characters: '', plotOutline: '' });
    const [isPreviewLoading, setIsPreviewLoading] = useState({ characters: false, plotOutline: false });

    const handleFieldChange = (field: keyof StoryBible, value: string) => {
        setEditableBible(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onUpdate(editableBible);
    };

    const createMarkup = (markdown: string) => {
        const rawMarkup = marked.parse(markdown);
        return { __html: rawMarkup as string };
    };
    
    const handleGeneratePreview = async (section: 'characters' | 'plotOutline') => {
        const currentContent = editableBible[section];
        setIsPreviewLoading(prev => ({ ...prev, [section]: true }));
        setPreviewContent(prev => ({ ...prev, [section]: '' })); // Clear previous preview
        try {
            const refinedText = await refineStoryBibleSection(
                section,
                currentContent,
                { logline: editableBible.logline },
                onApiLog,
                onApiStateChange
            );
            setPreviewContent(prev => ({ ...prev, [section]: refinedText }));
        } catch(e) {
            console.error(e);
            // Error toast handled by service
        } finally {
            setIsPreviewLoading(prev => ({ ...prev, [section]: false }));
        }
    };
    
    const handleTabClick = (section: 'characters' | 'plotOutline', tab: 'edit' | 'preview') => {
        if (section === 'characters') setCharTab(tab);
        if (section === 'plotOutline') setPlotTab(tab);

        if (tab === 'preview') {
            handleGeneratePreview(section);
        }
    };

    const acceptPreview = (section: 'characters' | 'plotOutline') => {
        if (previewContent[section]) {
            handleFieldChange(section, previewContent[section]);
            if (section === 'characters') setCharTab('edit');
            if (section === 'plotOutline') setPlotTab('edit');
        }
    };

    const hasChanges = JSON.stringify(storyBible) !== JSON.stringify(editableBible);

    const renderPreviewPane = (section: 'characters' | 'plotOutline') => (
        <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300 bg-gray-900/50 p-4 rounded-md border border-gray-700/50 min-h-[210px] relative">
            {isPreviewLoading[section] ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/50">
                    <svg className="animate-spin h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="mt-3 text-sm text-gray-400">AI is refining...</p>
                </div>
            ) : previewContent[section] ? (
                <>
                    <div dangerouslySetInnerHTML={createMarkup(previewContent[section])} />
                    <div className="absolute top-2 right-2 not-prose">
                        <button 
                            onClick={() => acceptPreview(section)} 
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-500"
                        >
                            <RefreshCwIcon className="w-4 h-4" />
                            Accept & Update
                        </button>
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-gray-500 italic">Click the tab again to re-generate.</p>
                </div>
            )}
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
                <BookOpenIcon className="w-12 h-12 mx-auto text-indigo-400 mb-4" />
                <h2 className="text-3xl font-bold text-gray-100">Your Story Bible</h2>
                <p className="text-gray-400 mt-2">This is the narrative foundation of your project. Refine it here before generating scenes.</p>
            </div>

            <GuideCard title="What is a Story Bible?">
                <p>
                    The Story Bible is the single source of truth for your entire project. Every creative decision flows from here. 
                    Take your time to refine each section. A strong foundation here leads to a much more coherent and compelling final story.
                    Use the <strong className="text-indigo-300">Refine with AI</strong> feature to enhance the AI's initial draft.
                </p>
            </GuideCard>

            <div ref={spotlightRef} className="glass-card p-8 rounded-xl space-y-6 interactive-spotlight">
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
                            <TabButton active={charTab === 'edit'} onClick={() => handleTabClick('characters', 'edit')}>Edit</TabButton>
                            <TabButton active={charTab === 'preview'} onClick={() => handleTabClick('characters', 'preview')}>
                                <SparklesIcon className="w-3 h-3" /> Refine with AI
                            </TabButton>
                        </div>
                    </div>
                    {charTab === 'edit' ? (
                        <textarea
                            value={editableBible.characters}
                            onChange={(e) => handleFieldChange('characters', e.target.value)}
                            rows={8}
                            placeholder="e.g., * **Protagonist:** A grizzled detective haunted by a past failure.
* **Antagonist:** A cunning art thief who leaves behind cryptic clues."
                            className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-200 p-3"
                        />
                    ) : renderPreviewPane('characters')}
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
                           <TabButton active={plotTab === 'edit'} onClick={() => handleTabClick('plotOutline', 'edit')}>Edit</TabButton>
                           <TabButton active={plotTab === 'preview'} onClick={() => handleTabClick('plotOutline', 'preview')}>
                               <SparklesIcon className="w-3 h-3" /> Refine with AI
                           </TabButton>
                        </div>
                    </div>
                     {plotTab === 'edit' ? (
                        <textarea
                            value={editableBible.plotOutline}
                            onChange={(e) => handleFieldChange('plotOutline', e.target.value)}
                            rows={10}
                            placeholder="e.g., * **Act I:** The detective discovers the first crime, reluctantly takes the case...
* **Act II:** A cat-and-mouse game ensues across the city...
* **Act III:** The final confrontation in a museum reveals a shocking truth."
                            className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-200 p-3"
                        />
                    ) : renderPreviewPane('plotOutline')}
                </div>

                <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-6 border-t border-gray-700/50">
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
                            className="inline-flex items-center justify-center px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transform hover:scale-105 animate-glow"
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
