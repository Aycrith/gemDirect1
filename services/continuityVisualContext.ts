// TODO: This is a stub implementation. Visual Bible integration is not yet complete.
// This file provides minimal type definitions and stub functions to allow the build to succeed.

export interface CharacterContinuityIssue {
  sceneId: string;
  severity: 'critical' | 'warning';
  message: string;
}

export function getSceneVisualBibleContext(visualBible: any, sceneId: string): any {
  return null;
}

export function computeSceneContinuityScore(visualBible: any, scene: any, allScenes: any[]): number {
  return 0;
}

export function findCharacterContinuityIssues(visualBible: any, scenes: any[]): CharacterContinuityIssue[] {
  return [];
}
