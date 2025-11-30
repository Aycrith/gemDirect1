import React, { useCallback } from 'react';
import { ToastMessage, ToastType } from '../types';
import CheckCircleIcon from './icons/CheckCircleIcon';
import InfoIcon from './icons/InfoIcon';

const toastIcons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircleIcon className="w-5 h-5 text-green-400" />,
    error: <InfoIcon className="w-5 h-5 text-red-400" />,
    info: <InfoIcon className="w-5 h-5 text-amber-400" />,
    warning: <InfoIcon className="w-5 h-5 text-yellow-400" />,
};

const toastStyles: Record<ToastType, string> = {
    success: 'bg-green-800/40 border-green-700/80 text-green-200',
    error: 'bg-red-800/40 border-red-700/80 text-red-200',
    info: 'bg-amber-900/40 border-amber-800/80 text-amber-200',
    warning: 'bg-yellow-800/40 border-yellow-700/80 text-yellow-200',
};

// Individual toast item component - prevents stale closure issues
const ToastItem: React.FC<{
    toast: ToastMessage;
    onRemove: (id: number) => void;
}> = ({ toast, onRemove }) => {
    const handleDismiss = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove(toast.id);
    }, [toast.id, onRemove]);

    return (
        <div
            className={`relative flex items-center gap-3 p-3 rounded-lg shadow-lg border backdrop-blur-md animate-fade-in-right overflow-hidden ${toastStyles[toast.type]}`}
            data-testid={`toast-${toast.type}`}
        >
            {/* Auto-dismiss progress bar - pointer-events:none ensures it doesn't block clicks */}
            <div 
                className="absolute bottom-0 left-0 h-1 bg-current opacity-30 animate-toast-progress pointer-events-none"
                style={{ animationDuration: '5s' }}
            />
            
            {toastIcons[toast.type]}
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button 
                onClick={handleDismiss}
                onMouseDown={(e) => e.stopPropagation()} 
                className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full w-6 h-6 flex items-center justify-center text-xl font-bold transition-colors relative z-10"
                aria-label="Close notification"
                title="Dismiss notification"
                data-testid="toast-dismiss-btn"
                type="button"
            >
                &times;
            </button>
        </div>
    );
};

const Toast: React.FC<{ toasts: ToastMessage[]; removeToast: (id: number) => void }> = ({ toasts, removeToast }) => {
    return (
        <div className="fixed top-20 right-5 z-50 space-y-3 w-80" data-testid="toast-container">
            {toasts.map(toast => (
                <ToastItem
                    key={toast.id}
                    toast={toast}
                    onRemove={removeToast}
                />
            ))}
        </div>
    );
};

// Remove React.memo to prevent stale closure issues with removeToast callback
export default Toast;