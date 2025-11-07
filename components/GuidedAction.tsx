
import React from 'react';
import SparklesIcon from './icons/SparklesIcon';

interface GuidedActionProps {
    title: string;
    description: string;
    buttonText: string;
    onClick: () => void;
    isLoading?: boolean;
    icon?: React.ReactNode;
}

const GuidedAction: React.FC<GuidedActionProps> = ({ title, description, buttonText, onClick, isLoading = false, icon }) => {
    return (
        <div className="text-center p-8 bg-gray-800/30 rounded-lg border-2 border-dashed border-indigo-700/50 flex flex-col items-center justify-center animate-breathing-glow my-6">
            <div className="mb-4 text-indigo-400">
                {icon || <SparklesIcon className="w-12 h-12" />}
            </div>
            <h3 className="text-xl font-bold text-gray-100">{title}</h3>
            <p className="text-gray-400 mt-2 max-w-md">{description}</p>
            <button
                onClick={onClick}
                disabled={isLoading}
                className="mt-6 inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-indigo-700 disabled:bg-gray-500 transform hover:scale-105"
            >
                {isLoading ? 'Processing...' : buttonText}
            </button>
        </div>
    );
};

export default GuidedAction;
