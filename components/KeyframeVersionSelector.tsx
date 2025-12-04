import React from 'react';
import { isVersionedKeyframe, KeyframeData, KeyframeVersionedData } from '../types';
import ClockIcon from './icons/ClockIcon';

interface KeyframeVersionSelectorProps {
    sceneId: string;
    keyframeData: KeyframeData;
    onSelectVersion: (sceneId: string, versionIndex: number) => void;
}

/**
 * Dropdown selector for keyframe version history.
 * Only shown when keyframeData has version history (KeyframeVersionedData type).
 */
const KeyframeVersionSelector: React.FC<KeyframeVersionSelectorProps> = ({
    sceneId,
    keyframeData,
    onSelectVersion,
}) => {
    // Only show for versioned keyframes with history
    if (!isVersionedKeyframe(keyframeData) || keyframeData.versions.length <= 1) {
        return null;
    }

    const versionedData = keyframeData as KeyframeVersionedData;
    const currentIndex = versionedData.selectedVersionIndex ?? 0;
    
    const formatTimestamp = (ts: number): string => {
        const date = new Date(ts);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatScore = (score?: { overall: number }): string => {
        return score?.overall !== undefined ? ` (${score.overall.toFixed(1)}/10)` : '';
    };

    return (
        <div className="flex items-center gap-2 mb-2">
            <ClockIcon className="w-4 h-4 text-gray-400" />
            <label htmlFor={`version-select-${sceneId}`} className="text-xs text-gray-400">
                Version:
            </label>
            <select
                id={`version-select-${sceneId}`}
                value={currentIndex}
                onChange={(e) => onSelectVersion(sceneId, parseInt(e.target.value, 10))}
                className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
                {versionedData.versions.map((version, idx) => (
                    <option key={idx} value={idx}>
                        #{idx + 1} - {formatTimestamp(version.timestamp)}{formatScore(version.score)}
                    </option>
                ))}
            </select>
            <span className="text-xs text-gray-500">
                ({versionedData.versions.length} total)
            </span>
        </div>
    );
};

export default KeyframeVersionSelector;
