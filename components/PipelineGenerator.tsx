import React from 'react';
import { StoryToVideoResult } from '../services/storyToVideoPipeline';

type Props = {
    onOpenInDirectorMode?: (result: StoryToVideoResult, prompt?: string) => void;
};

const PipelineGenerator: React.FC<Props> = ({ onOpenInDirectorMode }) => {
    const handleOpen = () => {
        if (onOpenInDirectorMode) {
            // Provide a minimal stub result so callers can import it as a quick-project
            const stubResult: StoryToVideoResult = {
                storyId: 'stub-story',
                storyBible: {
                    logline: 'Stub logline',
                    characters: 'Stub characters',
                    setting: 'Stub setting',
                    plotOutline: 'Stub plot'
                },
                scenes: [],
                totalDuration: 0,
                status: 'complete'
            };
            onOpenInDirectorMode(stubResult, 'quick generate (stub)');
        }
    };

    return (
        <div className="pipeline-generator p-4 bg-gray-800 rounded-md">
            <h3 className="text-lg font-semibold text-amber-300">Quick Generate</h3>
            <p className="text-sm text-gray-400">Run a quick generation to create a small demo project (stubbed in test env).</p>
            <div className="mt-3">
                <button
                    data-testid="btn-open-in-director"
                    onClick={handleOpen}
                    className="px-3 py-1 rounded-md bg-amber-600 text-white"
                >
                    Open in Director Mode
                </button>
            </div>
        </div>
    );
};

export default PipelineGenerator;
