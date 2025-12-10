async () => {
    const dbName = 'cinematic-story-db';
    const storyBible = {
        "title": "Test Story",
        "logline": "A test story.",
        "synopsis": "A test story.",
        "characters": [],
        "plotOutline": "Act I\nScene 1: A test scene.",
        "version": "2.0"
    };
    const scene = {
        "id": "scene-1",
        "title": "Test Scene",
        "summary": "A test scene.",
        "order": 1,
        "timeline": {
            "shots": [
                {
                    "id": "shot-1",
                    "description": "A test shot.",
                    "duration": 2,
                    "visualPrompt": "A cinematic shot of a test scene."
                }
            ]
        }
    };
    const directorsVision = "Cinematic.";
    const workflowStage = "continuity";

    // Construct Scene Store State
    const sceneStoreState = {
        state: {
            scenes: [scene],
            timelines: {
                [scene.id]: scene.timeline
            },
            generatedImages: {},
            generatedShotImages: {},
            generatedVideos: {},
            videoFeedbackResults: {},
            generationJobs: {},
            sceneImageStatuses: {},
            selectedSceneId: scene.id,
            _hasHydrated: true
        },
        version: 0
    };
    
    console.log("Injecting scene store state:", JSON.stringify(sceneStoreState));

    const openRequest = indexedDB.open(dbName);
    
    return new Promise((resolve, reject) => {
        openRequest.onerror = () => reject("DB Error");
        openRequest.onsuccess = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('storyBible') || !db.objectStoreNames.contains('scenes') || !db.objectStoreNames.contains('misc')) {
                 reject("Stores not found. Run app first.");
                 return;
            }

            const tx = db.transaction(['storyBible', 'scenes', 'misc'], 'readwrite');
            
            // Legacy Stores
            tx.objectStore('storyBible').put(storyBible, 'current');
            tx.objectStore('scenes').put(scene);
            tx.objectStore('misc').put(directorsVision, 'directorsVision');
            tx.objectStore('misc').put(workflowStage, 'workflowStage');
            
            // New Scene Store (persisted in misc)
            const putReq = tx.objectStore('misc').put(sceneStoreState, 'gemDirect-scene-store');
            
            putReq.onsuccess = () => console.log("Successfully injected gemDirect-scene-store");
            putReq.onerror = (e) => console.error("Failed to inject gemDirect-scene-store", e);
            
            tx.oncomplete = () => resolve("Story injected");
            tx.onerror = () => reject("Tx Error");
        };
    });
}
