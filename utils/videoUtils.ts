// A utility to convert a Blob to a base64 string
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                // The result includes the data URL prefix, which we need to remove.
                // e.g., "data:image/jpeg;base64,...." -> "...."
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            } else {
                reject(new Error('Failed to convert blob to base64 string.'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Extracts frames from a video file.
export const extractFramesFromVideo = (
    videoFile: File,
    fps: number = 1 // This is used to calculate total frames based on duration, but is capped.
): Promise<string[]> => {
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

        video.addEventListener('loadedmetadata', async () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const duration = video.duration;
            const maxFrames = 15;
            const minFrames = 3;

            // Calculate a dynamic number of frames to extract.
            // It aims for roughly 1 per second, but is clamped between a min and max value
            // to ensure enough data without being excessive.
            const totalFramesToExtract = Math.min(maxFrames, Math.max(minFrames, Math.floor(duration * fps)));
            const interval = duration > 0 ? duration / (totalFramesToExtract - 1) : 0;

            if (duration === 0) {
                 // Handle videos with no duration
                 URL.revokeObjectURL(video.src);
                 resolve([]);
                 return;
            }

            for (let i = 0; i < totalFramesToExtract; i++) {
                // Distribute frames evenly across the video's timeline
                video.currentTime = Math.min(duration, i * interval);
                
                await new Promise<void>(res => {
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        res();
                    }
                    video.addEventListener('seeked', onSeeked);
                });
                
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.8));

                if (blob) {
                    try {
                        const base64String = await blobToBase64(blob);
                        frames.push(base64String);
                    } catch (error) {
                        console.error("Error converting blob to base64:", error);
                        // continue to next frame
                    }
                }
            }
            URL.revokeObjectURL(video.src);
            resolve(frames);
        });
        
        video.addEventListener('error', (e) => {
            URL.revokeObjectURL(video.src);
            reject(new Error(`Video loading error: ${e.message || 'Unknown error'}`));
        });
        
        video.load();
    });
};