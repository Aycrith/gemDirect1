import React, { useEffect, useState } from 'react';
import { useApiStatus } from '../contexts/ApiStatusContext';
import SparklesIcon from './icons/SparklesIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import InfoIcon from './icons/InfoIcon';

const ApiStatusIndicator: React.FC = () => {
  const { apiStatus } = useApiStatus();
  const { status, message } = apiStatus;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (status !== 'idle') {
      setIsVisible(true);
    }

    if (status === 'success') {
      const timer = setTimeout(() => setIsVisible(false), 2000); // Hide after 2s on success
      return () => clearTimeout(timer);
    }
    
    if (status === 'idle') {
      const timer = setTimeout(() => setIsVisible(false), 500); // A small delay to avoid flicker
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (!isVisible) {
    return null;
  }

  const getStatusInfo = () => {
    switch (status) {
      case 'bundling':
      case 'loading':
      case 'retrying':
        return {
          icon: <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
          color: 'border-indigo-500',
        };
      case 'success':
        return { icon: <CheckCircleIcon className="w-5 h-5 text-green-400" />, color: 'border-green-500' };
      case 'error':
        return { icon: <InfoIcon className="w-5 h-5 text-red-400" />, color: 'border-red-500' };
      default:
        return { icon: null, color: 'border-gray-700' };
    }
  };

  const { icon, color } = getStatusInfo();

  return (
    <div className={`fixed bottom-4 left-4 z-50 flex items-center gap-3 p-3 rounded-lg shadow-lg border backdrop-blur-sm bg-gray-800/80 transition-all duration-300 animate-fade-in ${color}`}>
      {icon}
      <p className="text-sm font-medium text-gray-200">{message}</p>
    </div>
  );
};

export default React.memo(ApiStatusIndicator);
