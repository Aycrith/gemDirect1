import React from "react";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import GenerationControls from "../GenerationControls";
import { createValidTestSettings } from "../../services/__tests__/fixtures";
import type { LocalGenerationStatus } from "../../types";

const timeline = {
  shots: [
    {
      id: "shot-1",
      description: "Opening hero shot",
    },
  ],
  shotEnhancers: {
    "shot-1": {},
  },
  transitions: [],
  negativePrompt: "low quality",
};

const baseKeyframes = {
  "shot-1": "data:image/png;base64,AAA",
};

const renderComponent = (props = {}) => {
  const settings = createValidTestSettings();
  return render(
    <GenerationControls
      timeline={timeline}
      directorsVision="Dreamy atmosphere"
      settings={settings}
      keyframeImages={baseKeyframes}
      {...props}
    />,
  );
};

const createControlledGenerator = (
  events: Array<Partial<LocalGenerationStatus>>,
  options: { reject?: boolean; rejectReason?: Error } = {},
): {
  generator: (
    settings: any,
    shot: any,
    enhancers: any,
    vision: string,
    keyframe: string | null,
    onProgress: (update: Partial<LocalGenerationStatus>) => void,
  ) => Promise<{ videoPath: string; duration: number; filename: string }>;
  emit: (index: number) => Promise<void>;
} => {
  const gates = events.map(() => {
    let resolver: () => void;
    const promise = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    return {
      promise,
      resolve: resolver!,
      released: false,
    };
  });

  const generator = async (
    _settings: any,
    shot: any,
    _enhancers: any,
    _vision: string,
    _keyframe: string | null,
    onProgress: (update: Partial<LocalGenerationStatus>) => void,
  ) => {
    for (let i = 0; i < events.length; i++) {
      await gates[i].promise;
      onProgress(events[i]);
    }
    if (options.reject) {
      throw options.rejectReason ?? new Error("Controlled generator rejected");
    }
    const filename =
      events
        .find((event) => event.final_output?.filename)
        ?.final_output?.filename ?? `${shot.id}.mp4`;
    return {
      videoPath: `${shot.id}-stub.mp4`,
      duration: 1,
      filename,
    };
  };

  const emit = async (index: number) => {
    const gate = gates[index];
    if (!gate || gate.released) {
      throw new Error(`Event ${index} already released or missing.`);
    }
    gate.released = true;
    gate.resolve();
    await Promise.resolve();
  };

  return { generator, emit };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe("GenerationControls", () => {
  it("keeps the queued card until a queued event arrives even when execution_start fires first", async () => {
    const events: Array<Partial<LocalGenerationStatus>> = [
      {
        status: "running",
        message: "Execution_start arrived ahead of queue info",
        progress: 5,
      },
      {
        status: "queued",
        message: "Queue update arriving with position 2",
        queue_position: 2,
      },
      {
        status: "running",
        message: "Rendering guard test is now visible after queue unlock",
        progress: 40,
      },
      {
        status: "complete",
        message: "Generation complete!",
        final_output: {
          type: "video",
          data: "blob:lifecycle",
          filename: "lifecycle.mp4",
        },
      },
    ];

    const { generator, emit } = createControlledGenerator(events);

    renderComponent({ generateShotVideo: generator });

    fireEvent.click(screen.getByText(/^Generate$/));

    const queuedStatus = await screen.findByTestId("local-status-queued");
    expect(queuedStatus).toBeTruthy();
    expect(screen.queryByTestId("local-status-running")).toBeNull();

    await act(async () => {
      await emit(0);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-queued")).toBeTruthy();
    });
    expect(screen.queryByTestId("local-status-running")).toBeNull();

    await act(async () => {
      await emit(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-message").textContent).toContain(
        "Queue update arriving",
      );
    });

    await act(async () => {
      await emit(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-running")).toBeTruthy();
    });

    await act(async () => {
      await emit(3);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-generation-final-output")).toBeTruthy();
    });
    expect(screen.getByTestId("local-status-message").textContent).toContain(
      "Video generated:",
    );
  });

  it("surfaces final output after sequential lifecycle events", async () => {
    const events: Array<Partial<LocalGenerationStatus>> = [
      {
        status: "queued",
        message: "In queue... Position: 1",
        queue_position: 1,
      },
      {
        status: "running",
        message: "Executing node",
        progress: 75,
      },
      {
        status: "complete",
        message: "Generation complete!",
        final_output: {
          type: "video",
          data: "blob:completion",
          filename: "summary.mp4",
        },
      },
    ];

    const { generator, emit } = createControlledGenerator(events);

    renderComponent({ generateShotVideo: generator });

    fireEvent.click(screen.getByText(/^Generate$/));
    await screen.findByTestId("local-status-queued");

    await act(async () => {
      await emit(0);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-message").textContent).toContain(
        "In queue",
      );
    });

    await act(async () => {
      await emit(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-running")).toBeTruthy();
    });

    await act(async () => {
      await emit(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-generation-final-output")).toBeTruthy();
    });

    expect(screen.getByText(/Video generated: summary\.mp4/)).toBeTruthy();
  });

  it("keeps low VRAM warnings in the queued card until an explicit queue event arrives", async () => {
    const events: Array<Partial<LocalGenerationStatus>> = [
      {
        status: "running",
        message: "Low VRAM detected: GPU memory is tight",
        progress: 5,
      },
      {
        status: "queued",
        message: "Queue update arrived with position 1",
        queue_position: 1,
      },
      {
        status: "running",
        message: "Rendering resumed after queue unlock",
        progress: 60,
      },
      {
        status: "complete",
        message: "Low VRAM guard complete",
        final_output: {
          type: "video",
          data: "blob:low-vram",
          filename: "low-vram.mp4",
        },
      },
    ];

    const { generator, emit } = createControlledGenerator(events);

    renderComponent({ generateShotVideo: generator });
    fireEvent.click(screen.getByText(/^Generate$/));
    await screen.findByTestId("local-status-queued");

    await act(async () => {
      await emit(0);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-message").textContent).toMatch(
        /Low VRAM/,
      );
    });
    expect(screen.getByTestId("local-status-queued")).toBeTruthy();

    await act(async () => {
      await emit(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-message").textContent).toContain(
        "Queue update arrived",
      );
    });

    await act(async () => {
      await emit(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-running")).toBeTruthy();
    });

    await act(async () => {
      await emit(3);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-generation-final-output")).toBeTruthy();
    });
  });

  it("shows an error card when queue status cannot be retrieved", async () => {
    const events: Array<Partial<LocalGenerationStatus>> = [
      {
        status: "running",
        message: "Execution running before queue info arrives",
      },
      {
        status: "error",
        message: "Could not retrieve queue info (status: 502).",
      },
    ];

    const errorReason = new Error("Could not retrieve queue info (status: 502).");
    const { generator, emit } = createControlledGenerator(events, {
      reject: true,
      rejectReason: errorReason,
    });

    renderComponent({ generateShotVideo: generator });
    fireEvent.click(screen.getByText(/^Generate$/));
    await screen.findByTestId("local-status-queued");

    await act(async () => {
      await emit(0);
    });
    expect(screen.getByTestId("local-status-queued")).toBeTruthy();
    expect(screen.queryByTestId("local-status-running")).toBeNull();

    await act(async () => {
      await emit(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-error")).toBeTruthy();
    });
    expect(
      screen.getByTestId("local-status-message").textContent,
    ).toContain("Could not retrieve queue info (status: 502).");
  });

  it("surfaces queue polling failures and keeps the queued card pinned", async () => {
    const events: Array<Partial<LocalGenerationStatus>> = [
      {
        status: "running",
        message: "Execution running ahead of queue info",
      },
      {
        status: "error",
        message: "Queue polling failed: overloaded",
      },
    ];

    const errorReason = new Error("Queue polling failed: overloaded");
    const { generator, emit } = createControlledGenerator(events, {
      reject: true,
      rejectReason: errorReason,
    });

    renderComponent({ generateShotVideo: generator });
    fireEvent.click(screen.getByText(/^Generate$/));
    await screen.findByTestId("local-status-queued");

    // Follows the status -> execution_start -> queued -> running -> progress ordering described in the
    // ComfyUI `websockets_api_example.py` sample so the queue guard stays in sync.
    await act(async () => {
      await emit(0);
    });
    expect(screen.getByTestId("local-status-queued")).toBeTruthy();
    expect(screen.queryByTestId("local-status-running")).toBeNull();

    await act(async () => {
      await emit(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("local-status-error")).toBeTruthy();
    });
    expect(
      screen.getByTestId("local-status-message").textContent,
    ).toContain("Queue polling failed: overloaded");
  });
});
