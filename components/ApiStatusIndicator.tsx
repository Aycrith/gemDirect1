import React, { useEffect, useState } from 'react';
import { useApiStatus } from '../contexts/ApiStatusContext';
import SparklesIcon from './icons/SparklesIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import InfoIcon from './icons/InfoIcon';

const getStatusInfo = (status?: string) => {
  switch (status) {
    case 'retrying':
      return {
        icon: (
          <svg
            className="animate-spin h-5 w-5 text-amber-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        ),
        color: 'border-amber-600',
      };
    case 'success':
      return { icon: <CheckCircleIcon className="w-5 h-5 text-green-400" />, color: 'border-green-600' };
    case 'error':
      return { icon: <InfoIcon className="w-5 h-5 text-red-400" />, color: 'border-red-600' };
    default:
      return { icon: <SparklesIcon className="w-5 h-5 text-sky-300" />, color: 'border-gray-700' };
  }
};

const ApiStatusIndicator: React.FC = () => {
  const { apiStatus } = useApiStatus();
  const { status, message } = apiStatus;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (status !== 'idle') {
      setIsVisible(true);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    if (status === 'success') {
      timer = setTimeout(() => setIsVisible(false), 2000);
    } else if (status === 'idle') {
      timer = setTimeout(() => setIsVisible(false), 500);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [status]);

  if (!isVisible) {
    return null;
  }

  const { icon, color } = getStatusInfo(status);

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 flex items-center gap-3 p-3 rounded-lg shadow-lg border backdrop-blur-sm bg-gray-900/80 transition-all duration-300 animate-fade-in ${color}`}
    >
      {icon}
      <p className="text-sm font-medium text-gray-200">{message}</p>
    </div>
  );
};

export default React.memo(ApiStatusIndicator);
