import { describe, it, expect, beforeEach } from 'vitest';
import {
    getSecureConfig,
    setSecureConfig,
    getSecureConfigValue,
    getSecureConfigOrDefault,
    getMaskedConfigValue,
    getConfigKeys,
    exportSafeConfig,
    clearSecureConfig,
    validateSecureConfig
} from '../../utils/secureConfig';

describe('secureConfig', () => {
    beforeEach(() => {
        clearSecureConfig();
    });

    describe('setSecureConfig / getSecureConfigValue', () => {
        it('sets and gets config values', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');
            const value = getSecureConfigValue('COMFYUI_URL');

            expect(value).toBe('http://localhost:8188');
        });

        it('returns undefined for non-existent keys', () => {
            const value = getSecureConfigValue('NON_EXISTENT');
            expect(value).toBeUndefined();
        });

        it('validates key names', () => {
            expect(() => {
                setSecureConfig('INVALID_KEY', 'value');
            }).toThrow();
        });

        it('validates values', () => {
            expect(() => {
                setSecureConfig('COMFYUI_URL', '');
            }).toThrow();
        });
    });

    describe('getSecureConfigOrDefault', () => {
        it('returns stored value', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');
            const value = getSecureConfigOrDefault('COMFYUI_URL', 'default');

            expect(value).toBe('http://localhost:8188');
        });

        it('returns default for missing value', () => {
            const value = getSecureConfigOrDefault('COMFYUI_URL', 'http://default');

            expect(value).toBe('http://default');
        });
    });

    describe('getMaskedConfigValue', () => {
        it('masks sensitive keys', () => {
            setSecureConfig('GEMINI_API_KEY', 'my-super-secret-key-12345');
            const masked = getMaskedConfigValue('GEMINI_API_KEY');

            expect(masked).toContain('[REDACTED]');
            expect(masked).not.toContain('secret');
        });

        it('shows first part of long values', () => {
            setSecureConfig('GEMINI_API_KEY', 'my-super-secret-key-12345');
            const masked = getMaskedConfigValue('GEMINI_API_KEY');

            expect(masked).toContain('my-sup');
            expect(masked).toContain('...[REDACTED]');
        });

        it('masks short values completely', () => {
            setSecureConfig('LOCAL_LLM_MODEL', 'small');
            const masked = getMaskedConfigValue('LOCAL_LLM_MODEL');

            expect(masked).toBe('[REDACTED]');
        });

        it('shows [NOT SET] for missing values', () => {
            const masked = getMaskedConfigValue('MISSING_KEY');
            expect(masked).toBe('[NOT SET]');
        });
    });

    describe('getConfigKeys', () => {
        it('returns all configured keys', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');
            setSecureConfig('LOCAL_LLM_MODEL', 'mistral');

            const keys = getConfigKeys();

            expect(keys).toContain('COMFYUI_URL');
            expect(keys).toContain('LOCAL_LLM_MODEL');
        });

        it('returns empty array when no config', () => {
            const keys = getConfigKeys();
            expect(keys).toHaveLength(0);
        });
    });

    describe('exportSafeConfig', () => {
        it('masks sensitive values', () => {
            setSecureConfig('GEMINI_API_KEY', 'secret-key-12345');
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');

            const safe = exportSafeConfig();

            expect(safe.GEMINI_API_KEY).toContain('[REDACTED]');
            expect(safe.COMFYUI_URL).toBe('http://localhost:8188');
        });

        it('includes all keys', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');
            setSecureConfig('LOCAL_LLM_MODEL', 'mistral');

            const safe = exportSafeConfig();

            expect(Object.keys(safe)).toContain('COMFYUI_URL');
            expect(Object.keys(safe)).toContain('LOCAL_LLM_MODEL');
        });
    });

    describe('clearSecureConfig', () => {
        it('clears all config', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');
            clearSecureConfig();

            const value = getSecureConfigValue('COMFYUI_URL');
            expect(value).toBeUndefined();
        });
    });

    describe('validateSecureConfig', () => {
        it('validates required config is present', () => {
            const result = validateSecureConfig();

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('accepts valid config', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');
            setSecureConfig('LOCAL_STORY_PROVIDER_URL', 'http://192.168.50.192:1234/v1/chat/completions');

            const result = validateSecureConfig();

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('requires at least one LLM source', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');

            const result = validateSecureConfig();

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('LLM'))).toBe(true);
        });

        it('accepts Gemini as LLM source', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');
            setSecureConfig('GEMINI_API_KEY', 'test-key-12345');

            const result = validateSecureConfig();

            expect(result.valid).toBe(true);
        });
    });

    describe('Encryption', () => {
        it('stores encrypted config in localStorage', () => {
            if (typeof window !== 'undefined' && window.localStorage) {
                setSecureConfig('COMFYUI_URL', 'http://localhost:8188');

                const stored = window.localStorage.getItem('gemDirect1_secure_config');
                expect(stored).toBeDefined();
                expect(stored).not.toContain('http://localhost');
            }
        });
    });

    describe('Singleton Pattern', () => {
        it('returns same instance', () => {
            const config1 = getSecureConfig();
            const config2 = getSecureConfig();

            expect(config1).toBe(config2);
        });
    });

    describe('Configuration Summary', () => {
        it('generates config summary', () => {
            setSecureConfig('COMFYUI_URL', 'http://localhost:8188');
            setSecureConfig('LOCAL_LLM_MODEL', 'mistral');

            const summary = getSecureConfig().getSummary();

            expect(summary).toContain('Secure Configuration Summary');
            expect(summary).toContain('COMFYUI_URL');
            expect(summary).toContain('LOCAL_LLM_MODEL');
        });
    });
});
