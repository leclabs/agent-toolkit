import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { WorkflowEngine, isTerminalNode, getTerminalType, toSubagentRef, getBaselineInstructions, readTaskFile } from "./engine.js";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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

      const result = engine.navigate({ workflowType: "test-wf" });

      assert.strictEqual(result.currentStep, "analyze");
      assert.strictEqual(result.action, "start");
      assert.strictEqual(result.stage, "planning");
      assert.strictEqual(result.subagent, "@flow:planner");
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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "implement",
          retryCount: 0,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "analyze",
          retryCount: 0,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "task",
          retryCount: 0,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "task",
          retryCount: 0,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "task",
          retryCount: 1,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
      }));

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
      assert.ok(result.orchestratorInstructions.includes("@flow:planner"));
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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "analyze",
          retryCount: 0,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "analyze",
          retryCount: 0,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "task",
          retryCount: 0,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "analyze",
          retryCount: 0,
          userDescription: "Build the auth system",
        },
      }));

      try {
        const result = engine.navigate({ taskFilePath: taskFile });

        assert.ok(result.orchestratorInstructions);
        assert.ok(result.orchestratorInstructions.includes("Build the auth system"));
      } finally {
        rmSync(taskDir, { recursive: true });
      }
    });
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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "lint_format",
          retryCount: 0,
        },
      }));

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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "lint_format",
          retryCount: 1,
        },
      }));

      try {
        const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

        assert.strictEqual(result.currentStep, "commit");
        assert.strictEqual(result.action, "advance");
        assert.strictEqual(result.retriesIncremented, false);
        // retryCount should stay at 1 (not increment)
        assert.strictEqual(result.metadata.retryCount, 1);
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
      writeFileSync(taskFile, JSON.stringify({
        id: "1",
        subject: "Test task",
        metadata: {
          workflowType: "test-wf",
          currentStep: "lint_format",
          retryCount: 3,
        },
      }));

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
