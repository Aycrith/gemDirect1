/**
 * Node-only FLF2V frame extraction.
 *
 * IMPORTANT: This module must never be imported in the browser bundle.
 * It uses Node built-ins and is intended to be loaded via dynamic import
 * behind a runtime guard (e.g. `typeof window === 'undefined'`).
 */

import { exec as execCb } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execCb);

const ensureDir = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const safeUnlink = (filePath: string) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch {
        // best-effort cleanup
    }
};

/**
 * Downloads a video from `videoUrl`, extracts the last frame with ffmpeg, and returns it as base64.
 *
 * @returns base64 (no data-url prefix) or null when extraction failed.
 */
export async function extractLastFrameBase64FromVideoUrl(
    videoUrl: string,
    options?: {
        tempDir?: string;
        /** ffmpeg path override (defaults to `ffmpeg` on PATH). */
        ffmpegPath?: string;
    }
): Promise<string | null> {
    const tempDir = options?.tempDir ?? path.join(process.cwd(), 'temp');
    const ffmpegPath = options?.ffmpegPath ?? 'ffmpeg';

    ensureDir(tempDir);

    const stamp = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const tempVideoPath = path.join(tempDir, `temp_video_${stamp}.mp4`);
    const tempFramePath = path.join(tempDir, `temp_frame_${stamp}.jpg`);

    try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(tempVideoPath, buffer);

        // -sseof -0.1 seeks near the end to reliably get a frame.
        // -update 1 writes/overwrites a single frame.
        const cmd = `${ffmpegPath} -sseof -0.1 -i "${tempVideoPath}" -vsync 0 -q:v 2 -update 1 "${tempFramePath}" -y`;
        await exec(cmd);

        if (!fs.existsSync(tempFramePath)) {
            return null;
        }

        const frameBuffer = fs.readFileSync(tempFramePath);
        return frameBuffer.toString('base64');
    } catch {
        return null;
    } finally {
        safeUnlink(tempVideoPath);
        safeUnlink(tempFramePath);
    }
}
