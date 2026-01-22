# roam-block-reconciler

[![CI](https://github.com/avelino/roam-block-reconciler/actions/workflows/ci.yml/badge.svg)](https://github.com/avelino/roam-block-reconciler/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/roam-block-reconciler.svg)](https://www.npmjs.com/package/roam-block-reconciler)

A library for efficiently syncing data from external sources to Roam Research blocks. Only creates, updates, or deletes blocks when necessary.

## Features

- **Efficient reconciliation**: Only modifies blocks that actually changed
- **Configurable**: Custom ID extraction, block building, and preservation rules
- **Progress tracking**: Callbacks for monitoring sync progress
- **Children support**: Reconcile nested block structures
- **Testable**: Adapter pattern for easy mocking of Roam API

## Installation

```bash
npm install roam-block-reconciler
# or
pnpm add roam-block-reconciler
```

## Usage

```typescript
import { BlockReconciler, createRoamApiAdapter } from "roam-block-reconciler";

// Create the Roam API adapter
const adapter = createRoamApiAdapter({
  getBasicTreeByParentUid: (uid) => {
    // Your Roam API call to get children
    return window.roamAlphaAPI.q(`...`);
  },
  createBlock: async ({ parentUid, order, node }) => {
    return await window.roamAlphaAPI.createBlock({
      location: { "parent-uid": parentUid, order },
      block: { string: node.text, children: node.children },
    });
  },
  updateBlock: async ({ uid, text }) => {
    await window.roamAlphaAPI.updateBlock({
      block: { uid, string: text },
    });
  },
  deleteBlock: async (uid) => {
    await window.roamAlphaAPI.deleteBlock({ block: { uid } });
  },
});

// Define your item type
interface Task {
  id: number;
  content: string;
  completed: boolean;
}

// Create the reconciler
const reconciler = new BlockReconciler<Task>(
  {
    extractId: (task) => String(task.id),
    buildBlock: (task) => ({
      text: `{{[[TODO]]}} ${task.content} #task-${task.id}`,
      children: [],
    }),
    extractIdFromBlock: (node) => {
      const match = node.text.match(/#task-(\d+)/);
      return match ? match[1] : undefined;
    },
    options: {
      preserveWhen: (node) => node.text.includes("{{[[DONE]]}}"),
      onProgress: (stats) => console.log("Progress:", stats),
    },
  },
  adapter
);

// Reconcile tasks with Roam blocks
const tasks: Task[] = [
  { id: 1, content: "Buy milk", completed: false },
  { id: 2, content: "Walk the dog", completed: false },
];

const stats = await reconciler.reconcile("page-uid", tasks);
console.log(`Created: ${stats.created}, Updated: ${stats.updated}, Skipped: ${stats.skipped}`);
```

## API

### BlockReconciler

The main class for reconciling items with Roam blocks.

#### Constructor

```typescript
new BlockReconciler<T>(config: ReconcilerConfig<T>, adapter: RoamApiAdapter)
```

#### Methods

- `reconcile(parentUid: string, items: T[]): Promise<SyncStats>` - Reconciles items with blocks
- `withChildrenReconciler(config: ChildReconcilerConfig): this` - Adds children reconciliation

### Types

#### ReconcilerConfig<T>

```typescript
interface ReconcilerConfig<T> {
  extractId: (item: T) => string;
  buildBlock: (item: T) => BlockPayload;
  extractIdFromBlock: (node: RoamNode) => string | undefined;
  options?: ReconcilerOptions;
}
```

#### ReconcilerOptions

```typescript
interface ReconcilerOptions {
  preserveWhen?: (node: RoamNode) => boolean;
  onProgress?: (stats: SyncStats) => void;
  mutationDelayMs?: number; // default: 100
  yieldBatchSize?: number; // default: 3
  logger?: Logger;
}
```

#### SyncStats

```typescript
interface SyncStats {
  total: number;
  skipped: number;
  created: number;
  updated: number;
  deleted: number;
}
```

### createRoamApiAdapter

Factory function to create a Roam API adapter.

```typescript
const adapter = createRoamApiAdapter({
  getBasicTreeByParentUid: (uid) => RoamBasicNode[],
  createBlock: async (params) => string,
  updateBlock: async (params) => void,
  deleteBlock: async (uid) => void,
});
```

## Used By

Plugins using this library:

- [roamresearch-todoist-backup](https://github.com/avelino/roamresearch-todoist-backup) - Sync Todoist tasks to Roam Research
- [roamresearch-ouraring](https://github.com/avelino/roamresearch-ouraring) - Sync Oura Ring data to Roam Research
- [roamresearch-ical](https://github.com/avelino/roamresearch-ical) - Sync iCal events to Roam Research

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint and type check
npm run check

# Build
npm run build
```

## License

MIT
