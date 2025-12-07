import { spawnSync } from 'child_process';

type PreflightResult = {
    ffmpegVersion?: string;
    tmixNormalizeSupported: boolean;
    vlmEndpoint: string;
    vlmReachable: boolean;
    warnings: string[];
};

/**
 * Check ffmpeg version string by invoking `ffmpeg -version`.
 */
function getFfmpegVersion(): string | undefined {
    try {
        const res = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' });
        if (res.status === 0 && res.stdout) {
            const firstLine = res.stdout.split('\n')[0] || '';
            const match = firstLine.match(/ffmpeg version\s+([^\s]+)/i);
            return match?.[1] || firstLine.trim();
        }
    } catch {
        // ignore
    }
    return undefined;
}

/**
 * Detect whether tmix normalize=1 is supported by running a tiny probe.
 */
function hasTmixNormalize(): boolean {
    try {
        const probeArgs = [
            '-hide_banner',
            '-loglevel',
            'error',
            '-f',
            'lavfi',
            '-i',
            'color=c=black:s=16x16:d=0.05',
            '-frames:v',
            '2',
            '-vf',
            "tmix=frames=2:weights='1 1':normalize=1",
            '-f',
            'null',
            '-',
        ];
        const res = spawnSync('ffmpeg', probeArgs, { stdio: 'ignore' });
        return res.status === 0;
    } catch {
        return false;
    }
}

/**
 * Check reachability of the VLM endpoint. Treat any non-network failure as reachable.
 */
async function isVlmReachable(endpoint: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const resp = await fetch(endpoint, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        return !!resp;
    } catch {
        return false;
    }
}

/**
 * Run preflight checks for ffmpeg and VLM endpoint.
 */
export async function runPreflight(): Promise<PreflightResult> {
    const warnings: string[] = [];
    const ffmpegVersion = getFfmpegVersion();
    const tmixNormalizeSupported = hasTmixNormalize();
    if (!ffmpegVersion) {
        warnings.push('ffmpeg not found');
    } else if (!tmixNormalizeSupported) {
        warnings.push('ffmpeg tmix normalize=1 not supported; temporal smoothing will fall back');
    }

    const vlmEndpoint = process.env.VLM_ENDPOINT || 'http://192.168.50.192:1234/v1/chat/completions';
    const vlmReachable = await isVlmReachable(vlmEndpoint);
    if (!vlmReachable) {
        warnings.push(`VLM endpoint unreachable: ${vlmEndpoint}`);
    }

    return {
        ffmpegVersion,
        tmixNormalizeSupported,
        vlmEndpoint,
        vlmReachable,
        warnings,
    };
}

