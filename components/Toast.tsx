import React from 'react';
import { ToastMessage } from '../types';
import CheckCircleIcon from './icons/CheckCircleIcon';
import InfoIcon from './icons/InfoIcon';

const toastIcons = {
    success: <CheckCircleIcon className="w-5 h-5 text-green-400" />,
    error: <InfoIcon className="w-5 h-5 text-red-400" />,
    info: <InfoIcon className="w-5 h-5 text-amber-400" />,
}

const toastStyles = {
    success: 'bg-green-800/40 border-green-700/80 text-green-200',
    error: 'bg-red-800/40 border-red-700/80 text-red-200',
    info: 'bg-amber-900/40 border-amber-800/80 text-amber-200',
}


const Toast: React.FC<{ toasts: ToastMessage[]; removeToast: (id: number) => void }> = ({ toasts, removeToast }) => {
    return (
        <div className="fixed top-20 right-5 z-50 space-y-3 w-80">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`relative flex items-center gap-3 p-3 rounded-lg shadow-lg border backdrop-blur-md animate-fade-in-right overflow-hidden ${toastStyles[toast.type]}`}
                >
                    {/* Auto-dismiss progress bar */}
                    <div 
                        className="absolute bottom-0 left-0 h-1 bg-current opacity-30 animate-toast-progress"
                        style={{ animationDuration: '5s' }}
                    />
                    
                    {toastIcons[toast.type]}
                    <p className="text-sm font-medium flex-1">{toast.message}</p>
                    <button 
                        onClick={() => removeToast(toast.id)} 
                        className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full w-6 h-6 flex items-center justify-center text-xl font-bold transition-colors"
                        aria-label="Close notification"
                        title="Dismiss notification"
                    >
                        &times;
                    </button>
                </div>
            ))}
        </div>
    );
};

export default React.memo(Toast);