
import React, { useState, useCallback } from 'react';
import { LocalGenerationSettings } from '../types';
import { checkServerConnection, validateWorkflowAndMappings } from '../services/comfyUIService';
import ShieldCheckIcon from './icons/ShieldCheckIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';

interface PreflightCheckProps {
    settings: LocalGenerationSettings;
}

type CheckStatus = 'idle' | 'running' | 'success' | 'error';

interface CheckResult {
    status: CheckStatus;
    message: string;
}

const initialCheckState: Record<string, CheckResult> = {
    connection: { status: 'idle', message: '' },
    workflow: { status: 'idle', message: '' },
};

const StatusIndicator: React.FC<{ status: CheckStatus }> = ({ status }) => {
    switch (status) {
        case 'running':
            return <svg className="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>;
        case 'success':
            return <CheckCircleIcon className="h-4 w-4 text-green-400" />;
        case 'error':
            return <AlertTriangleIcon className="h-4 w-4 text-red-400" />;
        default:
            return <div className="h-4 w-4 rounded-full bg-gray-600" />;
    }
};

const PreflightCheck: React.FC<PreflightCheckProps> = ({ settings }) => {
    const [checkResults, setCheckResults] = useState(initialCheckState);
    const [isChecking, setIsChecking] = useState(false);

    const runChecks = useCallback(async () => {
        setIsChecking(true);
        setCheckResults(initialCheckState);

        // Check 1: Server Connection
        setCheckResults(prev => ({ ...prev, connection: { status: 'running', message: 'Pinging server...' }}));
        try {
            await checkServerConnection(settings.comfyUIUrl);
            setCheckResults(prev => ({ ...prev, connection: { status: 'success', message: 'Server connection successful.' }}));
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown error';
            setCheckResults(prev => ({ ...prev, connection: { status: 'error', message: errorMsg }}));
            setIsChecking(false);
            return; // Stop if connection fails
        }
        
        // Check 2: Workflow & Mappings
        setCheckResults(prev => ({ ...prev, workflow: { status: 'running', message: 'Validating workflow & mappings...' }}));
        try {
            validateWorkflowAndMappings(settings);
            setCheckResults(prev => ({ ...prev, workflow: { status: 'success', message: 'Workflow and mappings are consistent.' }}));
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown error';
            setCheckResults(prev => ({ ...prev, workflow: { status: 'error', message: errorMsg }}));
        }

        setIsChecking(false);
    }, [settings]);

    // Fix: Explicitly type `r` as `CheckResult` to fix type inference issue.
    const overallStatus = Object.values(checkResults).every((r: CheckResult) => r.status === 'success')
        ? 'success'
        : Object.values(checkResults).some((r: CheckResult) => r.status === 'error')
        ? 'error'
        : 'idle';

    return (
        <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg ring-1 ring-gray-700/50">
            <h4 className="font-semibold text-gray-200 flex items-center">
                <ShieldCheckIcon className="w-5 h-5 mr-2 text-gray-400" />
                Intelligent Pre-flight Check
            </h4>
            <p className="text-xs text-gray-400">
                Run this diagnostic to ensure your settings are correct before starting a local generation. It verifies the server connection and workflow integrity.
            </p>

            <button
                onClick={runChecks}
                disabled={isChecking}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500 transition-colors"
            >
                {isChecking ? 'Running Diagnostics...' : 'Run System Check'}
            </button>

            {checkResults.connection.status !== 'idle' && (
                <div className="mt-4 space-y-2 text-sm">
                    {Object.entries({
                        'Server Connection': checkResults.connection,
                        'Workflow & Mapping Consistency': checkResults.workflow,
                    }).map(([label, result]) => (
                        <div key={label} className="p-2 bg-gray-800/50 rounded-md">
                           <div className="flex items-start gap-2">
                                <StatusIndicator status={result.status} />
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-200">{label}</p>
                                    <p className={`text-xs whitespace-pre-wrap ${result.status === 'error' ? 'text-red-300' : 'text-gray-400'}`}>
                                        {result.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                    {overallStatus === 'success' && (
                        <p className="text-sm font-bold text-green-400 text-center py-2">
                            System Ready for Local Generation!
                        </p>
                    )}
                     {overallStatus === 'error' && (
                        <p className="text-sm font-bold text-red-400 text-center py-2">
                           Please resolve the issues above before generating.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default PreflightCheck;