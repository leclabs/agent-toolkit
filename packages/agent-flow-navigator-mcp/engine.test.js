import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  WorkflowEngine,
  isTerminalNode,
  isForkJoinNode,
  getTerminalType,
  toSubagentRef,
  getBaselineInstructions,
  readTaskFile,
  buildContextInstructions,
  resolveContextFile,
  resolveProseRefs,
} from "./engine.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Minimal WorkflowStore for testing - matches production interface
 */
class WorkflowStore {
  constructor() {
    this.workflows = new Map();
    this.sources = new Map();
    this.sourceRoots = new Map();
  }

  loadDefinition(id, definition, source = "catalog", sourceRoot = null) {
    this.workflows.set(id, definition);
    this.sources.set(id, source);
    if (sourceRoot) {
      this.sourceRoots.set(id, sourceRoot);
    }
    return id;
  }

  getDefinition(id) {
    return this.workflows.get(id);
  }

  getSource(id) {
    return this.sources.get(id);
  }

  getSourceRoot(id) {
    return this.sourceRoots.get(id);
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

      const result = engine.navigate({ workflowType: "test-wf" });

      assert.strictEqual(result.currentStep, "analyze");
      assert.strictEqual(result.action, "start");
      assert.strictEqual(result.stage, "planning");
      assert.strictEqual(result.subagent, "flow:planner");
      assert.strictEqual(result.terminal, null);
      assert.ok(result.stepInstructions);
      assert.strictEqual(result.stepInstructions.name, "Analyze");
      assert.ok(result.metadata);
      assert.strictEqual(result.metadata.workflowType, "test-wf");
      assert.strictEqual(result.metadata.currentStep, "analyze");
      assert.strictEqual(result.metadata.retryCount, 0);
    });

    it("should return current state when taskFilePath provided without result", () => {
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

      // Create a temp task file
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "implement",
            retryCount: 0,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile });

        assert.strictEqual(result.currentStep, "implement");
        assert.strictEqual(result.action, "current");
        assert.ok(result.stepInstructions);
      } finally {
        rmSync(taskDir, { recursive: true });
      }
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

      // Create a temp task file
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "analyze",
            retryCount: 0,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

        assert.strictEqual(result.currentStep, "implement");
        assert.strictEqual(result.action, "advance");
        assert.strictEqual(result.retriesIncremented, false);
        assert.strictEqual(result.metadata.currentStep, "implement");
      } finally {
        rmSync(taskDir, { recursive: true });
      }
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

      // Create a temp task file
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "task",
            retryCount: 0,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

        assert.strictEqual(result.currentStep, "done");
        assert.strictEqual(result.terminal, "success");
        assert.strictEqual(result.stepInstructions, null);
      } finally {
        rmSync(taskDir, { recursive: true });
      }
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

      // Create a temp task file
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "task",
            retryCount: 0,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "failed" });

        assert.strictEqual(result.currentStep, "retry");
        assert.strictEqual(result.action, "retry");
        assert.strictEqual(result.retriesIncremented, true);
        assert.strictEqual(result.metadata.retryCount, 1);
      } finally {
        rmSync(taskDir, { recursive: true });
      }
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

      // Create a temp task file with retryCount = 1 (exhausted)
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "task",
            retryCount: 1,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "failed" });

        assert.strictEqual(result.currentStep, "escalate");
        assert.strictEqual(result.action, "escalate");
        assert.strictEqual(result.terminal, "hitl");
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should throw for non-existent workflow", () => {
      assert.throws(() => engine.navigate({ workflowType: "nonexistent" }), /not found/);
    });

    it("should throw when workflowType not provided", () => {
      assert.throws(() => engine.navigate({}), /workflowType is required/);
    });

    it("should throw for non-existent task file", () => {
      assert.throws(() => engine.navigate({ taskFilePath: "/nonexistent/task.json" }), /Task file not found/);
    });

    it("should throw for task without metadata", () => {
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
        })
      );

      try {
        assert.throws(() => engine.navigate({ taskFilePath: taskFile }), /Task has no metadata/);
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should return metadata with correct values", () => {
      const def = {
        nodes: {
          start: { type: "start" },
          task: { type: "task", name: "Task", stage: "development" },
        },
        edges: [{ from: "start", to: "task" }],
      };
      store.loadDefinition("my-workflow", def);

      const result = engine.navigate({ workflowType: "my-workflow" });

      assert.ok(result.metadata);
      assert.strictEqual(result.metadata.workflowType, "my-workflow");
      assert.strictEqual(result.metadata.currentStep, "task");
      assert.strictEqual(result.metadata.retryCount, 0);
    });

    it("should return orchestratorInstructions for start action", () => {
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

      const result = engine.navigate({ workflowType: "test-wf" });

      assert.strictEqual(result.action, "start");
      assert.ok(result.orchestratorInstructions);
      assert.ok(result.orchestratorInstructions.includes("planner"));
    });

    it("should include description in orchestratorInstructions when provided", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          analyze: { type: "task", name: "Analyze", stage: "planning" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "analyze" },
          { from: "analyze", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      const result = engine.navigate({ workflowType: "test-wf", description: "Add user authentication" });

      assert.ok(result.orchestratorInstructions);
      assert.ok(result.orchestratorInstructions.includes("Add user authentication"));
    });

    it("should return orchestratorInstructions for current action (non-terminal)", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          analyze: { type: "task", name: "Analyze" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "analyze" },
          { from: "analyze", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      // Create a temp task file
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "analyze",
            retryCount: 0,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile });

        assert.strictEqual(result.action, "current");
        assert.ok(result.orchestratorInstructions); // Now returns instructions for non-terminal
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should return orchestratorInstructions for advance action (non-terminal)", () => {
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

      // Create a temp task file
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "analyze",
            retryCount: 0,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

        assert.strictEqual(result.action, "advance");
        assert.ok(result.orchestratorInstructions); // Now returns instructions for non-terminal
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should return null orchestratorInstructions for terminal step", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          task: { type: "task", name: "Task" },
          done: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "task" },
          { from: "task", to: "done", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      // Create a temp task file
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "task",
            retryCount: 0,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

        assert.strictEqual(result.terminal, "success");
        assert.strictEqual(result.orchestratorInstructions, null);
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should use placeholder when description not provided", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          analyze: { type: "task", name: "Analyze", stage: "planning" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "analyze" },
          { from: "analyze", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      const result = engine.navigate({ workflowType: "test-wf" });

      assert.strictEqual(result.action, "start");
      assert.ok(result.orchestratorInstructions);
      // Should use placeholder when description not provided
      assert.ok(result.orchestratorInstructions.includes("{task description}"));
    });

    it("should navigate workflow with node metadata without errors", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start", metadata: { version: "2.0" } },
          analyze: {
            type: "task",
            name: "Analyze",
            stage: "analysis",
            metadata: { phase: "discovery", qualityBar: 80 },
          },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "analyze" },
          { from: "analyze", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("meta-wf", def);

      const result = engine.navigate({ workflowType: "meta-wf" });

      assert.strictEqual(result.currentStep, "analyze");
      assert.strictEqual(result.stage, "analysis");
      assert.strictEqual(result.action, "start");
    });

    it("should navigate workflow with edge conditions without errors", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          task: { type: "task", name: "Task" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "task" },
          { from: "task", to: "end", on: "passed", condition: "confidence >= 80" },
        ],
      };
      store.loadDefinition("cond-wf", def);

      const result = engine.navigate({ workflowType: "cond-wf" });
      assert.strictEqual(result.currentStep, "task");
      assert.strictEqual(result.action, "start");

      // Advance with passed - edge with condition should work like normal conditional edge
      const taskDir = join(tmpdir(), "flow-cond-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: { workflowType: "cond-wf", currentStep: "task", retryCount: 0 },
        })
      );

      try {
        const advance = engine.navigate({ taskFilePath: taskFile, result: "passed" });
        assert.strictEqual(advance.currentStep, "end");
        assert.strictEqual(advance.terminal, "success");
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should preserve task id in write-through (filename-to-id invariant)", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          task: { type: "task", name: "Task" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "task" },
          { from: "task", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("id-wf", def);

      const taskDir = join(tmpdir(), "flow-id-preserve-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "1.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: { workflowType: "id-wf", currentStep: "task", retryCount: 0 },
        })
      );

      try {
        engine.navigate({ taskFilePath: taskFile, result: "passed" });

        const updated = readTaskFile(taskFile);
        assert.strictEqual(updated.id, "1", "task id must be preserved after write-through");
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should auto-correct task id from filename when mismatched", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          task: { type: "task", name: "Task" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "task" },
          { from: "task", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("id-fix-wf", def);

      const taskDir = join(tmpdir(), "flow-id-autocorrect-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      // File is named 1.json but contains id "2" — the corruption scenario
      const taskFile = join(taskDir, "1.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "2",
          subject: "#2 Corrupted task",
          metadata: { workflowType: "id-fix-wf", currentStep: "task", retryCount: 0 },
        })
      );

      try {
        engine.navigate({ taskFilePath: taskFile, result: "passed" });

        const updated = readTaskFile(taskFile);
        assert.strictEqual(updated.id, "1", "task id must be auto-corrected to match filename");
        assert.ok(updated.subject.startsWith("#1 "), "subject must use corrected id");
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should write-through state transitions to task file on advance", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          lint: {
            type: "gate",
            name: "Lint",
            agent: "Developer",
            stage: "delivery",
            maxRetries: 3,
          },
          commit: { type: "task", name: "Commit", agent: "Developer", stage: "delivery" },
          end: { type: "end", result: "success" },
          hitl: { type: "end", result: "blocked", escalation: "hitl" },
        },
        edges: [
          { from: "start", to: "lint" },
          { from: "lint", to: "commit", on: "passed" },
          { from: "lint", to: "lint", on: "failed" },
          { from: "lint", to: "hitl", on: "failed" },
          { from: "commit", to: "end" },
        ],
      };
      store.loadDefinition("wt-wf", def);

      const taskDir = join(tmpdir(), "flow-writethrough-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test write-through",
          metadata: { workflowType: "wt-wf", currentStep: "lint", retryCount: 0 },
        })
      );

      try {
        // Advance lint with passed - should write-through to task file
        const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });
        assert.strictEqual(result.currentStep, "commit");
        assert.strictEqual(result.action, "advance");

        // Read task file back - should have updated metadata
        const updated = readTaskFile(taskFile);
        assert.strictEqual(updated.metadata.currentStep, "commit");
        assert.strictEqual(updated.metadata.workflowType, "wt-wf");

        // Navigate again with no result - should read "commit" from file, not stale "lint"
        const current = engine.navigate({ taskFilePath: taskFile });
        assert.strictEqual(current.currentStep, "commit");
        assert.strictEqual(current.action, "current");
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should write-through retry state to task file", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          gate: { type: "gate", name: "Gate", maxRetries: 2 },
          work: { type: "task", name: "Work" },
          end: { type: "end", result: "success" },
          hitl: { type: "end", result: "blocked", escalation: "hitl" },
        },
        edges: [
          { from: "start", to: "gate" },
          { from: "gate", to: "end", on: "passed" },
          { from: "gate", to: "work", on: "failed" },
          { from: "gate", to: "hitl", on: "failed" },
          { from: "work", to: "gate" },
        ],
      };
      store.loadDefinition("wt-retry", def);

      const taskDir = join(tmpdir(), "flow-wt-retry-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test retry write-through",
          metadata: { workflowType: "wt-retry", currentStep: "gate", retryCount: 0 },
        })
      );

      try {
        // Fail gate - should retry to work and write-through
        const retry = engine.navigate({ taskFilePath: taskFile, result: "failed" });
        assert.strictEqual(retry.currentStep, "work");
        assert.strictEqual(retry.action, "retry");

        // Read task file - should have incremented retryCount and updated currentStep
        const updated = readTaskFile(taskFile);
        assert.strictEqual(updated.metadata.currentStep, "work");
        assert.strictEqual(updated.metadata.retryCount, 1);
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should read userDescription from task file when available", () => {
      const def = {
        nodes: {
          start: { type: "start", name: "Start" },
          analyze: { type: "task", name: "Analyze" },
          end: { type: "end", result: "success" },
        },
        edges: [
          { from: "start", to: "analyze" },
          { from: "analyze", to: "end", on: "passed" },
        ],
      };
      store.loadDefinition("test-wf", def);

      // Create a temp task file with userDescription
      const taskDir = join(tmpdir(), "flow-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "analyze",
            retryCount: 0,
            userDescription: "Build the auth system",
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile });

        assert.ok(result.orchestratorInstructions);
        assert.ok(result.orchestratorInstructions.includes("Build the auth system"));
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    describe("mid-flow start with stepId", () => {
      function createMidFlowWorkflow() {
        return {
          nodes: {
            start: { type: "start", name: "Start" },
            analyze: { type: "task", name: "Analyze", stage: "planning", agent: "Planner" },
            implement: { type: "task", name: "Implement", stage: "development", agent: "Developer" },
            review: { type: "gate", name: "Review", stage: "verification", agent: "Reviewer", maxRetries: 2 },
            fork_impl: {
              type: "fork",
              name: "Fork Impl",
              branches: {
                frontend: { entryStep: "impl_frontend", description: "Build UI" },
                backend: { entryStep: "impl_backend", description: "Build API" },
              },
              join: "join_impl",
            },
            impl_frontend: { type: "task", name: "Frontend", stage: "development", agent: "Developer" },
            impl_backend: { type: "task", name: "Backend", stage: "development", agent: "Developer" },
            join_impl: { type: "join", name: "Join Impl", fork: "fork_impl", strategy: "all-pass" },
            end: { type: "end", result: "success" },
          },
          edges: [
            { from: "start", to: "analyze" },
            { from: "analyze", to: "implement", on: "passed" },
            { from: "implement", to: "review", on: "passed" },
            { from: "review", to: "fork_impl", on: "passed" },
            { from: "review", to: "implement", on: "failed" },
            { from: "fork_impl", to: "impl_frontend" },
            { from: "fork_impl", to: "impl_backend" },
            { from: "impl_frontend", to: "join_impl", on: "passed" },
            { from: "impl_backend", to: "join_impl", on: "passed" },
            { from: "join_impl", to: "end", on: "passed" },
          ],
        };
      }

      it("should start at a mid-flow task step", () => {
        store.loadDefinition("mid-wf", createMidFlowWorkflow());

        const result = engine.navigate({ workflowType: "mid-wf", stepId: "implement" });

        assert.strictEqual(result.currentStep, "implement");
        assert.strictEqual(result.action, "start");
        assert.strictEqual(result.stage, "development");
        assert.strictEqual(result.subagent, "flow:Developer");
        assert.strictEqual(result.terminal, null);
        assert.ok(result.stepInstructions);
        assert.strictEqual(result.metadata.currentStep, "implement");
        assert.strictEqual(result.metadata.retryCount, 0);
      });

      it("should start at a mid-flow gate step", () => {
        store.loadDefinition("mid-wf", createMidFlowWorkflow());

        const result = engine.navigate({ workflowType: "mid-wf", stepId: "review" });

        assert.strictEqual(result.currentStep, "review");
        assert.strictEqual(result.action, "start");
        assert.strictEqual(result.stage, "verification");
        assert.strictEqual(result.subagent, "flow:Reviewer");
        assert.strictEqual(result.maxRetries, 2);
      });

      it("should start at a fork step and return enriched fork response", () => {
        store.loadDefinition("mid-wf", createMidFlowWorkflow());

        const result = engine.navigate({ workflowType: "mid-wf", stepId: "fork_impl" });

        assert.strictEqual(result.currentStep, "fork_impl");
        assert.strictEqual(result.action, "fork");
        assert.ok(result.fork);
        assert.strictEqual(result.fork.joinStep, "join_impl");
        assert.strictEqual(result.fork.joinStrategy, "all-pass");

        // Enriched branch data
        assert.ok(result.fork.branches.frontend);
        assert.strictEqual(result.fork.branches.frontend.subagent, "flow:Developer");
        assert.strictEqual(result.fork.branches.frontend.stage, "development");
        assert.ok(result.fork.branches.frontend.stepInstructions);
        assert.ok(result.fork.branches.backend);
        assert.strictEqual(result.fork.branches.backend.subagent, "flow:Developer");
      });

      it("should throw for non-existent step", () => {
        store.loadDefinition("mid-wf", createMidFlowWorkflow());

        assert.throws(
          () => engine.navigate({ workflowType: "mid-wf", stepId: "nonexistent" }),
          /Step 'nonexistent' not found/
        );
      });

      it("should throw for start node", () => {
        store.loadDefinition("mid-wf", createMidFlowWorkflow());

        assert.throws(() => engine.navigate({ workflowType: "mid-wf", stepId: "start" }), /Cannot start at start node/);
      });

      it("should throw for end node", () => {
        store.loadDefinition("mid-wf", createMidFlowWorkflow());

        assert.throws(() => engine.navigate({ workflowType: "mid-wf", stepId: "end" }), /Cannot start at end node/);
      });

      it("should ignore stepId when currentStep exists (advance mode)", () => {
        store.loadDefinition("mid-wf", createMidFlowWorkflow());

        const taskDir = join(tmpdir(), "flow-mid-ignore-" + Date.now());
        mkdirSync(taskDir, { recursive: true });
        const taskFile = join(taskDir, "task.json");
        writeFileSync(
          taskFile,
          JSON.stringify({
            id: "1",
            subject: "Test stepId ignored",
            metadata: {
              workflowType: "mid-wf",
              currentStep: "analyze",
              retryCount: 0,
            },
          })
        );

        try {
          // stepId should be ignored because taskFilePath sets currentStep
          const result = engine.navigate({
            taskFilePath: taskFile,
            result: "passed",
            stepId: "review",
          });

          // Should advance from analyze → implement, not jump to review
          assert.strictEqual(result.currentStep, "implement");
          assert.strictEqual(result.action, "advance");
        } finally {
          rmSync(taskDir, { recursive: true });
        }
      });

      it("should include description in orchestratorInstructions for mid-flow start", () => {
        store.loadDefinition("mid-wf", createMidFlowWorkflow());

        const result = engine.navigate({
          workflowType: "mid-wf",
          stepId: "implement",
          description: "Fix the login bug",
        });

        assert.ok(result.orchestratorInstructions);
        assert.ok(result.orchestratorInstructions.includes("Fix the login bug"));
      });
    });

    describe("context in orchestratorInstructions", () => {
      it("should return null from buildContextInstructions when contextFiles empty", () => {
        const result = buildContextInstructions({
          contextFiles: [],
          projectRoot: "/project",
        });
        assert.strictEqual(result, null);
      });

      it("should include Read file lines with absolute paths when contextFiles + projectRoot provided", () => {
        const result = buildContextInstructions({
          contextFiles: ["ARCHITECTURE.md", "docs/setup.md"],
          projectRoot: "/my/project",
        });
        assert.ok(result);
        assert.ok(result.includes("Read file: /my/project/ARCHITECTURE.md"));
        assert.ok(result.includes("Read file: /my/project/docs/setup.md"));
      });

      it("should return null when projectRoot is null", () => {
        const result = buildContextInstructions({
          contextFiles: ["ARCHITECTURE.md"],
          projectRoot: null,
        });
        assert.strictEqual(result, null);
      });

      it("should include context section in orchestratorInstructions when step has context_files", () => {
        const def = {
          nodes: {
            start: { type: "start", name: "Start" },
            implement: {
              type: "task",
              name: "Implement",
              context_files: ["ARCHITECTURE.md", "docs/setup.md"],
            },
            end: { type: "end", result: "success" },
          },
          edges: [
            { from: "start", to: "implement" },
            { from: "implement", to: "end", on: "passed" },
          ],
        };
        store.loadDefinition("ctx-wf", def);

        const result = engine.navigate({
          workflowType: "ctx-wf",
          projectRoot: "/my/project",
        });

        assert.ok(result.orchestratorInstructions);
        assert.ok(result.orchestratorInstructions.includes("## Context"));
        assert.ok(result.orchestratorInstructions.includes("Read file: /my/project/ARCHITECTURE.md"));
        assert.ok(result.orchestratorInstructions.includes("Read file: /my/project/docs/setup.md"));
      });

      it("should have no context section when no context_files declared", () => {
        const def = {
          nodes: {
            start: { type: "start", name: "Start" },
            task: { type: "task", name: "Task" },
            end: { type: "end", result: "success" },
          },
          edges: [
            { from: "start", to: "task" },
            { from: "task", to: "end", on: "passed" },
          ],
        };
        store.loadDefinition("plain-wf", def);

        const result = engine.navigate({ workflowType: "plain-wf" });

        assert.ok(result.orchestratorInstructions);
        assert.ok(!result.orchestratorInstructions.includes("## Context"));
      });

      it("should return null orchestratorInstructions for terminal nodes", () => {
        const def = {
          nodes: {
            start: { type: "start", name: "Start" },
            task: {
              type: "task",
              name: "Task",
              context_files: ["ARCHITECTURE.md"],
            },
            done: { type: "end", result: "success" },
          },
          edges: [
            { from: "start", to: "task" },
            { from: "task", to: "done", on: "passed" },
          ],
        };
        store.loadDefinition("term-ctx-wf", def);

        const taskDir = join(tmpdir(), "flow-ctx-term-" + Date.now());
        mkdirSync(taskDir, { recursive: true });
        const taskFile = join(taskDir, "task.json");
        writeFileSync(
          taskFile,
          JSON.stringify({
            id: "1",
            subject: "Test task",
            metadata: {
              workflowType: "term-ctx-wf",
              currentStep: "task",
              retryCount: 0,
            },
          })
        );

        try {
          const result = engine.navigate({
            taskFilePath: taskFile,
            result: "passed",
            projectRoot: "/project",
          });

          assert.strictEqual(result.terminal, "success");
          assert.strictEqual(result.orchestratorInstructions, null);
        } finally {
          rmSync(taskDir, { recursive: true });
        }
      });

      it("should resolve mixed plain + ./ entries in buildContextInstructions", () => {
        const result = buildContextInstructions({
          contextFiles: ["ARCHITECTURE.md", "./skills/debug/SKILL.md"],
          projectRoot: "/my/project",
          sourceRoot: "/plugins/fusion",
        });
        assert.ok(result);
        assert.ok(result.includes("Read file: /my/project/ARCHITECTURE.md"));
        assert.ok(result.includes("Read file: /plugins/fusion/skills/debug/SKILL.md"));
      });

      it("should resolve ./ paths in step description via store sourceRoot", () => {
        const def = {
          nodes: {
            start: { type: "start", name: "Start" },
            task: {
              type: "task",
              name: "Setup Session",
              description:
                "Start Chrome session using ./skills/chrome-debug-session/SKILL.md and authenticate via ./skills/upwork-login/SKILL.md.",
            },
            end: { type: "end", result: "success" },
          },
          edges: [
            { from: "start", to: "task" },
            { from: "task", to: "end", on: "passed" },
          ],
        };
        store.loadDefinition("prose-ctx-wf", def, "external", "/opt/fusion-studio");

        const result = engine.navigate({
          workflowType: "prose-ctx-wf",
          projectRoot: "/my/project",
        });

        assert.ok(result.stepInstructions);
        assert.ok(
          result.stepInstructions.description.includes("/opt/fusion-studio/skills/chrome-debug-session/SKILL.md")
        );
        assert.ok(result.stepInstructions.description.includes("/opt/fusion-studio/skills/upwork-login/SKILL.md"));
        assert.ok(!result.stepInstructions.description.includes("./skills/"));
      });

      it("should not resolve ./ in description when no sourceRoot", () => {
        const def = {
          nodes: {
            start: { type: "start", name: "Start" },
            task: {
              type: "task",
              name: "Task",
              description: "Read ./skills/foo/SKILL.md for context.",
            },
            end: { type: "end", result: "success" },
          },
          edges: [
            { from: "start", to: "task" },
            { from: "task", to: "end", on: "passed" },
          ],
        };
        store.loadDefinition("no-root-prose-wf", def, "catalog");

        const result = engine.navigate({
          workflowType: "no-root-prose-wf",
          projectRoot: "/my/project",
        });

        assert.ok(result.stepInstructions);
        assert.strictEqual(result.stepInstructions.description, "Read ./skills/foo/SKILL.md for context.");
      });

      it("should resolve ./ context_files in Navigate via store sourceRoot", () => {
        const def = {
          nodes: {
            start: { type: "start", name: "Start" },
            implement: {
              type: "task",
              name: "Implement",
              context_files: ["ARCHITECTURE.md", "./skills/debug/SKILL.md"],
            },
            end: { type: "end", result: "success" },
          },
          edges: [
            { from: "start", to: "implement" },
            { from: "implement", to: "end", on: "passed" },
          ],
        };
        store.loadDefinition("ext-ctx-wf", def, "external", "/plugins/fusion");

        const result = engine.navigate({
          workflowType: "ext-ctx-wf",
          projectRoot: "/my/project",
        });

        assert.ok(result.orchestratorInstructions);
        assert.ok(result.orchestratorInstructions.includes("Read file: /my/project/ARCHITECTURE.md"));
        assert.ok(result.orchestratorInstructions.includes("Read file: /plugins/fusion/skills/debug/SKILL.md"));
      });

      it("should not include stepContext in Navigate response", () => {
        const def = {
          nodes: {
            start: { type: "start", name: "Start" },
            implement: {
              type: "task",
              name: "Implement",
              context_files: ["README.md"],
            },
            end: { type: "end", result: "success" },
          },
          edges: [
            { from: "start", to: "implement" },
            { from: "implement", to: "end", on: "passed" },
          ],
        };
        store.loadDefinition("no-ctx-field-wf", def);

        const result = engine.navigate({ workflowType: "no-ctx-field-wf" });

        assert.strictEqual(result.stepContext, undefined);
      });
    });
  });
});

