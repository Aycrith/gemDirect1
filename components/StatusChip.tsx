import React from 'react';

export type StatusChipVariant = 'info' | 'success' | 'warning' | 'error' | 'generating';

interface StatusChipProps {
    status: StatusChipVariant;
    label: string;
    icon?: React.ReactNode;
    className?: string;
}

/**
 * StatusChip - Consistent status indicator with color-coded variants
 * 
 * UI Refresh component providing visual feedback for:
 * - info: Neutral information (blue)
 * - success: Completed/ready state (green)
 * - warning: Needs attention (amber)
 * - error: Failed/blocked state (red)
 * - generating: In-progress async operation (violet with pulse)
 */
const StatusChip: React.FC<StatusChipProps> = ({ status, label, icon, className = '' }) => {
    // Use CSS class from index.html plus Tailwind fallbacks
    const baseClasses = 'status-chip inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap';
    
    // CSS class variant + Tailwind fallback
    const variantClasses: Record<StatusChipVariant, string> = {
        info: 'status-chip--info bg-blue-400/15 text-blue-400',
        success: 'status-chip--success bg-green-400/15 text-green-400',
        warning: 'status-chip--warning bg-amber-400/15 text-amber-400',
        error: 'status-chip--error bg-red-400/15 text-red-400',
        generating: 'status-chip--generating bg-violet-400/15 text-violet-400',
    };

    const pulseClass = status === 'generating' ? 'animate-pulse' : '';

    return (
        <span 
            className={`${baseClasses} ${variantClasses[status]} ${pulseClass} ${className}`}
            role="status"
            aria-live={status === 'generating' ? 'polite' : undefined}
        >
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span>{label}</span>
        </span>
    );
};

export default StatusChip;
