/**
 * Roam Block Reconciler
 *
 * A library for efficiently syncing data from external sources to Roam blocks.
 * Only creates, updates, or deletes blocks when necessary.
 *
 * @example
 * ```typescript
 * import { BlockReconciler, createRoamApiAdapter } from "roam-block-reconciler";
 *
 * const adapter = createRoamApiAdapter({
 *   getBasicTreeByParentUid: (uid) => getBasicTreeByParentUid(uid),
 *   createBlock: async (params) => createBlock(params),
 *   updateBlock: async (params) => updateBlock(params),
 *   deleteBlock: async (uid) => deleteBlock(uid),
 * });
 *
 * const reconciler = new BlockReconciler<Task>({
 *   extractId: (task) => String(task.id),
 *   buildBlock: (task) => ({ text: task.content, children: [] }),
 *   extractIdFromBlock: (node) => extractIdFromText(node.text),
 *   options: {
 *     preserveWhen: (node) => hasCompletedStatus(node),
 *   }
 * }, adapter);
 *
 * const stats = await reconciler.reconcile(pageUid, tasks);
 * console.log(`Skipped: ${stats.skipped}, Updated: ${stats.updated}`);
 * ```
 */

// Types
export type {
  BlockPayload,
  RoamNode,
  ReconcilerConfig,
  ReconcilerOptions,
  SyncStats,
  ChildReconcilerConfig,
  Logger,
} from "./types";

// Roam API Adapter
export type { RoamApiAdapter, RoamBasicNode, InputTextNode, RoamApiAdapterOptions } from "./roam-api-adapter";
export { createRoamApiAdapter } from "./roam-api-adapter";

// Block Reconciler
export { BlockReconciler } from "./block-reconciler";

// Children Reconciler
export { ChildrenReconciler, type ChildSyncStats } from "./children-reconciler";

// Utilities
export { delay, yieldToMain, maybeYield, DEFAULT_MUTATION_DELAY_MS, DEFAULT_YIELD_BATCH_SIZE } from "./utils";
