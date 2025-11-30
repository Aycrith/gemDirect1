// A utility to convert a Blob to a base64 string
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                // The result includes the data URL prefix, which we need to remove.
                // e.g., "data:image/jpeg;base64,...." -> "...."
                const base64String = reader.result.split(',')[1] ?? '';
                resolve(base64String);
            } else {
                reject(new Error('Failed to convert blob to base64 string.'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// A utility to convert a base64 string to a Blob
export const base64ToBlob = (base64: string, mimeType: string): Blob => {
    if (!base64) {
        throw new Error('No base64 data supplied for blob conversion.');
    }

    const normalized = base64.includes(',') ? base64.split(',')[1] : base64;
    if (!normalized) {
        throw new Error('Failed to extract base64 data from input.');
    }
    const cleaned = normalized.replace(/\s/g, '');
    const chunkSize = 8192; // multiple of 4 to avoid breaking base64 groups
    const parts: BlobPart[] = [];

    try {
        for (let offset = 0; offset < cleaned.length; offset += chunkSize) {
            const chunk = cleaned.slice(offset, offset + chunkSize);
            const decoded = atob(chunk);
            const byteArray = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
                byteArray[i] = decoded.charCodeAt(i);
            }
            parts.push(byteArray);
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to decode base64 payload (${reason}).`);
    }

    return new Blob(parts, { type: mimeType });
};

// Extracts frames from a video file.
export const extractFramesFromVideo = (videoFile: File, fps: number = 1): Promise<string[]> => {
     return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(videoFile);
        video.muted = true;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
            return reject(new Error('Could not get canvas context.'));
        }
        
        const frames: string[] = [];

        const cleanup = () => {
            URL.revokeObjectURL(video.src);
        };

        video.addEventListener('loadedmetadata', async () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const duration = video.duration;
            if (duration === 0 || !isFinite(duration)) {
                 cleanup();
                 resolve([]);
                 return;
            }

            const processFrame = async (time: number) => {
                 video.currentTime = Math.max(0, Math.min(duration, time));
                 await new Promise<void>(res => {
                    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); res(); }
                    video.addEventListener('seeked', onSeeked, { once: true });
                });

                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.8));
                if (blob) {
                    try {
                        const base64String = await blobToBase64(blob);
                        frames.push(base64String);
                    } catch (error) {
                        console.error("Error converting blob to base64:", error);
                    }
                }
            };

            const maxFrames = 15;
            const minFrames = 3;
            const totalFramesToExtract = Math.min(maxFrames, Math.max(minFrames, Math.floor(duration * fps)));
            const interval = duration > 0 ? duration / (totalFramesToExtract - 1) : 0;
            
            for (let i = 0; i < totalFramesToExtract; i++) {
                await processFrame(i * interval);
            }
            
            cleanup();
            resolve(frames);
        });
        
        video.addEventListener('error', (e) => {
            cleanup();
            reject(new Error(`Video loading error: ${e.message || 'Unknown error'}`));
        });
        
        video.load();
    });
}