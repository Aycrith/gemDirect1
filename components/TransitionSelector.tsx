import React, { useState, useRef, useEffect } from 'react';
import TransitionsIcon from './icons/TransitionsIcon';
import InfoIcon from './icons/InfoIcon';

const TRANSITION_OPTIONS: Record<string, string> = {
    "Cut": "The most common transition, an instant change from one shot to another.",
    "Dissolve": "One shot gradually fades out while another fades in, often used to show passage of time.",
    "Wipe": "A line or shape moves across the screen, pushing one shot off and revealing the next.",
    "Match Cut": "Cuts from one shot to another by matching action or composition, creating a strong link.",
    "J-Cut": "The audio from the next scene begins before the video changes.",
    "L-Cut": "The audio from the current scene continues into the next shot.",
    "Whip Pan": "A very fast pan that blurs the image, creating a sense of energy and speed.",
    "Glitch Effect": "A digital distortion effect used as a stylistic transition.",
    "Fade to Black": "The image gradually fades to a black screen, often used to signify an ending.",
};

interface TransitionSelectorProps {
    value: string;
    onChange: (newValue: string) => void;
}

const TransitionSelector: React.FC<TransitionSelectorProps> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (option: string) => {
        onChange(option);
        setIsOpen(false);
    }
    
    const selectedTransition = value || "Select Transition";

    return (
        <div className="flex justify-center my-2" ref={dropdownRef}>
            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-300 bg-gray-700/50 border border-gray-600 rounded-full hover:bg-gray-700 transition-colors"
                >
                    <TransitionsIcon className="w-4 h-4" />
                    {selectedTransition}
                    <span className="text-indigo-400">{isOpen ? '▴' : '▾'}</span>
                </button>
                {isOpen && (
                    <div className="absolute z-20 bottom-full mb-2 w-72 bg-gray-800 border border-gray-700 rounded-md shadow-lg">
                        <ul className="p-2">
                           {Object.entries(TRANSITION_OPTIONS).map(([option, description]) => (
                                <li key={option}>
                                    <button
                                        onClick={() => handleSelect(option)}
                                        className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-indigo-600 rounded-md flex items-center justify-between group"
                                    >
                                       {option}
                                       <div className="relative">
                                           <InfoIcon className="w-4 h-4 text-gray-500" />
                                           <div className="absolute bottom-0 right-full mr-2 w-64 p-2 text-xs text-center text-white bg-gray-900 border border-gray-600 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                               {description}
                                           </div>
                                       </div>
                                    </button>
                                </li>
                           ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransitionSelector;