import React from 'react';
import SparklesIcon from './icons/SparklesIcon';

interface ApiKeySelectionScreenProps {
  onSelectKey: () => void;
}

const ApiKeySelectionScreen: React.FC<ApiKeySelectionScreenProps> = ({ onSelectKey }) => {
  return (
    <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center">
      <div className="text-center max-w-lg p-8">
        <SparklesIcon className="w-16 h-16 mx-auto text-indigo-400 mb-6" />
        <h1 className="text-3xl font-bold text-white mb-4">Video Generation Requires an API Key</h1>
        <p className="text-gray-400 mb-8">
          To use the advanced video generation features powered by Google's Veo model, you need to select an API key associated with a project that has billing enabled.
        </p>
        <button
          onClick={onSelectKey}
          className="inline-flex items-center justify-center w-full px-8 py-4 bg-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 transform hover:scale-105"
        >
          Select API Key to Continue
        </button>
        <p className="text-xs text-gray-500 mt-4">
          For more information on setting up billing, please visit the{' '}
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:underline"
          >
            official documentation
          </a>.
        </p>
      </div>
    </div>
  );
};

export default ApiKeySelectionScreen;