describe("resolveContextFile", () => {
  it("should resolve plain path relative to projectRoot", () => {
    const result = resolveContextFile("ARCHITECTURE.md", "/my/project", null);
    assert.strictEqual(result, join("/my/project", "ARCHITECTURE.md"));
  });

  it("should resolve ./ path relative to sourceRoot", () => {
    const result = resolveContextFile("./skills/chrome-debug/SKILL.md", "/my/project", "/plugins/fusion-studio");
    assert.strictEqual(result, join("/plugins/fusion-studio", "skills/chrome-debug/SKILL.md"));
  });

  it("should resolve plain path to projectRoot even when sourceRoot is set", () => {
    const result = resolveContextFile("ARCHITECTURE.md", "/my/project", "/plugins/fusion-studio");
    assert.strictEqual(result, join("/my/project", "ARCHITECTURE.md"));
  });

  it("should fall back to projectRoot for ./ path when sourceRoot is null", () => {
    const result = resolveContextFile("./skills/SKILL.md", "/my/project", null);
    assert.strictEqual(result, join("/my/project", "skills/SKILL.md"));
  });

  it("should handle nested ./ paths", () => {
    const result = resolveContextFile("./deep/nested/path/file.md", "/project", "/opt/ext-plugin");
    assert.strictEqual(result, join("/opt/ext-plugin", "deep/nested/path/file.md"));
  });
});

