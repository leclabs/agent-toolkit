import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { WorkflowEngine } from "./engine.js";

/**
 * Minimal WorkflowStore for testing - matches production interface
 */
class WorkflowStore {
  constructor() {
    this.workflows = new Map();
  }

  loadDefinition(id, definition) {
    this.workflows.set(id, definition);
    return id;
  }

  getDefinition(id) {
    return this.workflows.get(id);
  }
}

describe("WorkflowStore", () => {
  let store;

  beforeEach(() => {
    store = new WorkflowStore();
  });

  describe("loadDefinition", () => {
    it("should load and retrieve a workflow definition", () => {
      const def = { nodes: { A: { type: "task", name: "A" } }, edges: [] };
      store.loadDefinition("test", def);

      const result = store.getDefinition("test");
      assert.deepStrictEqual(result, def);
    });

    it("should return undefined for non-existent workflow", () => {
      const result = store.getDefinition("nonexistent");
      assert.strictEqual(result, undefined);
    });
  });
});

describe("WorkflowEngine", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
  });

  describe("buildEdgeGraph", () => {
    it("should build graph from edges array", () => {
      const def = {
        nodes: { A: { type: "task", name: "A" }, B: { type: "task", name: "B" } },
        edges: [{ from: "A", to: "B" }],
      };
      store.loadDefinition("test", def);

      const graph = engine.buildEdgeGraph("test");
      assert.strictEqual(graph.edges.get("A").length, 1);
      assert.strictEqual(graph.edges.get("A")[0].to, "B");
    });

    it("should throw for non-existent workflow", () => {
      assert.throws(() => engine.buildEdgeGraph("nonexistent"), /not found/);
    });

    it("should throw for workflow without nodes", () => {
      const def = { edges: [] };
      store.loadDefinition("test", def);

      assert.throws(() => engine.buildEdgeGraph("test"), /must have nodes/);
    });

    it("should throw for workflow without edges array", () => {
      const def = { nodes: { A: { type: "task", name: "A" } } };
      store.loadDefinition("test", def);

      assert.throws(() => engine.buildEdgeGraph("test"), /must have edges array/);
    });

    it("should build reverse edges for dependency checking", () => {
      const def = {
        nodes: {
          A: { type: "task", name: "A" },
          B: { type: "task", name: "B" },
          C: { type: "task", name: "C" },
        },
        edges: [
          { from: "A", to: "C" },
          { from: "B", to: "C" },
        ],
      };
      store.loadDefinition("test", def);

      const graph = engine.buildEdgeGraph("test");
      assert.deepStrictEqual(graph.reverseEdges.get("C"), ["A", "B"]);
    });
  });

  describe("evaluateEdge", () => {
    it("should follow unconditional edges", () => {
      const def = {
        nodes: { A: { type: "task", name: "A" }, B: { type: "task", name: "B" } },
        edges: [{ from: "A", to: "B" }],
      };
      store.loadDefinition("test", def);

      const result = engine.evaluateEdge("test", "A", "passed", 0);

      assert.strictEqual(result.nextStep, "B");
      assert.strictEqual(result.action, "unconditional");
    });

    it("should follow passed condition edges", () => {
      const def = {
        nodes: { A: { type: "task", name: "A" }, B: { type: "task", name: "B" } },
        edges: [{ from: "A", to: "B", on: "passed" }],
      };
      store.loadDefinition("test", def);

      const result = engine.evaluateEdge("test", "A", "passed", 0);

      assert.strictEqual(result.nextStep, "B");
      assert.strictEqual(result.action, "conditional");
    });

    it("should not follow passed edges when result is failed", () => {
      const def = {
        nodes: { A: { type: "task", name: "A" }, B: { type: "task", name: "B" } },
        edges: [{ from: "A", to: "B", on: "passed" }],
      };
      store.loadDefinition("test", def);

      const result = engine.evaluateEdge("test", "A", "failed", 0);

      assert.strictEqual(result.nextStep, null);
      assert.strictEqual(result.action, "no_matching_edge");
    });

    it("should follow retry edge when retries available", () => {
      const def = {
        nodes: {
          A: { type: "task", name: "A", maxRetries: 3 },
          B: { type: "task", name: "B" },
          C: { type: "end", result: "blocked" },
        },
        edges: [
          { from: "A", to: "B", on: "failed" }, // retry edge (to non-end)
          { from: "A", to: "C", on: "failed" }, // escalate edge (to end)
        ],
      };
      store.loadDefinition("test", def);

      const result = engine.evaluateEdge("test", "A", "failed", 1);

      assert.strictEqual(result.nextStep, "B");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesUsed, 2);
      assert.strictEqual(result.retriesRemaining, 1);
    });

    it("should escalate when retries exhausted", () => {
      const def = {
        nodes: {
          A: { type: "task", name: "A", maxRetries: 3 },
          B: { type: "task", name: "B" },
          C: { type: "end", result: "blocked" },
        },
        edges: [
          { from: "A", to: "B", on: "failed" }, // retry edge
          { from: "A", to: "C", on: "failed" }, // escalate edge
        ],
      };
      store.loadDefinition("test", def);

      const result = engine.evaluateEdge("test", "A", "failed", 3);

      assert.strictEqual(result.nextStep, "C");
      assert.strictEqual(result.action, "escalate");
    });

    it("should return no_matching_edge when no edge matches", () => {
      const def = {
        nodes: { A: { type: "task", name: "A" }, B: { type: "task", name: "B" } },
        edges: [{ from: "A", to: "B", on: "passed" }],
      };
      store.loadDefinition("test", def);

      const result = engine.evaluateEdge("test", "A", "failed", 0);

      assert.strictEqual(result.nextStep, null);
      assert.strictEqual(result.action, "no_matching_edge");
    });

    it("should return no_outgoing_edges for terminal steps", () => {
      const def = {
        nodes: {
          A: { type: "task", name: "A" },
          B: { type: "end", result: "success" },
        },
        edges: [{ from: "A", to: "B" }],
      };
      store.loadDefinition("test", def);

      const result = engine.evaluateEdge("test", "B", "passed", 0);

      assert.strictEqual(result.nextStep, null);
      assert.strictEqual(result.action, "no_outgoing_edges");
    });

    it("should prefer conditional edges over unconditional", () => {
      const def = {
        nodes: {
          A: { type: "task", name: "A" },
          B: { type: "task", name: "B" },
          C: { type: "task", name: "C" },
        },
        edges: [
          { from: "A", to: "B" }, // unconditional (default)
          { from: "A", to: "C", on: "passed" }, // conditional
        ],
      };
      store.loadDefinition("test", def);

      const result = engine.evaluateEdge("test", "A", "passed", 0);

      assert.strictEqual(result.nextStep, "C");
      assert.strictEqual(result.action, "conditional");
    });
  });
});
