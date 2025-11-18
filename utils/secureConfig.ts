/**
 * Secure Configuration Service
 * 
 * Provides encrypted storage and retrieval of sensitive configuration
 * including API keys, model endpoints, and credentials.
 */

export interface SecureConfig {
    geminiApiKey?: string;
    localLLMEndpoint?: string;
    localLLMModel?: string;
    comfyUIEndpoint?: string;
}

/**
 * Simple encryption/decryption using base64 + character substitution
 * Note: This is NOT cryptographically secure and should be replaced
 * with proper encryption (AES-256) in production
 */
class EncryptionUtil {
    private static readonly SHIFT = 13; // Simple Caesar cipher

    static encrypt(text: string): string {
        try {
            // First encode as base64
            const base64 = Buffer.from(text).toString('base64');
            
            // Apply simple transformation
            return base64
                .split('')
                .map(char => String.fromCharCode(char.charCodeAt(0) + this.SHIFT))
                .join('');
        } catch (error) {
            console.error('[SecureConfig] Encryption failed:', error);
            return text;
        }
    }

    static decrypt(encrypted: string): string {
        try {
            // Reverse simple transformation
            const base64 = encrypted
                .split('')
                .map(char => String.fromCharCode(char.charCodeAt(0) - this.SHIFT))
                .join('');
            
            // Decode from base64
            return Buffer.from(base64, 'base64').toString('utf-8');
        } catch (error) {
            console.error('[SecureConfig] Decryption failed:', error);
            return encrypted;
        }
    }
}

/**
 * Secure config manager with encryption
 */
class SecureConfigManager {
    private static readonly STORAGE_KEY = 'gemDirect1_secure_config';
    private static readonly MASK_LENGTH = 8;

    private config: Map<string, string> = new Map();
    private loaded = false;

    constructor() {
        this.loadFromStorage();
    }

    /**
     * Load config from environment or localStorage
     */
    private loadFromStorage(): void {
        try {
            // In browser environment, use localStorage
            if (typeof window !== 'undefined' && window.localStorage) {
                const stored = window.localStorage.getItem(SecureConfigManager.STORAGE_KEY);
                if (stored) {
                    const decrypted = EncryptionUtil.decrypt(stored);
                    const parsed = JSON.parse(decrypted);
                    Object.entries(parsed).forEach(([key, value]) => {
                        this.config.set(key, String(value));
                    });
                }
            }
        } catch (error) {
            console.warn('[SecureConfig] Failed to load from storage:', error);
        }

        // Load from environment variables
        if (typeof process !== 'undefined' && process.env) {
            const envKeys = [
                'GEMINI_API_KEY',
                'LOCAL_STORY_PROVIDER_URL',
                'LOCAL_LLM_MODEL',
                'COMFYUI_URL'
            ];

            envKeys.forEach(key => {
                const value = process.env[key];
                if (value && !this.config.has(key)) {
                    this.config.set(key, value);
                }
            });
        }

        this.loaded = true;
    }

