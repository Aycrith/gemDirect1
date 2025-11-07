import React from 'react';

interface ToggleSwitchProps {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ id, checked, onChange }) => {
    return (
        <label htmlFor={id} className="relative inline-flex items-center cursor-pointer">
            <input 
                type="checkbox" 
                id={id} 
                className="sr-only peer" 
                checked={checked} 
                onChange={(e) => onChange(e.target.checked)} 
            />
            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-4 peer-focus:ring-indigo-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
    );
};


interface GenerationControlsProps {
    mitigateViolence: boolean;
    setMitigateViolence: (value: boolean) => void;
    enhanceRealism: boolean;
    setEnhanceRealism: (value: boolean) => void;
}

const GenerationControls: React.FC<GenerationControlsProps> = ({
    mitigateViolence,
    setMitigateViolence,
    enhanceRealism,
    setEnhanceRealism,
}) => {
    return (
        <div className="space-y-4">
             <h3 className="block text-sm font-medium text-gray-300 mb-2">
                Generation Guardrails & Style Locks
            </h3>
            <div className="flex items-start justify-between">
                <div>
                    <label htmlFor="violence-toggle" className="font-medium text-gray-200">Mitigate Violence & Graphic Content</label>
                    <p className="text-xs text-gray-400 mt-1">Adds automated negative prompts to reduce the chance of generating violent or graphic content.</p>
                </div>
                <ToggleSwitch id="violence-toggle" checked={mitigateViolence} onChange={setMitigateViolence} />
            </div>

            <div className="flex items-start justify-between">
                <div>
                    <label htmlFor="realism-toggle" className="font-medium text-gray-200">Enhance Realism (Anti-Smudge)</label>
                    <p className="text-xs text-gray-400 mt-1">Adds advanced prompts to avoid AI artifacts like smudging and watercolor effects, aiming for photorealism.</p>
                </div>
                 <ToggleSwitch id="realism-toggle" checked={enhanceRealism} onChange={setEnhanceRealism} />
            </div>
        </div>
    );
};

export default GenerationControls;
