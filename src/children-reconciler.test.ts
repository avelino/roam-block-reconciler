import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChildrenReconciler } from "./children-reconciler";
import type { RoamApiAdapter } from "./roam-api-adapter";
import type { ChildReconcilerConfig, RoamNode, BlockPayload } from "./types";

function createMockAdapter(): RoamApiAdapter {
  return {
    getChildren: vi.fn().mockReturnValue([]),
    createBlock: vi.fn().mockResolvedValue("new-uid"),
    updateBlock: vi.fn().mockResolvedValue(undefined),
    deleteBlock: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestConfig(
  overrides?: Partial<ChildReconcilerConfig>
): ChildReconcilerConfig {
  return {
    extractKey: (text) => {
      const match = text.match(/^([a-z-]+)::/);
      return match?.[1];
    },
    mutationDelayMs: 0,
    ...overrides,
  };
}

describe("ChildrenReconciler", () => {
  let adapter: RoamApiAdapter;
  let config: ChildReconcilerConfig;
  let reconciler: ChildrenReconciler;

  beforeEach(() => {
    adapter = createMockAdapter();
    config = createTestConfig();
    reconciler = new ChildrenReconciler(config, adapter);
  });

  describe("syncChildren - create properties", () => {
    it("should create new property blocks", async () => {
      const existingChildren: RoamNode[] = [];
      const newChildren: BlockPayload[] = [
        { text: "priority:: high" },
        { text: "due-date:: 2024-01-15" },
      ];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats).toEqual({
        skipped: 0,
        updated: 0,
        created: 2,
        deleted: 0,
      });

      expect(adapter.createBlock).toHaveBeenCalledTimes(2);
      expect(adapter.createBlock).toHaveBeenCalledWith(
        "parent-uid",
        { text: "priority:: high" },
        "last"
      );
      expect(adapter.createBlock).toHaveBeenCalledWith(
        "parent-uid",
        { text: "due-date:: 2024-01-15" },
        "last"
      );
    });
  });

  describe("syncChildren - skip unchanged properties", () => {
    it("should skip properties that have not changed", async () => {
      const existingChildren: RoamNode[] = [
        { uid: "uid-1", text: "priority:: high" },
        { uid: "uid-2", text: "status:: active" },
      ];
      const newChildren: BlockPayload[] = [
        { text: "priority:: high" },
        { text: "status:: active" },
      ];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats).toEqual({
        skipped: 2,
        updated: 0,
        created: 0,
        deleted: 0,
      });

      expect(adapter.createBlock).not.toHaveBeenCalled();
      expect(adapter.updateBlock).not.toHaveBeenCalled();
      expect(adapter.deleteBlock).not.toHaveBeenCalled();
    });
  });

  describe("syncChildren - update properties", () => {
    it("should update properties when value changes", async () => {
      const existingChildren: RoamNode[] = [
        { uid: "uid-1", text: "priority:: low" },
      ];
      const newChildren: BlockPayload[] = [{ text: "priority:: high" }];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats).toEqual({
        skipped: 0,
        updated: 1,
        created: 0,
        deleted: 0,
      });

      expect(adapter.updateBlock).toHaveBeenCalledWith("uid-1", "priority:: high");
    });
  });

  describe("syncChildren - delete orphaned properties", () => {
    it("should delete properties no longer in desired state", async () => {
      const existingChildren: RoamNode[] = [
        { uid: "uid-1", text: "priority:: high" },
        { uid: "uid-2", text: "status:: active" },
        { uid: "uid-3", text: "old-prop:: value" },
      ];
      const newChildren: BlockPayload[] = [{ text: "priority:: high" }];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats).toEqual({
        skipped: 1,
        updated: 0,
        created: 0,
        deleted: 2,
      });

      expect(adapter.deleteBlock).toHaveBeenCalledTimes(2);
      expect(adapter.deleteBlock).toHaveBeenCalledWith("uid-2");
      expect(adapter.deleteBlock).toHaveBeenCalledWith("uid-3");
    });
  });

  describe("syncChildren - special blocks", () => {
    it("should handle special blocks by deleting and recreating", async () => {
      const configWithSpecial = createTestConfig({
        isSpecialBlock: (text) => text.startsWith("__comments__"),
      });
      reconciler = new ChildrenReconciler(configWithSpecial, adapter);

      const existingChildren: RoamNode[] = [
        { uid: "uid-1", text: "__comments__" },
      ];
      const newChildren: BlockPayload[] = [
        { text: "__comments__", children: [{ text: "New comment" }] },
      ];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats.deleted).toBe(1);
      expect(stats.created).toBe(1);

      expect(adapter.deleteBlock).toHaveBeenCalledWith("uid-1");
      expect(adapter.createBlock).toHaveBeenCalledWith(
        "parent-uid",
        { text: "__comments__", children: [{ text: "New comment" }] },
        "last"
      );
    });

    it("should delete all existing special blocks before creating new one", async () => {
      const configWithSpecial = createTestConfig({
        isSpecialBlock: (text) => text.startsWith("__comments__"),
      });
      reconciler = new ChildrenReconciler(configWithSpecial, adapter);

      const existingChildren: RoamNode[] = [
        { uid: "uid-1", text: "__comments__" },
        { uid: "uid-2", text: "__comments__" },
      ];
      const newChildren: BlockPayload[] = [{ text: "__comments__" }];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats.deleted).toBe(2);
      expect(stats.created).toBe(1);
    });
  });

  describe("syncChildren - blocks without extractable key", () => {
    it("should ignore blocks without extractable key", async () => {
      const existingChildren: RoamNode[] = [
        { uid: "uid-1", text: "Some random text without property format" },
        { uid: "uid-2", text: "priority:: high" },
      ];
      const newChildren: BlockPayload[] = [{ text: "priority:: high" }];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats.skipped).toBe(1);
      expect(stats.deleted).toBe(0);
      expect(adapter.deleteBlock).not.toHaveBeenCalled();
    });
  });

  describe("syncChildren - empty arrays", () => {
    it("should handle empty existing children", async () => {
      const existingChildren: RoamNode[] = [];
      const newChildren: BlockPayload[] = [{ text: "priority:: high" }];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats.created).toBe(1);
    });

    it("should handle empty new children", async () => {
      const existingChildren: RoamNode[] = [
        { uid: "uid-1", text: "priority:: high" },
      ];
      const newChildren: BlockPayload[] = [];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats.deleted).toBe(1);
    });

    it("should handle both empty", async () => {
      const stats = await reconciler.syncChildren("parent-uid", [], []);

      expect(stats).toEqual({
        skipped: 0,
        updated: 0,
        created: 0,
        deleted: 0,
      });
    });
  });

  describe("syncChildren - mixed operations", () => {
    it("should handle create, update, skip, and delete in same sync", async () => {
      const existingChildren: RoamNode[] = [
        { uid: "uid-1", text: "priority:: high" },
        { uid: "uid-2", text: "status:: old-status" },
        { uid: "uid-3", text: "to-delete:: value" },
      ];
      const newChildren: BlockPayload[] = [
        { text: "priority:: high" },
        { text: "status:: new-status" },
        { text: "new-prop:: value" },
      ];

      const stats = await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(stats).toEqual({
        skipped: 1,
        updated: 1,
        created: 1,
        deleted: 1,
      });
    });
  });

  describe("syncChildren - logger", () => {
    it("should log events when logger is provided", async () => {
      const logger = { debug: vi.fn() };
      const configWithLogger = createTestConfig({ logger });
      reconciler = new ChildrenReconciler(configWithLogger, adapter);

      const existingChildren: RoamNode[] = [];
      const newChildren: BlockPayload[] = [{ text: "priority:: high" }];

      await reconciler.syncChildren("parent-uid", existingChildren, newChildren);

      expect(logger.debug).toHaveBeenCalledWith(
        "children_reconciler_start",
        expect.objectContaining({
          parentUid: "parent-uid",
        })
      );
      expect(logger.debug).toHaveBeenCalledWith("children_reconciler_create", { key: "priority" });
      expect(logger.debug).toHaveBeenCalledWith(
        "children_reconciler_complete",
        expect.objectContaining({ created: 1 })
      );
    });
  });
});
