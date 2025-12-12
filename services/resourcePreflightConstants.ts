import type { StabilityProfileId } from '../utils/stabilityProfiles';

/**
 * VRAM requirements for each stability preset (in MB)
 *
 * Updated for B2 (Resource Safety & Defaults Hardening):
 * - Fast: 6-8 GB - Basic WAN workflow, no temporal processing
 * - Standard: 8-12 GB - WAN + deflicker post-processing
 * - Cinematic: 12-16 GB - WAN + deflicker + IP-Adapter + FETA
 *
 * Based on empirical testing with RTX 3060/3070/3090/4090 cards.
 * Values represent minimum VRAM to start generation without OOM.
 */
export const PRESET_VRAM_REQUIREMENTS: Record<StabilityProfileId, number> = {
    fast: 6144, // 6GB - Basic WAN 2.5B workflow only
    standard: 8192, // 8GB - WAN 2.5B + deflicker post-processing
    cinematic: 12288, // 12GB - WAN 2.5B + deflicker + IP-Adapter + FETA
    custom: 8192, // 8GB - Assume standard as baseline
};

/**
 * Recommended VRAM for comfortable operation (in MB)
 * Includes headroom for system overhead and unexpected spikes.
 */
export const PRESET_VRAM_RECOMMENDED: Record<StabilityProfileId, number> = {
    fast: 8192, // 8GB recommended for Fast
    standard: 12288, // 12GB recommended for Standard
    cinematic: 16384, // 16GB recommended for Cinematic
    custom: 12288, // 12GB baseline for Custom
};

/**
 * Recommended headroom above minimum VRAM (in MB)
 * Leaves room for system overhead and unexpected spikes.
 */
export const VRAM_HEADROOM_MB = 2048; // 2GB

/**
 * Maximum acceptable VRAM for any preset (to warn about overkill)
 */
export const MAX_RECOMMENDED_VRAM_MB = 24576; // 24GB

