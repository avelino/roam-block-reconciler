/**
 * Block payload for creating/updating blocks in Roam.
 */
type BlockPayload = {
    text: string;
    children?: BlockPayload[];
};
/**
 * Represents a block node in Roam's tree structure.
 */
interface RoamNode {
    text: string;
    uid: string;
    children?: RoamNode[];
}
/**
 * Configuration for reconciling items with Roam blocks.
 * @template T The type of source items (e.g., TodoistBackupTask).
 */
interface ReconcilerConfig<T> {
    /**
     * Extracts a unique identifier from the source item.
     * This ID is used to match items with existing blocks.
     */
    extractId: (item: T) => string;
    /**
     * Builds a block payload from the source item.
     */
    buildBlock: (item: T) => BlockPayload;
    /**
     * Extracts the unique identifier from an existing Roam block.
     * Returns undefined if the block doesn't have a recognizable ID.
     */
    extractIdFromBlock: (node: RoamNode) => string | undefined;
    /**
     * Optional configuration options.
     */
    options?: ReconcilerOptions;
}
/**
 * Options for customizing reconciliation behavior.
 */
interface ReconcilerOptions {
    /**
     * Determines whether a block should be preserved even when
     * its corresponding item was removed from the source.
     * Useful for keeping completed tasks that are no longer in the active list.
     */
    preserveWhen?: (node: RoamNode) => boolean;
    /**
     * Callback invoked during sync to report progress.
     */
    onProgress?: (stats: SyncStats) => void;
    /**
     * Delay in milliseconds between Roam API mutations.
     * Default: 100ms
     */
    mutationDelayMs?: number;
    /**
     * Number of operations to process before yielding to the main thread.
     * Default: 3
     */
    yieldBatchSize?: number;
    /**
     * Optional logger for debug output.
     */
    logger?: Logger;
}
/**
 * Statistics about a sync operation.
 */
interface SyncStats {
    /** Total number of items processed */
    total: number;
    /** Blocks that were unchanged and skipped */
    skipped: number;
    /** New blocks created */
    created: number;
    /** Existing blocks that were updated */
    updated: number;
    /** Obsolete blocks that were deleted */
    deleted: number;
}
/**
 * Configuration for reconciling child blocks (properties).
 */
interface ChildReconcilerConfig {
    /**
     * Extracts the property key from block text.
     * For example, extracts "todoist-id" from "todoist-id:: value".
     * Returns undefined if the text is not a property block.
     */
    extractKey: (text: string) => string | undefined;
    /**
     * Identifies special blocks that need different handling.
     * For example, comment wrapper blocks that should be replaced entirely.
     */
    isSpecialBlock?: (text: string) => boolean;
    /**
     * Delay in milliseconds between Roam API mutations.
     * Default: 100ms
     */
    mutationDelayMs?: number;
    /**
     * Optional logger for debug output.
     */
    logger?: Logger;
}
/**
 * Logger interface for debug output.
 */
interface Logger {
    debug: (event: string, data?: Record<string, unknown>) => void;
}

/**
 * Adapter interface for Roam API operations.
 * Abstracts the underlying Roam API to make the reconciler testable.
 */
interface RoamApiAdapter {
    /**
     * Gets child blocks of a parent block or page.
     */
    getChildren(parentUid: string): RoamNode[];
    /**
     * Creates a new block under a parent.
     * @returns The UID of the created block.
     */
    createBlock(parentUid: string, block: BlockPayload, order?: number | "last"): Promise<string>;
    /**
     * Updates the text of an existing block.
     */
    updateBlock(uid: string, text: string): Promise<void>;
    /**
     * Deletes a block by its UID.
     */
    deleteBlock(uid: string): Promise<void>;
}
/**
 * Basic node structure from Roam's API.
 */
interface RoamBasicNode {
    text?: string;
    uid: string;
    children?: RoamBasicNode[];
}
/**
 * Input node format for creating blocks in Roam.
 */
interface InputTextNode {
    text: string;
    children?: InputTextNode[];
}
/**
 * Options for creating a Roam API adapter.
 */
