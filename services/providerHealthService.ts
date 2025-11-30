/**
 * Provider Health Monitoring Service
 * 
 * Provides health checks and diagnostics for AI providers to prevent
 * single-point-of-failure issues and give users visibility into system status.
 */

import { GoogleGenAI } from "@google/genai";
import { LocalGenerationSettings } from '../types';
import { checkFastVideoHealth } from './fastVideoService';

export interface ProviderHealthStatus {
    providerId: string;
    providerName: string;
    status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
    message: string;
    lastChecked: Date;
    responseTime?: number;
}

export interface SystemHealthReport {
    timestamp: Date;
    providers: ProviderHealthStatus[];
    recommendations: string[];
}

/**
 * Check if Gemini API is accessible and responding
 */
export const checkGeminiHealth = async (): Promise<ProviderHealthStatus> => {
    const startTime = Date.now();
    const result: ProviderHealthStatus = {
        providerId: 'gemini-plan',
        providerName: 'Gemini AI',
        status: 'unknown',
        message: 'Checking...',
        lastChecked: new Date()
    };

    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            result.status = 'unavailable';
            result.message = 'API key not configured';
            return result;
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Hello',
            config: { temperature: 0 }
        });

        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime;

        if (response.text) {
            result.status = 'healthy';
            result.message = `Operational (${responseTime}ms response time)`;
        } else {
            result.status = 'degraded';
            result.message = 'API responding but returned empty response';
        }
    } catch (error) {
        result.status = 'unavailable';
        result.responseTime = Date.now() - startTime;
        
        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted')) {
                result.message = 'Rate limit exceeded or quota exhausted';
            } else if (errorMsg.includes('api key') || errorMsg.includes('unauthorized')) {
                result.message = 'API key invalid or unauthorized';
            } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
                result.message = 'Network error - check internet connection';
            } else {
                result.message = `API error: ${error.message}`;
            }
        } else {
            result.message = 'Unknown API error';
        }
    }

    return result;
};

/**
 * Check if Local Drafter is available
 */
export const checkLocalDrafterHealth = async (): Promise<ProviderHealthStatus> => {
    const result: ProviderHealthStatus = {
        providerId: 'local-drafter',
        providerName: 'Local Drafter',
        status: 'healthy',
        message: 'Local provider is always available (template-based)',
        lastChecked: new Date(),
        responseTime: 0
    };

    // Local drafter is always available since it's template-based
    // No external dependencies
    return result;
};

/**
 * Validate ComfyUI server URL to prevent SSRF attacks
 */
function validateComfyUIUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        // Only allow localhost/127.0.0.1 for security
        const allowedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
        // ComfyUI default port is 8188
        const allowedPorts = ['8188', ''];
        
        return allowedHosts.includes(parsed.hostname) && 
               (allowedPorts.includes(parsed.port) || parsed.port === '8188');
    } catch {
        return false;
    }
}

/**
 * Check if ComfyUI server is accessible
 */
export const checkComfyUIHealth = async (serverUrl: string = 'http://127.0.0.1:8188'): Promise<ProviderHealthStatus> => {
    const startTime = Date.now();
    const result: ProviderHealthStatus = {
        providerId: 'comfyui-local',
        providerName: 'ComfyUI',
        status: 'unknown',
        message: 'Checking...',
        lastChecked: new Date()
    };

    // Validate URL to prevent SSRF
    if (!validateComfyUIUrl(serverUrl)) {
        result.status = 'unavailable';
        result.message = 'Invalid server URL - only localhost/127.0.0.1 allowed';
        result.responseTime = Date.now() - startTime;
        return result;
    }

    try {
        const response = await fetch(`${serverUrl}/system_stats`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime;

        if (response.ok) {
            const data = await response.json();
            result.status = 'healthy';
            
            const vramInfo = data.system?.vram ? ` | VRAM: ${(data.system.vram.free / 1024 / 1024 / 1024).toFixed(1)}GB free` : '';
            result.message = `Server running (${responseTime}ms)${vramInfo}`;
        } else {
            result.status = 'degraded';
            result.message = `Server responded with status ${response.status}`;
        }
    } catch (error) {
        result.status = 'unavailable';
        result.responseTime = Date.now() - startTime;
        
        if (error instanceof Error) {
            if (error.message.includes('fetch')) {
                result.message = 'Server not reachable - ensure ComfyUI is running';
            } else {
                result.message = `Connection error: ${error.message}`;
            }
        } else {
            result.message = 'Unknown connection error';
        }
    }

    return result;
};

/**
 * Check FastVideo server health
 */
export const checkFastVideoServerHealth = async (
    settings: LocalGenerationSettings
): Promise<ProviderHealthStatus> => {
    const startTime = Date.now();
    const result: ProviderHealthStatus = {
        providerId: 'fastvideo-local',
        providerName: 'FastVideo',
        status: 'unknown',
        message: 'Checking...',
        lastChecked: new Date()
    };

    if (!settings.fastVideo?.endpointUrl) {
        result.status = 'unavailable';
        result.message = 'FastVideo not configured';
        return result;
    }

    try {
        const healthData = await checkFastVideoHealth(settings);
        const responseTime = Date.now() - startTime;
        result.responseTime = responseTime;

        if (healthData.status === 'ok') {
            result.status = healthData.modelLoaded ? 'healthy' : 'degraded';
            result.message = healthData.modelLoaded
                ? `Server running | Model: ${healthData.modelId.split('/').pop()} (${responseTime}ms)`
                : `Server running but model not loaded (${responseTime}ms)`;
        } else {
            result.status = 'degraded';
            result.message = `Server responded with status: ${healthData.status}`;
        }
    } catch (error) {
        result.status = 'unavailable';
        result.responseTime = Date.now() - startTime;
        
        if (error instanceof Error) {
            if (error.message.includes('timeout')) {
                result.message = 'Server timeout - check if adapter is running';
            } else if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
                result.message = 'Server not reachable - run scripts/run-fastvideo-server.ps1';
            } else {
                result.message = `Connection error: ${error.message}`;
            }
        } else {
            result.message = 'Unknown connection error';
        }
    }

    return result;
};

