import React from 'react';
import { ToastMessage } from '../types';
import CheckCircleIcon from './icons/CheckCircleIcon';
import InfoIcon from './icons/InfoIcon';

const toastIcons = {
    success: <CheckCircleIcon className="w-5 h-5 text-green-400" />,
    error: <InfoIcon className="w-5 h-5 text-red-400" />,
    info: <InfoIcon className="w-5 h-5 text-blue-400" />,
}

const toastStyles = {
    success: 'bg-green-800/50 border-green-600 text-green-200',
    error: 'bg-red-800/50 border-red-600 text-red-200',
    info: 'bg-blue-800/50 border-blue-600 text-blue-200',
}


const Toast: React.FC<{ toasts: ToastMessage[]; removeToast: (id: number) => void }> = ({ toasts, removeToast }) => {
    return (
        <div className="fixed top-5 right-5 z-50 space-y-3 w-80">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`flex items-center gap-3 p-3 rounded-lg shadow-lg border backdrop-blur-sm animate-fade-in-right ${toastStyles[toast.type]}`}
                >
                    {toastIcons[toast.type]}
                    <p className="text-sm font-medium flex-1">{toast.message}</p>
                    <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-white">&times;</button>
                </div>
            ))}
        </div>
    );
};

export default Toast;
