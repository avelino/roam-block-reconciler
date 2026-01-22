import { describe, it, expect, vi, beforeEach } from "vitest";
import { BlockReconciler } from "./block-reconciler";
import type { RoamApiAdapter } from "./roam-api-adapter";
import type { ReconcilerConfig, RoamNode, BlockPayload } from "./types";

interface TestItem {
  id: string;
  content: string;
  children?: { text: string }[];
}

function createMockAdapter(): RoamApiAdapter {
  return {
    getChildren: vi.fn().mockReturnValue([]),
    createBlock: vi.fn().mockResolvedValue("new-uid"),
    updateBlock: vi.fn().mockResolvedValue(undefined),
    deleteBlock: vi.fn().mockResolvedValue(undefined),
  };
}

function createTestConfig(
  overrides?: Partial<ReconcilerConfig<TestItem>>
): ReconcilerConfig<TestItem> {
  return {
    extractId: (item) => item.id,
    buildBlock: (item) => ({
      text: `{{[[todoist]]:${item.id}}} ${item.content}`,
      children: item.children?.map((c) => ({ text: c.text })),
    }),
    extractIdFromBlock: (node) => {
      const match = node.text.match(/\{\{\[\[todoist\]\]:(\d+)\}\}/);
      return match?.[1];
    },
    options: {
      mutationDelayMs: 0,
      yieldBatchSize: 100,
    },
    ...overrides,
  };
}