describe("resolveProseRefs", () => {
  it("should resolve ./ paths in prose text", () => {
    const text = "Invoke ./skills/chrome-debug-session/SKILL.md to start session.";
    const result = resolveProseRefs(text, "/opt/fusion-studio");
    assert.strictEqual(result, "Invoke /opt/fusion-studio/skills/chrome-debug-session/SKILL.md to start session.");
  });

  it("should resolve multiple ./ paths in one string", () => {
    const text = "Read ./skills/verify-ssh-agent/SKILL.md then ./skills/catalog-sync-app-repo/SKILL.md for details.";
    const result = resolveProseRefs(text, "/opt/plugin");
    assert.ok(result.includes("/opt/plugin/skills/verify-ssh-agent/SKILL.md"));
    assert.ok(result.includes("/opt/plugin/skills/catalog-sync-app-repo/SKILL.md"));
    assert.ok(!result.includes("./"));
  });

  it("should leave text unchanged when sourceRoot is null", () => {
    const text = "Read ./skills/foo/SKILL.md for context.";
    const result = resolveProseRefs(text, null);
    assert.strictEqual(result, text);
  });

  it("should return null for null text", () => {
    assert.strictEqual(resolveProseRefs(null, "/opt/plugin"), null);
  });

  it("should leave text without ./ paths unchanged", () => {
    const text = "Verify catalog artifacts exist at ARCHITECTURE.md";
    const result = resolveProseRefs(text, "/opt/plugin");
    assert.strictEqual(result, text);
  });

  it("should handle ./ paths with hyphens and dots", () => {
    const text = "Use ./skills/chrome-debug-session/SKILL.md and ./config/app.settings.json";
    const result = resolveProseRefs(text, "/ext");
    assert.ok(result.includes("/ext/skills/chrome-debug-session/SKILL.md"));
    assert.ok(result.includes("/ext/config/app.settings.json"));
  });
});

