import { vi } from "vitest";
import type { LocalGenerationStatus } from "../../../types";

const makeResponse = (
  opts: Partial<{
    ok: boolean;
    status: number;
    body: any;
    blobData: Blob | string;
  }> = {},
) => ({
  ok: opts.ok ?? true,
  status: opts.status ?? 200,
  async json() {
    return opts.body ?? {};
  },
  async blob() {
    if (opts.blobData instanceof Blob) {
      return opts.blobData;
    }
    return new Blob([opts.blobData ?? ""]);
  },
});

type WebsocketEventType =
  | "status"
  | "execution_start"
  | "executing"
  | "progress"
  | "execution_error"
  | "executed"
  | "legacy";

interface WebsocketEvent {
  type: WebsocketEventType;
  /** Raw event payload data that can be used to derive the VirtualComfy update. */
  data?: Record<string, any>;
  /** Custom delay before the next event (ms). */
  delayMs?: number;
  /** Direct override of the LocalGenerationStatus update (used for legacy flows). */
  update?: Partial<LocalGenerationStatus>;
}

export interface ComfyUIHarnessOptions {
  /** When true, /system_stats will report low free VRAM to trigger warnings. */
  lowVram?: boolean;
  /** Custom progress events to feed into the trackExecution mock. */
  progressEvents?: Array<Partial<LocalGenerationStatus>>;
  /** Provide WebSocket-style events that map closer to the upstream `websockets_api_example.py`. */
  websocketEvents?: WebsocketEvent[];
  /** How long to wait after a queued event before emitting the next progress message (ms). */
  queueDelayMs?: number;
  /** How long to wait between subsequent progress events (ms). */
  progressDelayMs?: number;
  /** Override the data returned from the mocked final output event. */
  finalOutput?: {
    type: "image" | "video";
    data: string;
    filename: string;
    images?: string[];
  };
  /** Cause the /prompt endpoint to fail with a specific status + body. */
  promptFailure?: { status?: number; body?: any };
  /** Cause the queue polling helper to reject with this error. */
  queueError?: Error;
  /** Cause the /queue endpoint to return an HTTP error response. */
  queueStatusError?: { status?: number; body?: any };
  /** Provide a sequence of queue responses for the mocked /queue endpoint. */
  queueResponses?: Array<{ queue_running: number[]; queue_pending: number[] }>;
}

const defaultSystemStats = {
  system: { cpu: "x86" },
  devices: [
    {
      type: "cuda",
      name: "TestGPU",
      vram_total: 8 * 1024 ** 3,
      vram_free: 6 * 1024 ** 3,
    },
  ],
};

const lowVramStats = {
  system: { cpu: "x86" },
  devices: [
    {
      type: "cuda",
      name: "TestGPU",
      vram_total: 4 * 1024 ** 3,
      vram_free: 0.8 * 1024 ** 3,
    },
  ],
};

