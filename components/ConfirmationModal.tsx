import React from 'react';
import AlertTriangleIcon from './icons/AlertTriangleIcon';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmButtonClass = 'bg-red-600 hover:bg-red-700'
}) => {
    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-dialog-title"
        >
            <div 
                className="bg-gray-800/90 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <h3 id="confirmation-dialog-title" className="flex items-center text-lg font-bold text-amber-400 mb-4">
                        <AlertTriangleIcon className="w-5 h-5 mr-2" />
                        {title}
                    </h3>
                    
                    <p className="text-gray-300 mb-6">
                        {message}
                    </p>
                    
                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-md text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${confirmButtonClass}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
