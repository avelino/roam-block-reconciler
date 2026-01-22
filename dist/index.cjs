'use strict';

// src/roam-api-adapter.ts
function toRoamNode(node) {
  return {
    text: node.text ?? "",
    uid: node.uid,
    children: node.children?.map(toRoamNode)
  };
}
function toInputNode(payload) {
  return {
    text: payload.text,
    children: payload.children?.map(toInputNode)
  };
}
function createRoamApiAdapter(options) {
  return {
    getChildren(parentUid) {
      const nodes = options.getBasicTreeByParentUid(parentUid);
      return nodes.map(toRoamNode);
    },
    async createBlock(parentUid, block, order = "last") {
      const uid = await options.createBlock({
        parentUid,
        order,
        node: toInputNode(block)
      });
      return uid;
    },
    async updateBlock(uid, text) {
      await options.updateBlock({ uid, text });
    },
    async deleteBlock(uid) {
      await options.deleteBlock(uid);
    }
  };
}

// src/utils.ts
var DEFAULT_MUTATION_DELAY_MS = 100;
var DEFAULT_YIELD_BATCH_SIZE = 3;
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function yieldToMain() {
  const g = globalThis;
  if (typeof g.scheduler?.yield === "function") {
    await g.scheduler.yield();
  } else {
    await delay(0);
  }
}
async function maybeYield(operationCount, batchSize = DEFAULT_YIELD_BATCH_SIZE) {
  if (operationCount % batchSize === 0) {
    await yieldToMain();
  }
}

// src/children-reconciler.ts
var ChildrenReconciler = class {
  constructor(config, roamApi) {
    this.config = config;
    this.roamApi = roamApi;
    this.mutationDelayMs = config.mutationDelayMs ?? DEFAULT_MUTATION_DELAY_MS;
    this.logger = config.logger;
  }
  mutationDelayMs;
  logger;
  /**
   * Synchronizes child blocks of a parent.
   *
   * @param parentUid UID of the parent block.
   * @param existingChildren Current child nodes from Roam.
   * @param newChildren Desired child payloads.
   * @returns Statistics about the sync.
   */
  async syncChildren(parentUid, existingChildren, newChildren) {
    const stats = {
      skipped: 0,
      updated: 0,
      created: 0,
      deleted: 0
    };
    const existingPropsMap = /* @__PURE__ */ new Map();
    const existingSpecialBlocks = [];
    for (const child of existingChildren) {
      const key = this.config.extractKey(child.text);
      if (key) {
        existingPropsMap.set(key, child);
      } else if (this.config.isSpecialBlock?.(child.text)) {
        existingSpecialBlocks.push(child);
      }
    }
    this.logger?.debug("children_reconciler_start", {
      parentUid,
      existingPropsCount: existingPropsMap.size,
      existingSpecialCount: existingSpecialBlocks.length,
      newChildrenCount: newChildren.length
    });
    let operationCount = 0;
    for (const newChild of newChildren) {
      const key = this.config.extractKey(newChild.text);
      if (key) {
        const existing = existingPropsMap.get(key);
        if (existing) {
          if (existing.text === newChild.text) {
            stats.skipped++;
            this.logger?.debug("children_reconciler_skip", { key, reason: "unchanged" });
          } else {
            await this.roamApi.updateBlock(existing.uid, newChild.text);
            await delay(this.mutationDelayMs);
            stats.updated++;
            this.logger?.debug("children_reconciler_update", { key, uid: existing.uid });
          }
          existingPropsMap.delete(key);
        } else {
          await this.roamApi.createBlock(parentUid, newChild, "last");
          await delay(this.mutationDelayMs);
          stats.created++;
          this.logger?.debug("children_reconciler_create", { key });
        }
      } else if (this.config.isSpecialBlock?.(newChild.text)) {
        for (const specialBlock of existingSpecialBlocks) {
          await this.roamApi.deleteBlock(specialBlock.uid);
          await delay(this.mutationDelayMs);
          stats.deleted++;
          this.logger?.debug("children_reconciler_delete_special", { uid: specialBlock.uid });
        }
        existingSpecialBlocks.length = 0;
        await this.roamApi.createBlock(parentUid, newChild, "last");
        await delay(this.mutationDelayMs);
        stats.created++;
        this.logger?.debug("children_reconciler_create_special", { text: newChild.text.substring(0, 30) });
      }
      operationCount++;
      await maybeYield(operationCount);
    }
    for (const [key, orphanBlock] of existingPropsMap) {
      await delay(this.mutationDelayMs);
      await this.roamApi.deleteBlock(orphanBlock.uid);
      stats.deleted++;
      this.logger?.debug("children_reconciler_delete_orphan", { key, uid: orphanBlock.uid });
      operationCount++;
      await maybeYield(operationCount);
    }
    this.logger?.debug("children_reconciler_complete", { ...stats });
    return stats;
  }
};

