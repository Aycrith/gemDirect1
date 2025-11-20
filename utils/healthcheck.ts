/**
 * Health Check and Contract Validation
 * Traffic-light readiness gates per AI_AGENT_PROMPT.md
 */

export interface HealthStatus {
  service: 'lm-studio' | 'comfyui' | 'gemdirect';
  status: 'green' | 'yellow' | 'red';
  reachable: boolean;
  latency?: number;
  errors: string[];
  warnings: string[];
  contracts: ContractCheck[];
}

export interface ContractCheck {
  name: string;
  expected: string | number;
  actual: string | number;
  passed: boolean;
}

export interface DriftMatrix {
  timestamp: number;
  services: {
    service: string;
    endpoint: string;
    auth: string;
    port: number;
    timeout: number;
    contentType: string;
    schemaVersion: string;
  }[];
  deviations: string[];
}

// Read from env with sane defaults (127.0.0.1 preferred over localhost for consistency)
const LM_STUDIO_EXPECTED = {
  endpoint: process.env.VITE_LOCAL_STORY_PROVIDER_URL?.replace('/v1/chat/completions', '') || 
            process.env.LM_STUDIO_URL || 
            'http://127.0.0.1:1234',
  port: parseInt(process.env.LM_STUDIO_PORT || '1234'),
  timeout: parseInt(process.env.LM_STUDIO_TIMEOUT || '5000'),
  contentType: 'application/json',
  schema: 'openai-v1',
};

const COMFYUI_EXPECTED = {
  endpoint: process.env.COMFYUI_URL || 'http://127.0.0.1:8188',
  port: parseInt(process.env.COMFYUI_PORT || '8188'),
  timeout: parseInt(process.env.COMFYUI_TIMEOUT || '60000'),
  contentType: 'application/json',
  schema: 'comfyui-custom',
};

/**
 * Checks LM Studio health and contract compliance
 */