describe("BlockReconciler", () => {
  let adapter: RoamApiAdapter;
  let config: ReconcilerConfig<TestItem>;
  let reconciler: BlockReconciler<TestItem>;

  beforeEach(() => {
    adapter = createMockAdapter();
    config = createTestConfig();
    reconciler = new BlockReconciler(config, adapter);
  });

  describe("reconcile - create blocks", () => {
    it("should create new blocks when none exist", async () => {
      const items: TestItem[] = [
        { id: "1", content: "Task 1" },
        { id: "2", content: "Task 2" },
      ];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats).toEqual({
        total: 2,
        skipped: 0,
        created: 2,
        updated: 0,
        deleted: 0,
      });

      expect(adapter.createBlock).toHaveBeenCalledTimes(2);
      expect(adapter.createBlock).toHaveBeenCalledWith(
        "parent-uid",
        { text: "{{[[todoist]]:1}} Task 1", children: undefined },
        "last"
      );
      expect(adapter.createBlock).toHaveBeenCalledWith(
        "parent-uid",
        { text: "{{[[todoist]]:2}} Task 2", children: undefined },
        "last"
      );
    });

    it("should create blocks with children", async () => {
      const items: TestItem[] = [
        { id: "1", content: "Task", children: [{ text: "Child 1" }, { text: "Child 2" }] },
      ];

      await reconciler.reconcile("parent-uid", items);

      expect(adapter.createBlock).toHaveBeenCalledWith(
        "parent-uid",
        {
          text: "{{[[todoist]]:1}} Task",
          children: [{ text: "Child 1" }, { text: "Child 2" }],
        },
        "last"
      );
    });
  });

  describe("reconcile - skip unchanged blocks", () => {
    it("should skip blocks that have not changed", async () => {
      const existingNodes: RoamNode[] = [
        { uid: "uid-1", text: "{{[[todoist]]:1}} Task 1" },
        { uid: "uid-2", text: "{{[[todoist]]:2}} Task 2" },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const items: TestItem[] = [
        { id: "1", content: "Task 1" },
        { id: "2", content: "Task 2" },
      ];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats).toEqual({
        total: 2,
        skipped: 2,
        created: 0,
        updated: 0,
        deleted: 0,
      });

      expect(adapter.createBlock).not.toHaveBeenCalled();
      expect(adapter.updateBlock).not.toHaveBeenCalled();
      expect(adapter.deleteBlock).not.toHaveBeenCalled();
    });

    it("should skip blocks with matching children", async () => {
      const existingNodes: RoamNode[] = [
        {
          uid: "uid-1",
          text: "{{[[todoist]]:1}} Task",
          children: [{ uid: "child-1", text: "Child 1" }],
        },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const items: TestItem[] = [
        { id: "1", content: "Task", children: [{ text: "Child 1" }] },
      ];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats.skipped).toBe(1);
      expect(stats.updated).toBe(0);
    });
  });

  describe("reconcile - update blocks", () => {
    it("should update blocks when text changes", async () => {
      const existingNodes: RoamNode[] = [
        { uid: "uid-1", text: "{{[[todoist]]:1}} Old Task" },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const items: TestItem[] = [{ id: "1", content: "Updated Task" }];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats).toEqual({
        total: 1,
        skipped: 0,
        created: 0,
        updated: 1,
        deleted: 0,
      });

      expect(adapter.updateBlock).toHaveBeenCalledWith(
        "uid-1",
        "{{[[todoist]]:1}} Updated Task"
      );
    });

    it("should update when children count changes", async () => {
      const existingNodes: RoamNode[] = [
        {
          uid: "uid-1",
          text: "{{[[todoist]]:1}} Task",
          children: [{ uid: "c1", text: "Child 1" }],
        },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const items: TestItem[] = [
        { id: "1", content: "Task", children: [{ text: "Child 1" }, { text: "Child 2" }] },
      ];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats.updated).toBe(1);
    });

    it("should update when child text changes", async () => {
      const existingNodes: RoamNode[] = [
        {
          uid: "uid-1",
          text: "{{[[todoist]]:1}} Task",
          children: [{ uid: "c1", text: "Old Child" }],
        },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const items: TestItem[] = [
        { id: "1", content: "Task", children: [{ text: "New Child" }] },
      ];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats.updated).toBe(1);
    });
  });

  describe("reconcile - delete obsolete blocks", () => {
    it("should delete blocks no longer in source", async () => {
      const existingNodes: RoamNode[] = [
        { uid: "uid-1", text: "{{[[todoist]]:1}} Task 1" },
        { uid: "uid-2", text: "{{[[todoist]]:2}} Task 2" },
        { uid: "uid-3", text: "{{[[todoist]]:3}} Task 3" },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const items: TestItem[] = [{ id: "1", content: "Task 1" }];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats).toEqual({
        total: 1,
        skipped: 1,
        created: 0,
        updated: 0,
        deleted: 2,
      });

      expect(adapter.deleteBlock).toHaveBeenCalledTimes(2);
      expect(adapter.deleteBlock).toHaveBeenCalledWith("uid-2");
      expect(adapter.deleteBlock).toHaveBeenCalledWith("uid-3");
    });

    it("should ignore blocks without extractable ID", async () => {
      const existingNodes: RoamNode[] = [
        { uid: "uid-1", text: "{{[[todoist]]:1}} Task 1" },
        { uid: "uid-2", text: "Some random block without ID" },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const items: TestItem[] = [{ id: "1", content: "Task 1" }];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats.deleted).toBe(0);
      expect(adapter.deleteBlock).not.toHaveBeenCalled();
    });
  });

  describe("reconcile - preserveWhen option", () => {
    it("should preserve blocks matching preserveWhen condition", async () => {
      const existingNodes: RoamNode[] = [
        { uid: "uid-1", text: "{{[[todoist]]:1}} {{[[DONE]]}} Completed Task" },
        { uid: "uid-2", text: "{{[[todoist]]:2}} Active Task" },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const configWithPreserve = createTestConfig({
        options: {
          mutationDelayMs: 0,
          yieldBatchSize: 100,
          preserveWhen: (node) => node.text.includes("{{[[DONE]]}}"),
        },
      });
      reconciler = new BlockReconciler(configWithPreserve, adapter);

      const items: TestItem[] = [];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats.deleted).toBe(1);
      expect(adapter.deleteBlock).toHaveBeenCalledWith("uid-2");
      expect(adapter.deleteBlock).not.toHaveBeenCalledWith("uid-1");
    });
  });

  describe("reconcile - onProgress callback", () => {
    it("should call onProgress for each item processed", async () => {
      const onProgress = vi.fn();
      const configWithProgress = createTestConfig({
        options: {
          mutationDelayMs: 0,
          yieldBatchSize: 100,
          onProgress,
        },
      });
      reconciler = new BlockReconciler(configWithProgress, adapter);

      const items: TestItem[] = [
        { id: "1", content: "Task 1" },
        { id: "2", content: "Task 2" },
        { id: "3", content: "Task 3" },
      ];

      await reconciler.reconcile("parent-uid", items);

      expect(onProgress).toHaveBeenCalledTimes(3);
    });
  });

  describe("reconcile - logger", () => {
    it("should log reconciler events when logger is provided", async () => {
      const logger = { debug: vi.fn() };
      const configWithLogger = createTestConfig({
        options: {
          mutationDelayMs: 0,
          yieldBatchSize: 100,
          logger,
        },
      });
      reconciler = new BlockReconciler(configWithLogger, adapter);

      const items: TestItem[] = [{ id: "1", content: "Task 1" }];

      await reconciler.reconcile("parent-uid", items);

      expect(logger.debug).toHaveBeenCalledWith(
        "reconciler_start",
        expect.objectContaining({
          parentUid: "parent-uid",
          itemCount: 1,
        })
      );
      expect(logger.debug).toHaveBeenCalledWith("reconciler_create", { id: "1" });
      expect(logger.debug).toHaveBeenCalledWith(
        "reconciler_complete",
        expect.objectContaining({ created: 1 })
      );
    });
  });

  describe("reconcile - empty items", () => {
    it("should handle empty items array", async () => {
      const stats = await reconciler.reconcile("parent-uid", []);

      expect(stats).toEqual({
        total: 0,
        skipped: 0,
        created: 0,
        updated: 0,
        deleted: 0,
      });
    });

    it("should delete all matching blocks when items is empty", async () => {
      const existingNodes: RoamNode[] = [
        { uid: "uid-1", text: "{{[[todoist]]:1}} Task 1" },
        { uid: "uid-2", text: "{{[[todoist]]:2}} Task 2" },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const stats = await reconciler.reconcile("parent-uid", []);

      expect(stats.deleted).toBe(2);
    });
  });

  describe("reconcile - mixed operations", () => {
    it("should handle create, update, skip, and delete in same reconcile", async () => {
      const existingNodes: RoamNode[] = [
        { uid: "uid-1", text: "{{[[todoist]]:1}} Task 1" },
        { uid: "uid-2", text: "{{[[todoist]]:2}} Old Task 2" },
        { uid: "uid-3", text: "{{[[todoist]]:3}} Task 3" },
      ];
      vi.mocked(adapter.getChildren).mockReturnValue(existingNodes);

      const items: TestItem[] = [
        { id: "1", content: "Task 1" },
        { id: "2", content: "Updated Task 2" },
        { id: "4", content: "New Task 4" },
      ];

      const stats = await reconciler.reconcile("parent-uid", items);

      expect(stats).toEqual({
        total: 3,
        skipped: 1,
        created: 1,
        updated: 1,
        deleted: 1,
      });
    });
  });

  describe("withChildrenReconciler", () => {
    it("should return self for chaining", () => {
      const result = reconciler.withChildrenReconciler({
        extractKey: () => undefined,
      });

      expect(result).toBe(reconciler);
    });
  });
});
