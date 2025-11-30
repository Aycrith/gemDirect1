import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import Toast from "../Toast";
import type { ToastMessage } from "../../types";

describe("Toast Component", () => {
  const removeToastMock = vi.fn<(id: number) => void>();

  beforeEach(() => {
    removeToastMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  const createToast = (overrides: Partial<ToastMessage> = {}): ToastMessage => ({
    id: 1,
    message: "Test message",
    type: "success",
    ...overrides,
  });

  describe("Rendering", () => {
    it("renders empty container when no toasts", () => {
      render(<Toast toasts={[]} removeToast={removeToastMock} />);
      
      const container = screen.getByTestId("toast-container");
      expect(container).toBeTruthy();
      expect(container.children.length).toBe(0);
    });

    it("renders a single toast with correct message", () => {
      const toasts = [createToast({ message: "Hello World" })];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      expect(screen.getByText("Hello World")).toBeTruthy();
    });

    it("renders multiple toasts", () => {
      const toasts = [
        createToast({ id: 1, message: "First toast" }),
        createToast({ id: 2, message: "Second toast" }),
        createToast({ id: 3, message: "Third toast" }),
      ];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      expect(screen.getByText("First toast")).toBeTruthy();
      expect(screen.getByText("Second toast")).toBeTruthy();
      expect(screen.getByText("Third toast")).toBeTruthy();
    });

    it("renders toast with correct type styling", () => {
      const successToast = createToast({ type: "success" });
      const errorToast = createToast({ id: 2, type: "error" });
      const infoToast = createToast({ id: 3, type: "info" });
      
      render(<Toast toasts={[successToast, errorToast, infoToast]} removeToast={removeToastMock} />);
      
      expect(screen.getByTestId("toast-success")).toBeTruthy();
      expect(screen.getByTestId("toast-error")).toBeTruthy();
      expect(screen.getByTestId("toast-info")).toBeTruthy();
    });
  });

  describe("Dismiss Functionality", () => {
    it("calls removeToast with correct id when dismiss button is clicked", () => {
      const toasts = [createToast({ id: 42, message: "Dismissable toast" })];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const dismissBtn = screen.getByTestId("toast-dismiss-btn");
      fireEvent.click(dismissBtn);
      
      expect(removeToastMock).toHaveBeenCalledTimes(1);
      expect(removeToastMock).toHaveBeenCalledWith(42);
    });

    it("dismiss button is visible and clickable", () => {
      const toasts = [createToast()];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const dismissBtn = screen.getByTestId("toast-dismiss-btn");
      expect(dismissBtn).toBeTruthy();
      expect(dismissBtn.getAttribute("aria-label")).toBe("Close notification");
    });

    it("each toast has its own dismiss button that removes the correct toast", () => {
      const toasts = [
        createToast({ id: 1, message: "First" }),
        createToast({ id: 2, message: "Second" }),
        createToast({ id: 3, message: "Third" }),
      ];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const dismissBtns = screen.getAllByTestId("toast-dismiss-btn");
      expect(dismissBtns.length).toBe(3);
      
      // Click the second dismiss button
      const secondBtn = dismissBtns[1];
      if (secondBtn) fireEvent.click(secondBtn);
      
      expect(removeToastMock).toHaveBeenCalledWith(2);
    });

    it("prevents event propagation when clicking dismiss", () => {
      const toasts = [createToast()];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const dismissBtn = screen.getByTestId("toast-dismiss-btn");
      const clickEvent = new MouseEvent("click", { bubbles: true });
      const stopPropagationSpy = vi.spyOn(clickEvent, "stopPropagation");
      
      dismissBtn.dispatchEvent(clickEvent);
      
      // The handler calls e.stopPropagation()
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("dismiss button has correct aria-label", () => {
      const toasts = [createToast()];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const dismissBtn = screen.getByTestId("toast-dismiss-btn");
      expect(dismissBtn.getAttribute("aria-label")).toBe("Close notification");
    });

    it("dismiss button has title for tooltip", () => {
      const toasts = [createToast()];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const dismissBtn = screen.getByTestId("toast-dismiss-btn");
      expect(dismissBtn.getAttribute("title")).toBe("Dismiss notification");
    });

    it("dismiss button is a proper button element", () => {
      const toasts = [createToast()];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const dismissBtn = screen.getByTestId("toast-dismiss-btn");
      expect(dismissBtn.tagName).toBe("BUTTON");
      expect(dismissBtn.getAttribute("type")).toBe("button");
    });
  });

  describe("Progress Bar", () => {
    it("renders progress bar with pointer-events-none class", () => {
      const toasts = [createToast()];
      const { container } = render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      // Find the progress bar element by its animation class
      const progressBar = container.querySelector(".animate-toast-progress");
      expect(progressBar).toBeTruthy();
      expect(progressBar?.classList.contains("pointer-events-none")).toBe(true);
    });
  });

  describe("Toast Types", () => {
    it("success toast has green styling", () => {
      const toasts = [createToast({ type: "success" })];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const toast = screen.getByTestId("toast-success");
      expect(toast.className).toContain("green");
    });

    it("error toast has red styling", () => {
      const toasts = [createToast({ type: "error" })];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const toast = screen.getByTestId("toast-error");
      expect(toast.className).toContain("red");
    });

    it("info toast has amber styling", () => {
      const toasts = [createToast({ type: "info" })];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      const toast = screen.getByTestId("toast-info");
      expect(toast.className).toContain("amber");
    });
  });

  describe("Callback Stability", () => {
    it("does not call removeToast on render", () => {
      const toasts = [createToast()];
      render(<Toast toasts={toasts} removeToast={removeToastMock} />);
      
      expect(removeToastMock).not.toHaveBeenCalled();
    });

    it("creates new callback when toast id changes", () => {
      const toasts1 = [createToast({ id: 1 })];
      const { rerender } = render(<Toast toasts={toasts1} removeToast={removeToastMock} />);
      
      const toasts2 = [createToast({ id: 2 })];
      rerender(<Toast toasts={toasts2} removeToast={removeToastMock} />);
      
      const dismissBtn = screen.getByTestId("toast-dismiss-btn");
      fireEvent.click(dismissBtn);
      
      expect(removeToastMock).toHaveBeenCalledWith(2);
    });
  });
});
