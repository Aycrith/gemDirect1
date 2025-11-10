import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateVideoFromShot,
  generateTimelineVideos,
} from "../comfyUIService";
import {
  createValidTestSettings,
  createWorkflowWithTransitionMetadataSettings,
} from "./fixtures";
import { createComfyUIHarness } from "./mocks/comfyUIHarness";
import type { TimelineData } from "../../types";

describe("generateVideoFromShot integration", () => {
  let harness: ReturnType<typeof createComfyUIHarness> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    harness?.restore();
    harness = null;
    vi.useRealTimers();
  });

  it("runs the full upload/prompt/ws harness and returns frames", async () => {
    harness = createComfyUIHarness();
    const settings = createValidTestSettings();
    const progressSpy = vi.fn();

    const shot = { id: "shot-99", description: "Hero leaps into the storm" };

    const resultPromise = generateVideoFromShot(
      settings,
      shot,
      undefined,
      "Stormy neon vision",
      "data:image/png;base64,AAA",
      progressSpy,
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );

    await vi.advanceTimersByTimeAsync(2500);
    const result = await resultPromise;

    expect(harness.pollQueueInfo).toHaveBeenCalled();
    expect(harness.trackExecution).toHaveBeenCalled();
    expect(result.frames).toEqual(["frame-1", "frame-2"]);
    expect(result.filename).toBe("prompt-output.png");
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "complete" }),
    );

    expect(harness.recordedPrompts).toHaveLength(1);
    const queuedPayload = harness.recordedPrompts[0];
    expect(queuedPayload.prompt.positive_clip.inputs.text).toContain(
      shot.description,
    );
    expect(queuedPayload.prompt.negative_clip.inputs.text).toContain("blurry");
    expect(queuedPayload.prompt.timeline_json.inputs.text).toContain(
      shot.description,
    );
    expect(queuedPayload.prompt.keyframe_loader.inputs.image).toBe(
      "uploaded-keyframe.jpg",
    );
    expect(queuedPayload.client_id).toBe(settings.comfyUIClientId);
  });

  it("throws when the /prompt endpoint returns an error", async () => {
    harness = createComfyUIHarness({
      promptFailure: { status: 500, body: { error: "queue failure" } },
    });

    const settings = createValidTestSettings();
    await expect(
      generateVideoFromShot(
        settings,
        { id: "shot-error", description: "Should fail" },
        undefined,
        "Vision",
        "data:image/png;base64,BBB",
        vi.fn(),
        {
          pollQueueInfo: harness.pollQueueInfo,
          trackExecution: harness.trackExecution,
        },
      ),
    ).rejects.toThrow(/500/);
  });

  it("supports video outputs with MP4 final data", async () => {
    harness = createComfyUIHarness({
      finalOutput: {
        type: "video",
        data: "blob:prompt-video",
        filename: "prompt-1.mp4",
      },
      progressEvents: [
        {
          status: "queued",
          message: "In queue... Position: 1",
          queue_position: 1,
        },
        {
          status: "running",
          message: "Executing: CLIPTextEncode - Positive Prompt Layer",
        },
        {
          status: "complete",
          message: "Generation complete!",
          final_output: {
            type: "video",
            data: "blob:prompt-1",
            filename: "prompt-1.mp4",
          },
        },
      ],
    });
    const settings = createValidTestSettings();

    const resultPromise = generateVideoFromShot(
      settings,
      { id: "shot-mp4", description: "MP4 shot" },
      undefined,
      "Vision",
      "data:image/png;base64,CCC",
      vi.fn(),
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );

    await vi.advanceTimersByTimeAsync(2500);
    const result = await resultPromise;
    expect(result.frames).toBeUndefined();
    expect(result.filename).toBe("prompt-1.mp4");
    expect(harness.recordedPrompts).toHaveLength(1);
  });

  it("handles queue polling failures gracefully", async () => {
    harness = createComfyUIHarness({ queueError: new Error("Queue timeout") });
    const settings = createValidTestSettings();
    const shot = { id: "shot-poll", description: "Timeout check" };

    const resultPromise = generateVideoFromShot(
      settings,
      shot,
      undefined,
      "Vision",
      "data:image/png;base64,DDD",
      vi.fn(),
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );

    const expectation = expect(resultPromise).rejects.toThrow(/Queue timeout/);
    await vi.advanceTimersByTimeAsync(2500);
    await expectation;

    expect(harness.recordedPrompts).toHaveLength(1);
  });

  it("waits for queue info to report empty before resolving", async () => {
    harness = createComfyUIHarness({
      queueResponses: [
        { queue_running: [1], queue_pending: [1] },
        { queue_running: [], queue_pending: [] },
      ],
    });
    const settings = createValidTestSettings();
    const shot = { id: "shot-queue-wait", description: "Queue wait" };

    const progressSpy = vi.fn();
    let resolved = false;
    const resultPromise = generateVideoFromShot(
      settings,
      shot,
      undefined,
      "Vision",
      "data:image/png;base64,GGG",
      (update) => {
        progressSpy(update);
      },
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );
    resultPromise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(2100);
    expect(harness.pollQueueInfo).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(resolved).toBe(false);
    const queuedCall = progressSpy.mock.calls.find(
      ([update]) => update.status === "queued",
    );
    expect(queuedCall).toBeDefined();

    await vi.advanceTimersByTimeAsync(2100);
    const result = await resultPromise;
    expect(resolved).toBe(true);
    expect(result.frames).toEqual(["frame-1", "frame-2"]);
    expect(harness.recordedPrompts).toHaveLength(1);
    expect(harness.pollQueueInfo).toHaveBeenCalledTimes(2);
  });

  it("does not resolve until the queue drains even if WebSocket emits executed early", async () => {
    harness = createComfyUIHarness({
      queueResponses: [
        { queue_running: [1], queue_pending: [2] },
        { queue_running: [1], queue_pending: [1] },
        { queue_running: [], queue_pending: [] },
      ],
      // Reference: https://github.com/comfyanonymous/ComfyUI/blob/master/scripts/websockets_api_example.py
      websocketEvents: [
        {
          type: "execution_start",
          data: { prompt_id: "prompt-1", message: "Execution running" },
          delayMs: 5,
        },
        {
          type: "executed",
          data: {
            prompt_id: "prompt-1",
            final_output: {
              type: "image",
              data: "data:image/png;base64,stall",
              filename: "stall.png",
              images: ["frame-stall"],
            },
          },
          delayMs: 5,
        },
      ],
      queueDelayMs: 5,
      progressDelayMs: 5,
    });

    const settings = createValidTestSettings();
    const shot = { id: "shot-queue-guard", description: "Guard busy queue" };
    let resolved = false;

    const resultPromise = generateVideoFromShot(
      settings,
      shot,
      undefined,
      "Vision",
      "data:image/png;base64,HHH",
      vi.fn(),
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );

    resultPromise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(harness.pollQueueInfo).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(harness.pollQueueInfo).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(harness.pollQueueInfo).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;
    expect(result.frames).toEqual(["frame-stall"]);
    expect(resolved).toBe(true);
    expect(harness.pollQueueInfo).toHaveBeenCalledTimes(3);
  });

  it("waits for a queued update when execution_start precedes the queued status event", async () => {
    harness = createComfyUIHarness({
      queueResponses: [
        { queue_running: [1], queue_pending: [1] },
        { queue_running: [1], queue_pending: [1] },
        { queue_running: [], queue_pending: [] },
      ],
      // Reference for ordering: https://github.com/comfyanonymous/ComfyUI/blob/master/scripts/websockets_api_example.py
      websocketEvents: [
        {
          type: "execution_start",
          data: {
            prompt_id: "prompt-guard",
            message: "Execution running before queue info",
          },
          delayMs: 5,
        },
        {
          type: "status",
          data: {
            prompt_id: "prompt-guard",
            status: "queued",
            queue_position: 3,
            message: "Queue update arriving after execution_start",
          },
          delayMs: 5,
        },
        {
          type: "progress",
          data: {
            prompt_id: "prompt-guard",
            progress: 55,
            message: "Rendering after queue unlock",
          },
          delayMs: 5,
        },
        {
          type: "executed",
          data: {
            prompt_id: "prompt-guard",
            final_output: {
              type: "image",
              data: "data:image/png;base64,guard",
              filename: "guard.png",
              images: ["frame-guard"],
            },
          },
          delayMs: 5,
        },
      ],
      queueDelayMs: 5,
      progressDelayMs: 5,
    });

    const settings = createValidTestSettings();
    const progressSpy = vi.fn();

    let resolved = false;
    const resultPromise = generateVideoFromShot(
      settings,
      { id: "shot-guard", description: "Queue guard ordering" },
      undefined,
      "Vision",
      "data:image/png;base64,HHH",
      progressSpy,
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );

    resultPromise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(harness.pollQueueInfo).toHaveBeenCalledTimes(1);
    const queuedCall = progressSpy.mock.calls.find(
      ([update]) => update.status === "queued",
    );
    expect(queuedCall).toBeDefined();

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    expect(harness.pollQueueInfo).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    const result = await resultPromise;
    expect(resolved).toBe(true);
    expect(harness.pollQueueInfo).toHaveBeenCalledTimes(3);
    expect(result.frames).toEqual(["frame-guard"]);
    expect(result.filename).toBe("guard.png");
  });

  it("fails when the queue polling helper rejects before the queue drains", async () => {
    const queueError = new Error("Queue polling failed: overloaded");
    harness = createComfyUIHarness({
      queueResponses: [
        { queue_running: [1], queue_pending: [1] },
      ],
      queueError,
      queueDelayMs: 5,
      progressDelayMs: 5,
      websocketEvents: [
        // Mirrors the status -> execution_start -> queued -> running -> executed order described in ComfyUI's websockets_api_example.py.
        {
          type: "execution_start",
          data: {
            prompt_id: "prompt-queue-poll-error",
            message: "Execution running before queue info",
          },
          delayMs: 5,
        },
        {
          type: "status",
          data: {
            prompt_id: "prompt-queue-poll-error",
            status: "queued",
            queue_position: 2,
            message: "Queued update arriving after execution_start",
          },
          delayMs: 5,
        },
        {
          type: "progress",
          data: {
            prompt_id: "prompt-queue-poll-error",
            progress: 20,
            message: "Rendering before queue poll resolves",
          },
          delayMs: 5,
        },
        {
          type: "executed",
          data: {
            prompt_id: "prompt-queue-poll-error",
            final_output: {
              type: "image",
              data: "data:image/png;base64,queue-error",
              filename: "queue-error.png",
              images: ["frame-queue-error"],
            },
          },
          delayMs: 5,
        },
      ],
    });

    const settings = createValidTestSettings();
    const progressSpy = vi.fn();

    const resultPromise = generateVideoFromShot(
      settings,
      { id: "shot-queue-error", description: "Queue poll fails" },
      undefined,
      "Vision",
      "data:image/png;base64,EEE",
      progressSpy,
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );

    const expectation = expect(resultPromise).rejects.toThrow(
      /Queue polling failed: overloaded/,
    );

    await vi.advanceTimersByTimeAsync(2500);
    await expectation;

    expect(
      progressSpy.mock.calls.find(
        ([update]) =>
          update.status === "error" &&
          typeof update.message === "string" &&
          update.message.includes("Queue polling failed"),
      ),
    ).toBeDefined();

    expect(harness.pollQueueInfo).toHaveBeenCalled();
  });

  it("surfaces queue endpoint failures before completion", async () => {
    harness = createComfyUIHarness({
      queueStatusError: { status: 502, body: { error: "Queue rejected" } },
    });
    const settings = createValidTestSettings();

    const resultPromise = generateVideoFromShot(
      settings,
      { id: "shot-queue-failure", description: "Queue fail" },
      undefined,
      "Vision",
      "data:image/png;base64,FFF",
      vi.fn(),
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );

    const expectation = expect(resultPromise).rejects.toThrow(
      /Could not retrieve queue info \(status: 502\)/,
    );
    await vi.advanceTimersByTimeAsync(2500);
    await expectation;
    expect(harness.recordedPrompts).toHaveLength(1);
  });

  it("surfaces low VRAM warnings from the pre-flight checks", async () => {
    harness = createComfyUIHarness({ lowVram: true });
    const settings = createWorkflowWithTransitionMetadataSettings();
    const progressSpy = vi.fn();

    const resultPromise = generateVideoFromShot(
      settings,
      { id: "shot-low-vram", description: "Intensive generation" },
      undefined,
      "Vision",
      "data:image/png;base64,EEE",
      progressSpy,
      {
        trackExecution: harness.trackExecution,
        pollQueueInfo: harness.pollQueueInfo,
      },
    );

    await vi.advanceTimersByTimeAsync(2500);
    await resultPromise;

    const warningCall = progressSpy.mock.calls.find(
      ([update]) =>
        typeof update.message === "string" &&
        update.message.includes("Low VRAM"),
    );

    expect(warningCall).toBeDefined();
    expect(harness.recordedPrompts).toHaveLength(1);
    const metadataPayload =
      harness.recordedPrompts[0].prompt.metadata_writer.inputs.text;
    expect(metadataPayload).toContain("shot-low-vram");
    expect(metadataPayload).toContain("Intensive generation");
  });
});

