import React from 'react';

interface ShotCardSkeletonProps {
    /** Number of skeleton cards to render */
    count?: number;
    /** Additional CSS classes */
    className?: string;
}

/**
 * ShotCardSkeleton - Loading placeholder for shot cards
 * 
 * Displays animated skeleton UI matching the shot card layout:
 * - Thumbnail placeholder (left)
 * - Title and description lines (right)
 * - Action button placeholders (bottom)
 * 
 * Improves perceived performance by showing content shape immediately.
 */
const ShotCardSkeleton: React.FC<ShotCardSkeletonProps> = ({ count = 1, className = '' }) => {
    return (
        <div className={`space-y-3 ${className}`} role="status" aria-label="Loading shots...">
            {Array.from({ length: count }).map((_, index) => (
                <div 
                    key={index}
                    className="shot-card bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 animate-pulse"
                >
                    <div className="flex gap-3">
                        {/* Thumbnail skeleton */}
                        <div className="skeleton w-24 h-16 rounded bg-gray-700/50 flex-shrink-0" />
                        
                        {/* Content skeleton */}
                        <div className="flex-1 space-y-2">
                            {/* Shot number */}
                            <div className="skeleton h-4 w-16 rounded bg-gray-700/50" />
                            
                            {/* Description lines */}
                            <div className="skeleton h-3 w-full rounded bg-gray-700/50" />
                            <div className="skeleton h-3 w-4/5 rounded bg-gray-700/50" />
                            <div className="skeleton h-3 w-2/3 rounded bg-gray-700/50" />
                        </div>
                    </div>
                    
                    {/* Action buttons skeleton */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700/30">
                        <div className="skeleton h-8 w-24 rounded bg-gray-700/50" />
                        <div className="skeleton h-8 w-20 rounded bg-gray-700/50" />
                        <div className="skeleton h-8 w-8 rounded bg-gray-700/50 ml-auto" />
                    </div>
                </div>
            ))}
            <span className="sr-only">Loading shot content...</span>
        </div>
    );
};

export default ShotCardSkeleton;
