import React from 'react';
import FilmIcon from './icons/FilmIcon';

interface VeoGenerationStatusProps {
    message: string;
}

const VeoGenerationStatus: React.FC<VeoGenerationStatusProps> = ({ message }) => {
    return (
        <div className="flex flex-col items-center justify-center text-center p-8 bg-gray-900/50 rounded-lg h-full">
            <div className="relative mb-4">
                <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-indigo-400"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <FilmIcon className="w-8 h-8 text-indigo-400" />
                </div>
            </div>
            <p className="text-lg font-semibold text-gray-200">Generating Your Video...</p>
            <p className="text-sm text-gray-400 mt-2 max-w-xs">{message}</p>
        </div>
    );
};

export default React.memo(VeoGenerationStatus);