describe("generateTimelineVideos integration", () => {
  let harness: ReturnType<typeof createComfyUIHarness> | null = null;

  const timeline: TimelineData = {
    shots: [
      { id: "shot-a", description: "Opening shot" },
      { id: "shot-b", description: "Reaction shot" },
    ],
    shotEnhancers: {
      "shot-a": { framing: ["wide"] },
      "shot-b": { lighting: ["dramatic"] },
    },
    transitions: ["cut"],
    negativePrompt: "low quality",
  };

  const keyframes = {
    "shot-a": "data:image/png;base64,AAA",
    "shot-b": "data:image/png;base64,BBB",
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    harness?.restore();
    harness = null;
    vi.useRealTimers();
  });

  it("processes every shot via the shared harness and reports progress", async () => {
    harness = createComfyUIHarness();
    const settings = createValidTestSettings();
    const progressSpy = vi.fn();

    const shotGenerator = (
      genSettings: typeof settings,
      shot: TimelineData["shots"][number],
      enhancers: TimelineData["shotEnhancers"][string],
      vision: string,
      keyframe: string | null,
      onProgress?: (statusUpdate: any) => void,
    ) =>
      generateVideoFromShot(
        genSettings,
        shot,
        enhancers,
        vision,
        keyframe,
        onProgress,
        {
          trackExecution: harness.trackExecution,
          pollQueueInfo: harness.pollQueueInfo,
        },
      );

    const timelinePromise = generateTimelineVideos(
      settings,
      timeline,
      "Stylized vision",
      "Scene summary",
      keyframes,
      progressSpy,
      { shotGenerator },
    );

    await vi.advanceTimersByTimeAsync(7000);
    const results = await timelinePromise;

    expect(harness.recordedPrompts).toHaveLength(timeline.shots.length);
    expect(harness.trackExecution).toHaveBeenCalledTimes(timeline.shots.length);
    expect(progressSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "complete" }),
    );

    expect(Object.keys(results)).toEqual(["shot-a", "shot-b"]);
    expect(results["shot-a"].filename).toBeTruthy();
    expect(results["shot-b"].filename).toBeTruthy();
  });
});
