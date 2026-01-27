import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { WorkflowEngine, isTerminalNode, getTerminalType, toSubagentRef, getBaselineInstructions } from "./engine.js";

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

  describe("navigate", () => {
    it("should start at first work step when no currentStep provided", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          analyze: { type: "task", name: "Analyze", stage: "planning", agent: "planner" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "analyze" },
          { from: "analyze", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      const result = engine.navigate("test-wf");

      assert.strictEqual(result.currentStep, "analyze");
      assert.strictEqual(result.action, "start");
      assert.strictEqual(result.stage, "planning");
      assert.strictEqual(result.subagent, "@flow:planner");
      assert.strictEqual(result.terminal, null);
      assert.ok(result.stepInstructions);
      assert.strictEqual(result.stepInstructions.name, "Analyze");
    });

    it("should return current state when currentStep but no result", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          implement: { type: "task", name: "Implement", description: "Build it" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "implement" },
          { from: "implement", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      const result = engine.navigate("test-wf", "implement");

      assert.strictEqual(result.currentStep, "implement");
      assert.strictEqual(result.action, "current");
      assert.ok(result.stepInstructions);
    });

    it("should advance to next step when result is passed", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          analyze: { type: "task", name: "Analyze" },
          implement: { type: "task", name: "Implement" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "analyze" },
          { from: "analyze", to: "implement", on: "passed" },
          { from: "implement", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      const result = engine.navigate("test-wf", "analyze", "passed");

      assert.strictEqual(result.currentStep, "implement");
      assert.strictEqual(result.action, "advance");
      assert.strictEqual(result.retriesIncremented, false);
    });

    it("should navigate to terminal with correct type", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          task: { type: "task", name: "Task" },
          done: { type: "end", result: "success", name: "Done" },
        },
        edges: [
          { from: "start", to: "task" },
          { from: "task", to: "done", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      const result = engine.navigate("test-wf", "task", "passed");

      assert.strictEqual(result.currentStep, "done");
      assert.strictEqual(result.terminal, "success");
      assert.strictEqual(result.stepInstructions, null);
    });

    it("should handle retry with incremented flag", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          task: { type: "task", name: "Task", maxRetries: 2 },
          retry: { type: "task", name: "Retry Task" },
          escalate: { type: "end", escalation: "hitl", name: "HITL" },
        },
        edges: [
          { from: "start", to: "task" },
          { from: "task", to: "retry", on: "failed" },
          { from: "task", to: "escalate", on: "failed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      const result = engine.navigate("test-wf", "task", "failed", 0);

      assert.strictEqual(result.currentStep, "retry");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesIncremented, true);
    });

    it("should escalate to HITL when retries exhausted", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          task: { type: "task", name: "Task", maxRetries: 1 },
          retry: { type: "task", name: "Retry Task" },
          escalate: { type: "end", escalation: "hitl", name: "HITL" },
        },
        edges: [
          { from: "start", to: "task" },
          { from: "task", to: "retry", on: "failed" },
          { from: "task", to: "escalate", on: "failed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      const result = engine.navigate("test-wf", "task", "failed", 1);

      assert.strictEqual(result.currentStep, "escalate");
      assert.strictEqual(result.action, "escalate");
      assert.strictEqual(result.terminal, "hitl");
    });

    it("should throw for non-existent workflow", () => {
      assert.throws(() => engine.navigate("nonexistent"), /not found/);
    });

    it("should throw for non-existent step", () => {
      const def = {
        nodes: { start: { type: "start" }, A: { type: "task", name: "A" } },
        edges: [{ from: "start", to: "A" }],
      };
      store.loadDefinition("test", def);

      assert.throws(() => engine.navigate("test", "nonexistent"), /not found/);
    });

    it("should build correct subjectSuffix with stage", () => {
      const def = {
        nodes: {
          start: { type: "start" },
          task: { type: "task", name: "Task", stage: "development" },
        },
        edges: [{ from: "start", to: "task" }],
      };
      store.loadDefinition("my-workflow", def);

      const result = engine.navigate("my-workflow");

      assert.strictEqual(result.subjectSuffix, "[my-workflow.development.task]");
    });

    it("should build correct subjectSuffix without stage", () => {
      const def = {
        nodes: {
          start: { type: "start" },
          task: { type: "task", name: "Task" },
        },
        edges: [{ from: "start", to: "task" }],
      };
      store.loadDefinition("simple", def);

      const result = engine.navigate("simple");

      assert.strictEqual(result.subjectSuffix, "[simple.task]");
    });
  });
});

describe("Helper functions", () => {
  describe("isTerminalNode", () => {
    it("should return true for start nodes", () => {
      assert.strictEqual(isTerminalNode({ type: "start" }), true);
    });

    it("should return true for end nodes", () => {
      assert.strictEqual(isTerminalNode({ type: "end" }), true);
    });

    it("should return false for task nodes", () => {
      assert.strictEqual(isTerminalNode({ type: "task" }), false);
    });

    it("should return false for null/undefined", () => {
      assert.strictEqual(isTerminalNode(null), false);
      assert.strictEqual(isTerminalNode(undefined), false);
    });
  });

  describe("getTerminalType", () => {
    it("should return 'start' for start nodes", () => {
      assert.strictEqual(getTerminalType({ type: "start" }), "start");
    });

    it("should return 'success' for successful end nodes", () => {
      assert.strictEqual(getTerminalType({ type: "end", result: "success" }), "success");
    });

    it("should return 'failure' for failed end nodes", () => {
      assert.strictEqual(getTerminalType({ type: "end", result: "failure" }), "failure");
    });

    it("should return 'hitl' for HITL escalation nodes", () => {
      assert.strictEqual(getTerminalType({ type: "end", escalation: "hitl" }), "hitl");
    });

    it("should return null for task nodes", () => {
      assert.strictEqual(getTerminalType({ type: "task" }), null);
    });
  });

  describe("toSubagentRef", () => {
    it("should prefix with @flow:", () => {
      assert.strictEqual(toSubagentRef("developer"), "@flow:developer");
    });

    it("should not double-prefix", () => {
      assert.strictEqual(toSubagentRef("@flow:developer"), "@flow:developer");
    });

    it("should return null for falsy input", () => {
      assert.strictEqual(toSubagentRef(null), null);
      assert.strictEqual(toSubagentRef(""), null);
    });
  });

  describe("getBaselineInstructions", () => {
    it("should return analyze instructions for analyze steps", () => {
      const result = getBaselineInstructions("analyze_task", "");
      assert.ok(result.includes("requirements"));
    });

    it("should return implement instructions for implement steps", () => {
      const result = getBaselineInstructions("implement", "Build Feature");
      assert.ok(result.includes("code"));
    });

    it("should return test instructions for test steps", () => {
      const result = getBaselineInstructions("test_unit", "");
      assert.ok(result.includes("Verify"));
    });

    it("should return default instructions for unknown steps", () => {
      const result = getBaselineInstructions("unknown_step", "");
      assert.ok(result.includes("Complete"));
    });
  });
});
