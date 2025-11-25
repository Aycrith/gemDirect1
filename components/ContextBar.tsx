import React from 'react';
import StatusChip, { StatusChipVariant } from './StatusChip';
import ChevronRightIcon from './icons/ChevronRightIcon';

interface BreadcrumbItem {
    label: string;
    onClick?: () => void;
}

interface ContextBarProps {
    /** Breadcrumb trail showing current location */
    breadcrumbs: BreadcrumbItem[];
    /** Optional status to display */
    status?: {
        variant: StatusChipVariant;
        label: string;
    };
    /** Primary action buttons (right side) */
    actions?: React.ReactNode;
    /** Additional CSS classes */
    className?: string;
}

/**
 * ContextBar - Sticky header showing current context and primary actions
 * 
 * Provides persistent navigation context:
 * - Breadcrumb trail (Project > Scene X > Shot Y)
 * - Status indicator for current operation
 * - Primary action buttons always visible
 * 
 * Reduces cognitive load by keeping users oriented.
 */
const ContextBar: React.FC<ContextBarProps> = ({ 
    breadcrumbs, 
    status, 
    actions,
    className = '' 
}) => {
    return (
        <div 
            className={`context-bar h-14 bg-gray-900/80 backdrop-blur-md border-b border-gray-700/50 flex items-center justify-between px-4 sticky top-16 z-25 ${className}`}
            role="navigation"
            aria-label="Context navigation"
        >
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
                <ol className="flex items-center gap-1">
                    {breadcrumbs.map((item, index) => (
                        <li key={index} className="flex items-center">
                            {index > 0 && (
                                <ChevronRightIcon className="w-4 h-4 mx-1 text-gray-600" aria-hidden="true" />
                            )}
                            {item.onClick ? (
                                <button
                                    onClick={item.onClick}
                                    className="text-gray-400 hover:text-amber-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded px-1"
                                >
                                    {item.label}
                                </button>
                            ) : (
                                <span 
                                    className={index === breadcrumbs.length - 1 ? 'text-amber-400 font-medium' : 'text-gray-400'}
                                    aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
                                >
                                    {item.label}
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            </nav>

            {/* Status and Actions */}
            <div className="flex items-center gap-3">
                {status && (
                    <StatusChip status={status.variant} label={status.label} />
                )}
                {actions && (
                    <div className="flex items-center gap-2">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContextBar;