export async function checkLMStudioHealth(): Promise<HealthStatus> {
  const status: HealthStatus = {
    service: 'lm-studio',
    status: 'red',
    reachable: false,
    errors: [],
    warnings: [],
    contracts: [],
  };

  try {
    const startTime = Date.now();
    const response = await fetch(`${LM_STUDIO_EXPECTED.endpoint}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(LM_STUDIO_EXPECTED.timeout),
    });

    status.latency = Date.now() - startTime;
    status.reachable = true;

    // Contract: Endpoint reachable
    status.contracts.push({
      name: 'endpoint_reachable',
      expected: LM_STUDIO_EXPECTED.endpoint,
      actual: response.url,
      passed: response.ok,
    });

    // Contract: Content-Type header
    const contentType = response.headers.get('content-type') || '';
    status.contracts.push({
      name: 'content_type',
      expected: LM_STUDIO_EXPECTED.contentType,
      actual: contentType,
      passed: contentType.includes(LM_STUDIO_EXPECTED.contentType),
    });

    // Contract: Response structure (OpenAI compatible)
    if (response.ok) {
      const data = await response.json();
      const hasDataArray = Array.isArray(data?.data);
      status.contracts.push({
        name: 'openai_schema',
        expected: 'data[]',
        actual: hasDataArray ? 'data[]' : 'invalid',
        passed: hasDataArray,
      });

      if (!hasDataArray) {
        status.errors.push('Response does not match OpenAI schema (missing data array)');
      }
    } else {
      status.errors.push(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Determine traffic light status
    const allPassed = status.contracts.every(c => c.passed);
    if (allPassed && status.reachable) {
      status.status = 'green';
    } else if (status.reachable) {
      status.status = 'yellow';
      status.warnings.push('Service reachable but contracts failing');
    }

  } catch (error) {
    status.errors.push(error instanceof Error ? error.message : String(error));
    status.status = 'red';
  }

  return status;
}

/**
 * Checks ComfyUI health and contract compliance
 */
export async function checkComfyUIHealth(): Promise<HealthStatus> {
  const status: HealthStatus = {
    service: 'comfyui',
    status: 'red',
    reachable: false,
    errors: [],
    warnings: [],
    contracts: [],
  };

  try {
    const startTime = Date.now();
    const response = await fetch(`${COMFYUI_EXPECTED.endpoint}/system_stats`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // Quick check
    });

    status.latency = Date.now() - startTime;
    status.reachable = true;

    // Contract: Endpoint reachable
    status.contracts.push({
      name: 'endpoint_reachable',
      expected: COMFYUI_EXPECTED.endpoint,
      actual: response.url,
      passed: response.ok,
    });

    // Contract: Response structure
    if (response.ok) {
      const data = await response.json();
      const hasSystem = !!data?.system;
      const hasDevices = Array.isArray(data?.devices);
      
      status.contracts.push({
        name: 'comfyui_schema',
        expected: 'system+devices',
        actual: `${hasSystem ? 'system' : ''}${hasDevices ? '+devices' : ''}`,
        passed: hasSystem && hasDevices,
      });

      if (!hasSystem || !hasDevices) {
        status.errors.push('Response does not match ComfyUI schema');
      }
    } else {
      status.errors.push(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check queue endpoint
    try {
      const queueResponse = await fetch(`${COMFYUI_EXPECTED.endpoint}/queue`, {
        signal: AbortSignal.timeout(3000),
      });
      status.contracts.push({
        name: 'queue_endpoint',
        expected: '/queue available',
        actual: queueResponse.ok ? 'available' : 'unavailable',
        passed: queueResponse.ok,
      });
    } catch (queueError) {
      status.warnings.push('Queue endpoint check failed');
    }

    // Determine traffic light status
    const allPassed = status.contracts.every(c => c.passed);
    if (allPassed && status.reachable) {
      status.status = 'green';
    } else if (status.reachable) {
      status.status = 'yellow';
      status.warnings.push('Service reachable but contracts failing');
    }

  } catch (error) {
    status.errors.push(error instanceof Error ? error.message : String(error));
    status.status = 'red';
  }

  return status;
}

/**
 * Generates drift matrix comparing actual vs expected configurations
 */
export async function generateDriftMatrix(): Promise<DriftMatrix> {
  const matrix: DriftMatrix = {
    timestamp: Date.now(),
    services: [
      {
        service: 'gemdirect',
        endpoint: 'http://localhost:3000',
        auth: 'none',
        port: 3000,
        timeout: 30000,
        contentType: 'application/json',
        schemaVersion: 'v1',
      },
      {
        service: 'lm-studio',
        endpoint: LM_STUDIO_EXPECTED.endpoint,
        auth: 'none',
        port: LM_STUDIO_EXPECTED.port,
        timeout: LM_STUDIO_EXPECTED.timeout,
        contentType: LM_STUDIO_EXPECTED.contentType,
        schemaVersion: LM_STUDIO_EXPECTED.schema,
      },
      {
        service: 'comfyui',
        endpoint: COMFYUI_EXPECTED.endpoint,
        auth: 'none',
        port: COMFYUI_EXPECTED.port,
        timeout: COMFYUI_EXPECTED.timeout,
        contentType: COMFYUI_EXPECTED.contentType,
        schemaVersion: COMFYUI_EXPECTED.schema,
      },
    ],
    deviations: [],
  };

  // Check for actual deviations by running health checks
  const [lmHealth, comfyHealth] = await Promise.all([
    checkLMStudioHealth(),
    checkComfyUIHealth(),
  ]);

  if (lmHealth.status !== 'green') {
    const marker = lmHealth.status === 'yellow' ? '[!]' : '[X]';
    matrix.deviations.push(`${marker} LM Studio: ${lmHealth.errors.join(', ')}`);
  }
  if (comfyHealth.status !== 'green') {
    const marker = comfyHealth.status === 'yellow' ? '[!]' : '[X]';
    matrix.deviations.push(`${marker} ComfyUI: ${comfyHealth.errors.join(', ')}`);
  }

  return matrix;
}

/**
 * Traffic-light readiness check - fails fast if services not ready
 */
export async function checkReadiness(): Promise<{
  ready: boolean;
  lmStudio: HealthStatus;
  comfyui: HealthStatus;
  blockers: string[];
}> {
  const [lmStudio, comfyui] = await Promise.all([
    checkLMStudioHealth(),
    checkComfyUIHealth(),
  ]);

  const blockers: string[] = [];
  
  if (lmStudio.status === 'red') {
    blockers.push(`LM Studio unreachable: ${lmStudio.errors.join(', ')}`);
  }
  if (comfyui.status === 'red') {
    blockers.push(`ComfyUI unreachable: ${comfyui.errors.join(', ')}`);
  }

  const ready = lmStudio.status !== 'red' && comfyui.status !== 'red';

  return { ready, lmStudio, comfyui, blockers };
}
