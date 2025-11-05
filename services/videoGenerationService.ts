import { GoogleGenAI } from "@google/genai";

export const generateVideo = async (
    prompt: string, 
    image?: { imageBytes: string, mimeType: string },
    onStatusUpdate?: (status: string) => void
): Promise<{ videoUrl: string, videoBlob: Blob }> => {
    // A new instance must be created for each call to ensure the latest API key is used.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    onStatusUpdate?.("Initiating video generation...");

    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        image: image,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '16:9'
        }
    });

    onStatusUpdate?.("Video generation in progress... this may take several minutes.");
    
    let checks = 0;
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
        checks++;
        onStatusUpdate?.(`Video generation in progress... (checked ${checks} time(s))`);
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("Video generation completed, but no download link was found.");
    }
    
    onStatusUpdate?.("Generation complete. Downloading video...");

    // The response.body contains the MP4 bytes. You must append an API key when fetching.
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const videoBlob = await response.blob();
    const videoUrl = URL.createObjectURL(videoBlob);
    
    return { videoUrl, videoBlob };
};
