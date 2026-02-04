import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { WorkflowEngine, getTerminalType, readTaskFile } from "./engine.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Minimal WorkflowStore for testing
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
    if (sourceRoot) this.sourceRoots.set(id, sourceRoot);
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

// =============================================================================
// Helper: Simple workflow for testing
// =============================================================================

const simpleWorkflow = {
  nodes: {
    start: { type: "start", name: "Start" },
    task1: { type: "task", name: "Task 1", agent: "Developer" },
    task2: { type: "task", name: "Task 2" },
    end_success: { type: "end", result: "success" },
    end_failure: { type: "end", result: "failure" },
  },
  edges: [
    { from: "start", to: "task1" },
    { from: "task1", to: "task2", on: "passed" },
    { from: "task1", to: "end_failure", on: "failed" },
    { from: "task2", to: "end_success", on: "passed" },
    { from: "task2", to: "end_failure", on: "failed" },
  ],
};

const retryWorkflow = {
  nodes: {
    start: { type: "start" },
    work: { type: "task", name: "Work", maxRetries: 2 },
    end_success: { type: "end", result: "success" },
    end_hitl: { type: "end", result: "failure", escalation: "hitl" },
  },
  edges: [
    { from: "start", to: "work" },
    { from: "work", to: "end_success", on: "passed" },
    { from: "work", to: "work", on: "failed" },
    { from: "work", to: "end_hitl", on: "failed" },
  ],
};

// =============================================================================
// getTerminalType
// =============================================================================

describe("getTerminalType", () => {
  it("returns 'start' for start nodes", () => {
    assert.strictEqual(getTerminalType({ type: "start" }), "start");
  });

  it("returns 'success' for success end nodes", () => {
    assert.strictEqual(getTerminalType({ type: "end", result: "success" }), "success");
  });

  it("returns 'failure' for failure end nodes", () => {
    assert.strictEqual(getTerminalType({ type: "end", result: "failure" }), "failure");
  });

  it("returns 'hitl' for hitl escalation nodes", () => {
    assert.strictEqual(getTerminalType({ type: "end", result: "failure", escalation: "hitl" }), "hitl");
  });

  it("returns null for task nodes", () => {
    assert.strictEqual(getTerminalType({ type: "task", name: "Test" }), null);
  });

  it("returns null for null/undefined", () => {
    assert.strictEqual(getTerminalType(null), null);
    assert.strictEqual(getTerminalType(undefined), null);
  });
});

// =============================================================================
// WorkflowEngine.start
// =============================================================================

describe("WorkflowEngine.start", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);
  });

  it("throws if workflowType not provided", () => {
    assert.throws(() => engine.start({}), /workflowType is required/);
  });

  it("throws if workflow not found", () => {
    assert.throws(() => engine.start({ workflowType: "nonexistent" }), /not found/);
  });

  it("starts at start node by default", () => {
    const result = engine.start({ workflowType: "simple" });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
    assert.strictEqual(result.node.type, "start");
  });

  it("returns outgoing edges", () => {
    const result = engine.start({ workflowType: "simple" });
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].to, "task1");
  });

  it("can start at specific step", () => {
    const result = engine.start({ workflowType: "simple", stepId: "task1" });
    assert.strictEqual(result.currentStep, "task1");
    assert.strictEqual(result.node.name, "Task 1");
    assert.strictEqual(result.node.agent, "Developer");
  });

  it("stores description in metadata", () => {
    const result = engine.start({ workflowType: "simple", description: "Test task" });
    assert.strictEqual(result.metadata.userDescription, "Test task");
    assert.strictEqual(result.metadata.workflowType, "simple");
    assert.strictEqual(result.metadata.retryCount, 0);
  });

  it("throws if stepId not found", () => {
    assert.throws(() => engine.start({ workflowType: "simple", stepId: "nonexistent" }), /not found/);
  });
});

// =============================================================================
// WorkflowEngine.start with taskFilePath (write-through)
// =============================================================================

