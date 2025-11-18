/**
 * Pipeline Generator Component
 * 
 * UI for story-to-video generation workflow
 */

import React, { useState } from 'react';
import { usePipeline } from '../contexts/PipelineContext';
import './PipelineGenerator.css';

interface Genre {
  id: string;
  label: string;
  description: string;
}

const GENRES: Genre[] = [
  { id: 'sci-fi', label: 'Sci-Fi', description: 'Science fiction' },
  { id: 'fantasy', label: 'Fantasy', description: 'Fantasy adventure' },
  { id: 'horror', label: 'Horror', description: 'Horror thriller' },
  { id: 'drama', label: 'Drama', description: 'Dramatic story' },
  { id: 'action', label: 'Action', description: 'Action adventure' },
  { id: 'comedy', label: 'Comedy', description: 'Comedic story' },
];

/**
 * Pipeline Generator Component
 */
export const PipelineGenerator: React.FC<{
  onOpenInDirectorMode?: (result: any, prompt: string) => void;
}> = ({ onOpenInDirectorMode }) => {
  const { isGenerating, progress, result, error, generateStoryToVideo, cancelGeneration, clearError, clearResult } =
    usePipeline();

  const [prompt, setPrompt] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('sci-fi');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      await generateStoryToVideo(prompt, selectedGenre);
    }
  };

  const handleCancel = () => {
    cancelGeneration();
  };

  const handleClear = () => {
    clearResult();
    clearError();
    setPrompt('');
  };

  const progressPercent = progress?.progress ?? 0;

  return (
    <div className="pipeline-generator">
      <div className="pipeline-header">
        <h2>Story to Video Generator</h2>
        <p className="pipeline-subtitle">Generate cinematic videos from story prompts</p>
      </div>

      {/* Error Section */}
      {error && (
        <div className="error-section">
          <div className="error-header">
            <span className="error-icon">⚠️</span>
            <span className="error-title">Generation Error</span>
            <button className="error-close" onClick={clearError}>
              ×
            </button>
          </div>
          <p className="error-message">{error.message}</p>
        </div>
      )}

      {/* Input Form */}
      {!isGenerating && !result && (
        <form onSubmit={handleGenerate} className="pipeline-form">
          <div className="form-group">
            <label htmlFor="story-prompt" className="form-label">
              Story Prompt
            </label>
            <textarea
              id="story-prompt"
              className="form-input"
              placeholder="Describe the story you want to see... (e.g., 'A hero discovers a hidden portal in an ancient forest')"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              rows={4}
              maxLength={2000}
            />
            <div className="char-count">{prompt.length} / 2000</div>
          </div>

          <div className="form-group">
            <label htmlFor="genre-select" className="form-label">
              Genre
            </label>
            <div className="genre-selector">
              {GENRES.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  className={`genre-button ${selectedGenre === genre.id ? 'active' : ''}`}
                  onClick={() => setSelectedGenre(genre.id)}
                  disabled={isGenerating}
                  title={genre.description}
                >
                  {genre.label}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-generate" disabled={!prompt.trim() || isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate Video'}
          </button>
        </form>
      )}

      {/* Progress Section */}
      {isGenerating && (
        <div className="progress-section">
          <div className="progress-header">
            <span className="progress-stage">{progress?.stage.replace('-', ' ').toUpperCase()}</span>
            <span className="progress-percent">{progressPercent}%</span>
          </div>

          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>

          <p className="progress-message">{progress?.message}</p>

          <button type="button" className="btn-cancel" onClick={handleCancel}>
            Cancel Generation
          </button>
        </div>
      )}

      {/* Result Section */}
      {result && !isGenerating && (
        <div className="result-section">
          <div className="result-header">
            <span className="result-icon">✅</span>
            <h3>Generation Complete</h3>
          </div>

          <div className="result-details">
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className="detail-value">{result.status.toUpperCase()}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Scenes:</span>
              <span className="detail-value">{result.scenes.length}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Duration:</span>
              <span className="detail-value">{(result.totalDuration / 1000).toFixed(2)}s</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Processing Time:</span>
              <span className="detail-value">
                {result.completedAt ? ((result.completedAt - result.startedAt) / 1000).toFixed(2) : 'N/A'}s
              </span>
            </div>
          </div>

          <div className="result-scenes">
            <h4>Generated Scenes</h4>
            <div className="scenes-list">
              {result.scenes.map((scene, index) => (
                <div key={scene.id} className="scene-card">
                  <div className="scene-number">{index + 1}</div>
                  <div className="scene-content">
                    <h5>{scene.title}</h5>
                    <p>{scene.description}</p>
                    <span className={`scene-status status-${scene.status}`}>{scene.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="result-actions">
            <button type="button" className="btn-open-director" onClick={() => {
              if (onOpenInDirectorMode) {
                onOpenInDirectorMode(result, prompt);
              } else {
                // Fallback: save to file
                import('../utils/projectUtils').then(({ createQuickProjectState, saveProjectToFile }) => {
                  const projectState = createQuickProjectState(result, prompt);
                  saveProjectToFile(projectState);
                  alert('Project saved! Switch to Director Mode to continue refining this story.');
                });
              }
            }}>
              Open in Director Mode
            </button>
            <button type="button" className="btn-clear" onClick={handleClear}>
              Generate Another
            </button>
          </div>
        </div>
      )}

      {/* History Section */}
      {/* Can be expanded later to show previous generations */}
    </div>
  );
};

export default PipelineGenerator;
