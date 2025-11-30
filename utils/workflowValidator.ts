/**
 * Workflow Validator Utility
 * 
 * Validates ComfyUI workflow integrity and format before queuing.
 * Ensures workflows are in API format (not UI format) and contain required nodes.
 */

/**
 * Node types expected in different workflow categories
 */
export const REQUIRED_NODE_TYPES = {
  // Text-to-Image workflows
  't2i': ['CLIPTextEncode', 'KSampler', 'VAEDecode', 'SaveImage'],
  // Image-to-Video workflows  
  'i2v': ['CLIPTextEncode', 'KSampler', 'LoadImage', 'SaveVideo'],
  // First-Last-Frame to Video (bookend)
  'flf2v': ['CLIPTextEncode', 'KSampler', 'LoadImage', 'WanFirstLastFrameToVideo', 'SaveVideo'],
  // Fun Inpaint to Video (bookend)
  'fun-inpaint': ['CLIPTextEncode', 'KSampler', 'LoadImage', 'WanFunInpaintToVideo', 'SaveVideo'],
  // Fun Control to Video
  'fun-control': ['CLIPTextEncode', 'KSampler', 'LoadImage', 'Wan22FunControlToVideo', 'SaveVideo'],
} as const;

export type WorkflowCategory = keyof typeof REQUIRED_NODE_TYPES;

/**
 * Workflow validation result
 */
export interface WorkflowValidationResult {
  valid: boolean;
  format: 'api' | 'ui' | 'unknown';
  nodeTypes: string[];
  missingNodes: string[];
  warnings: string[];
  errors: string[];
}

/**
 * Detects if a workflow is in API format (flat node structure) or UI format (nested with links).
 * 
 * API format: { "1": { "class_type": "...", "inputs": {...} }, "2": {...} }
 * UI format: { "nodes": [...], "links": [...], "groups": [...] }
 * 
 * @param workflow Parsed workflow object
 * @returns 'api' | 'ui' | 'unknown'
 */
export function detectWorkflowFormat(workflow: Record<string, unknown>): 'api' | 'ui' | 'unknown' {
  if (!workflow || typeof workflow !== 'object') {
    return 'unknown';
  }

  // UI format indicators: nodes array, links array, and often 'extra' metadata
  const hasNodesArray = Array.isArray(workflow.nodes);
  const hasLinksArray = Array.isArray(workflow.links);
  
  if (hasNodesArray && hasLinksArray) {
    return 'ui';
  }

  // API format indicators: numeric keys with class_type/inputs structure
  const keys = Object.keys(workflow);
  const hasNumericKeys = keys.some(k => /^\d+$/.test(k));
  const hasClassType = keys.some(k => {
    const node = workflow[k];
    return typeof node === 'object' && node !== null && 'class_type' in node;
  });

  if (hasNumericKeys && hasClassType) {
    return 'api';
  }

  // Check for prompt wrapper: { prompt: { "1": {...} } }
  if ('prompt' in workflow && typeof workflow.prompt === 'object') {
    return detectWorkflowFormat(workflow.prompt as Record<string, unknown>);
  }

  return 'unknown';
}

/**
 * Checks if a workflow is in API format.
 * @param workflow Parsed workflow object
 * @returns true if API format, false otherwise
 */
export function isApiFormat(workflow: Record<string, unknown>): boolean {
  return detectWorkflowFormat(workflow) === 'api';
}

/**
 * Extracts all node class_types from a workflow.
 * Handles both API format and prompt-wrapped format.
 * 
 * @param workflow Parsed workflow object
 * @returns Array of unique class_type strings
 */
export function extractNodeTypes(workflow: Record<string, unknown>): string[] {
  const nodeTypes = new Set<string>();

  // Handle prompt wrapper
  const nodes = ('prompt' in workflow && typeof workflow.prompt === 'object')
    ? workflow.prompt as Record<string, unknown>
    : workflow;

  for (const [key, value] of Object.entries(nodes)) {
    // Skip non-node keys
    if (!/^\d+$/.test(key)) continue;
    
    if (typeof value === 'object' && value !== null && 'class_type' in value) {
      const classType = (value as { class_type: string }).class_type;
      if (typeof classType === 'string') {
        nodeTypes.add(classType);
      }
    }
  }

  return Array.from(nodeTypes);
}

/**
 * Validates workflow integrity for a specific workflow category.
 * 
 * @param workflow Parsed workflow object (API format expected)
 * @param category Workflow category to validate against
 * @returns Validation result with details
 */
