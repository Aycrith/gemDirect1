import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { Scene, StoryBible, ToastMessage, WorkflowStage, Suggestion, LocalGenerationStatus, SceneContinuityData, SceneImageGenerationStatus, KeyframeData } from './types';
import { useProjectData, usePersistentState, useSceneGenerationWatcher } from './utils/hooks';
import { ApiStatusProvider, useApiStatus } from './contexts/ApiStatusContext';
import { UsageProvider, useUsage } from './contexts/UsageContext';
import { TemplateContextProvider } from './contexts/TemplateContext';
import { saveProjectToFile, loadProjectFromFile } from './utils/projectUtils';
import { PlanExpansionStrategyProvider, usePlanExpansionActions } from './contexts/PlanExpansionStrategyContext';
import { MediaGenerationProviderProvider } from './contexts/MediaGenerationProviderContext';
import { LocalGenerationSettingsProvider, useLocalGenerationSettings } from './contexts/LocalGenerationSettingsContext';
import { PipelineProvider } from './contexts/PipelineContext';
import { LocalGenerationProvider } from './contexts/LocalGenerationContext';
import { createMediaGenerationActions, LOCAL_COMFY_ID } from './services/mediaGenerationService';

// P0 Optimization: Code splitting for heavy components
// Target: Reduce initial bundle, improve -1.5s cold start
// These components are lazy-loaded only when needed
const TimelineEditor = lazy(() => import('./components/TimelineEditor'));
const LocalGenerationSettingsModal = lazy(() => import('./components/LocalGenerationSettingsModal'));
const UsageDashboard = lazy(() => import('./components/UsageDashboard'));
const ContinuityDirector = lazy(() => import('./components/ContinuityDirector'));
const ContinuityModal = lazy(() => import('./components/ContinuityModal'));
const VisualBiblePanel = lazy(() => import('./components/VisualBiblePanel'));
const ArtifactViewer = lazy(() => import('./components/ArtifactViewer'));

// P1 Optimization (2025-11-20): Additional lazy loading for conditional components
const PipelineGenerator = lazy(() => import('./components/PipelineGenerator')); // Only used in Quick Generate mode

// P2 Optimization (2025-11-22): Lazy load workflow-stage-specific components
// These are only rendered when user reaches specific workflow stages, saving ~80KB initial bundle
const StoryIdeaForm = lazy(() => import('./components/StoryIdeaForm')); // Stage: 'idea'
const StoryBibleEditor = lazy(() => import('./components/StoryBibleEditor')); // Stage: 'bible'
const DirectorsVisionForm = lazy(() => import('./components/DirectorsVisionForm')); // Stage: 'vision'
const ConfirmationModal = lazy(() => import('./components/ConfirmationModal')); // Conditional: new project confirmation

// Eager imports for critical path components (always visible)
import SceneNavigator from './components/SceneNavigator';
import GenerateSceneImagesButton from './components/GenerateSceneImagesButton';
import WorkflowTracker from './components/WorkflowTracker';
import Toast from './components/Toast';
import ApiStatusIndicator from './components/ApiStatusIndicator';
import ProviderHealthIndicator from './components/ProviderHealthIndicator';
import ErrorBoundary from './components/ErrorBoundary';
import ContextBar from './components/ContextBar';
import BarChartIcon from './components/icons/BarChartIcon';
import SettingsIcon from './components/icons/SettingsIcon';
import SparklesIcon from './components/icons/SparklesIcon';
import SaveIcon from './components/icons/SaveIcon';
import UploadCloudIcon from './components/icons/UploadCloudIcon';
import BookOpenIcon from './components/icons/BookOpenIcon';
import ProgressBar from './components/ProgressBar';
import ComfyUICallbackProvider from './components/ComfyUICallbackProvider.clean';
import { clearProjectData } from './utils/database';

// Loading fallback component
const LoadingFallback: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="flex items-center justify-center p-8">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
      <p className="text-sm text-neutral-400">{message}</p>
    </div>
  </div>
);