describe("WorkflowEngine.start with taskFilePath", () => {
  let store;
  let engine;
  let tmpDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);

    tmpDir = join(tmpdir(), `engine-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    taskFile = join(tmpDir, "123.json");

    // Create initial task file
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "123",
        subject: "Test task",
        description: "Original description",
        status: "pending",
        metadata: {},
      })
    );
  });

  it("writes workflow state to task file", () => {
    engine.start({ taskFilePath: taskFile, workflowType: "simple", description: "My task" });

    const task = readTaskFile(taskFile);
    assert.strictEqual(task.metadata.workflowType, "simple");
    assert.strictEqual(task.metadata.currentStep, "start");
    assert.strictEqual(task.metadata.userDescription, "My task");
  });

  it("sets task status to in_progress", () => {
    engine.start({ taskFilePath: taskFile, workflowType: "simple" });

    const task = readTaskFile(taskFile);
    assert.strictEqual(task.status, "in_progress");
  });

  it("updates task subject with workflow info", () => {
    engine.start({ taskFilePath: taskFile, workflowType: "simple", description: "My task" });

    const task = readTaskFile(taskFile);
    assert.ok(task.subject.includes("simple"));
    assert.ok(task.subject.includes("start"));
  });

  // Cleanup
  it("cleanup", () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// =============================================================================
// WorkflowEngine.current
// =============================================================================

describe("WorkflowEngine.current", () => {
  let store;
  let engine;
  let tmpDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);

    tmpDir = join(tmpdir(), `engine-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    taskFile = join(tmpDir, "456.json");
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => engine.current({}), /taskFilePath is required/);
  });

  it("throws if task file not found", () => {
    assert.throws(() => engine.current({ taskFilePath: "/nonexistent/path.json" }), /not found/);
  });

  it("throws if task has no workflow metadata", () => {
    writeFileSync(taskFile, JSON.stringify({ id: "456", status: "pending", metadata: {} }));
    assert.throws(() => engine.current({ taskFilePath: taskFile }), /no workflow metadata/);
  });

  it("returns current step info", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "456",
        status: "in_progress",
        metadata: { workflowType: "simple", currentStep: "task1", retryCount: 0 },
      })
    );

    const result = engine.current({ taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "task1");
    assert.strictEqual(result.node.name, "Task 1");
    assert.strictEqual(result.edges.length, 2); // passed -> task2, failed -> end_failure
  });

  it("preserves retry count", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "456",
        status: "in_progress",
        metadata: { workflowType: "simple", currentStep: "task1", retryCount: 2, userDescription: "Test" },
      })
    );

    const result = engine.current({ taskFilePath: taskFile });
    assert.strictEqual(result.metadata.retryCount, 2);
    assert.strictEqual(result.metadata.userDescription, "Test");
  });

  // Cleanup
  it("cleanup", () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// =============================================================================
// WorkflowEngine.next
// =============================================================================

describe("WorkflowEngine.next", () => {
  let store;
  let engine;
  let tmpDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);
    store.loadDefinition("retry", retryWorkflow);

    tmpDir = join(tmpdir(), `engine-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    taskFile = join(tmpDir, "789.json");
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => engine.next({ result: "passed" }), /taskFilePath is required/);
  });

  it("throws if result not provided", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "789",
        metadata: { workflowType: "simple", currentStep: "task1", retryCount: 0 },
      })
    );
    assert.throws(() => engine.next({ taskFilePath: taskFile }), /result is required/);
  });

  it("advances on passed result", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "789",
        status: "in_progress",
        metadata: { workflowType: "simple", currentStep: "task1", retryCount: 0 },
      })
    );

    const result = engine.next({ taskFilePath: taskFile, result: "passed" });
    assert.strictEqual(result.currentStep, "task2");
    assert.strictEqual(result.node.name, "Task 2");
  });

  it("advances on failed result", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "789",
        status: "in_progress",
        metadata: { workflowType: "simple", currentStep: "task1", retryCount: 0 },
      })
    );

    const result = engine.next({ taskFilePath: taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "end_failure");
    assert.strictEqual(result.terminal, "failure");
  });

  it("writes updated state to task file", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "789",
        status: "in_progress",
        metadata: { workflowType: "simple", currentStep: "task1", retryCount: 0 },
      })
    );

    engine.next({ taskFilePath: taskFile, result: "passed" });

    const task = readTaskFile(taskFile);
    assert.strictEqual(task.metadata.currentStep, "task2");
  });

  it("sets status to completed on success terminal", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "789",
        status: "in_progress",
        metadata: { workflowType: "simple", currentStep: "task2", retryCount: 0 },
      })
    );

    engine.next({ taskFilePath: taskFile, result: "passed" });

    const task = readTaskFile(taskFile);
    assert.strictEqual(task.status, "completed");
  });

  it("returns error for no matching edge", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "789",
        status: "in_progress",
        metadata: { workflowType: "simple", currentStep: "end_success", retryCount: 0 },
      })
    );

    const result = engine.next({ taskFilePath: taskFile, result: "passed" });
    assert.ok(result.error);
  });

  // Cleanup
  it("cleanup", () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// =============================================================================
// WorkflowEngine.next - Retry logic
// =============================================================================

describe("WorkflowEngine.next - retry logic", () => {
  let store;
  let engine;
  let tmpDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("retry", retryWorkflow);

    tmpDir = join(tmpdir(), `engine-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    taskFile = join(tmpDir, "retry.json");
  });

  it("increments retry count on failure within limit", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "retry",
        status: "in_progress",
        metadata: { workflowType: "retry", currentStep: "work", retryCount: 0 },
      })
    );

    const result = engine.next({ taskFilePath: taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "work"); // Stays at work (retry)
    assert.strictEqual(result.metadata.retryCount, 1);
  });

  it("escalates to end node after max retries", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "retry",
        status: "in_progress",
        metadata: { workflowType: "retry", currentStep: "work", retryCount: 2 }, // At max
      })
    );

    const result = engine.next({ taskFilePath: taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "end_hitl");
    assert.strictEqual(result.terminal, "hitl");
  });

  it("resets retry count on success", () => {
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "retry",
        status: "in_progress",
        metadata: { workflowType: "retry", currentStep: "work", retryCount: 1 },
      })
    );

    const result = engine.next({ taskFilePath: taskFile, result: "passed" });
    assert.strictEqual(result.currentStep, "end_success");
    assert.strictEqual(result.metadata.retryCount, 0);
  });

  // Cleanup
  it("cleanup", () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// =============================================================================
// Response shape consistency
// =============================================================================

describe("Response shape consistency", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);
  });

  it("start returns consistent shape", () => {
    const result = engine.start({ workflowType: "simple" });

    assert.ok("currentStep" in result);
    assert.ok("node" in result);
    assert.ok("edges" in result);
    assert.ok("terminal" in result);
    assert.ok("metadata" in result);
    assert.ok(Array.isArray(result.edges));
  });

  it("node contains expected fields", () => {
    const result = engine.start({ workflowType: "simple", stepId: "task1" });

    assert.strictEqual(result.node.type, "task");
    assert.strictEqual(result.node.name, "Task 1");
    assert.strictEqual(result.node.agent, "Developer");
    assert.strictEqual(result.node.maxRetries, 0);
  });

  it("metadata contains expected fields", () => {
    const result = engine.start({ workflowType: "simple", description: "Test" });

    assert.strictEqual(result.metadata.workflowType, "simple");
    assert.strictEqual(result.metadata.currentStep, "start");
    assert.strictEqual(result.metadata.retryCount, 0);
    assert.strictEqual(result.metadata.userDescription, "Test");
  });

  it("edges contain expected fields", () => {
    const result = engine.start({ workflowType: "simple", stepId: "task1" });

    for (const edge of result.edges) {
      assert.ok("to" in edge);
      assert.ok("on" in edge);
      assert.ok("label" in edge);
    }
  });
});

