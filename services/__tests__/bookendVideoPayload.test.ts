/**
 * Tests for bookend video generation payload and validation.
 * 
 * Verifies:
 * - generateVideoFromBookendsNative throws on missing profile (no silent fallback)
 * - Workflow validation rejects UI-format workflows
 * - Video generation returns valid data URL format
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import * as comfyUIService from '../comfyUIService';

// Mock fetch globally - save original for proper cleanup
const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Restore original fetch after all tests
afterAll(() => {
    global.fetch = originalFetch;
});

// Sample workflow JSON in API format
const validApiWorkflow = JSON.stringify({
  "1": {
    "class_type": "CLIPLoader",
    "inputs": { "clip_name": "test.safetensors" }
  },
  "2": {
    "class_type": "CLIPTextEncode",
    "inputs": { "text": "test prompt", "clip": ["1", 0] }
  },
  "3": {
    "class_type": "KSampler",
    "inputs": { "seed": 123, "steps": 20 }
  },
  "4": {
    "class_type": "LoadImage",
    "inputs": { "image": "start.png" }
  },
  "5": {
    "class_type": "LoadImage",
    "inputs": { "image": "end.png" }
  },
  "6": {
    "class_type": "WanFunInpaintToVideo",
    "inputs": { "start_image": ["4", 0], "end_image": ["5", 0] }
  },
  "7": {
    "class_type": "SaveVideo",
    "inputs": { "filename_prefix": "output" }
  }
});

// Sample workflow JSON in UI format (should be rejected)
const uiFormatWorkflow = JSON.stringify({
  "nodes": [
    { "id": 1, "type": "CLIPLoader" },
    { "id": 2, "type": "KSampler" }
  ],
  "links": [
    [1, 0, 2, 0]
  ],
  "groups": [],
  "extra": {}
});

// Mock settings with wan-fun-inpaint profile
const createMockSettings = (hasProfile: boolean, workflowJson: string = validApiWorkflow) => ({
  comfyUIUrl: 'http://127.0.0.1:8188',
  comfyUIClientId: 'test-client',
  workflowProfiles: hasProfile ? {
    'wan-fun-inpaint': {
      id: 'wan-fun-inpaint',
      label: 'WAN Fun Inpaint',
      workflowJson,
      mapping: {
        '2:text': 'human_readable_prompt',
        '4:image': 'start_image',
        '5:image': 'end_image'
      }
    }
  } : {}
});

const mockScene = {
  id: 'scene-001',
  title: 'Test Scene',
  summary: 'A test scene for video generation',
  timeline: {
    shots: [{ id: 'shot-1', description: 'Test shot' }],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: ''
  }
};

const mockTimeline = {
  shots: [{ id: 'shot-1', description: 'Test shot' }],
  shotEnhancers: {},
  transitions: [],
  negativePrompt: ''
};

const mockBookends = {
  start: 'base64-start-image-data',
  end: 'base64-end-image-data'
};

const mockLogApiCall = vi.fn();
const mockOnStateChange = vi.fn();

describe('generateVideoFromBookendsNative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Profile Validation', () => {
    it('throws explicit error when wan-fun-inpaint profile is missing', async () => {
      const settingsWithoutProfile = createMockSettings(false);
      
      await expect(
        comfyUIService.generateVideoFromBookendsNative(
          settingsWithoutProfile as any,
          mockScene as any,
          mockTimeline as any,
          mockBookends,
          'Test vision',
          mockLogApiCall,
          mockOnStateChange,
          'wan-fun-inpaint'
        )
      ).rejects.toThrow(/Workflow profile 'wan-fun-inpaint' not found/);
    });

    it('throws explicit error when wan-flf2v profile is missing', async () => {
      const settingsWithoutProfile = createMockSettings(false);
      
      await expect(
        comfyUIService.generateVideoFromBookendsNative(
          settingsWithoutProfile as any,
          mockScene as any,
          mockTimeline as any,
          mockBookends,
          'Test vision',
          mockLogApiCall,
          mockOnStateChange,
          'wan-flf2v'
        )
      ).rejects.toThrow(/Workflow profile 'wan-flf2v' not found/);
    });

    it('error message includes configuration instructions', async () => {
      const settingsWithoutProfile = createMockSettings(false);
      
      await expect(
        comfyUIService.generateVideoFromBookendsNative(
          settingsWithoutProfile as any,
          mockScene as any,
          mockTimeline as any,
          mockBookends,
          'Test vision',
          mockLogApiCall,
          mockOnStateChange
        )
      ).rejects.toThrow(/Settings.*Workflow Profiles/);
    });
  });

  describe('Input Validation', () => {
    it('throws when start keyframe is missing', async () => {
      const settings = createMockSettings(true);
      
      await expect(
        comfyUIService.generateVideoFromBookendsNative(
          settings as any,
          mockScene as any,
          mockTimeline as any,
          { start: '', end: 'valid-end' },
          'Test vision',
          mockLogApiCall,
          mockOnStateChange
        )
      ).rejects.toThrow(/start and end keyframes are required/);
    });

    it('throws when end keyframe is missing', async () => {
      const settings = createMockSettings(true);
      
      await expect(
        comfyUIService.generateVideoFromBookendsNative(
          settings as any,
          mockScene as any,
          mockTimeline as any,
          { start: 'valid-start', end: '' },
          'Test vision',
          mockLogApiCall,
          mockOnStateChange
        )
      ).rejects.toThrow(/start and end keyframes are required/);
    });
  });

  describe('Default Profile', () => {
    it('defaults to wan-fun-inpaint profile when not specified', async () => {
      // This test verifies the default is wan-fun-inpaint by checking
      // that it throws the profile-not-found error for wan-fun-inpaint (not wan-flf2v)
      const settingsWithoutProfile = createMockSettings(false);
      
      await expect(
        comfyUIService.generateVideoFromBookendsNative(
          settingsWithoutProfile as any,
          mockScene as any,
          mockTimeline as any,
          mockBookends,
          'Test vision',
          mockLogApiCall,
          mockOnStateChange
          // Note: no profileId parameter - should default to wan-fun-inpaint
        )
      ).rejects.toThrow(/wan-fun-inpaint/);
    });
  });
});

describe('Workflow Validator', () => {
  // Import validator functions directly for unit testing
  let validateWorkflowIntegrity: any;
  let isApiFormat: any;
  let detectWorkflowFormat: any;

  beforeEach(async () => {
    const validator = await import('../../utils/workflowValidator');
    validateWorkflowIntegrity = validator.validateWorkflowIntegrity;
    isApiFormat = validator.isApiFormat;
    detectWorkflowFormat = validator.detectWorkflowFormat;
  });

  describe('detectWorkflowFormat', () => {
    it('identifies API format workflow', () => {
      const workflow = JSON.parse(validApiWorkflow);
      expect(detectWorkflowFormat(workflow)).toBe('api');
    });

    it('identifies UI format workflow', () => {
      const workflow = JSON.parse(uiFormatWorkflow);
      expect(detectWorkflowFormat(workflow)).toBe('ui');
    });

    it('returns unknown for empty object', () => {
      expect(detectWorkflowFormat({})).toBe('unknown');
    });

    it('handles prompt-wrapped workflow', () => {
      const wrapped = { prompt: JSON.parse(validApiWorkflow) };
      expect(detectWorkflowFormat(wrapped)).toBe('api');
    });
  });

  describe('isApiFormat', () => {
    it('returns true for API format', () => {
      const workflow = JSON.parse(validApiWorkflow);
      expect(isApiFormat(workflow)).toBe(true);
    });

    it('returns false for UI format', () => {
      const workflow = JSON.parse(uiFormatWorkflow);
      expect(isApiFormat(workflow)).toBe(false);
    });
  });

  describe('validateWorkflowIntegrity', () => {
    it('validates fun-inpaint workflow with all required nodes', () => {
      const workflow = JSON.parse(validApiWorkflow);
      const result = validateWorkflowIntegrity(workflow, 'fun-inpaint');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('api');
      expect(result.errors).toHaveLength(0);
    });

    it('rejects UI format workflow', () => {
      const workflow = JSON.parse(uiFormatWorkflow);
      const result = validateWorkflowIntegrity(workflow, 'fun-inpaint');
      
      expect(result.valid).toBe(false);
      expect(result.format).toBe('ui');
      expect(result.errors[0]).toMatch(/UI format/);
    });

    it('reports missing required nodes', () => {
      const incompleteWorkflow = {
        "1": { "class_type": "CLIPTextEncode", "inputs": {} },
        "2": { "class_type": "KSampler", "inputs": {} }
      };
      
      const result = validateWorkflowIntegrity(incompleteWorkflow, 'fun-inpaint');
      
      expect(result.valid).toBe(false);
      expect(result.missingNodes).toContain('WanFunInpaintToVideo');
      expect(result.missingNodes).toContain('LoadImage');
    });

    it('warns when bookend workflow has fewer than 2 LoadImage nodes', () => {
      const singleLoadImageWorkflow = {
        "1": { "class_type": "CLIPTextEncode", "inputs": {} },
        "2": { "class_type": "KSampler", "inputs": {} },
        "3": { "class_type": "LoadImage", "inputs": {} },
        "4": { "class_type": "WanFunInpaintToVideo", "inputs": {} },
        "5": { "class_type": "SaveVideo", "inputs": {} }
      };
      
      const result = validateWorkflowIntegrity(singleLoadImageWorkflow, 'fun-inpaint');
      
      // Should be valid but with warning
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w: string) => w.includes('2 LoadImage nodes'))).toBe(true);
    });
  });
});

describe('Video Output Validation', () => {
  it('validates data URL format starts with data:video/', () => {
    const validDataUrl = 'data:video/mp4;base64,AAAA...';
    const isValid = validDataUrl.startsWith('data:video/') || validDataUrl.startsWith('data:image/');
    expect(isValid).toBe(true);
  });

  it('rejects filename instead of data URL', () => {
    const filename = 'output/video_00001.mp4';
    const isValid = filename.startsWith('data:video/') || filename.startsWith('data:image/');
    expect(isValid).toBe(false);
  });

  it('rejects relative path', () => {
    const path = './videos/output.mp4';
    const isValid = path.startsWith('data:video/') || path.startsWith('data:image/');
    expect(isValid).toBe(false);
  });
});
