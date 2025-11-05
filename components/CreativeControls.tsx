import React from 'react';
import { CreativeEnhancers } from '../types';
import CameraIcon from './icons/CameraIcon';
import DancerIcon from './icons/DancerIcon';
import PaintBrushIcon from './icons/PaintBrushIcon';
import FramingIcon from './icons/FramingIcon';
import LensIcon from './icons/LensIcon';
import LightingIcon from './icons/LightingIcon';
import VfxIcon from './icons/VfxIcon';
import DramaMaskIcon from './icons/DramaMaskIcon';
import Tooltip from './Tooltip';
import { CINEMATIC_TERMS } from '../utils/cinematicTerms';

interface CreativeControlsProps {
  value: Partial<Omit<CreativeEnhancers, 'transitions'>>;
  onChange: (value: Partial<Omit<CreativeEnhancers, 'transitions'>>) => void;
}

const FRAMING_OPTIONS = ["Bird's-Eye View", "Close-Up", "Cowboy Shot", "Establishing Shot", "Extreme Close-Up", "Full Shot", "High Angle", "Low Angle", "Medium Shot", "Over-the-Shoulder", "Point of View", "Two Shot", "Wide Shot", "Worm's-Eye View"];
const MOVEMENT_OPTIONS = ["Arc Shot", "Crane/Jib Shot", "Dolly Zoom", "Dutch Tilt", "Follow Shot", "Handheld", "Pan", "Pull Out", "Push In", "Static Shot", "Steadicam", "Tilt", "Tracking Shot", "Whip Pan", "Zoom In/Out"];
const LENS_OPTIONS = ["Anamorphic", "Bokeh", "Deep Focus", "Fisheye Lens", "Lens Flare", "Rack Focus", "Shallow Depth of Field", "Soft Focus", "Split Diopter", "Telephoto", "Tilt-Shift", "Wide-Angle"];
const PACING_OPTIONS = ["Bullet Time", "Chaotic", "Cross-Cutting", "Fast-Paced", "Freeze Frame", "Graceful", "Jump Cut", "Long Take", "Montage", "Slow Motion", "Smash Cut", "Speed Ramp"];
const LIGHTING_OPTIONS = ["Low-Key (Chiaroscuro)", "High-Key", "Backlight / Rim Light", "Golden Hour", "Neon Glow", "Hard Lighting"];
const MOOD_OPTIONS = ["Suspenseful", "Epic", "Gritty", "Dreamlike", "Tense", "Energetic", "Nostalgic"];
const VFX_OPTIONS = ["Bleach Bypass", "Chromatic Aberration", "Color Grading (Teal & Orange)", "Day-for-Night", "Desaturated", "Film Grain", "Glitch Effect", "Glow/Bloom", "High Contrast", "Lens Dirt/Smudges", "Light Leaks", "Motion Blur", "Particle Effects", "Scanlines", "VHS Look", "Vignette"];
const PLOT_ENHANCEMENTS_OPTIONS = ["Add Character Action", "Introduce Conflict", "Foreshadowing Moment", "Heighten Emotion", "Add Dialogue Snippet", "Reveal a Detail"];

const ControlButton: React.FC<{ label: string; selected: boolean; onClick: () => void; description: string; }> = ({ label, selected, onClick, description }) => (
    <Tooltip text={description}>
        <button
            onClick={onClick}
            className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${selected ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-700 hover:border-gray-500'}`}
        >
            {label}
        </button>
    </Tooltip>
)

const ControlSection: React.FC<{ title: string; icon: React.ReactNode; options: string[]; selected: string[]; onToggle: (option: string) => void; categoryId: keyof typeof CINEMATIC_TERMS; }> = 
({ title, icon, options, selected, onToggle, categoryId }) => {
    return (
    <div>
        <label className="flex items-center text-sm font-medium text-gray-300 mb-3">
            {icon}
            {title}
        </label>
        <div className="flex flex-wrap gap-2">
            {options.map(option => (
                <ControlButton 
                    key={option}
                    label={option} 
                    selected={selected.includes(option)}
                    onClick={() => onToggle(option)}
                    description={CINEMATIC_TERMS[categoryId]?.[option] || ''}
                />
            ))}
        </div>
    </div>
    );
};


const CreativeControls: React.FC<CreativeControlsProps> = ({ value, onChange }) => {

    const handleToggle = (category: keyof Omit<CreativeEnhancers, 'transitions' | 'plotEnhancements'>, option: string) => {
        const currentSelection = value[category] || [];
        const newSelection = currentSelection.includes(option)
            ? currentSelection.filter(item => item !== option)
            : [...currentSelection, option];
        
        onChange({
            ...value,
            [category]: newSelection,
        });
    };
    
    const handlePlotToggle = (category: 'plotEnhancements', option: string) => {
        const currentSelection = value[category] || [];
        const newSelection = currentSelection.includes(option)
            ? currentSelection.filter(item => item !== option)
            : [...currentSelection, option];

        onChange({
            ...value,
            [category]: newSelection,
        });
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 p-1">
            <ControlSection 
                title="Framing & Angle"
                icon={<FramingIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                options={FRAMING_OPTIONS}
                selected={value.framing || []}
                onToggle={(option) => handleToggle('framing', option)}
                categoryId="framing"
            />
            <ControlSection 
                title="Camera Movement"
                icon={<CameraIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                options={MOVEMENT_OPTIONS}
                selected={value.movement || []}
                onToggle={(option) => handleToggle('movement', option)}
                categoryId="movement"
            />
             <ControlSection 
                title="Lens & Focus"
                icon={<LensIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                options={LENS_OPTIONS}
                selected={value.lens || []}
                onToggle={(option) => handleToggle('lens', option)}
                categoryId="lens"
            />
            <ControlSection 
                title="Editing & Pacing"
                icon={<DancerIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                options={PACING_OPTIONS}
                selected={value.pacing || []}
                onToggle={(option) => handleToggle('pacing', option)}
                categoryId="pacing"
            />
             <ControlSection 
                title="Plot & Action"
                icon={<DramaMaskIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                options={PLOT_ENHANCEMENTS_OPTIONS}
                selected={value.plotEnhancements || []}
                onToggle={(option) => handlePlotToggle('plotEnhancements', option)}
                categoryId="plotEnhancements"
            />
            <ControlSection 
                title="Lighting Style"
                icon={<LightingIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                options={LIGHTING_OPTIONS}
                selected={value.lighting || []}
                onToggle={(option) => handleToggle('lighting', option)}
                categoryId="lighting"
            />
            <ControlSection 
                title="Mood & Tone"
                icon={<PaintBrushIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                options={MOOD_OPTIONS}
                selected={value.mood || []}
                onToggle={(option) => handleToggle('mood', option)}
                categoryId="mood"
            />
             <ControlSection 
                title="Visual Style & VFX"
                icon={<VfxIcon className="w-5 h-5 mr-2 text-indigo-400" />}
                options={VFX_OPTIONS}
                selected={value.vfx || []}
                onToggle={(option) => handleToggle('vfx', option)}
                categoryId="vfx"
            />
        </div>
    )
}

export default CreativeControls;