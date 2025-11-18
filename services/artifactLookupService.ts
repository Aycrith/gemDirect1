import { ArtifactMetadata, ArtifactSceneMetadata } from '../utils/hooks';

/**
 * Artifact Lookup Service
 *
 * Provides utilities for finding scene artifacts in artifact-metadata.json
 * Ensures deterministic mapping between Director Mode scenes and artifact data.
 */

export function findSceneArtifact(
  artifact: ArtifactMetadata | null,
  sceneId: string
): ArtifactSceneMetadata | null {
  if (!artifact || !artifact.Scenes) {
    return null;
  }

  // Find the scene by SceneId (which should match Scene.id from Director Mode)
  return artifact.Scenes.find(scene => scene.SceneId === sceneId) || null;
}