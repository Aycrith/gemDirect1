import React from 'react';
import SparklesIcon from './icons/SparklesIcon';

interface AnalyzeButtonProps {
    onClick: () => void;
    isLoading: boolean;
    disabled?: boolean;
}

const AnalyzeButton: React.FC<AnalyzeButtonProps> = ({ onClick, isLoading, disabled }) => {
    const isButtonDisabled = isLoading || disabled;

    return (
        <div className="my-8 text-center">
            <button
                onClick={onClick}
                disabled={isButtonDisabled}
                className="inline-flex items-center justify-center px-8 py-4 bg-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                aria-disabled={isButtonDisabled}
            >
                {isLoading ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Analyzing...
                    </>
                ) : (
                    <>
                        <SparklesIcon className="mr-3 h-6 w-6" />
                        Analyze Cinematic Action
                    </>
                )}
            </button>
        </div>
    );
};

export default AnalyzeButton;