describe("resolveProseRefs - project sourceRoot regression (Bug 3)", () => {
  it("should resolve ./ paths when project sourceRoot is provided", () => {
    const result = resolveProseRefs("See ./docs/plan.md", "/project/root");
    assert.strictEqual(result, "See /project/root/docs/plan.md");
  });

  it("should leave ./ paths unchanged when sourceRoot is null (pre-fix behavior)", () => {
    const result = resolveProseRefs("See ./docs/plan.md", null);
    assert.strictEqual(result, "See ./docs/plan.md");
  });
});

describe("resolveContextFile - explicit sourceRoot vs null fallback (Bug 3)", () => {
  it("should resolve ./ path via sourceRoot when provided", () => {
    const result = resolveContextFile("./foo.md", "/project", "/project");
    assert.strictEqual(result, join("/project", "foo.md"));
  });

  it("should resolve ./ path via projectRoot fallback when sourceRoot is null", () => {
    const result = resolveContextFile("./foo.md", "/project", null);
    assert.strictEqual(result, join("/project", "foo.md"));
  });
});

describe("readTaskFile", () => {
  it("should return null for non-existent file", () => {
    const result = readTaskFile("/nonexistent/path.json");
    assert.strictEqual(result, null);
  });

  it("should return null for null/undefined path", () => {
    assert.strictEqual(readTaskFile(null), null);
    assert.strictEqual(readTaskFile(undefined), null);
  });

  it("should parse valid task file", () => {
    const taskDir = join(tmpdir(), "flow-test-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    const task = { id: "1", subject: "Test", metadata: { workflowType: "test" } };
    writeFileSync(taskFile, JSON.stringify(task));

    try {
      const result = readTaskFile(taskFile);
      assert.deepStrictEqual(result, task);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should return null for invalid JSON", () => {
    const taskDir = join(tmpdir(), "flow-test-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(taskFile, "not valid json");

    try {
      const result = readTaskFile(taskFile);
      assert.strictEqual(result, null);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });
});

describe("lint_format gate behavior", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
  });

  /**
   * Helper to create a workflow definition with lint_format gate
   * Follows the pattern used in all 6 workflows:
   * - lint_format gate with maxRetries: 3
   * - passed -> commit
   * - failed -> implementation node (retry)
   * - failed -> hitl node (escalation)
   */
  function createLintFormatWorkflow(implNode = "implement", hitlNode = "hitl_failed") {
    return {
      nodes: {
        start: { type: "start", name: "Start" },
        [implNode]: { type: "task", name: "Implement", stage: "development" },
        lint_format: {
          type: "gate",
          name: "Lint & Format",
          description: "Run lint and format checks. Auto-fix issues where possible.",
          agent: "Developer",
          stage: "delivery",
          maxRetries: 3,
        },
        commit: { type: "task", name: "Commit Changes", stage: "delivery" },
        end_success: { type: "end", result: "success" },
        [hitlNode]: { type: "end", result: "blocked", escalation: "hitl" },
      },
      edges: [
        { from: "start", to: implNode },
        { from: implNode, to: "lint_format" },
        { from: "lint_format", to: "commit", on: "passed" },
        { from: "lint_format", to: implNode, on: "failed" }, // retry edge
        { from: "lint_format", to: hitlNode, on: "failed" }, // escalate edge
        { from: "commit", to: "end_success" },
      ],
    };
  }

  describe("lint_format gate configuration", () => {
    it("should have maxRetries: 3 on lint_format gate", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      const workflow = store.getDefinition("test-wf");
      assert.strictEqual(workflow.nodes.lint_format.maxRetries, 3);
    });

    it("should have type: gate for lint_format node", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      const workflow = store.getDefinition("test-wf");
      assert.strictEqual(workflow.nodes.lint_format.type, "gate");
    });

    it("should have stage: delivery for lint_format node", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      const workflow = store.getDefinition("test-wf");
      assert.strictEqual(workflow.nodes.lint_format.stage, "delivery");
    });
  });

  describe("lint_format retry behavior", () => {
    it("should retry to implementation when lint_format fails and retryCount < maxRetries", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // retryCount = 0, first failure -> should retry
      const result = engine.evaluateEdge("test-wf", "lint_format", "failed", 0);

      assert.strictEqual(result.nextStep, "implement");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesUsed, 1);
      assert.strictEqual(result.retriesRemaining, 2);
    });

    it("should retry to implementation on second failure (retryCount = 1)", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // retryCount = 1, second failure -> should retry
      const result = engine.evaluateEdge("test-wf", "lint_format", "failed", 1);

      assert.strictEqual(result.nextStep, "implement");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesUsed, 2);
      assert.strictEqual(result.retriesRemaining, 1);
    });

    it("should retry to implementation on third failure (retryCount = 2)", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // retryCount = 2, third failure -> should retry (last retry)
      const result = engine.evaluateEdge("test-wf", "lint_format", "failed", 2);

      assert.strictEqual(result.nextStep, "implement");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesUsed, 3);
      assert.strictEqual(result.retriesRemaining, 0);
    });
  });

  describe("lint_format escalation behavior", () => {
    it("should escalate to HITL when retries exhausted (retryCount = 3)", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // retryCount = 3, fourth failure -> should escalate
      const result = engine.evaluateEdge("test-wf", "lint_format", "failed", 3);

      assert.strictEqual(result.nextStep, "hitl_failed");
      assert.strictEqual(result.action, "escalate");
    });

    it("should escalate when retries exceeded (retryCount > maxRetries)", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // retryCount = 5, well past maxRetries -> should escalate
      const result = engine.evaluateEdge("test-wf", "lint_format", "failed", 5);

      assert.strictEqual(result.nextStep, "hitl_failed");
      assert.strictEqual(result.action, "escalate");
    });
  });

  describe("lint_format passed behavior", () => {
    it("should advance to commit when lint_format passes", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      const result = engine.evaluateEdge("test-wf", "lint_format", "passed", 0);

      assert.strictEqual(result.nextStep, "commit");
      assert.strictEqual(result.action, "conditional");
    });

    it("should advance to commit even after previous retries", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // Even with retryCount = 2, if it passes, go to commit
      const result = engine.evaluateEdge("test-wf", "lint_format", "passed", 2);

      assert.strictEqual(result.nextStep, "commit");
      assert.strictEqual(result.action, "conditional");
    });
  });

  describe("lint_format with different implementation nodes", () => {
    it("should retry to write_fix for bug-fix workflow pattern", () => {
      const def = createLintFormatWorkflow("write_fix", "hitl_fix_failed");
      store.loadDefinition("bug-fix", def);

      const result = engine.evaluateEdge("bug-fix", "lint_format", "failed", 0);

      assert.strictEqual(result.nextStep, "write_fix");
      assert.strictEqual(result.action, "retry");
    });

    it("should retry to execute for quick-task workflow pattern", () => {
      const def = createLintFormatWorkflow("execute", "hitl_blocked");
      store.loadDefinition("quick-task", def);

      const result = engine.evaluateEdge("quick-task", "lint_format", "failed", 0);

      assert.strictEqual(result.nextStep, "execute");
      assert.strictEqual(result.action, "retry");
    });

    it("should retry to write_tests for test-coverage workflow pattern", () => {
      const def = createLintFormatWorkflow("write_tests", "hitl_failed");
      store.loadDefinition("test-coverage", def);

      const result = engine.evaluateEdge("test-coverage", "lint_format", "failed", 0);

      assert.strictEqual(result.nextStep, "write_tests");
      assert.strictEqual(result.action, "retry");
    });

    it("should retry to uiRebuild_build for ui-reconstruction workflow pattern", () => {
      const def = createLintFormatWorkflow("uiRebuild_build", "hitl_final_failed");
      store.loadDefinition("ui-reconstruction", def);

      const result = engine.evaluateEdge("ui-reconstruction", "lint_format", "failed", 0);

      assert.strictEqual(result.nextStep, "uiRebuild_build");
      assert.strictEqual(result.action, "retry");
    });
  });

  describe("navigate with lint_format gate", () => {
    it("should increment retryCount when lint_format fails", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // Create a temp task file at lint_format step
      const taskDir = join(tmpdir(), "flow-lint-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "lint_format",
            retryCount: 0,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "failed" });

        assert.strictEqual(result.currentStep, "implement");
        assert.strictEqual(result.action, "retry");
        assert.strictEqual(result.retriesIncremented, true);
        assert.strictEqual(result.metadata.retryCount, 1);
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should not increment retryCount when lint_format passes", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // Create a temp task file at lint_format step
      const taskDir = join(tmpdir(), "flow-lint-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "lint_format",
            retryCount: 1,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

        assert.strictEqual(result.currentStep, "commit");
        assert.strictEqual(result.action, "advance");
        assert.strictEqual(result.retriesIncremented, false);
        // retryCount resets to 0 on advance (new step gets fresh retries)
        assert.strictEqual(result.metadata.retryCount, 0);
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });

    it("should escalate to HITL after exhausting retries", () => {
      const def = createLintFormatWorkflow();
      store.loadDefinition("test-wf", def);

      // Create a temp task file with retryCount = 3 (exhausted)
      const taskDir = join(tmpdir(), "flow-lint-test-" + Date.now());
      mkdirSync(taskDir, { recursive: true });
      const taskFile = join(taskDir, "task.json");
      writeFileSync(
        taskFile,
        JSON.stringify({
          id: "1",
          subject: "Test task",
          metadata: {
            workflowType: "test-wf",
            currentStep: "lint_format",
            retryCount: 3,
          },
        })
      );

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "failed" });

        assert.strictEqual(result.currentStep, "hitl_failed");
        assert.strictEqual(result.action, "escalate");
        assert.strictEqual(result.terminal, "hitl");
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });
  });
});