export function validateWorkflowIntegrity(
  workflow: Record<string, unknown>,
  category: WorkflowCategory
): WorkflowValidationResult {
  const result: WorkflowValidationResult = {
    valid: true,
    format: detectWorkflowFormat(workflow),
    nodeTypes: [],
    missingNodes: [],
    warnings: [],
    errors: [],
  };

  // Check format
  if (result.format === 'ui') {
    result.valid = false;
    result.errors.push(
      'Workflow is in UI format (contains nodes/links arrays). ' +
      'Please export as API format from ComfyUI (Save API Format) or use the corresponding *API.json file.'
    );
    return result;
  }

  if (result.format === 'unknown') {
    result.valid = false;
    result.errors.push('Unable to determine workflow format. Expected API format with numeric node IDs.');
    return result;
  }

  // Extract and check node types
  result.nodeTypes = extractNodeTypes(workflow);
  
  if (result.nodeTypes.length === 0) {
    result.valid = false;
    result.errors.push('No valid nodes found in workflow.');
    return result;
  }

  // Check for required nodes
  const requiredNodes = REQUIRED_NODE_TYPES[category];
  for (const required of requiredNodes) {
    if (!result.nodeTypes.includes(required)) {
      result.missingNodes.push(required);
    }
  }

  if (result.missingNodes.length > 0) {
    result.valid = false;
    result.errors.push(
      `Missing required nodes for ${category} workflow: ${result.missingNodes.join(', ')}. ` +
      `Found nodes: ${result.nodeTypes.join(', ')}`
    );
  }

  // Add warnings for common issues
  if (!result.nodeTypes.includes('SaveVideo') && !result.nodeTypes.includes('SaveImage')) {
    result.warnings.push('Workflow has no SaveVideo or SaveImage node - output may not be retrievable.');
  }

  // Check for dual LoadImage nodes in bookend workflows
  if (category === 'flf2v' || category === 'fun-inpaint') {
    const loadImageCount = countNodeType(workflow, 'LoadImage');
    if (loadImageCount < 2) {
      result.warnings.push(
        `Bookend workflow should have 2 LoadImage nodes (start/end), found ${loadImageCount}.`
      );
    }
  }

  return result;
}

/**
 * Counts occurrences of a specific node type in a workflow.
 */
function countNodeType(workflow: Record<string, unknown>, nodeType: string): number {
  let count = 0;
  
  const nodes = ('prompt' in workflow && typeof workflow.prompt === 'object')
    ? workflow.prompt as Record<string, unknown>
    : workflow;

  for (const [key, value] of Object.entries(nodes)) {
    if (!/^\d+$/.test(key)) continue;
    
    if (typeof value === 'object' && value !== null && 'class_type' in value) {
      if ((value as { class_type: string }).class_type === nodeType) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Validates a workflow JSON string before parsing.
 * Returns parsed workflow if valid, throws descriptive error if not.
 * 
 * @param workflowJson JSON string of workflow
 * @param category Expected workflow category
 * @returns Parsed and validated workflow object
 * @throws Error with detailed message if validation fails
 */
export function parseAndValidateWorkflow(
  workflowJson: string,
  category: WorkflowCategory
): Record<string, unknown> {
  // Parse JSON
  let workflow: Record<string, unknown>;
  try {
    workflow = JSON.parse(workflowJson);
  } catch (e) {
    throw new Error(
      `Invalid workflow JSON: ${e instanceof Error ? e.message : 'Parse error'}. ` +
      'Ensure the workflow is valid JSON exported from ComfyUI.'
    );
  }

  // Validate structure
  const result = validateWorkflowIntegrity(workflow, category);
  
  if (!result.valid) {
    throw new Error(result.errors.join(' '));
  }

  // Log warnings
  if (result.warnings.length > 0) {
    console.warn('[WorkflowValidator]', result.warnings.join(' '));
  }

  return workflow;
}

/**
 * Maps profile IDs to workflow categories for validation.
 */
export function getWorkflowCategoryForProfile(profileId: string): WorkflowCategory | null {
  const mapping: Record<string, WorkflowCategory> = {
    'flux-t2i': 't2i',
    'wan-t2i': 't2i',
    'wan-i2v': 'i2v',
    'wan-flf2v': 'flf2v',
    'wan-fun-inpaint': 'fun-inpaint',
    'wan-fun-control': 'fun-control',
  };
  
  return mapping[profileId] ?? null;
}
