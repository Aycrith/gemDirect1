import React from 'react';
import { LocalGenerationStatus as LocalGenerationStatusType } from '../types';
import ServerIcon from './icons/ServerIcon';

interface Props {
    status: LocalGenerationStatusType;
    onClear: () => void;
}

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
    <div className="w-full bg-gray-700 rounded-full h-2.5 my-1">
        <div 
            className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300" 
            style={{ width: `${progress}%` }}
        ></div>
    </div>
);

const LocalGenerationStatus: React.FC<Props> = ({ status, onClear }) => {
    if (status.status === 'idle') {
        return null;
    }

    const isLoading = status.status === 'queued' || status.status === 'running';

    return (
        <div className="mb-6 p-4 bg-gray-900/50 border border-gray-700 rounded-lg fade-in">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="flex items-center text-lg font-semibold text-gray-200">
                        <ServerIcon className={`w-5 h-5 mr-3 ${isLoading ? 'animate-pulse text-indigo-400' : 'text-gray-400'}`} />
                        Local Generation Status
                    </h3>
                    <p className="text-sm text-indigo-300 font-mono mt-1">{status.message}</p>
                </div>
                {status.status === 'complete' || status.status === 'error' ? (
                     <button onClick={onClear} className="text-sm font-semibold text-gray-400 hover:text-white">Clear</button>
                ): null}
            </div>

            {(status.status === 'running' || (status.status === 'complete' && status.final_output)) && (
                <div className="mt-4">
                    {status.status === 'running' && <ProgressBar progress={status.progress} />}
                    {status.status === 'complete' && status.final_output && (
                        <div>
                            <h4 className="text-md font-bold text-green-400 mb-2 text-center">Generation Complete</h4>
                            <div className="max-w-md mx-auto bg-black rounded-lg overflow-hidden shadow-lg border border-gray-600">
                                {status.final_output.type === 'image' ? (
                                    <img src={status.final_output.data} alt={status.final_output.filename} className="w-full aspect-video object-contain" />
                                ) : (
                                    <video src={status.final_output.data} className="w-full aspect-video" controls autoPlay loop muted />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(LocalGenerationStatus);