export const createComfyUIHarness = (options: ComfyUIHarnessOptions = {}) => {
  const recordedPrompts: any[] = [];
  const uploadedImages: Array<{ body: FormData }> = [];
  const queueResponsesForFetch = [...(options.queueResponses ?? [])];
  const queueResponsesForPoll = [...(options.queueResponses ?? [])];

  const fetchMock = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const normalizedUrl = String(url);

      if (normalizedUrl.includes("/system_stats")) {
        return makeResponse({
          body: options.lowVram ? lowVramStats : defaultSystemStats,
        });
      }

      if (normalizedUrl.includes("/upload/image")) {
        if (init?.body instanceof FormData) {
          uploadedImages.push({ body: init.body });
        }
        return makeResponse({ body: { name: "uploaded-keyframe.jpg" } });
      }

      if (normalizedUrl.includes("/prompt")) {
        if (options.promptFailure) {
          return makeResponse({
            ok: false,
            status: options.promptFailure.status ?? 500,
            body: options.promptFailure.body ?? {
              error: "Mock prompt failure",
            },
          });
        }
        if (init?.body) {
          recordedPrompts.push(JSON.parse(String(init.body)));
        }
        return makeResponse({
          body: { prompt_id: `prompt-${recordedPrompts.length}` },
        });
      }

      if (normalizedUrl.includes("/queue")) {
        if (options.queueStatusError) {
          return makeResponse({
            ok: false,
            status: options.queueStatusError.status ?? 502,
            body: options.queueStatusError.body ?? {
              error: "Mock queue status failure",
            },
          });
        }
        if (options.queueError) {
          throw options.queueError;
        }
        const next = queueResponsesForFetch.shift() ?? {
          queue_running: [],
          queue_pending: [],
        };
        return makeResponse({ body: next });
      }

      if (normalizedUrl.includes("/view")) {
        return makeResponse({
          body: {},
          blobData:
            options.finalOutput?.type === "video"
              ? new Blob([options.finalOutput.data], { type: "video/mp4" })
              : new Blob([options.finalOutput?.data ?? ""], {
                  type: "image/png",
                }),
        });
      }

      throw new Error(`Unexpected fetch call to ${normalizedUrl}`);
    },
  );

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const defaultOutput =
    options.finalOutput ??
    ({
      type: "image",
      data: "data:image/png;base64,final-output",
      filename: "prompt-output.png",
      images: ["frame-1", "frame-2"],
    } as const);

  const progressEvents =
    options.progressEvents ??
    ([
      {
        status: "queued",
        message: "In queue... Position: 1",
        queue_position: 1,
      },
      {
        status: "running",
        message: "Executing: CLIPTextEncode - Positive Prompt Layer",
      },
      { status: "running", message: "Fetching final output...", progress: 95 },
      {
        status: "complete",
        message: "Generation complete!",
        final_output: defaultOutput,
      },
    ] as Array<Partial<LocalGenerationStatus>>);

  const mergeWebsocketEvents = (): WebsocketEvent[] => {
    if (options.websocketEvents && options.websocketEvents.length > 0) {
      return [...options.websocketEvents];
    }
    return progressEvents.map((update) => ({
      type: "legacy" as const,
      update,
    }));
  };

  const mapEventToUpdate = (
    event: WebsocketEvent,
  ): Partial<LocalGenerationStatus> | undefined => {
    if (event.update) {
      return event.update;
    }

    const data = event.data ?? {};
    switch (event.type) {
      case "status": {
        const queuePosition =
          typeof data.queue_remaining === "number" ? data.queue_remaining : 1;
        return {
          status: "queued",
          message: data.message ?? `In queue... Position: ${queuePosition}`,
          queue_position: queuePosition,
        };
      }
      case "execution_start":
        return {
          status: "running",
          message: data.message ?? "Execution started.",
        };
      case "executing": {
        const nodeTitle = data.node_title ?? data.node ?? "node";
        return {
          status: "running",
          message: data.message ?? `Executing: ${nodeTitle}`,
          node_title: nodeTitle,
        };
      }
      case "progress": {
        let progressValue = data.progress;
        if (
          typeof progressValue !== "number" &&
          typeof data.value === "number" &&
          typeof data.max === "number" &&
          data.max !== 0
        ) {
          progressValue = Math.round((data.value / data.max) * 100);
        }
        return {
          status: "running",
          message: data.message,
          progress: progressValue,
        };
      }
      case "execution_error":
        return {
          status: "error",
          message:
            data.message ??
            `Execution error on node ${data.node_id ?? "unknown"}: ${data.exception_message ?? "Unknown"}`,
        };
      case "executed":
        return {
          status: "complete",
          message: data.message ?? "Generation complete!",
          final_output: data.final_output ?? defaultOutput,
        };
      default:
        return undefined;
    }
  };

  const trackExecution = vi.fn(
    (
      _settings: any,
      _promptId: string,
      callback: (status: Partial<LocalGenerationStatus>) => void,
    ) => {
      const queueDelayMs = options.queueDelayMs ?? 5;
      const progressDelayMs = options.progressDelayMs ?? 0;
      const events = mergeWebsocketEvents();

      const emitNext = () => {
        const event = events.shift();
        if (!event) {
          return;
        }
        const update = mapEventToUpdate(event);
        if (!update) {
          emitNext();
          return;
        }
        callback(update);
        if (update.status === "complete" || update.status === "error") {
          return;
        }
        const delay =
          event.delayMs ??
          (update.status === "queued" ? queueDelayMs : progressDelayMs);
        if (delay > 0) {
          setTimeout(emitNext, delay);
        } else {
          emitNext();
        }
      };

      emitNext();
      return () => {};
    },
  );

  const pollQueueInfo = vi.fn(async () => {
    if (options.queueStatusError) {
      const status = options.queueStatusError.status ?? 502;
      throw new Error(`Could not retrieve queue info (status: ${status}).`);
    }
    if (options.queueError) {
      throw options.queueError;
    }
    const next = queueResponsesForPoll.shift() ?? {
      queue_running: [],
      queue_pending: [],
    };
    return {
      queue_running: Array.isArray(next.queue_running)
        ? next.queue_running.length
        : Number(next.queue_running) || 0,
      queue_pending: Array.isArray(next.queue_pending)
        ? next.queue_pending.length
        : Number(next.queue_pending) || 0,
    };
  });

  const restore = () => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  };

  return {
    fetchMock,
    recordedPrompts,
    uploadedImages,
    trackExecution,
    pollQueueInfo,
    progressEvents,
    restore,
  };
};
