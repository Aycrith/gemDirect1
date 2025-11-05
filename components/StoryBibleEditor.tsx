import React from 'react';
import { StoryBible } from '../types';
import BookOpenIcon from './icons/BookOpenIcon';
import { marked } from 'marked';

interface StoryBibleEditorProps {
    storyBible: StoryBible;
    setStoryBible: React.Dispatch<React.SetStateAction<StoryBible | null>>;
    onContinue: () => void;
    isLoading: boolean;
}

const EditableSection: React.FC<{ title: string; content: string; onChange: (value: string) => void; rows?: number; isMarkdown?: boolean }> =
({ title, content, onChange, rows = 3, isMarkdown = false }) => {
    const createMarkup = (markdown: string) => {
        const rawMarkup = marked(markdown, { sanitize: true });
        return { __html: rawMarkup };
    };

    return (
        <div className="bg-gray-800/50 p-4 rounded-md border border-gray-700">
            <label className="block text-sm font-bold text-indigo-400 mb-2">{title}</label>
            {isMarkdown ? (
                <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300 p-3 bg-gray-900/50 border border-gray-600 rounded-md">
                     <div dangerouslySetInnerHTML={createMarkup(content)} />
                </div>
            ) : (
                <textarea
                    value={content}
                    onChange={(e) => onChange(e.target.value)}
                    rows={rows}
                    className="w-full bg-gray-900/50 p-2 border border-gray-600 rounded-md focus:ring-1 focus:ring-indigo-500 text-sm text-gray-300"
                />
            )}
        </div>
    );
};

const StoryBibleEditor: React.FC<StoryBibleEditorProps> = ({ storyBible, setStoryBible, onContinue, isLoading }) => {
    
    const handleFieldChange = (field: keyof StoryBible, value: string) => {
        setStoryBible(prev => prev ? { ...prev, [field]: value } : null);
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="flex items-center text-2xl font-bold text-gray-200 mb-6">
                <BookOpenIcon className="w-7 h-7 mr-3 text-indigo-400" />
                Your Story Bible
            </h2>

            <div className="space-y-6">
                <EditableSection title="Logline" content={storyBible.logline} onChange={v => handleFieldChange('logline', v)} rows={2} />
                <EditableSection title="Characters" content={storyBible.characters} onChange={v => handleFieldChange('characters', v)} isMarkdown />
                <EditableSection title="Setting" content={storyBible.setting} onChange={v => handleFieldChange('setting', v)} isMarkdown />
                <EditableSection title="Plot Outline (3 Acts)" content={storyBible.plotOutline} onChange={v => handleFieldChange('plotOutline', v)} isMarkdown />
            </div>

            <div className="mt-8 text-center">
                <button
                    onClick={onContinue}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center px-8 py-3 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                >
                    {isLoading ? 'Processing...' : 'Continue to Scene Breakdown'}
                </button>
            </div>
        </div>
    );
};

export default StoryBibleEditor;