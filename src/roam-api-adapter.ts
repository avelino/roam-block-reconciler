import type { BlockPayload, RoamNode } from "./types";

/**
 * Adapter interface for Roam API operations.
 * Abstracts the underlying Roam API to make the reconciler testable.
 */
export interface RoamApiAdapter {
  /**
   * Gets child blocks of a parent block or page.
   */
  getChildren(parentUid: string): RoamNode[];

  /**
   * Creates a new block under a parent.
   * @returns The UID of the created block.
   */
  createBlock(
    parentUid: string,
    block: BlockPayload,
    order?: number | "last"
  ): Promise<string>;

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
export interface RoamBasicNode {
  text?: string;
  uid: string;
  children?: RoamBasicNode[];
}

/**
 * Input node format for creating blocks in Roam.
 */
export interface InputTextNode {
  text: string;
  children?: InputTextNode[];
}

/**
 * Options for creating a Roam API adapter.
 */
export interface RoamApiAdapterOptions {
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
  updateBlock: (params: { uid: string; text: string }) => Promise<void>;

  /**
   * Function to delete a block.
   */
  deleteBlock: (uid: string) => Promise<void>;
}

/**
 * Converts a RoamBasicNode to the RoamNode interface used by the reconciler.
 */
function toRoamNode(node: RoamBasicNode): RoamNode {
  return {
    text: node.text ?? "",
    uid: node.uid,
    children: node.children?.map(toRoamNode),
  };
}

/**
 * Converts a BlockPayload to the InputTextNode format expected by Roam API.
 */
function toInputNode(payload: BlockPayload): InputTextNode {
  return {
    text: payload.text,
    children: payload.children?.map(toInputNode),
  };
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
export function createRoamApiAdapter(options: RoamApiAdapterOptions): RoamApiAdapter {
  return {
    getChildren(parentUid: string): RoamNode[] {
      const nodes = options.getBasicTreeByParentUid(parentUid);
      return nodes.map(toRoamNode);
    },

    async createBlock(
      parentUid: string,
      block: BlockPayload,
      order: number | "last" = "last"
    ): Promise<string> {
      const uid = await options.createBlock({
        parentUid,
        order,
        node: toInputNode(block),
      });
      return uid;
    },

    async updateBlock(uid: string, text: string): Promise<void> {
      await options.updateBlock({ uid, text });
    },

    async deleteBlock(uid: string): Promise<void> {
      await options.deleteBlock(uid);
    },
  };
}