const AppContent: React.FC = () => {
    // UI Refresh feature flag - enables new presentation layer improvements
    const uiRefreshEnabled = import.meta.env.VITE_UI_REFRESH_ENABLED === 'true';
    
    const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, task: '' });
    const { 
        workflowStage, setWorkflowStage, storyBible, setStoryBible, 
        directorsVision, setDirectorsVision, scenes, setScenes,
        handleGenerateStoryBible, handleGenerateScenes, isLoading: isProjectLoading,
        scenesToReview, setScenesToReview, applySuggestions
    } = useProjectData(setGenerationProgress);

    const [activeSceneId, setActiveSceneId] = usePersistentState<string | null>('activeSceneId', null);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [isUsageDashboardOpen, setIsUsageDashboardOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [refinedSceneIds, setRefinedSceneIds] = useState(new Set<string>());
    const [continuityModal, setContinuityModal] = useState<{ sceneId: string, lastFrame: string } | null>(null);
    const [isExtending, setIsExtending] = useState(false);
    const [hasSeenWelcome, setHasSeenWelcome] = usePersistentState('hasSeenWelcome', false);
    const [mode, setMode] = usePersistentState<'quick' | 'director'>('mode', 'director');
    const [isVisualBibleOpen, setIsVisualBibleOpen] = useState(false);
    const [isNewProjectConfirmOpen, setIsNewProjectConfirmOpen] = useState(false);

    const { sceneStatuses, updateSceneStatus } = useSceneGenerationWatcher(scenes);

    const { settings: localGenSettings, setSettings: setLocalGenSettings } = useLocalGenerationSettings();
    const [generatedImages, setGeneratedImages] = usePersistentState<Record<string, KeyframeData>>('generatedImages', {});
    const [sceneImageStatuses, setSceneImageStatuses] = usePersistentState<Record<string, SceneImageGenerationStatus>>('sceneImageStatuses', {});
    const [generatedShotImages, setGeneratedShotImages] = usePersistentState<Record<string, string>>('generatedShotImages', {});
    const [continuityData, setContinuityData] = usePersistentState<Record<string, SceneContinuityData>>('continuityData', {});
    const [localGenStatus, setLocalGenStatus] = usePersistentState<Record<string, LocalGenerationStatus>>('localGenStatus', {});
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();
    const planActions = usePlanExpansionActions();

    // Effect for the interactive background gradient
    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const { clientX, clientY } = event;
            document.documentElement.style.setProperty('--mouse-x', `${clientX}px`);
            document.documentElement.style.setProperty('--mouse-y', `${clientY}px`);
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    const addToast = useCallback((message: string, type: ToastMessage['type']) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(currentToasts => currentToasts.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const updateSceneImageStatus = useCallback((sceneId: string, update: Partial<SceneImageGenerationStatus>) => {
        setSceneImageStatuses(prev => ({
            ...prev,
            [sceneId]: {
                ...(prev[sceneId] || { status: 'idle' as const }),
                ...update
            }
        }));
    }, [setSceneImageStatuses]);

    const handleNewProjectRequest = useCallback(() => {
        setIsNewProjectConfirmOpen(true);
    }, []);

    const handleNewProject = useCallback(async () => {
        await clearProjectData();
        setStoryBible(null);
        setDirectorsVision('');
        setScenes([]);
        setActiveSceneId(null);
        setScenesToReview(new Set<string>());
        setWorkflowStage('idea');
    }, [setStoryBible, setDirectorsVision, setScenes, setScenesToReview, setWorkflowStage]);

    // Set active scene when scenes are loaded/updated
    useEffect(() => {
        if (scenes.length > 0 && !scenes.find(s => s.id === activeSceneId)) {
            setActiveSceneId(scenes[0].id);
        } else if (scenes.length === 0) {
            setActiveSceneId(null);
        }
    }, [scenes, activeSceneId]);

    const handleStageClick = (stage: WorkflowStage) => {
        if (stage === 'director' && (!storyBible || !directorsVision || scenes.length === 0)) {
            addToast('Please complete previous steps first.', 'info');
            return;
        }
        if (stage === 'continuity' && scenes.length === 0) {
            addToast('Please generate scenes before moving to continuity review.', 'info');
            return;
        }
        setWorkflowStage(stage);
    };

    const handleApplySuggestion = (suggestion: Suggestion, sceneId: string) => {
        // This is now the single dispatcher for all suggestion types.
        applySuggestions([suggestion], sceneId, addToast);
        
        // Mark scene as refined if it was a timeline change
        if (suggestion.type === 'ADD_SHOT_AFTER' || suggestion.type === 'UPDATE_SHOT' || suggestion.type === 'UPDATE_TRANSITION') {
            setRefinedSceneIds(prev => new Set(prev).add(sceneId));
        }
    };

    const handleUpdateSceneSummary = async (sceneId: string): Promise<boolean> => {
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene) {
            addToast("Scene not found for summary update.", 'error');
            return false;
        }
        try {
            const newSummary = await planActions.updateSceneSummaryWithRefinements(scene.summary, scene.timeline, logApiCall, updateApiStatus);
            const updatedScenes = scenes.map(s => s.id === sceneId ? { ...s, summary: newSummary } : s);
            setScenes(updatedScenes);
            setRefinedSceneIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(sceneId);
                return newSet;
            });
            addToast("Scene summary updated based on refinements.", 'info');
            return true;
        } catch(e) {
            addToast(e instanceof Error ? e.message : 'Failed to update scene summary.', 'error');
            return false;
        }
    };

    const handleSceneKeyframeGenerated = useCallback((sceneId: string, data: KeyframeData) => {
        const length = typeof data === 'string' ? data.length : (data.start.length + data.end.length);
        console.log(`✅ [Image Sync - handleSceneKeyframeGenerated] Scene ${sceneId}: image updated, length: ${length}`);
        setGeneratedImages(prev => ({ ...prev, [sceneId]: data }));
    }, [setGeneratedImages]);
    
    const handleDeleteScene = (sceneId: string) => {
        const sceneIndex = scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) return;
        
        // Remove scene from list
        const newScenes = scenes.filter(s => s.id !== sceneId);
        setScenes(newScenes);
        
        // Clear active scene if it was deleted
        if (activeSceneId === sceneId) {
            // Select the previous scene, or the next one, or null if no scenes left
            const newActiveId = newScenes[sceneIndex - 1]?.id || newScenes[0]?.id || null;
            setActiveSceneId(newActiveId);
        }
        
        // Clean up related data
        setGeneratedImages(prev => {
            const updated = { ...prev };
            delete updated[sceneId];
            return updated;
        });
        
        setScenesToReview(prev => {
            const newSet = new Set(prev);
            newSet.delete(sceneId);
            return newSet;
        });
        
        addToast('Scene deleted', 'info');
    };

    const handleExtendTimeline = (sceneId: string, lastFrame: string) => {
        setContinuityModal({ sceneId, lastFrame });
    };

    const handleRerunScene = async (sceneId: string) => {
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene || !storyBible) return;

        try {
            updateApiStatus({ status: 'running', message: 'Regenerating scene keyframe...' });
            const mediaActions = createMediaGenerationActions(LOCAL_COMFY_ID, localGenSettings);
            const image = await mediaActions.generateKeyframeForScene(
                directorsVision,
                scene.summary,
                sceneId,
                logApiCall,
                updateApiStatus
            );
            setGeneratedImages(prev => ({ ...prev, [sceneId]: image }));
            addToast('Scene keyframe regenerated!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to regenerate scene.', 'error');
        } finally {
            updateApiStatus({ status: 'idle' });
        }
    };

    const handleSaveProject = async () => {
        await saveProjectToFile({
            storyBible,
            directorsVision,
            scenes,
            generatedImages,
            generatedShotImages,
            continuityData,
            localGenSettings,
            localGenStatus,
            scenesToReview,
        });
        addToast('Project saved to your downloads!', 'success');
    };

    const handleLoadProjectClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            try {
                const data = await loadProjectFromFile(file);
                
                // Hard reset of the application state
                setStoryBible(data.storyBible);
                setDirectorsVision(data.directorsVision);
                setScenes(data.scenes);
                setGeneratedImages(data.generatedImages || {});
                setGeneratedShotImages(data.generatedShotImages || {});
                setContinuityData(data.continuityData || {});
                setLocalGenSettings(data.localGenSettings || { comfyUIUrl: '', comfyUIClientId: '', workflowJson: '', mapping: {} });
                setLocalGenStatus(data.localGenStatus || {});
                setScenesToReview(new Set(data.scenesToReview || []));
                setHasSeenWelcome(true); // Assume user loading a project has seen the welcome screen

                // Determine workflow stage from loaded data
                // Always set mode to 'director' for imported projects to ensure consistent UI state
                setMode('director');
                
                if (data.storyBible) {
                    if (data.directorsVision) {
                        if (data.scenes.length > 0) {
                            setWorkflowStage('director');
                        } else {
                            setWorkflowStage('vision');
                        }
                    } else {
                        setWorkflowStage('bible');
                    }
                } else {
                    setWorkflowStage('idea');
                }
                addToast('Project loaded successfully!', 'success');
            } catch (e) {
                addToast(e instanceof Error ? e.message : 'Failed to load project.', 'error');
            } finally {
                if (event.target) {
                    event.target.value = ''; // Reset file input
                }
            }
        }
    };

    // Auto-select first scene if we have scenes but no active scene
    // This handles the race condition where scenes load before activeSceneId from IndexedDB
    useEffect(() => {
        if (scenes.length > 0 && !activeSceneId && workflowStage === 'director' && scenes[0]) {
            console.log('[App] Auto-selecting first scene:', scenes[0].id);
            setActiveSceneId(scenes[0].id);
        }
    }, [scenes, activeSceneId, workflowStage, setActiveSceneId]);

    const activeScene = scenes.find(s => s.id === activeSceneId);

    const renderCurrentStage = () => {
        switch (workflowStage) {
            case 'idea':
                return (
                    <>
                        <div className="text-center py-16 sm:py-20 fade-in">
                            <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-300">
                                Cinematic Story Generator
                            </h1>
                            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-300">
                                Transform your ideas into fully-realized cinematic stories, from high-level plot to shot-by-shot details, all with the power of AI.
                            </p>
                        </div>
                        <Suspense fallback={<LoadingFallback message="Loading story form..." />}>
                            <StoryIdeaForm onSubmit={(idea, genre) => handleGenerateStoryBible(idea, genre || 'sci-fi', addToast)} isLoading={isProjectLoading} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />
                        </Suspense>
                    </>
                )
            case 'bible':
                return storyBible && (
                    <Suspense fallback={<LoadingFallback message="Loading story bible editor..." />}>
                        <StoryBibleEditor storyBible={storyBible} onUpdate={setStoryBible} onGenerateScenes={() => setWorkflowStage('vision')} isLoading={isProjectLoading} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />
                    </Suspense>
                );
            case 'vision':
                return storyBible && (
                    <ErrorBoundary
                        FallbackComponent={({ error, resetError }) => (
                            <div className="p-4 bg-red-900/20 border border-red-500 rounded-md">
                                <h3 className="text-red-400 font-semibold mb-2">Scene Generation Error</h3>
                                <p className="text-sm text-gray-300 mb-3">{error.message}</p>
                                <button
                                    onClick={() => {
                                        resetError();
                                        setWorkflowStage('vision');
                                    }}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
                                >
                                    Return to Director's Vision
                                </button>
                            </div>
                        )}
                        onError={(error, errorInfo) => {
                            console.error('[Scene Generation Error Boundary]', error);
                            console.error('[Component Stack]', errorInfo.componentStack);
                        }}
                    >
                        <Suspense fallback={<LoadingFallback message="Loading director's vision form..." />}>
                            <DirectorsVisionForm onSubmit={(vision) => handleGenerateScenes(vision, addToast, setGeneratedImages, updateSceneStatus)} isLoading={isProjectLoading} storyBible={storyBible} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />
                        </Suspense>
                    </ErrorBoundary>
                );
            case 'director':
                return (
                    <div className="space-y-6">
                        <GenerateSceneImagesButton
                            scenes={scenes}
                            directorsVision={directorsVision}
                            generatedImages={generatedImages}
                            onImagesGenerated={setGeneratedImages}
                            onApiLog={logApiCall}
                            onApiStateChange={updateApiStatus}
                            setGenerationProgress={setGenerationProgress}
                            updateSceneImageStatus={updateSceneImageStatus}
                            sceneImageStatuses={sceneImageStatuses}
                        />
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                            <div className="lg:col-span-1">
                                <SceneNavigator scenes={scenes} activeSceneId={activeSceneId} onSelectScene={setActiveSceneId} onDeleteScene={handleDeleteScene} scenesToReview={scenesToReview} sceneStatuses={sceneStatuses} generatedImages={generatedImages} sceneImageStatuses={sceneImageStatuses} />
                            </div>
                            <div className="lg:col-span-3">
                                {activeScene ? (
                                    <Suspense fallback={<LoadingFallback message="Loading timeline editor..." />}>
                                        <TimelineEditor 
                                            key={activeScene.id} 
                                            scene={activeScene} 
                                            onUpdateScene={(updatedScene) => {
                                                const newScenes = scenes.map(s => s.id === updatedScene.id ? updatedScene : s);
                                                setScenes(newScenes);
                                            }} 
                                            directorsVision={directorsVision} 
                                            storyBible={storyBible!} 
                                            onApiStateChange={updateApiStatus} 
                                            onApiLog={logApiCall} 
                                            scenes={scenes}
                                            onApplySuggestion={handleApplySuggestion}
                                            generatedImages={generatedImages}
                                            generatedShotImages={generatedShotImages}
                                            setGeneratedShotImages={setGeneratedShotImages}
                                            onSceneKeyframeGenerated={handleSceneKeyframeGenerated}
                                            localGenSettings={localGenSettings}
                                            localGenStatus={localGenStatus}
                                            setLocalGenStatus={setLocalGenStatus}
                                            isRefined={refinedSceneIds.has(activeScene.id)}
                                            onUpdateSceneSummary={handleUpdateSceneSummary}
                                            uiRefreshEnabled={uiRefreshEnabled}
                                        />
                                    </Suspense>
                                ) : <p>Select a scene</p>}
                            </div>
                        </div>
                    </div>
                );
            case 'continuity':
                return (
                    <Suspense fallback={<LoadingFallback message="Loading continuity director..." />}>
                        <ContinuityDirector 
                            scenes={scenes}
                            storyBible={storyBible!}
                            directorsVision={directorsVision}
                            generatedImages={generatedImages}
                            continuityData={continuityData}
                            setContinuityData={setContinuityData}
                            addToast={addToast}
                            onApiStateChange={updateApiStatus}
                            onApiLog={logApiCall}
                            onApplySuggestion={handleApplySuggestion}
                            refinedSceneIds={refinedSceneIds}
                            onUpdateSceneSummary={handleUpdateSceneSummary}
                            onExtendTimeline={handleExtendTimeline}
                            onRerunScene={handleRerunScene}
                            localGenStatus={localGenStatus}
                        />
                    </Suspense>
                );
            default:
                return <p>Welcome! Please start with an idea.</p>;
        }
    };
    
    return (
        <div className={`min-h-screen bg-gray-900 text-gray-200 font-sans ${uiRefreshEnabled ? 'ui-refresh' : ''}`} data-testid="app-container">
            <header className="p-4 flex justify-between items-center sticky top-0 bg-gray-900/80 backdrop-blur-md z-30 border-b border-amber-500/20">
                <div className="flex items-center gap-3">
                    <SparklesIcon className="w-7 h-7 text-amber-400" />
                    <h1 className="text-xl font-bold text-white">Cinematic Story Generator</h1>
                </div>
                <div className="flex items-center gap-4">
                    {/* Provider Health Indicator - only shown when providerHealthPolling is enabled */}
                    <ProviderHealthIndicator addToast={addToast} compact={true} />
                    
                    <div className="flex bg-gray-800 rounded-lg p-1">
                        <button
                            data-testid="mode-quick"
                            onClick={() => setMode('quick')}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                mode === 'quick' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:text-white'
                            }`}
                        >
                            Quick Generate
                        </button>
                        <button
                            data-testid="mode-director"
                            onClick={() => setMode('director')}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                mode === 'director' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:text-white'
                            }`}
                        >
                            Director Mode
                        </button>
                    </div>
                    <div>
                        {mode === 'director' && (
                            <button
                                data-testid="btn-new-project"
                                onClick={handleNewProjectRequest}
                                className="p-2 rounded-full hover:bg-gray-700 transition-colors mr-2"
                                aria-label="New project"
                            >
                                New
                            </button>
                        )}
                        <button onClick={handleSaveProject} className="p-2 rounded-full hover:bg-gray-700 transition-colors mr-2" aria-label="Save project">
                            <SaveIcon className="w-6 h-6 text-gray-400" />
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" style={{ display: 'none' }} />
                        <button onClick={handleLoadProjectClick} className="p-2 rounded-full hover:bg-gray-700 transition-colors mr-2" aria-label="Load project">
                            <UploadCloudIcon className="w-6 h-6 text-gray-400" />
                        </button>
                         <button onClick={() => setIsUsageDashboardOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors mr-2" aria-label="Open usage dashboard">
                            <BarChartIcon className="w-6 h-6 text-gray-400" />
                        </button>
                        {mode === 'director' && (
                            <button onClick={() => setIsVisualBibleOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors mr-2" aria-label="Open visual bible">
                                <BookOpenIcon className="w-6 h-6 text-gray-400" />
                            </button>
                        )}
                        <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Open settings" data-testid="settings-button">
                            <SettingsIcon className="w-6 h-6 text-gray-400" />
                        </button>
                    </div>
                </div>
            </header>
            
            {/* Context Bar - sticky below header in Director Mode */}
            {mode === 'director' && workflowStage === 'director' && (
                <ContextBar 
                    breadcrumbs={[
                        { label: 'Director Mode', onClick: () => setActiveSceneId(null) },
                        ...(activeScene ? [{ label: `Scene ${scenes.findIndex(s => s.id === activeScene.id) + 1}: ${activeScene.title}` }] : [])
                    ]}
                    status={(() => {
                        const activeImageStatus = activeSceneId ? sceneImageStatuses[activeSceneId] : null;
                        if (activeImageStatus?.status === 'generating') {
                            return { variant: 'generating' as const, label: 'Generating...' };
                        }
                        if (activeImageStatus?.status === 'error') {
                            return { variant: 'error' as const, label: 'Generation Failed' };
                        }
                        if (activeImageStatus?.status === 'complete') {
                            return { variant: 'success' as const, label: 'Ready' };
                        }
                        return undefined;
                    })()}
                />
            )}
            
            <main className="py-8 sm:py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {mode === 'quick' ? (
                        <>
                            <section className="mb-12">
                                <Suspense fallback={<LoadingFallback message="Loading quick generate..." />}>
                                    <PipelineGenerator onOpenInDirectorMode={(result, prompt) => {
                                        // Create project state and load it
                                        import('./utils/projectUtils').then(({ createQuickProjectState }) => {
                                            const projectState = createQuickProjectState(result, prompt);
                                            
                                            // Load the project into Director Mode
                                            setStoryBible(projectState.storyBible);
                                            setDirectorsVision(projectState.directorsVision);
                                            setScenes(projectState.scenes);
                                            setScenesToReview(projectState.scenesToReview);
                                            
                                            // Switch to Director Mode
                                            setMode('director');
                                            setWorkflowStage('director');
                                            
                                            addToast('Project loaded in Director Mode! You can now refine your story.', 'success');
                                        });
                                    }} />
                                </Suspense>
                            </section>
                            <Suspense fallback={<LoadingFallback message="Loading artifacts..." />}>
                                <ArtifactViewer addToast={addToast} />
                            </Suspense>
                        </>
                    ) : (
                        <>
                            {mode === 'director' && (
                                <section className="mb-8 p-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
                                    <h2 className="text-lg font-semibold text-amber-400 mb-2">Quick Generate Sandbox</h2>
                                    <p className="text-sm text-gray-400 mb-4">For fast one-prompt to video experiments. Switch to Quick Generate mode for full focus.</p>
                                    <Suspense fallback={<LoadingFallback message="Loading quick generate..." />}>
                                        <PipelineGenerator onOpenInDirectorMode={(result, prompt) => {
                                            // Create project state and load it
                                            import('./utils/projectUtils').then(({ createQuickProjectState }) => {
                                                const projectState = createQuickProjectState(result, prompt);
                                                
                                                // Load the project into current Director Mode session
                                                setStoryBible(projectState.storyBible);
                                                setDirectorsVision(projectState.directorsVision);
                                                setScenes(projectState.scenes);
                                                setScenesToReview(projectState.scenesToReview);
                                                
                                                addToast('Quick run imported! Refine your story in Director Mode.', 'success');
                                            });
                                        }} />
                                    </Suspense>
                                </section>
                            )}
                            <WorkflowTracker currentStage={workflowStage} onStageClick={handleStageClick} />
                            <Suspense fallback={<LoadingFallback message="Loading artifacts..." />}>
                                <ArtifactViewer addToast={addToast} />
                            </Suspense>
                            {generationProgress.total > 0 && (
                                <ProgressBar
                                    current={generationProgress.current}
                                    total={generationProgress.total}
                                    task={generationProgress.task}
                                />
                            )}
                            {renderCurrentStage()}
                        </>
                    )}
                </div>
            </main>

            <Toast toasts={toasts} removeToast={removeToast} />
            <ApiStatusIndicator />
            <Suspense fallback={null}>
                <UsageDashboard isOpen={isUsageDashboardOpen} onClose={() => setIsUsageDashboardOpen(false)} />
            </Suspense>
            <Suspense fallback={<div data-testid="modal-loading" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white">Loading Settings...</div>}>
                {isSettingsModalOpen && (
                    <LocalGenerationSettingsModal 
                        isOpen={isSettingsModalOpen}
                        onClose={() => setIsSettingsModalOpen(false)}
                        settings={localGenSettings}
                        onSave={(newSettings) => {
                            console.log('[App] onSave received newSettings:', JSON.stringify(newSettings, null, 2));
                            console.log('[App] Calling setLocalGenSettings...');
                            setLocalGenSettings(newSettings);
                            console.log('[App] setLocalGenSettings called');
                            addToast('Settings saved!', 'success');
                        }}
                        addToast={addToast}
                    />
                )}
            </Suspense>
            {continuityModal && (
                <Suspense fallback={null}>
                    <ContinuityModal
                        isOpen={true}
                    onClose={() => setContinuityModal(null)}
                    onSubmit={async (direction) => {
                        if (!continuityModal) return;
                        setIsExtending(true);
                        try {
                            const lastScene = scenes.find(s => s.id === continuityModal.sceneId);
                            if (!storyBible || !lastScene) throw new Error("Missing context for scene generation.");
                            
                            const newSceneData = await planActions.generateNextSceneFromContinuity(
                                storyBible,
                                directorsVision,
                                lastScene.summary,
                                direction,
                                continuityModal.lastFrame,
                                logApiCall,
                                updateApiStatus
                            );
                    
                            const newScene: Scene = {
                                id: `scene_${Date.now()}_${Math.random()}`,
                                title: newSceneData.title,
                                summary: newSceneData.summary,
                                timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
                            };
                            
                            const currentSceneIndex = scenes.findIndex(s => s.id === continuityModal.sceneId);
                            const newScenes = [...scenes];
                            newScenes.splice(currentSceneIndex + 1, 0, newScene);
                            
                            setScenes(newScenes);
                    
                            addToast(`New scene "${newScene.title}" added to timeline!`, 'success');
                            setContinuityModal(null);
                        } catch (e) {
                            addToast(e instanceof Error ? e.message : 'Failed to generate next scene.', 'error');
                        } finally {
                            setIsExtending(false);
                        }
                    }}
                    lastFrame={continuityModal.lastFrame}
                    isLoading={isExtending}
                />
                </Suspense>
            )}
            {mode === 'director' && (
                <Suspense fallback={null}>
                    <VisualBiblePanel
                        isOpen={isVisualBibleOpen}
                        onClose={() => setIsVisualBibleOpen(false)}
                    />
                </Suspense>
            )}
            {isNewProjectConfirmOpen && (
                <Suspense fallback={null}>
                    <ConfirmationModal
                        isOpen={isNewProjectConfirmOpen}
                        onClose={() => setIsNewProjectConfirmOpen(false)}
                        onConfirm={handleNewProject}
                        title="Start New Project?"
                        message="This will clear all current project data, including your story bible, scenes, and generated content. This action cannot be undone."
                        confirmText="Start New Project"
                        cancelText="Cancel"
                    />
                </Suspense>
            )}
        </div>
    );
};

const App: React.FC = () => (
    <UsageProvider>
        <ApiStatusProvider>
            <PipelineProvider>
                <PlanExpansionStrategyProvider>
                    <LocalGenerationSettingsProvider>
                        <MediaGenerationProviderProvider>
                            <LocalGenerationProvider>
                                <TemplateContextProvider>
                                    <ComfyUICallbackProvider>
                                        <AppContent />
                                    </ComfyUICallbackProvider>
                                </TemplateContextProvider>
                            </LocalGenerationProvider>
                        </MediaGenerationProviderProvider>
                    </LocalGenerationSettingsProvider>
                </PlanExpansionStrategyProvider>
            </PipelineProvider>
        </ApiStatusProvider>
    </UsageProvider>
);

export default App;
