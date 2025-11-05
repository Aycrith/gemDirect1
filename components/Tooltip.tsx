import React, { useState } from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  if (!text) {
    return <>{children}</>;
  }

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 text-xs text-center text-white bg-gray-900 border border-gray-600 rounded-md z-10 opacity-95 transition-opacity duration-300 pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
};

export default React.memo(Tooltip);
