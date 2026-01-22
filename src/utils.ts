/**
 * Default delay between Roam API mutations in milliseconds.
 */
export const DEFAULT_MUTATION_DELAY_MS = 100;

/**
 * Default number of operations before yielding to main thread.
 */
export const DEFAULT_YIELD_BATCH_SIZE = 3;

/**
 * Delays execution for the specified number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Yields to the main thread using scheduler.yield if available,
 * otherwise falls back to setTimeout.
 */
export async function yieldToMain(): Promise<void> {
  const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } };
  if (typeof g.scheduler?.yield === "function") {
    await g.scheduler.yield();
  } else {
    await delay(0);
  }
}

/**
 * Conditionally yields to the main thread based on operation count.
 */
export async function maybeYield(
  operationCount: number,
  batchSize: number = DEFAULT_YIELD_BATCH_SIZE
): Promise<void> {
  if (operationCount % batchSize === 0) {
    await yieldToMain();
  }
}
