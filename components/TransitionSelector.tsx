import React, { useState, useRef, useEffect } from 'react';
import TransitionsIcon from './icons/TransitionsIcon';
import InfoIcon from './icons/InfoIcon';
import { TRANSITION_OPTIONS, CINEMATIC_TERMS } from '../utils/cinematicTerms';

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
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-300 bg-gray-800/60 border border-gray-700 rounded-full hover:bg-gray-700/80 hover:border-gray-600 transition-colors"
                >
                    <TransitionsIcon className="w-4 h-4" />
                    {selectedTransition}
                    <span className="text-amber-400">{isOpen ? '▴' : '▾'}</span>
                </button>
                {isOpen && (
                    <div className="absolute z-20 bottom-full mb-2 w-72 bg-gray-800 border border-gray-700 rounded-md shadow-lg fade-in">
                        <ul className="p-2">
                           {TRANSITION_OPTIONS.map((option) => (
                                <li key={option}>
                                    <button
                                        onClick={() => handleSelect(option)}
                                        className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-amber-600 rounded-md flex items-center justify-between group"
                                    >
                                       {option}
                                       <div className="relative">
                                           <InfoIcon className="w-4 h-4 text-gray-500" />
                                           <div className="absolute bottom-0 right-full mr-2 w-64 p-2 text-xs text-center text-white bg-gray-900 border border-gray-600 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                               {CINEMATIC_TERMS.transitions[option]}
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

export default React.memo(TransitionSelector);