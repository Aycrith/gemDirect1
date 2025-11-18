import React from 'react';
import { useLastE2EQAResult } from '../utils/hooks';
import RefreshCwIcon from './icons/RefreshCwIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';

const E2EQACard: React.FC<{ onSelectScene?: (sceneId: string) => void }> = ({ onSelectScene }) => {
  const { result, loading, error, refresh } = useLastE2EQAResult();

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-200">E2E QA Status</h3>
          <RefreshCwIcon className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
        <p className="text-sm text-gray-400">Loading latest QA results...</p>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-200">E2E QA Status</h3>
          <button
            onClick={refresh}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
            title="Refresh"
          >
            <RefreshCwIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center py-4">
          <AlertTriangleIcon className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-sm text-gray-400">
            {error || 'No E2E QA results found. Run "npm run e2e:smoke" to generate.'}
          </p>
        </div>
      </div>
    );
  }

  const successfulScenes = result.scenes.filter(s => s.frameCount > 0).length;
  const totalScenes = result.scenes.length;
  const hasFlags = result.scenes.some(s => s.flags.length > 0);
  const helperSummary = result.helperSummary;
  const formatPathSegment = (value?: string) => {
    if (!value) {
      return undefined;
    }
    const segments = value.split(/[\\/]/);
    return segments[segments.length - 1] || value;
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-200">E2E QA Status</h3>
        <button
          onClick={refresh}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          title="Refresh"
        >
          <RefreshCwIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Last Run:</span>
          <span className="text-sm text-gray-200">{result.runId}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Timestamp:</span>
          <span className="text-sm text-gray-200">
            {new Date(result.timestamp).toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Scenes Generated:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200">
              {successfulScenes}/{totalScenes}
            </span>
            {successfulScenes === totalScenes ? (
              <CheckCircleIcon className="w-4 h-4 text-green-400" />
            ) : (
              <AlertTriangleIcon className="w-4 h-4 text-yellow-400" />
            )}
          </div>
        </div>

        {hasFlags && (
          <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-700/50 rounded">
            <p className="text-xs text-yellow-300 mb-2">
              Some scenes have quality flags. Click on a scene below to navigate to it:
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {result.scenes.filter(s => s.flags.length > 0).map((scene, index) => (
                <button
                  key={index}
                  onClick={() => onSelectScene?.(scene.id)}
                  className="w-full text-left p-2 bg-yellow-900/40 border border-yellow-700/50 rounded text-xs text-yellow-200 hover:bg-yellow-900/60 transition-colors"
                >
                  Scene {scene.id}: {scene.flags.join(', ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {helperSummary && (
          <div className="mt-3 p-3 space-y-1 bg-gray-900/60 border border-gray-700 rounded-md text-xs text-gray-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-200">ComfyUI Status</span>
              <span className="text-[11px] text-gray-500">{new Date(helperSummary.timestamp).toLocaleTimeString()}</span>
            </div>
            <p className="text-xs text-gray-400">
              Queue: Running {helperSummary.queue?.running ?? 0}, Pending {helperSummary.queue?.pending ?? 0}
            </p>
            {helperSummary.systemStats?.summary && (
              <p className="text-xs text-gray-400">System: {helperSummary.systemStats.summary}</p>
            )}
            {helperSummary.systemStats?.warning && (
              <p className="text-xs text-yellow-300">Warning: {helperSummary.systemStats.warning}</p>
            )}
            <div className="space-y-1">
              {helperSummary.workflows.map(profile => (
                <div key={profile.id} className="text-xs text-gray-200">
                  <span className="font-medium">{profile.label}:</span>
                  <span className="ml-1 text-gray-400">
                    {profile.hasTextMapping ? 'Text mapped' : 'Text missing'}
                  </span>
                  <span className="ml-2 text-gray-400">
                    {profile.hasKeyframeMapping ? 'Keyframe mapped' : 'Keyframe missing'}
                  </span>
                  {profile.warnings.length > 0 && (
                    <span className="ml-2 text-yellow-400">{profile.warnings.join(' | ')}</span>
                  )}
                </div>
              ))}
            </div>
            {helperSummary.workflowFiles.some(file => !file.exists) && (
              <p className="text-xs text-yellow-300">
                Missing workflows: {helperSummary.workflowFiles.filter(file => !file.exists).map(file => formatPathSegment(file.path)).join(', ')}
              </p>
            )}
            <div className="text-xs text-gray-500">
              {helperSummary.helperLogPath && (
                <span>Helper log: {formatPathSegment(helperSummary.helperLogPath)}</span>
              )}
              {helperSummary.helperLogPath && result.helperSummaryPath && <span className="px-1">*</span>}
              {result.helperSummaryPath && (
                <span>Summary: {formatPathSegment(result.helperSummaryPath)}</span>
              )}
            </div>
          </div>
        )}
        <div className="text-xs text-gray-500 mt-2">
          Run <code className="bg-gray-700 px-1 py-0.5 rounded">npm run e2e:smoke</code> to update
        </div>
      </div>
    </div>
  );
};

export default E2EQACard;
