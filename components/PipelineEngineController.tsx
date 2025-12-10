import React, { useEffect } from 'react';
import { pipelineEngine } from '../services/pipelineEngine';
import { PipelineStatusPanel } from './PipelineStatusPanel';

export const PipelineEngineController: React.FC = () => {
    useEffect(() => {
        pipelineEngine.start();
        return () => {
            pipelineEngine.stop();
        };
    }, []);

    return <PipelineStatusPanel />;
};
