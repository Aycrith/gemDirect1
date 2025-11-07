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
        <div className="fixed top-5 right-5 z-50 space-y-3 w-80">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`flex items-center gap-3 p-3 rounded-lg shadow-lg border backdrop-blur-md animate-fade-in-right ${toastStyles[toast.type]}`}
                >
                    {toastIcons[toast.type]}
                    <p className="text-sm font-medium flex-1">{toast.message}</p>
                    <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-white rounded-full w-5 h-5 flex items-center justify-center">&times;</button>
                </div>
            ))}
        </div>
    );
};

export default React.memo(Toast);