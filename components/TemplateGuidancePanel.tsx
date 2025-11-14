import React from 'react';
import { TemplateMetadata } from '../services/templateLoader';

interface TemplateGuidancePanelProps {
  template: TemplateMetadata;
  coveredElements: Set<string>;
  onClose: () => void;
}

const TemplateGuidancePanel: React.FC<TemplateGuidancePanelProps> = ({ 
  template, 
  coveredElements,
  onClose
}) => {
  const coveragePercentage = template.mandatory_elements.length > 0
    ? Math.round((Array.from(coveredElements).filter(e => template.mandatory_elements.includes(e)).length / template.mandatory_elements.length) * 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-start justify-end animate-fade-in">
      <div 
        className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-96 max-h-[90vh] overflow-y-auto m-4 shadow-2xl animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-amber-400">{template.name}</h2>
            <p className="text-sm text-gray-400 mt-1">{template.genre.charAt(0).toUpperCase() + template.genre.slice(1)} Story</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        {/* Template Description */}
        {template.description && (
          <div className="mb-6">
            <p className="text-sm text-gray-300 leading-relaxed">{template.description}</p>
          </div>
        )}

        {/* Coverage Status */}
        <div className="mb-6 bg-gray-700/50 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-gray-200">Coverage</h3>
            <span className={`text-lg font-bold ${
              coveragePercentage === 100 ? 'text-green-400' :
              coveragePercentage >= 75 ? 'text-blue-400' :
              coveragePercentage >= 50 ? 'text-yellow-400' :
              'text-orange-400'
            }`}>
              {coveragePercentage}%
            </span>
          </div>
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

        {/* Genre & Tone */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase">Tone</label>
            <p className="text-sm text-gray-200 mt-1">{template.tone}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase">Visual Density</label>
            <p className="text-sm text-gray-200 mt-1">{template.visual_density}</p>
          </div>
        </div>

        {/* Character Archetypes */}
        {template.character_archetypes && template.character_archetypes.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Character Archetypes</h3>
            <div className="flex flex-wrap gap-2">
              {template.character_archetypes.map((archetype, idx) => (
                <span 
                  key={idx}
                  className="px-2 py-1 bg-indigo-900/50 text-indigo-200 text-xs rounded-full border border-indigo-700/50"
                >
                  {archetype}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mandatory Elements */}
        {template.mandatory_elements && template.mandatory_elements.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Mandatory Elements</h3>
            <div className="space-y-2">
              {template.mandatory_elements.map((element, idx) => {
                const isCovered = coveredElements.has(element);
                return (
                  <div 
                    key={idx}
                    className={`flex items-start gap-3 p-2 rounded-md transition-colors ${
                      isCovered 
                        ? 'bg-green-900/20 border border-green-700/50' 
                        : 'bg-gray-700/30 border border-gray-600/50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      isCovered 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-600 text-gray-400'
                    }`}>
                      {isCovered && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Color Palette */}
        {template.color_palette && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Color Palette</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{template.color_palette}</p>
          </div>
        )}

        {/* Quality Thresholds */}
        <div className="pt-4 border-t border-gray-700">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Quality Targets</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Min Coherence Score:</span>
              <span className="text-amber-400">{template.quality_thresholds.coherence_min}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Min Diversity Entropy:</span>
              <span className="text-amber-400">{template.quality_thresholds.diversity_entropy_min}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Min Similarity Alignment:</span>
              <span className="text-amber-400">{template.quality_thresholds.similarity_alignment_min}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateGuidancePanel;