describe("autonomy mode", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
  });

  /**
   * Multi-stage workflow:
   * start → plan → end_planning --passed--> implement → end_dev --passed--> test → end_success
   *
   * end_planning and end_dev are "stage boundary" end nodes (have outgoing on:"passed" edges).
   * end_success is truly terminal (no outgoing edges).
   */
  function createMultiStageWorkflow() {
    return {
      nodes: {
        start: { type: "start", name: "Start" },
        plan: { type: "task", name: "Plan", stage: "planning", agent: "Planner" },
        end_planning: { type: "end", result: "success", name: "Planning Complete" },
        implement: { type: "task", name: "Implement", stage: "development", agent: "Developer" },
        end_dev: { type: "end", result: "success", name: "Development Complete" },
        test: { type: "task", name: "Test", stage: "verification", agent: "Tester" },
        end_success: { type: "end", result: "success", name: "All Done" },
      },
      edges: [
        { from: "start", to: "plan" },
        { from: "plan", to: "end_planning", on: "passed" },
        { from: "end_planning", to: "implement", on: "passed" },
        { from: "implement", to: "end_dev", on: "passed" },
        { from: "end_dev", to: "test", on: "passed" },
        { from: "test", to: "end_success", on: "passed" },
      ],
    };
  }

  it("should auto-continue through stage boundary end node", () => {
    const def = createMultiStageWorkflow();
    store.loadDefinition("multi-stage", def);

    const taskDir = join(tmpdir(), "flow-autonomy-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test autonomy",
        metadata: { workflowType: "multi-stage", currentStep: "plan", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed", autonomy: true });

      // Should skip end_planning and land on implement
      assert.strictEqual(result.currentStep, "implement");
      assert.strictEqual(result.terminal, null);
      assert.strictEqual(result.autonomyContinued, true);
      assert.ok(result.stepInstructions);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should stop at truly terminal end node (no outgoing edges)", () => {
    const def = createMultiStageWorkflow();
    store.loadDefinition("multi-stage", def);

    const taskDir = join(tmpdir(), "flow-autonomy-terminal-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test autonomy terminal",
        metadata: { workflowType: "multi-stage", currentStep: "test", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed", autonomy: true });

      // end_success has no outgoing edges → should stop
      assert.strictEqual(result.currentStep, "end_success");
      assert.strictEqual(result.terminal, "success");
      assert.strictEqual(result.autonomyContinued, false);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should never auto-continue through HITL nodes", () => {
    const def = {
      nodes: {
        start: { type: "start", name: "Start" },
        task: { type: "task", name: "Task", maxRetries: 0 },
        hitl: { type: "end", result: "blocked", escalation: "hitl", name: "Needs Help" },
        recover: { type: "task", name: "Recover" },
        end: { type: "end", result: "success" },
      },
      edges: [
        { from: "start", to: "task" },
        { from: "task", to: "hitl", on: "failed" },
        { from: "hitl", to: "recover", on: "passed" },
        { from: "recover", to: "end", on: "passed" },
      ],
    };
    store.loadDefinition("hitl-auto", def);

    const taskDir = join(tmpdir(), "flow-autonomy-hitl-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test autonomy hitl",
        metadata: { workflowType: "hitl-auto", currentStep: "task", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "failed", autonomy: true });

      // HITL nodes always stop, regardless of autonomy
      assert.strictEqual(result.currentStep, "hitl");
      assert.strictEqual(result.terminal, "hitl");
      assert.strictEqual(result.autonomyContinued, false);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should stop at stage boundary in normal mode (autonomy off)", () => {
    const def = createMultiStageWorkflow();
    store.loadDefinition("multi-stage", def);

    const taskDir = join(tmpdir(), "flow-no-autonomy-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test no autonomy",
        metadata: { workflowType: "multi-stage", currentStep: "plan", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      // Without autonomy, should stop at end_planning
      assert.strictEqual(result.currentStep, "end_planning");
      assert.strictEqual(result.terminal, "success");
      assert.strictEqual(result.autonomyContinued, false);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should persist autonomy in task metadata", () => {
    const def = createMultiStageWorkflow();
    store.loadDefinition("multi-stage", def);

    const taskDir = join(tmpdir(), "flow-autonomy-persist-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test autonomy persist",
        metadata: { workflowType: "multi-stage", currentStep: "plan", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed", autonomy: true });

      // Check metadata has autonomy
      assert.strictEqual(result.metadata.autonomy, true);

      // Check task file was updated with autonomy
      const updated = readTaskFile(taskFile);
      assert.strictEqual(updated.metadata.autonomy, true);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should read autonomy from task metadata when not passed explicitly", () => {
    const def = createMultiStageWorkflow();
    store.loadDefinition("multi-stage", def);

    const taskDir = join(tmpdir(), "flow-autonomy-read-meta-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test autonomy from meta",
        metadata: {
          workflowType: "multi-stage",
          currentStep: "implement",
          retryCount: 0,
          autonomy: true,
        },
      })
    );

    try {
      // No explicit autonomy param — should read from metadata
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      // Should auto-continue through end_dev to test
      assert.strictEqual(result.currentStep, "test");
      assert.strictEqual(result.autonomyContinued, true);
      assert.strictEqual(result.terminal, null);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should auto-continue through multiple stage boundaries", () => {
    const def = createMultiStageWorkflow();
    store.loadDefinition("multi-stage", def);

    const taskDir = join(tmpdir(), "flow-autonomy-multi-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test multi-stage autonomy",
        metadata: { workflowType: "multi-stage", currentStep: "plan", retryCount: 0 },
      })
    );

    try {
      // First advance: plan → end_planning → implement (auto-continued)
      const r1 = engine.navigate({ taskFilePath: taskFile, result: "passed", autonomy: true });
      assert.strictEqual(r1.currentStep, "implement");
      assert.strictEqual(r1.autonomyContinued, true);

      // Second advance: implement → end_dev → test (auto-continued)
      const r2 = engine.navigate({ taskFilePath: taskFile, result: "passed", autonomy: true });
      assert.strictEqual(r2.currentStep, "test");
      assert.strictEqual(r2.autonomyContinued, true);

      // Third advance: test → end_success (truly terminal, stops)
      const r3 = engine.navigate({ taskFilePath: taskFile, result: "passed", autonomy: true });
      assert.strictEqual(r3.currentStep, "end_success");
      assert.strictEqual(r3.terminal, "success");
      assert.strictEqual(r3.autonomyContinued, false);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should write-through to continued step, not the boundary end node", () => {
    const def = createMultiStageWorkflow();
    store.loadDefinition("multi-stage", def);

    const taskDir = join(tmpdir(), "flow-autonomy-writethrough-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test autonomy write-through",
        metadata: {
          workflowType: "multi-stage",
          currentStep: "plan",
          retryCount: 0,
          userDescription: "Build auth",
        },
      })
    );

    try {
      engine.navigate({ taskFilePath: taskFile, result: "passed", autonomy: true });

      // Task file should point to implement (the continued step), not end_planning
      const updated = readTaskFile(taskFile);
      assert.strictEqual(updated.metadata.currentStep, "implement");
      assert.strictEqual(updated.metadata.autonomy, true);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
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
    it("should prefix bare agent names with flow:", () => {
      assert.strictEqual(toSubagentRef("Developer"), "flow:Developer");
    });

    it("should normalize @flow: display notation to flow:", () => {
      assert.strictEqual(toSubagentRef("@flow:Developer"), "flow:Developer");
    });

    it("should keep flow: prefix as-is", () => {
      assert.strictEqual(toSubagentRef("flow:Developer"), "flow:Developer");
    });

    it("should return null for falsy input", () => {
      assert.strictEqual(toSubagentRef(null), null);
      assert.strictEqual(toSubagentRef(""), null);
    });

    it("should pass through non-flow namespaced IDs as-is", () => {
      assert.strictEqual(toSubagentRef("myorg:developer"), "myorg:developer");
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

describe("HITL resume behavior", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
  });

  /**
   * Helper: workflow with a HITL node that has a recovery edge back to a work step
   */
  function createHitlResumeWorkflow() {
    return {
      nodes: {
        start: { type: "start", name: "Start" },
        implement: { type: "task", name: "Implement", agent: "Developer", stage: "development" },
        review: { type: "gate", name: "Review", agent: "Reviewer", stage: "verification", maxRetries: 2 },
        lint_format: { type: "gate", name: "Lint & Format", agent: "Developer", stage: "delivery", maxRetries: 3 },
        commit: { type: "task", name: "Commit", agent: "Developer", stage: "delivery" },
        end_success: { type: "end", result: "success", name: "Complete" },
        hitl_failed: {
          type: "end",
          result: "blocked",
          escalation: "hitl",
          name: "Needs Help",
          description: "Needs human intervention",
        },
      },
      edges: [
        { from: "start", to: "implement" },
        { from: "implement", to: "review" },
        { from: "review", to: "implement", on: "failed" },
        { from: "review", to: "hitl_failed", on: "failed" },
        { from: "review", to: "lint_format", on: "passed" },
        { from: "lint_format", to: "commit", on: "passed" },
        { from: "lint_format", to: "implement", on: "failed" },
        { from: "lint_format", to: "hitl_failed", on: "failed" },
        { from: "commit", to: "end_success" },
        // Recovery edge: HITL -> implement
        { from: "hitl_failed", to: "implement", on: "passed", label: "Human resolved issue, resume" },
      ],
    };
  }

  it("should advance from HITL node on passed (action = advance)", () => {
    const def = createHitlResumeWorkflow();
    store.loadDefinition("hitl-wf", def);

    const taskDir = join(tmpdir(), "flow-hitl-resume-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test HITL resume",
        metadata: {
          workflowType: "hitl-wf",
          currentStep: "hitl_failed",
          retryCount: 3,
        },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      assert.strictEqual(result.currentStep, "implement");
      assert.strictEqual(result.action, "advance");
      assert.strictEqual(result.terminal, null);
      assert.ok(result.stepInstructions);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should reset retryCount to 0 on HITL resume", () => {
    const def = createHitlResumeWorkflow();
    store.loadDefinition("hitl-wf", def);

    const taskDir = join(tmpdir(), "flow-hitl-retry-reset-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test HITL retry reset",
        metadata: {
          workflowType: "hitl-wf",
          currentStep: "hitl_failed",
          retryCount: 5,
        },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      assert.strictEqual(result.currentStep, "implement");
      assert.strictEqual(result.action, "advance");
      assert.strictEqual(result.metadata.retryCount, 0);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should still show terminal hitl when HITL node has no result provided", () => {
    const def = createHitlResumeWorkflow();
    store.loadDefinition("hitl-wf", def);

    const taskDir = join(tmpdir(), "flow-hitl-current-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test HITL current",
        metadata: {
          workflowType: "hitl-wf",
          currentStep: "hitl_failed",
          retryCount: 3,
        },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile });

      assert.strictEqual(result.currentStep, "hitl_failed");
      assert.strictEqual(result.terminal, "hitl");
      assert.strictEqual(result.action, "current");
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should write-through state transition to task file on HITL resume", () => {
    const def = createHitlResumeWorkflow();
    store.loadDefinition("hitl-wf", def);

    const taskDir = join(tmpdir(), "flow-hitl-writethrough-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test HITL write-through",
        metadata: {
          workflowType: "hitl-wf",
          currentStep: "hitl_failed",
          retryCount: 3,
          userDescription: "Fix the auth bug",
        },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      assert.strictEqual(result.currentStep, "implement");
      assert.strictEqual(result.action, "advance");

      // Read task file back - should have updated metadata
      const updated = readTaskFile(taskFile);
      assert.strictEqual(updated.metadata.currentStep, "implement");
      assert.strictEqual(updated.metadata.retryCount, 0);
      assert.strictEqual(updated.metadata.workflowType, "hitl-wf");

      // Navigate again - should read from updated file
      const current = engine.navigate({ taskFilePath: taskFile });
      assert.strictEqual(current.currentStep, "implement");
      assert.strictEqual(current.action, "current");
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should preserve retryCount through unconditional edges in retry loops", () => {
    // Minimal workflow: work → gate (unconditional), gate → work (retry on failed)
    // After gate fails and retries to work, work → gate should NOT reset retryCount
    const def = {
      nodes: {
        start: { type: "start", name: "Start" },
        work: { type: "task", name: "Work", agent: "Developer", stage: "development" },
        gate: { type: "gate", name: "Gate", agent: "Reviewer", stage: "verification", maxRetries: 1 },
        end_success: { type: "end", result: "success", name: "Done" },
        hitl: { type: "end", result: "blocked", escalation: "hitl", name: "Blocked" },
      },
      edges: [
        { from: "start", to: "work" },
        { from: "work", to: "gate" },
        { from: "gate", to: "end_success", on: "passed" },
        { from: "gate", to: "work", on: "failed" },
        { from: "gate", to: "hitl", on: "failed" },
        { from: "hitl", to: "work", on: "passed" },
      ],
    };
    store.loadDefinition("retry-loop", def);

    const taskDir = join(tmpdir(), "flow-retry-preserve-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test retry preserve",
        metadata: {
          workflowType: "retry-loop",
          currentStep: "gate",
          retryCount: 0,
        },
      })
    );

    try {
      // Step 1: gate fails → retries to work (retryCount: 0 → 1, since 0 < maxRetries:1)
      const r1 = engine.navigate({ taskFilePath: taskFile, result: "failed" });
      assert.strictEqual(r1.currentStep, "work");
      assert.strictEqual(r1.action, "retry");
      assert.strictEqual(r1.metadata.retryCount, 1);

      // Step 2: work passes → unconditional advance to gate
      // BUG FIX: retryCount must stay at 1, not reset to 0
      const r2 = engine.navigate({ taskFilePath: taskFile, result: "passed" });
      assert.strictEqual(r2.currentStep, "gate");
      assert.strictEqual(r2.action, "advance");
      assert.strictEqual(r2.metadata.retryCount, 1, "retryCount should be preserved through unconditional advance");

      // Step 3: gate fails again → escalates to HITL (retryCount 1 >= maxRetries 1)
      const r3 = engine.navigate({ taskFilePath: taskFile, result: "failed" });
      assert.strictEqual(r3.currentStep, "hitl");
      assert.strictEqual(r3.action, "escalate");
      assert.strictEqual(r3.terminal, "hitl");
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should reset retryCount on conditional advance (passed through gate)", () => {
    // When a gate passes (conditional on:"passed" edge), retryCount should reset
    const def = {
      nodes: {
        start: { type: "start", name: "Start" },
        work: { type: "task", name: "Work", agent: "Developer", stage: "development" },
        gate: { type: "gate", name: "Gate", agent: "Reviewer", stage: "verification", maxRetries: 2 },
        end_success: { type: "end", result: "success", name: "Done" },
      },
      edges: [
        { from: "start", to: "work" },
        { from: "work", to: "gate" },
        { from: "gate", to: "end_success", on: "passed" },
        { from: "gate", to: "work", on: "failed" },
      ],
    };
    store.loadDefinition("conditional-reset", def);

    const taskDir = join(tmpdir(), "flow-conditional-reset-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test conditional reset",
        metadata: {
          workflowType: "conditional-reset",
          currentStep: "gate",
          retryCount: 1,
        },
      })
    );

    try {
      // Gate passes → conditional advance to end_success → retryCount should reset to 0
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });
      assert.strictEqual(result.currentStep, "end_success");
      assert.strictEqual(result.action, "advance");
      assert.strictEqual(result.metadata.retryCount, 0, "retryCount should reset on conditional advance");
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should return error when HITL node has no recovery edge and result is passed", () => {
    // Workflow without recovery edge
    const def = {
      nodes: {
        start: { type: "start", name: "Start" },
        task: { type: "task", name: "Task" },
        hitl: { type: "end", result: "blocked", escalation: "hitl", name: "HITL" },
      },
      edges: [
        { from: "start", to: "task" },
        { from: "task", to: "hitl", on: "failed" },
      ],
    };
    store.loadDefinition("no-recovery", def);

    const taskDir = join(tmpdir(), "flow-hitl-no-recovery-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test no recovery",
        metadata: {
          workflowType: "no-recovery",
          currentStep: "hitl",
          retryCount: 0,
        },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      // Should return error since no outgoing edge from hitl with on: "passed"
      assert.ok(result.error);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });
});

describe("fork/join", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
  });

  /**
   * Fork/join workflow:
   * start → analyze → fork_impl
   *                     ├→ impl_frontend → test_frontend → join_impl
   *                     └→ impl_backend  → test_backend  → join_impl
   *                                                          └→ integration_test → end_success
   *                                                          └→ hitl_failed
   */
  function createForkJoinWorkflow() {
    return {
      nodes: {
        start: { type: "start", name: "Start" },
        analyze: { type: "task", name: "Analyze", stage: "planning", agent: "Planner" },
        fork_impl: {
          type: "fork",
          name: "Fork Implementation",
          branches: {
            frontend: { entryStep: "impl_frontend", description: "Build UI" },
            backend: { entryStep: "impl_backend", description: "Build API" },
          },
          join: "join_impl",
        },
        impl_frontend: { type: "task", name: "Implement Frontend", stage: "development", agent: "Developer" },
        test_frontend: { type: "task", name: "Test Frontend", stage: "verification", agent: "Tester" },
        impl_backend: { type: "task", name: "Implement Backend", stage: "development", agent: "Developer" },
        test_backend: { type: "task", name: "Test Backend", stage: "verification", agent: "Tester" },
        join_impl: {
          type: "join",
          name: "Join Implementation",
          fork: "fork_impl",
          strategy: "all-pass",
        },
        integration_test: { type: "task", name: "Integration Test", stage: "verification", agent: "Tester" },
        end_success: { type: "end", result: "success", name: "Complete" },
        hitl_failed: { type: "end", result: "blocked", escalation: "hitl", name: "Needs Help" },
      },
      edges: [
        { from: "start", to: "analyze" },
        { from: "analyze", to: "fork_impl", on: "passed" },
        { from: "fork_impl", to: "impl_frontend" },
        { from: "fork_impl", to: "impl_backend" },
        { from: "impl_frontend", to: "test_frontend", on: "passed" },
        { from: "test_frontend", to: "join_impl", on: "passed" },
        { from: "impl_backend", to: "test_backend", on: "passed" },
        { from: "test_backend", to: "join_impl", on: "passed" },
        { from: "join_impl", to: "integration_test", on: "passed" },
        { from: "join_impl", to: "hitl_failed", on: "failed" },
        { from: "integration_test", to: "end_success", on: "passed" },
      ],
    };
  }

  it("should return action 'fork' with enriched branch metadata when navigating to fork node", () => {
    const def = createForkJoinWorkflow();
    store.loadDefinition("fork-wf", def);

    const taskDir = join(tmpdir(), "flow-fork-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test fork",
        metadata: { workflowType: "fork-wf", currentStep: "analyze", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      assert.strictEqual(result.currentStep, "fork_impl");
      assert.strictEqual(result.action, "fork");
      assert.ok(result.fork);
      assert.strictEqual(result.fork.joinStep, "join_impl");
      assert.strictEqual(result.fork.joinStrategy, "all-pass");

      // Frontend branch — enriched fields
      const frontend = result.fork.branches.frontend;
      assert.ok(frontend);
      assert.strictEqual(frontend.entryStep, "impl_frontend");
      assert.strictEqual(frontend.description, "Build UI");
      assert.strictEqual(frontend.subagent, "flow:Developer");
      assert.strictEqual(frontend.stage, "development");
      assert.ok(frontend.stepInstructions);
      assert.strictEqual(frontend.stepInstructions.name, "Implement Frontend");
      assert.ok(frontend.orchestratorInstructions);
      assert.strictEqual(frontend.multiStep, true); // impl_frontend → test_frontend → join
      assert.strictEqual(frontend.maxRetries, 0);
      assert.ok(frontend.metadata);
      assert.strictEqual(frontend.metadata.workflowType, "fork-wf");
      assert.strictEqual(frontend.metadata.currentStep, "impl_frontend");

      // Backend branch — enriched fields
      const backend = result.fork.branches.backend;
      assert.ok(backend);
      assert.strictEqual(backend.entryStep, "impl_backend");
      assert.strictEqual(backend.subagent, "flow:Developer");
      assert.strictEqual(backend.multiStep, true); // impl_backend → test_backend → join
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should return action 'join' with strategy when navigating to join node", () => {
    const def = createForkJoinWorkflow();
    store.loadDefinition("fork-wf", def);

    const taskDir = join(tmpdir(), "flow-join-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test join",
        metadata: { workflowType: "fork-wf", currentStep: "test_frontend", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      assert.strictEqual(result.currentStep, "join_impl");
      assert.strictEqual(result.action, "join");
      assert.ok(result.join);
      assert.strictEqual(result.join.forkStep, "fork_impl");
      assert.strictEqual(result.join.strategy, "all-pass");
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should advance through join with 'passed' following on:'passed' edge", () => {
    const def = createForkJoinWorkflow();
    store.loadDefinition("fork-wf", def);

    const taskDir = join(tmpdir(), "flow-join-advance-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test join advance",
        metadata: { workflowType: "fork-wf", currentStep: "join_impl", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      assert.strictEqual(result.currentStep, "integration_test");
      assert.strictEqual(result.action, "advance");
      assert.strictEqual(result.terminal, null);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should advance through join with 'failed' following on:'failed' edge", () => {
    const def = createForkJoinWorkflow();
    store.loadDefinition("fork-wf", def);

    const taskDir = join(tmpdir(), "flow-join-fail-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test join fail",
        metadata: { workflowType: "fork-wf", currentStep: "join_impl", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "failed" });

      assert.strictEqual(result.currentStep, "hitl_failed");
      assert.strictEqual(result.terminal, "hitl");
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("isTerminalNode returns false for fork/join nodes", () => {
    assert.strictEqual(isTerminalNode({ type: "fork", name: "F", branches: {}, join: "j" }), false);
    assert.strictEqual(isTerminalNode({ type: "join", name: "J", fork: "f" }), false);
  });

  it("isForkJoinNode returns true for fork/join, false for others", () => {
    assert.strictEqual(isForkJoinNode({ type: "fork", name: "F", branches: {}, join: "j" }), true);
    assert.strictEqual(isForkJoinNode({ type: "join", name: "J", fork: "f" }), true);
    assert.strictEqual(isForkJoinNode({ type: "task", name: "T" }), false);
    assert.strictEqual(isForkJoinNode({ type: "start" }), false);
    assert.strictEqual(isForkJoinNode({ type: "end", result: "success" }), false);
    assert.strictEqual(isForkJoinNode(null), false);
  });

  it("getTerminalType returns null for fork/join nodes", () => {
    assert.strictEqual(getTerminalType({ type: "fork", name: "F", branches: {}, join: "j" }), null);
    assert.strictEqual(getTerminalType({ type: "join", name: "J", fork: "f" }), null);
  });

  it("fork response has null subagent, null stepInstructions, null terminal", () => {
    const def = createForkJoinWorkflow();
    store.loadDefinition("fork-wf", def);

    const taskDir = join(tmpdir(), "flow-fork-fields-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test fork fields",
        metadata: { workflowType: "fork-wf", currentStep: "analyze", retryCount: 0 },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      assert.strictEqual(result.action, "fork");
      assert.strictEqual(result.subagent, null);
      assert.strictEqual(result.stepInstructions, null);
      assert.strictEqual(result.terminal, null);
      assert.strictEqual(result.stage, null);
      assert.strictEqual(result.orchestratorInstructions, null);
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("write-through preserves forkState in metadata", () => {
    const def = createForkJoinWorkflow();
    store.loadDefinition("fork-wf", def);

    const taskDir = join(tmpdir(), "flow-fork-writethrough-" + Date.now());
    mkdirSync(taskDir, { recursive: true });
    const taskFile = join(taskDir, "task.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "Test fork write-through",
        metadata: {
          workflowType: "fork-wf",
          currentStep: "analyze",
          retryCount: 0,
          forkState: { test: "should-be-preserved" },
        },
      })
    );

    try {
      const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

      assert.strictEqual(result.currentStep, "fork_impl");

      // Read task file — forkState should be preserved (engine doesn't overwrite it)
      const updated = readTaskFile(taskFile);
      assert.strictEqual(updated.metadata.currentStep, "fork_impl");
      assert.ok(updated.metadata.forkState);
      assert.strictEqual(updated.metadata.forkState.test, "should-be-preserved");
    } finally {
      rmSync(taskDir, { recursive: true });
    }
  });

  it("should mark single-step branches as multiStep=false", () => {
    // Workflow where branches go directly to join (no intermediate steps)
    const def = {
      nodes: {
        start: { type: "start", name: "Start" },
        fork_gather: {
          type: "fork",
          name: "Fork Gather",
          branches: {
            alpha: { entryStep: "gather_alpha", description: "Gather alpha data" },
            beta: { entryStep: "gather_beta", description: "Gather beta data" },
          },
          join: "join_gather",
        },
        gather_alpha: { type: "task", name: "Gather Alpha", agent: "Investigator", stage: "investigation" },
        gather_beta: { type: "task", name: "Gather Beta", agent: "Investigator", stage: "investigation" },
        join_gather: { type: "join", name: "Join Gather", fork: "fork_gather", strategy: "all-pass" },
        end: { type: "end", result: "success" },
      },
      edges: [
        { from: "start", to: "fork_gather" },
        { from: "fork_gather", to: "gather_alpha" },
        { from: "fork_gather", to: "gather_beta" },
        { from: "gather_alpha", to: "join_gather", on: "passed" },
        { from: "gather_beta", to: "join_gather", on: "passed" },
        { from: "join_gather", to: "end", on: "passed" },
      ],
    };
    store.loadDefinition("single-step-fork", def);

    const result = engine.navigate({ workflowType: "single-step-fork" });

    assert.strictEqual(result.currentStep, "fork_gather");
    assert.strictEqual(result.action, "fork");

    // Both branches should be single-step (entry step edges only go to join)
    assert.strictEqual(result.fork.branches.alpha.multiStep, false);
    assert.strictEqual(result.fork.branches.beta.multiStep, false);
    assert.strictEqual(result.fork.branches.alpha.subagent, "flow:Investigator");
    assert.strictEqual(result.fork.branches.beta.subagent, "flow:Investigator");
    assert.strictEqual(result.fork.joinStrategy, "all-pass");
  });

  it("should include enriched fork data on mid-flow start with stepId", () => {
    const def = createForkJoinWorkflow();
    store.loadDefinition("fork-wf", def);

    const result = engine.navigate({ workflowType: "fork-wf", stepId: "fork_impl" });

    assert.strictEqual(result.currentStep, "fork_impl");
    assert.strictEqual(result.action, "fork");
    assert.ok(result.fork);
    assert.strictEqual(result.fork.joinStrategy, "all-pass");

    // Branches should have enriched data
    assert.strictEqual(result.fork.branches.frontend.subagent, "flow:Developer");
    assert.ok(result.fork.branches.frontend.stepInstructions);
    assert.ok(result.fork.branches.frontend.orchestratorInstructions);
    assert.strictEqual(result.fork.branches.backend.subagent, "flow:Developer");
  });
});