/**
 * Generate comprehensive system health report
 */
export const getSystemHealthReport = async (
    comfyUIUrl?: string,
    settings?: LocalGenerationSettings
): Promise<SystemHealthReport> => {
    // These always return ProviderHealthStatus
    const geminiHealthPromise = checkGeminiHealth();
    const localHealthPromise = checkLocalDrafterHealth();
    
    // These may return null if not configured
    const comfyHealthPromise = comfyUIUrl ? checkComfyUIHealth(comfyUIUrl) : Promise.resolve(null);
    const fastVideoHealthPromise = (settings && settings.videoProvider === 'fastvideo-local') 
        ? checkFastVideoServerHealth(settings) 
        : Promise.resolve(null);

    const [geminiHealth, localHealth, comfyHealth, fastVideoHealth] = await Promise.all([
        geminiHealthPromise,
        localHealthPromise,
        comfyHealthPromise,
        fastVideoHealthPromise
    ]);

    const providers: ProviderHealthStatus[] = [geminiHealth, localHealth];
    if (comfyHealth) {
        providers.push(comfyHealth);
    }
    if (fastVideoHealth) {
        providers.push(fastVideoHealth);
    }

    const recommendations: string[] = [];

    // Generate recommendations based on health status
    if (geminiHealth.status === 'unavailable') {
        recommendations.push('⚠️ Gemini API is unavailable. System will automatically use Local Drafter as fallback.');
        recommendations.push('✅ Local Drafter is operational - story generation will continue to work.');
    } else if (geminiHealth.status === 'degraded') {
        recommendations.push('⚠️ Gemini API is responding slowly or with issues.');
        recommendations.push('💡 Consider switching to Local Drafter for faster, offline generation.');
    } else if (geminiHealth.status === 'healthy') {
        recommendations.push('✅ Gemini API is operational with automatic fallback to Local Drafter if needed.');
    }

    if (comfyHealth && comfyHealth.status === 'unavailable') {
        recommendations.push('⚠️ ComfyUI server is not reachable. Start the server using the "Start ComfyUI Server" task.');
        recommendations.push('💡 You can still use Gemini Image for keyframe generation.');
    }

    if (fastVideoHealth && fastVideoHealth.status === 'unavailable') {
        recommendations.push('⚠️ FastVideo server is not reachable. Start it with: scripts/run-fastvideo-server.ps1');
        recommendations.push('💡 Switch to ComfyUI provider in Settings or use Gemini Image for keyframes.');
    } else if (fastVideoHealth && fastVideoHealth.status === 'degraded') {
        recommendations.push('⚠️ FastVideo server is running but model not loaded. First request will take longer.');
    }

    if (geminiHealth.status === 'healthy' && localHealth.status === 'healthy') {
        recommendations.push('🎉 All providers are operational! You have full redundancy and can choose your preferred provider.');
    }

    return {
        timestamp: new Date(),
        providers,
        recommendations
    };
};

/**
 * Quick health check that returns a simple boolean
 */
export const isSystemHealthy = async (): Promise<boolean> => {
    const report = await getSystemHealthReport();
    // System is healthy if at least one story generation provider is available
    const hasHealthyProvider = report.providers.some(
        p => (p.providerId === 'gemini-plan' || p.providerId === 'local-drafter') && 
             (p.status === 'healthy' || p.status === 'degraded')
    );
    return hasHealthyProvider;
};

/**
 * Get a user-friendly status message for the system
 */
export const getSystemStatusMessage = async (): Promise<string> => {
    const report = await getSystemHealthReport();
    const gemini = report.providers.find(p => p.providerId === 'gemini-plan');
    const local = report.providers.find(p => p.providerId === 'local-drafter');

    if (gemini?.status === 'healthy' && local?.status === 'healthy') {
        return '✅ All systems operational';
    } else if (gemini?.status === 'unavailable' && local?.status === 'healthy') {
        return '⚠️ Running on local fallback';
    } else if (local?.status === 'healthy') {
        return '⚠️ Gemini degraded, local available';
    } else {
        return '❌ System unavailable';
    }
};
