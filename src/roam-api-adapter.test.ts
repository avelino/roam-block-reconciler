import { describe, it, expect, vi } from "vitest";
import { createRoamApiAdapter, type RoamBasicNode, type RoamApiAdapterOptions } from "./roam-api-adapter";
import type { BlockPayload } from "./types";

function createMockOptions(): RoamApiAdapterOptions {
  return {
    getBasicTreeByParentUid: vi.fn(),
    createBlock: vi.fn().mockResolvedValue("new-uid"),
    updateBlock: vi.fn().mockResolvedValue(undefined),
    deleteBlock: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createRoamApiAdapter", () => {
  describe("getChildren", () => {
    it("should convert RoamBasicNode to RoamNode", () => {
      const mockNodes: RoamBasicNode[] = [
        { uid: "uid-1", text: "Block 1" },
        { uid: "uid-2", text: "Block 2" },
      ];

      const options = createMockOptions();
      vi.mocked(options.getBasicTreeByParentUid).mockReturnValue(mockNodes);

      const adapter = createRoamApiAdapter(options);
      const result = adapter.getChildren("parent-uid");

      expect(options.getBasicTreeByParentUid).toHaveBeenCalledWith("parent-uid");
      expect(result).toEqual([
        { uid: "uid-1", text: "Block 1", children: undefined },
        { uid: "uid-2", text: "Block 2", children: undefined },
      ]);
    });

    it("should handle nested children", () => {
      const mockNodes: RoamBasicNode[] = [
        {
          uid: "uid-1",
          text: "Parent",
          children: [
            { uid: "uid-1-1", text: "Child 1" },
            {
              uid: "uid-1-2",
              text: "Child 2",
              children: [{ uid: "uid-1-2-1", text: "Grandchild" }],
            },
          ],
        },
      ];

      const options = createMockOptions();
      vi.mocked(options.getBasicTreeByParentUid).mockReturnValue(mockNodes);

      const adapter = createRoamApiAdapter(options);
      const result = adapter.getChildren("parent-uid");

      expect(result).toEqual([
        {
          uid: "uid-1",
          text: "Parent",
          children: [
            { uid: "uid-1-1", text: "Child 1", children: undefined },
            {
              uid: "uid-1-2",
              text: "Child 2",
              children: [{ uid: "uid-1-2-1", text: "Grandchild", children: undefined }],
            },
          ],
        },
      ]);
    });

    it("should handle empty text as empty string", () => {
      const mockNodes: RoamBasicNode[] = [{ uid: "uid-1" }];

      const options = createMockOptions();
      vi.mocked(options.getBasicTreeByParentUid).mockReturnValue(mockNodes);

      const adapter = createRoamApiAdapter(options);
      const result = adapter.getChildren("parent-uid");

      expect(result).toEqual([{ uid: "uid-1", text: "", children: undefined }]);
    });

    it("should return empty array when no children", () => {
      const options = createMockOptions();
      vi.mocked(options.getBasicTreeByParentUid).mockReturnValue([]);

      const adapter = createRoamApiAdapter(options);
      const result = adapter.getChildren("parent-uid");

      expect(result).toEqual([]);
    });
  });

  describe("createBlock", () => {
    it("should create block with correct parameters", async () => {
      const options = createMockOptions();
      const adapter = createRoamApiAdapter(options);

      const block: BlockPayload = { text: "New block" };
      const result = await adapter.createBlock("parent-uid", block, "last");

      expect(options.createBlock).toHaveBeenCalledWith({
        parentUid: "parent-uid",
        order: "last",
        node: { text: "New block", children: undefined },
      });
      expect(result).toBe("new-uid");
    });

    it("should handle numeric order", async () => {
      const options = createMockOptions();
      const adapter = createRoamApiAdapter(options);

      const block: BlockPayload = { text: "New block" };
      await adapter.createBlock("parent-uid", block, 0);

      expect(options.createBlock).toHaveBeenCalledWith({
        parentUid: "parent-uid",
        order: 0,
        node: { text: "New block", children: undefined },
      });
    });

    it("should default order to last", async () => {
      const options = createMockOptions();
      const adapter = createRoamApiAdapter(options);

      const block: BlockPayload = { text: "New block" };
      await adapter.createBlock("parent-uid", block);

      expect(options.createBlock).toHaveBeenCalledWith({
        parentUid: "parent-uid",
        order: "last",
        node: { text: "New block", children: undefined },
      });
    });

    it("should convert nested children to InputTextNode format", async () => {
      const options = createMockOptions();
      const adapter = createRoamApiAdapter(options);

      const block: BlockPayload = {
        text: "Parent",
        children: [
          { text: "Child 1" },
          { text: "Child 2", children: [{ text: "Grandchild" }] },
        ],
      };

      await adapter.createBlock("parent-uid", block, "last");

      expect(options.createBlock).toHaveBeenCalledWith({
        parentUid: "parent-uid",
        order: "last",
        node: {
          text: "Parent",
          children: [
            { text: "Child 1", children: undefined },
            { text: "Child 2", children: [{ text: "Grandchild", children: undefined }] },
          ],
        },
      });
    });
  });

  describe("updateBlock", () => {
    it("should update block with correct parameters", async () => {
      const options = createMockOptions();
      const adapter = createRoamApiAdapter(options);

      await adapter.updateBlock("block-uid", "Updated text");

      expect(options.updateBlock).toHaveBeenCalledWith({
        uid: "block-uid",
        text: "Updated text",
      });
    });
  });

  describe("deleteBlock", () => {
    it("should delete block with correct uid", async () => {
      const options = createMockOptions();
      const adapter = createRoamApiAdapter(options);

      await adapter.deleteBlock("block-uid");

      expect(options.deleteBlock).toHaveBeenCalledWith("block-uid");
    });
  });
});
