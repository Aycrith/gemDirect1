import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
    existsSync: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('child_process')>();
    return {
        ...actual,
        spawn: mocks.spawn,
        default: { ...actual, spawn: mocks.spawn }
    };
});

// Mock fs
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: mocks.existsSync,
        default: { ...actual, existsSync: mocks.existsSync }
    };
});

import { spliceVideos, checkFfmpegAvailable, getVideoDuration } from '../videoSplicer';

describe('videoSplicer', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('spliceVideos', () => {
        it('should validate input files exist', async () => {
            mocks.existsSync.mockReturnValue(false);

            const result = await spliceVideos(
                'video1.mp4',
                'video2.mp4',
                'output.mp4'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Video 1 not found');
        });

        it('should generate ffmpeg command with correct parameters', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockProcess = {
                stderr: {
                    on: vi.fn()
                },
                stdout: {
                    on: vi.fn((event, callback) => {
                        // Mock ffprobe returning duration
                        if (event === 'data') {
                            callback(Buffer.from('2.0\n'));
                        }
                    })
                },
                on: vi.fn((event, callback) => {
                    if (event === 'close') {
                        // Simulate successful completion
                        setTimeout(() => callback(0), 10);
                    }
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);
            mocks.existsSync.mockReturnValue(true); // Output file exists after ffmpeg

            await spliceVideos(
                'video1.mp4',
                'video2.mp4',
                'output.mp4',
                { transitionFrames: 1, fps: 24 }
            );

            expect(mocks.spawn).toHaveBeenCalled();
            // First call is ffprobe for duration, second is ffmpeg for splicing
            const ffmpegCall = mocks.spawn.mock.calls.find((call: any[]) => call[0] === 'ffmpeg');
            expect(ffmpegCall).toBeDefined();
            const args = ffmpegCall![1] as string[];
            
            // Check ffmpeg was called with expected input files
            expect(args).toContain('-i');
            expect(args).toContain('video1.mp4');
            expect(args).toContain('video2.mp4');
            
            // Check filter_complex uses overlay+fade pattern (not xfade, for older ffmpeg compat)
            expect(args).toContain('-filter_complex');
            const filterComplexArg = args[args.indexOf('-filter_complex') + 1];
            expect(filterComplexArg).toContain('overlay');
            expect(filterComplexArg).toContain('fade');
            
            // Check output file
            expect(args).toContain('-y');
            expect(args).toContain('output.mp4');
        });

        it('should handle ffmpeg failure gracefully', async () => {
            mocks.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(false);
            
            const mockProcess = {
                stderr: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('Error: Invalid codec'));
                        }
                    })
                },
                on: vi.fn((event, callback) => {
                    if (event === 'close') {
                        setTimeout(() => callback(1), 10); // Exit code 1 = error
                    }
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            const result = await spliceVideos('video1.mp4', 'video2.mp4', 'output.mp4');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should calculate transition duration correctly', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockProcess = {
                stderr: { on: vi.fn() },
                stdout: {
                    on: vi.fn((event, callback) => {
                        // Mock ffprobe returning duration
                        if (event === 'data') {
                            callback(Buffer.from('2.0\n'));
                        }
                    })
                },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);
            
            await spliceVideos('v1.mp4', 'v2.mp4', 'out.mp4', {
                transitionFrames: 2,
                fps: 24
            });

            expect(mocks.spawn).toHaveBeenCalled();
            // Find the ffmpeg call (not ffprobe)
            const ffmpegCall = mocks.spawn.mock.calls.find((call: any[]) => call[0] === 'ffmpeg');
            expect(ffmpegCall).toBeDefined();
            
            const args = ffmpegCall![1] as string[];
            const filterComplexIdx = args.indexOf('-filter_complex');
            expect(filterComplexIdx).toBeGreaterThan(-1);
            
            const filterComplex = args[filterComplexIdx + 1];
            // 2 frames / 24 fps = 0.0833 seconds (formatted as 0.0833)
            expect(filterComplex).toContain('d=0.0833');
        });
    });

    describe('checkFfmpegAvailable', () => {
        it('should return true if ffmpeg is available', async () => {
            const mockProcess = {
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            const result = await checkFfmpegAvailable();

            expect(result).toBe(true);
            expect(mocks.spawn).toHaveBeenCalledWith('ffmpeg', ['-version'], expect.any(Object));
        });

        it('should return false if ffmpeg is not found', async () => {
            const mockProcess = {
                on: vi.fn((event, callback) => {
                    if (event === 'error') {
                        setTimeout(() => callback(new Error('Command not found')), 10);
                    }
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            const result = await checkFfmpegAvailable();

            expect(result).toBe(false);
        });
    });

    describe('getVideoDuration', () => {
        it('should throw error if video file does not exist', async () => {
            mocks.existsSync.mockReturnValue(false);

            await expect(getVideoDuration('nonexistent.mp4')).rejects.toThrow('Video not found');
        });

        it('should parse ffprobe output correctly', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('2.041667\n'));
                        }
                    })
                },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            const duration = await getVideoDuration('video.mp4');

            expect(duration).toBeCloseTo(2.041667, 5);
        });
    });
});