// src/block-reconciler.ts
var BlockReconciler = class {
  constructor(config, roamApi) {
    this.config = config;
    this.roamApi = roamApi;
    this.mutationDelayMs = config.options?.mutationDelayMs ?? DEFAULT_MUTATION_DELAY_MS;
    this.yieldBatchSize = config.options?.yieldBatchSize ?? DEFAULT_YIELD_BATCH_SIZE;
    this.logger = config.options?.logger;
  }
  mutationDelayMs;
  yieldBatchSize;
  logger;
  childrenReconciler = null;
  /**
   * Sets up the children reconciler for syncing child blocks (properties).
   */
  withChildrenReconciler(config) {
    this.childrenReconciler = new ChildrenReconciler(
      { ...config, logger: config.logger ?? this.logger },
      this.roamApi
    );
    return this;
  }
  /**
   * Reconciles items with existing blocks under a parent.
   *
   * @param parentUid UID of the parent block or page.
   * @param items Source items to reconcile.
   * @returns Statistics about the sync operation.
   */
  async reconcile(parentUid, items) {
    const stats = {
      total: items.length,
      skipped: 0,
      created: 0,
      updated: 0,
      deleted: 0
    };
    const existingNodes = this.roamApi.getChildren(parentUid);
    const existingMap = this.buildExistingMap(existingNodes);
    this.logger?.debug("reconciler_start", {
      parentUid,
      itemCount: items.length,
      existingBlockCount: existingNodes.length,
      mappedBlockCount: existingMap.size
    });
    const seenIds = /* @__PURE__ */ new Set();
    let operationCount = 0;
    for (const item of items) {
      const id = this.config.extractId(item);
      seenIds.add(id);
      const newBlock = this.config.buildBlock(item);
      const existingNode = existingMap.get(id);
      if (existingNode) {
        const unchanged = this.isUnchanged(existingNode, newBlock);
        if (unchanged) {
          stats.skipped++;
          this.logger?.debug("reconciler_skip", { id, reason: "unchanged" });
        } else {
          await this.updateExistingBlock(existingNode, newBlock);
          stats.updated++;
          this.logger?.debug("reconciler_update", { id, uid: existingNode.uid });
        }
      } else {
        await this.createNewBlock(parentUid, newBlock);
        stats.created++;
        this.logger?.debug("reconciler_create", { id });
      }
      operationCount++;
      await this.maybeYieldToMain(operationCount);
      this.config.options?.onProgress?.(stats);
    }
    stats.deleted = await this.removeObsolete(existingMap, seenIds);
    this.logger?.debug("reconciler_complete", { ...stats });
    return stats;
  }
  /**
   * Builds a map of existing blocks by their extracted ID.
   */
  buildExistingMap(nodes) {
    const map = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      const id = this.config.extractIdFromBlock(node);
      if (id) {
        map.set(id, node);
        this.logger?.debug("reconciler_map_entry", { id, uid: node.uid });
      }
    }
    return map;
  }
  /**
   * Compares an existing block with a new block payload.
   * Returns true if they are equivalent (no update needed).
   */
  isUnchanged(existing, newBlock) {
    if (existing.text !== newBlock.text) {
      return false;
    }
    const existingChildren = existing.children ?? [];
    const newChildren = newBlock.children ?? [];
    if (existingChildren.length !== newChildren.length) {
      return false;
    }
    for (let i = 0; i < existingChildren.length; i++) {
      const existingChild = existingChildren[i];
      const newChild = newChildren[i];
      if (!this.isChildUnchanged(existingChild, newChild)) {
        return false;
      }
    }
    return true;
  }
  /**
   * Compares a single child node with a new child payload.
   */
  isChildUnchanged(existing, newChild) {
    if (existing.text !== newChild.text) {
      return false;
    }
    const existingChildren = existing.children ?? [];
    const newChildren = newChild.children ?? [];
    if (existingChildren.length !== newChildren.length) {
      return false;
    }
    for (let i = 0; i < existingChildren.length; i++) {
      if (!this.isChildUnchanged(existingChildren[i], newChildren[i])) {
        return false;
      }
    }
    return true;
  }
  /**
   * Updates an existing block and its children.
   */
  async updateExistingBlock(existing, newBlock) {
    if (existing.text !== newBlock.text) {
      await this.roamApi.updateBlock(existing.uid, newBlock.text);
      await delay(this.mutationDelayMs);
    }
    if (this.childrenReconciler && newBlock.children) {
      await this.childrenReconciler.syncChildren(
        existing.uid,
        existing.children ?? [],
        newBlock.children
      );
    }
  }
  /**
   * Creates a new block with its children.
   */
  async createNewBlock(parentUid, block) {
    await this.roamApi.createBlock(parentUid, block, "last");
  }
  /**
   * Removes blocks that are no longer in the source list.
   * Respects the preserveWhen option.
   */
  async removeObsolete(existingMap, seenIds) {
    let deletedCount = 0;
    let operationCount = 0;
    for (const [id, node] of existingMap.entries()) {
      if (seenIds.has(id)) {
        continue;
      }
      if (this.config.options?.preserveWhen?.(node)) {
        this.logger?.debug("reconciler_preserve", { id, uid: node.uid });
        continue;
      }
      await this.roamApi.deleteBlock(node.uid);
      await delay(this.mutationDelayMs);
      deletedCount++;
      this.logger?.debug("reconciler_delete", { id, uid: node.uid });
      operationCount++;
      await this.maybeYieldToMain(operationCount);
    }
    return deletedCount;
  }
  /**
   * Yields to the main thread periodically based on the configured batch size.
   */
  async maybeYieldToMain(count) {
    if (count % this.yieldBatchSize === 0) {
      await yieldToMain();
    }
  }
};

exports.BlockReconciler = BlockReconciler;
exports.ChildrenReconciler = ChildrenReconciler;
exports.DEFAULT_MUTATION_DELAY_MS = DEFAULT_MUTATION_DELAY_MS;
exports.DEFAULT_YIELD_BATCH_SIZE = DEFAULT_YIELD_BATCH_SIZE;
exports.createRoamApiAdapter = createRoamApiAdapter;
exports.delay = delay;
exports.maybeYield = maybeYield;
exports.yieldToMain = yieldToMain;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map