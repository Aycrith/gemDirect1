export const extractFramesFromVideo = (videoUrl: string, framesToExtract: number): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous'; // Handle CORS
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const frames: string[] = [];

        video.addEventListener('loadeddata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const duration = video.duration;
            const interval = duration / (framesToExtract + 1);

            let currentTime = interval;
            let framesCaptured = 0;

            const captureFrame = () => {
                if (!context) {
                    reject(new Error('Canvas context is not available.'));
                    return;
                }
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                // Get frame as JPEG base64
                frames.push(canvas.toDataURL('image/jpeg', 0.8));
                framesCaptured++;

                if (framesCaptured < framesToExtract) {
                    currentTime += interval;
                    video.currentTime = Math.min(currentTime, duration);
                } else {
                    resolve(frames);
                }
            };

            video.addEventListener('seeked', captureFrame);

            // Start the process
            video.currentTime = currentTime;
        });

        video.addEventListener('error', (e) => {
            reject(new Error('Failed to load video file. It might be corrupt or in an unsupported format.'));
        });

        video.src = videoUrl;
    });
};
