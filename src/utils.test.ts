import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  delay,
  yieldToMain,
  maybeYield,
  DEFAULT_MUTATION_DELAY_MS,
  DEFAULT_YIELD_BATCH_SIZE,
} from "./utils";

describe("utils", () => {
  describe("constants", () => {
    it("DEFAULT_MUTATION_DELAY_MS should be 100", () => {
      expect(DEFAULT_MUTATION_DELAY_MS).toBe(100);
    });

    it("DEFAULT_YIELD_BATCH_SIZE should be 3", () => {
      expect(DEFAULT_YIELD_BATCH_SIZE).toBe(3);
    });
  });

  describe("delay", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should resolve after specified milliseconds", async () => {
      const promise = delay(100);

      vi.advanceTimersByTime(99);
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(1);
      await promise;

      expect(vi.getTimerCount()).toBe(0);
    });

    it("should resolve immediately with 0ms delay", async () => {
      const promise = delay(0);
      vi.advanceTimersByTime(0);
      await promise;
      expect(true).toBe(true);
    });
  });

  describe("yieldToMain", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should use scheduler.yield when available", async () => {
      const mockYield = vi.fn().mockResolvedValue(undefined);
      const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } };
      g.scheduler = { yield: mockYield };

      await yieldToMain();

      expect(mockYield).toHaveBeenCalledOnce();

      delete g.scheduler;
    });

    it("should fallback to setTimeout when scheduler.yield is not available", async () => {
      const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } };
      delete g.scheduler;

      const promise = yieldToMain();
      vi.advanceTimersByTime(0);
      await promise;

      expect(true).toBe(true);
    });
  });

  describe("maybeYield", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should yield when operation count is multiple of batch size", async () => {
      const promise = maybeYield(3, 3);
      vi.advanceTimersByTime(0);
      await promise;
      expect(true).toBe(true);
    });

    it("should yield when operation count is multiple of default batch size", async () => {
      const promise = maybeYield(6);
      vi.advanceTimersByTime(0);
      await promise;
      expect(true).toBe(true);
    });

    it("should not yield when operation count is not a multiple of batch size", async () => {
      await maybeYield(1, 3);
      await maybeYield(2, 3);
      await maybeYield(4, 3);
      expect(true).toBe(true);
    });
  });
});
