import React from 'react';
import BookOpenIcon from './icons/BookOpenIcon';
import ClapperboardIcon from './icons/ClapperboardIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';
import LightbulbIcon from './icons/LightbulbIcon';
import PaintBrushIcon from './icons/PaintBrushIcon';

interface WelcomeGuideModalProps {
    onClose: () => void;
}

const workflowSteps = [
    { icon: <LightbulbIcon className="w-8 h-8"/>, title: "1. Start with an Idea", description: "Provide a simple concept, or let our AI inspire you with suggestions." },
    { icon: <BookOpenIcon className="w-8 h-8"/>, title: "2. Build Your Story Bible", description: "Flesh out your idea into a logline, characters, setting, and plot. The AI helps you refine every detail." },
    { icon: <PaintBrushIcon className="w-8 h-8"/>, title: "3. Set the Director's Vision", description: "Define the cinematic style. Will it be gritty neo-noir, a Ghibli-style animation, or something else?" },
    { icon: <ClapperboardIcon className="w-8 h-8"/>, title: "4. Direct Your Scenes", description: "Break your story into scenes and shot lists. The AI Co-Director helps you enhance your creative choices." },
    { icon: <ClipboardCheckIcon className="w-8 h-8"/>, title: "5. Review & Iterate", description: "Generate videos with the exported prompts, then upload them here for AI analysis, creating a powerful feedback loop to improve your story." },
];


const WelcomeGuideModal: React.FC<WelcomeGuideModalProps> = ({ onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-dialog-title"
        >
            <div 
                className="bg-gray-800/90 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" 
            >
                <div className="p-6 text-center border-b border-gray-700">
                     <h1 id="welcome-dialog-title" className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-300">
                        Welcome to the Cinematic Story Generator
                    </h1>
                    <p className="mt-2 text-gray-300">Your journey from a single idea to a complete cinematic blueprint starts here.</p>
                </div>

                <div className="p-8 overflow-y-auto space-y-6">
                    {workflowSteps.map((step, index) => (
                         <div key={index} className="flex items-start gap-5">
                             <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-gray-700/50 text-amber-300">
                                 {step.icon}
                             </div>
                             <div>
                                <h3 className="text-lg font-bold text-gray-100">{step.title}</h3>
                                <p className="text-gray-400 text-sm mt-1">{step.description}</p>
                             </div>
                         </div>
                    ))}
                </div>

                <div className="p-6 mt-auto border-t border-gray-700 text-center bg-gray-900/50 rounded-b-lg">
                    <button
                        data-testid="btn-welcome-dismiss"
                        onClick={onClose}
                        className="w-full sm:w-auto flex items-center justify-center px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:from-amber-700 hover:to-orange-700 transform hover:scale-105"
                    >
                        Let's Get Started
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WelcomeGuideModal;
