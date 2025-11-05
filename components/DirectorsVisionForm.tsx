import React, { useState } from 'react';
import PaintBrushIcon from './icons/PaintBrushIcon';

interface DirectorsVisionFormProps {
    onSubmit: (vision: string) => void;
    isLoading: boolean;
}

const quickStyles = [
    "Cyberpunk Noir: Moody, atmospheric, neon-drenched cityscapes with high-contrast lighting and themes of existential dread. Think Blade Runner.",
    "Epic Fantasy: Grand, sweeping vistas, majestic castles, and dynamic, action-packed sequences with a sense of wonder. Think Lord of the Rings.",
    "Modern Thriller: Tense, gritty, and realistic. Uses handheld cameras, sterile lighting, and fast-paced editing to create suspense. Think Sicario.",
    "Cosmic Horror: Unsettling, dreamlike, and surreal visuals. Focuses on psychological dread, impossible geometry, and a muted, sickly color palette. Think Annihilation.",
];

const DirectorsVisionForm: React.FC<DirectorsVisionFormProps> = ({ onSubmit, isLoading }) => {
    const [vision, setVision] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (vision.trim()) {
            onSubmit(vision);
        }
    };

    return (
        <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-gray-200 mb-4">Define Your Director's Vision</h2>
            <p className="text-gray-400 mb-6">Describe the overall cinematic style, mood, and aesthetic. This will act as a guardrail, influencing the tone of scenes, camera work, and final visuals.</p>
            
            <form onSubmit={handleSubmit}>
                <textarea
                    value={vision}
                    onChange={(e) => setVision(e.target.value)}
                    rows={4}
                    className="w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3"
                    placeholder="e.g., A fast-paced, kinetic style inspired by Edgar Wright, with whip pans, smash cuts, and a vibrant, saturated color palette."
                />
                <button
                    type="submit"
                    disabled={isLoading || !vision.trim()}
                    className="mt-4 inline-flex items-center justify-center px-8 py-3 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                >
                    {isLoading ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating...
                        </>
                    ) : (
                         <>
                            <PaintBrushIcon className="mr-2 h-5 w-5" />
                            Generate Scenes with this Vision
                        </>
                    )}
                </button>
            </form>

            <div className="mt-8 text-left">
                <p className="text-sm text-gray-500 mb-3">Or get inspired by a style:</p>
                <div className="space-y-2">
                    {quickStyles.map((qs, i) => (
                         <button key={i} onClick={() => setVision(qs)} className="text-left text-sm text-indigo-400 hover:text-indigo-300 bg-gray-800/50 p-3 rounded-md w-full transition-colors">
                            {qs}
                         </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DirectorsVisionForm;