    /**
     * Save config to localStorage
     */
    private saveToStorage(): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const toStore: Record<string, string> = {};
                this.config.forEach((value, key) => {
                    toStore[key] = value;
                });
                const json = JSON.stringify(toStore);
                const encrypted = EncryptionUtil.encrypt(json);
                window.localStorage.setItem(SecureConfigManager.STORAGE_KEY, encrypted);
            }
        } catch (error) {
            console.error('[SecureConfig] Failed to save to storage:', error);
        }
    }

    /**
     * Set a config value
     */
    set(key: string, value: string): void {
        if (!this.isValidKey(key)) {
            throw new Error(`Invalid config key: ${key}`);
        }
        if (!this.isValidValue(value)) {
            throw new Error(`Invalid config value for ${key}`);
        }
        this.config.set(key, value);
        this.saveToStorage();
    }

    /**
     * Get a config value
     */
    get(key: string): string | undefined {
        return this.config.get(key);
    }

    /**
     * Get with fallback default
     */
    getOrDefault(key: string, defaultValue: string): string {
        return this.config.get(key) || defaultValue;
    }

    /**
     * Check if key exists
     */
    has(key: string): boolean {
        return this.config.has(key);
    }

    /**
     * Get all keys (sanitized)
     */
    getKeys(): string[] {
        return Array.from(this.config.keys());
    }

    /**
     * Clear all config
     */
    clear(): void {
        this.config.clear();
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(SecureConfigManager.STORAGE_KEY);
            }
        } catch (error) {
            console.error('[SecureConfig] Failed to clear storage:', error);
        }
    }

    /**
     * Get masked value for logging (hide sensitive data)
     */
    getMasked(key: string): string {
        const value = this.config.get(key);
        if (!value) return '[NOT SET]';
        
        if (value.length <= SecureConfigManager.MASK_LENGTH) {
            return '[REDACTED]';
        }

        const visible = SecureConfigManager.MASK_LENGTH;
        return value.substring(0, visible) + '...[REDACTED]';
    }

    /**
     * Validate config key
     */
    private isValidKey(key: string): boolean {
        const allowedKeys = [
            'GEMINI_API_KEY',
            'LOCAL_STORY_PROVIDER_URL',
            'LOCAL_LLM_MODEL',
            'COMFYUI_URL',
            'LOCAL_LLM_SEED',
            'LOCAL_LLM_TEMPERATURE',
            'LOCAL_LLM_TIMEOUT_MS'
        ];
        return allowedKeys.includes(key);
    }

    /**
     * Validate config value
     */
    private isValidValue(value: string): boolean {
        if (!value || value.trim().length === 0) {
            return false;
        }
        // Prevent values that are too long (potential injection)
        if (value.length > 10000) {
            return false;
        }
        return true;
    }

    /**
     * Export safe config (no sensitive values)
     */
    exportSafeConfig(): Record<string, string> {
        const safe: Record<string, string> = {};
        this.config.forEach((value, key) => {
            if (key.includes('KEY') || key.includes('TOKEN') || key.includes('PASSWORD')) {
                safe[key] = this.getMasked(key);
            } else {
                safe[key] = value;
            }
        });
        return safe;
    }

    /**
     * Get config summary for diagnostics
     */
    getSummary(): string {
        const summary: string[] = ['Secure Configuration Summary:'];
        this.config.forEach((value, key) => {
            summary.push(`  ${key}: ${this.getMasked(key)}`);
        });
        return summary.join('\n');
    }
}

// Singleton instance
let instance: SecureConfigManager | null = null;

/**
 * Get secure config manager instance
 */
export const getSecureConfig = (): SecureConfigManager => {
    if (!instance) {
        instance = new SecureConfigManager();
    }
    return instance;
};

/**
 * Set a config value
 */
export const setSecureConfig = (key: string, value: string): void => {
    getSecureConfig().set(key, value);
};

/**
 * Get a config value
 */
export const getSecureConfigValue = (key: string): string | undefined => {
    return getSecureConfig().get(key);
};

/**
 * Get with default fallback
 */
export const getSecureConfigOrDefault = (key: string, defaultValue: string): string => {
    return getSecureConfig().getOrDefault(key, defaultValue);
};

/**
 * Get masked value for logging
 */
export const getMaskedConfigValue = (key: string): string => {
    return getSecureConfig().getMasked(key);
};

/**
 * Get all config keys
 */
export const getConfigKeys = (): string[] => {
    return getSecureConfig().getKeys();
};

/**
 * Export safe config for logging/diagnostics
 */
export const exportSafeConfig = (): Record<string, string> => {
    return getSecureConfig().exportSafeConfig();
};

/**
 * Get summary for diagnostics
 */
export const getConfigSummary = (): string => {
    return getSecureConfig().getSummary();
};

/**
 * Clear all config
 */
export const clearSecureConfig = (): void => {
    getSecureConfig().clear();
};

/**
 * Initialize config from environment
 * Call this during application startup
 */
export const initializeSecureConfig = (): void => {
    const config = getSecureConfig();
    
    // Verify all critical config is present
    const required = ['COMFYUI_URL'];
    const optional = ['LOCAL_STORY_PROVIDER_URL', 'GEMINI_API_KEY'];
    
    const missing = required.filter(key => !config.has(key));
    
    if (missing.length > 0) {
        console.warn('[SecureConfig] Missing required configuration:', missing);
    }

    console.log('[SecureConfig] Configuration initialized');
    console.log(getConfigSummary());
};

/**
 * Validate that all required config is present
 */
export const validateSecureConfig = (): { valid: boolean; errors: string[] } => {
    const config = getSecureConfig();
    const errors: string[] = [];

    // Check required endpoints
    if (!config.has('COMFYUI_URL')) {
        errors.push('COMFYUI_URL is required');
    }

    // At least one LLM source should be configured
    const hasGemini = config.has('GEMINI_API_KEY');
    const hasLocal = config.has('LOCAL_STORY_PROVIDER_URL');

    if (!hasGemini && !hasLocal) {
        errors.push('At least one LLM source (GEMINI_API_KEY or LOCAL_STORY_PROVIDER_URL) is required');
    }

    return {
        valid: errors.length === 0,
        errors
    };
};