// =============================================================================
// Multiple edges (fork-like behavior)
// =============================================================================

describe("Multiple outgoing edges", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);

    // Workflow with a node that has multiple outgoing edges
    store.loadDefinition("multi", {
      nodes: {
        start: { type: "start" },
        dispatch: {
          type: "task",
          name: "Dispatch",
          description: "Process items in parallel: {items}",
        },
        branch_a: { type: "task", name: "Branch A" },
        branch_b: { type: "task", name: "Branch B" },
        branch_c: { type: "task", name: "Branch C" },
        end: { type: "end", result: "success" },
      },
      edges: [
        { from: "start", to: "dispatch" },
        { from: "dispatch", to: "branch_a", label: "Item A" },
        { from: "dispatch", to: "branch_b", label: "Item B" },
        { from: "dispatch", to: "branch_c", label: "Item C" },
        { from: "branch_a", to: "end", on: "passed" },
        { from: "branch_b", to: "end", on: "passed" },
        { from: "branch_c", to: "end", on: "passed" },
      ],
    });
  });

  it("returns all outgoing edges from dispatch node", () => {
    const result = engine.start({ workflowType: "multi", stepId: "dispatch" });

    assert.strictEqual(result.edges.length, 3);
    assert.deepStrictEqual(
      result.edges.map((e) => e.to).sort(),
      ["branch_a", "branch_b", "branch_c"]
    );
  });

  it("edges include labels", () => {
    const result = engine.start({ workflowType: "multi", stepId: "dispatch" });

    const labels = result.edges.map((e) => e.label).sort();
    assert.deepStrictEqual(labels, ["Item A", "Item B", "Item C"]);
  });

  it("node description contains parallelization hint", () => {
    const result = engine.start({ workflowType: "multi", stepId: "dispatch" });

    assert.ok(result.node.description.includes("parallel"));
  });
});
