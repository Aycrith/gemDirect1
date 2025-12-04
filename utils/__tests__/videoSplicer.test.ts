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

import { spliceVideos, checkFfmpegAvailable, getVideoDuration, extractLastFrame, extractFrame, getVideoFrameCount } from '../videoSplicer';

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

    describe('getVideoFrameCount', () => {
        it('should throw error if video file does not exist', async () => {
            mocks.existsSync.mockReturnValue(false);

            await expect(getVideoFrameCount('nonexistent.mp4')).rejects.toThrow('Video not found');
        });

        it('should parse frame count from ffprobe output', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('240\n'));
                        }
                    })
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            const frameCount = await getVideoFrameCount('video.mp4');

            expect(frameCount).toBe(240);
        });

        it('should reject if ffprobe fails', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockProcess = {
                stdout: { on: vi.fn() },
                stderr: { 
                    on: vi.fn((event, callback) => {
                        if (event === 'data') callback(Buffer.from('Error reading file'));
                    }) 
                },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(1), 10);
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            await expect(getVideoFrameCount('video.mp4')).rejects.toThrow('ffprobe frame count failed');
        });
    });

    describe('extractLastFrame', () => {
        it('should return error if video file does not exist', async () => {
            mocks.existsSync.mockReturnValue(false);

            const result = await extractLastFrame('nonexistent.mp4');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Video not found');
        });

        it('should extract last frame and return base64 PNG', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            // Mock ffprobe for frame count (first call)
            const mockFfprobeProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') callback(Buffer.from('49\n'));  // 49 frames = last frame at index 48
                    })
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 5);
                })
            };
            
            // Mock ffmpeg for frame extraction (second call)
            const mockFfmpegProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            // Simulate PNG image data
                            callback(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
                        }
                    })
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                })
            };
            
            // First call is ffprobe, second is ffmpeg
            mocks.spawn
                .mockReturnValueOnce(mockFfprobeProcess as any)
                .mockReturnValueOnce(mockFfmpegProcess as any);

            const result = await extractLastFrame('video.mp4');

            expect(result.success).toBe(true);
            expect(result.base64Image).toContain('data:image/png;base64,');
            expect(result.frameNumber).toBe(48);  // Last frame index (49 - 1)
        });

        it('should support JPEG output format', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockFfprobeProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') callback(Buffer.from('100\n'));
                    })
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 5);
                })
            };
            
            const mockFfmpegProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));  // JPEG magic bytes
                        }
                    })
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                })
            };
            
            mocks.spawn
                .mockReturnValueOnce(mockFfprobeProcess as any)
                .mockReturnValueOnce(mockFfmpegProcess as any);

            const result = await extractLastFrame('video.mp4', 'jpg');

            expect(result.success).toBe(true);
            expect(result.base64Image).toContain('data:image/jpeg;base64,');
        });

        it('should handle ffmpeg extraction failure', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockFfprobeProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') callback(Buffer.from('100\n'));
                    })
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 5);
                })
            };
            
            const mockFfmpegProcess = {
                stdout: { on: vi.fn() },  // No output
                stderr: { 
                    on: vi.fn((event, callback) => {
                        if (event === 'data') callback(Buffer.from('Error: Invalid video format'));
                    })
                },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(1), 10);  // Error exit code
                })
            };
            
            mocks.spawn
                .mockReturnValueOnce(mockFfprobeProcess as any)
                .mockReturnValueOnce(mockFfmpegProcess as any);

            const result = await extractLastFrame('corrupt.mp4');

            expect(result.success).toBe(false);
            expect(result.error).toContain('ffmpeg frame extraction failed');
        });
    });

    describe('extractFrame', () => {
        it('should return error if video file does not exist', async () => {
            mocks.existsSync.mockReturnValue(false);

            const result = await extractFrame('nonexistent.mp4', 0);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Video not found');
        });

        it('should extract specific frame by number', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
                        }
                    })
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            const result = await extractFrame('video.mp4', 24);

            expect(result.success).toBe(true);
            expect(result.base64Image).toBeDefined();
            expect(result.frameNumber).toBe(24);
            
            // Verify ffmpeg was called with correct timestamp (24 frames / 24 fps = 1 second)
            const spawnCall = mocks.spawn.mock.calls[0];
            const args = spawnCall ? spawnCall[1] as string[] : [];
            expect(args).toContain('-ss');
            expect(args[args.indexOf('-ss') + 1]).toBe('1.0000');
        });

        it('should calculate correct timestamp for arbitrary frame', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockProcess = {
                stdout: {
                    on: vi.fn((event, callback) => {
                        if (event === 'data') callback(Buffer.from([0x89]));
                    })
                },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'close') setTimeout(() => callback(0), 10);
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            await extractFrame('video.mp4', 12);

            // 12 frames / 24 fps = 0.5 seconds
            const spawnCall = mocks.spawn.mock.calls[0];
            const args = spawnCall ? spawnCall[1] as string[] : [];
            expect(args[args.indexOf('-ss') + 1]).toBe('0.5000');
        });

        it('should handle frame extraction error gracefully', async () => {
            mocks.existsSync.mockReturnValue(true);
            
            const mockProcess = {
                stdout: { on: vi.fn() },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'error') {
                        setTimeout(() => callback(new Error('ffmpeg not found')), 10);
                    }
                })
            };
            
            mocks.spawn.mockReturnValue(mockProcess as any);

            const result = await extractFrame('video.mp4', 0);

            expect(result.success).toBe(false);
            expect(result.error).toContain('ffmpeg spawn error');
        });
    });
});
