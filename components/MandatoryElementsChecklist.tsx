import React, { useState } from 'react';

interface MandatoryElementsChecklistProps {
  elements: string[];
  covered: Set<string>;
  onElementClick?: (element: string) => void;
  title?: string;
}

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 9l-1.41-1.41L12 14.17l-5.59-5.59L5 9l7 7 7-7z" />
  </svg>
);

const MandatoryElementsChecklist: React.FC<MandatoryElementsChecklistProps> = ({ 
  elements, 
  covered,
  onElementClick,
  title = "Mandatory Elements"
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const coveredCount = elements.filter(e => covered.has(e)).length;
  const coveragePercentage = elements.length > 0 ? Math.round((coveredCount / elements.length) * 100) : 0;

  if (elements.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-700/30 border border-gray-600/50 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          <span className="text-xs bg-gray-600 text-gray-100 px-2 py-1 rounded-full">
            {coveredCount}/{elements.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`text-lg font-bold ${
            coveragePercentage === 100 ? 'text-green-400' :
            coveragePercentage >= 75 ? 'text-blue-400' :
            coveragePercentage >= 50 ? 'text-yellow-400' :
            'text-orange-400'
          }`}>
            {coveragePercentage}%
          </div>
          <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Progress Bar */}
      {isExpanded && (
        <>
          <div className="px-4 py-2">
            <div className="w-full bg-gray-600 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  coveragePercentage === 100 ? 'bg-green-500' :
                  coveragePercentage >= 75 ? 'bg-blue-500' :
                  coveragePercentage >= 50 ? 'bg-yellow-500' :
                  'bg-orange-500'
                }`}
                style={{ width: `${coveragePercentage}%` }}
              />
            </div>
          </div>

          {/* Element List */}
          <div className="px-4 py-3 space-y-2 border-t border-gray-600/50 max-h-64 overflow-y-auto">
            {elements.map((element, idx) => {
              const isCovered = covered.has(element);
              return (
                <button
                  key={idx}
                  onClick={() => onElementClick?.(element)}
                  className={`w-full flex items-start gap-3 p-2 rounded-md transition-colors text-left ${
                    isCovered
                      ? 'bg-green-900/20 hover:bg-green-900/30 border border-green-700/50'
                      : 'bg-gray-600/20 hover:bg-gray-600/30 border border-gray-600/30'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center border-2 ${
                    isCovered
                      ? 'bg-green-600 border-green-500'
                      : 'border-gray-500'
                  }`}>
                    {isCovered && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className={`text-sm font-medium ${
                      isCovered ? 'text-green-300' : 'text-gray-300'
                    }`}>
                      {element}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default MandatoryElementsChecklist;