interface RoamApiAdapterOptions {
    /**
     * Function to get child blocks by parent UID.
     * Should return an array of RoamBasicNode.
     */
    getBasicTreeByParentUid: (uid: string) => RoamBasicNode[];
    /**
     * Function to create a block.
     * Should return the UID of the created block.
     */
    createBlock: (params: {
        parentUid: string;
        order: number | "last";
        node: InputTextNode;
    }) => Promise<string>;
    /**
     * Function to update a block's text.
     */
    updateBlock: (params: {
        uid: string;
        text: string;
    }) => Promise<void>;
    /**
     * Function to delete a block.
     */
    deleteBlock: (uid: string) => Promise<void>;
}
/**
 * Creates a Roam API adapter with the provided API functions.
 *
 * @example
 * ```typescript
 * const adapter = createRoamApiAdapter({
 *   getBasicTreeByParentUid: (uid) => window.roamAlphaAPI.q(...),
 *   createBlock: async (params) => window.roamAlphaAPI.createBlock(...),
 *   updateBlock: async (params) => window.roamAlphaAPI.updateBlock(...),
 *   deleteBlock: async (uid) => window.roamAlphaAPI.deleteBlock(...),
 * });
 * ```
 */
declare function createRoamApiAdapter(options: RoamApiAdapterOptions): RoamApiAdapter;

/**
 * Reconciles a list of source items with existing Roam blocks.
 * Only creates, updates, or deletes blocks when necessary.
 */
declare class BlockReconciler<T> {
    private readonly config;
    private readonly roamApi;
    private readonly mutationDelayMs;
    private readonly yieldBatchSize;
    private readonly logger;
    private childrenReconciler;
    constructor(config: ReconcilerConfig<T>, roamApi: RoamApiAdapter);
    /**
     * Sets up the children reconciler for syncing child blocks (properties).
     */
    withChildrenReconciler(config: ChildReconcilerConfig): this;
    /**
     * Reconciles items with existing blocks under a parent.
     *
     * @param parentUid UID of the parent block or page.
     * @param items Source items to reconcile.
     * @returns Statistics about the sync operation.
     */
    reconcile(parentUid: string, items: T[]): Promise<SyncStats>;
    /**
     * Builds a map of existing blocks by their extracted ID.
     */
    private buildExistingMap;
    /**
     * Compares an existing block with a new block payload.
     * Returns true if they are equivalent (no update needed).
     */
    private isUnchanged;
    /**
     * Compares a single child node with a new child payload.
     */
    private isChildUnchanged;
    /**
     * Updates an existing block and its children.
     */
    private updateExistingBlock;
    /**
     * Creates a new block with its children.
     */
    private createNewBlock;
    /**
     * Removes blocks that are no longer in the source list.
     * Respects the preserveWhen option.
     */
    private removeObsolete;
    /**
     * Yields to the main thread periodically based on the configured batch size.
     */
    private maybeYieldToMain;
}

/**
 * Statistics about a children sync operation.
 */
interface ChildSyncStats {
    skipped: number;
    updated: number;
    created: number;
    deleted: number;
}
/**
 * Reconciles child blocks (properties) of a parent block.
 * Updates existing properties, creates new ones, and handles special blocks.
 */
declare class ChildrenReconciler {
    private readonly config;
    private readonly roamApi;
    private readonly mutationDelayMs;
    private readonly logger;
    constructor(config: ChildReconcilerConfig, roamApi: RoamApiAdapter);
    /**
     * Synchronizes child blocks of a parent.
     *
     * @param parentUid UID of the parent block.
     * @param existingChildren Current child nodes from Roam.
     * @param newChildren Desired child payloads.
     * @returns Statistics about the sync.
     */
    syncChildren(parentUid: string, existingChildren: RoamNode[], newChildren: BlockPayload[]): Promise<ChildSyncStats>;
}

/**
 * Default delay between Roam API mutations in milliseconds.
 */
declare const DEFAULT_MUTATION_DELAY_MS = 100;
/**
 * Default number of operations before yielding to main thread.
 */
declare const DEFAULT_YIELD_BATCH_SIZE = 3;
/**
 * Delays execution for the specified number of milliseconds.
 */
declare function delay(ms: number): Promise<void>;
/**
 * Yields to the main thread using scheduler.yield if available,
 * otherwise falls back to setTimeout.
 */
declare function yieldToMain(): Promise<void>;
/**
 * Conditionally yields to the main thread based on operation count.
 */
declare function maybeYield(operationCount: number, batchSize?: number): Promise<void>;

export { type BlockPayload, BlockReconciler, type ChildReconcilerConfig, type ChildSyncStats, ChildrenReconciler, DEFAULT_MUTATION_DELAY_MS, DEFAULT_YIELD_BATCH_SIZE, type InputTextNode, type Logger, type ReconcilerConfig, type ReconcilerOptions, type RoamApiAdapter, type RoamApiAdapterOptions, type RoamBasicNode, type RoamNode, type SyncStats, createRoamApiAdapter, delay, maybeYield, yieldToMain };
