

import React from 'react';
import CompassIcon from './icons/CompassIcon';

interface GuideCardProps {
    title: string;
    children: React.ReactNode;
    icon?: React.ReactNode;
}

const GuideCard: React.FC<GuideCardProps> = ({ title, children, icon }) => {
    return (
        <div className="bg-gray-800/60 border border-amber-500/20 rounded-lg p-5 my-6 fade-in">
            <h3 className="flex items-center text-lg font-semibold text-amber-300 mb-3">
                {icon || <CompassIcon className="w-5 h-5 mr-3" />}
                {title}
            </h3>
            <div className="prose prose-sm prose-invert max-w-none text-gray-400 prose-p:my-1 prose-a:text-amber-400 hover:prose-a:text-amber-300">
                {children}
            </div>
        </div>
    );
};

export default GuideCard;