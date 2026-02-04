import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { WorkflowEngine, getTerminalType, readTaskFile } from "./engine.js";
import { WorkflowStore } from "./store.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// =============================================================================
// Helper: Simple workflow for testing
// =============================================================================

const simpleWorkflow = {
  nodes: {
    start: { type: "start", name: "Start" },
    task1: { type: "task", name: "Task 1", agent: "Developer", description: "First task" },
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

const forkWorkflow = {
  nodes: {
    start: { type: "start" },
    fork_work: { type: "fork", name: "Fork Work", join: "join_work", maxConcurrency: 3 },
    branch_a: { type: "task", name: "Branch A", agent: "Developer", description: "First branch" },
    branch_b: { type: "task", name: "Branch B", agent: "Tester", description: "Second branch" },
    join_work: { type: "join", name: "Join Work", fork: "fork_work" },
    end_success: { type: "end", result: "success" },
  },
  edges: [
    { from: "start", to: "fork_work" },
    { from: "fork_work", to: "branch_a" },
    { from: "fork_work", to: "branch_b" },
    { from: "branch_a", to: "join_work", on: "passed" },
    { from: "branch_b", to: "join_work", on: "passed" },
    { from: "join_work", to: "end_success", on: "passed" },
  ],
};

// Workflow with retry loop to prior step (gate -> task on failed)
const retryLoopWorkflow = {
  nodes: {
    start: { type: "start" },
    compute: { type: "task", name: "Compute" },
    check: { type: "gate", name: "Check", maxRetries: 2 },
    end_success: { type: "end", result: "success" },
    end_hitl: { type: "end", result: "failure", escalation: "hitl" },
  },
  edges: [
    { from: "start", to: "compute" },
    { from: "compute", to: "check", on: "passed" },
    { from: "check", to: "end_success", on: "passed" },
    { from: "check", to: "compute", on: "failed" },
    { from: "check", to: "end_hitl", on: "failed" },
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
// WorkflowEngine.init
// =============================================================================

describe("WorkflowEngine.init", () => {
  let store;
  let engine;
  let taskDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);

    taskDir = join(tmpdir(), `flow-test-${Date.now()}`);
    mkdirSync(taskDir, { recursive: true });
    taskFile = join(taskDir, "test-task.json");
  });

  afterEach(() => {
    try {
      rmSync(taskDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => engine.init({}), /taskFilePath is required/);
  });

  it("throws if workflowType not provided for new init", () => {
    assert.throws(() => engine.init({ taskFilePath: taskFile }), /workflowType is required/);
  });

  it("throws if workflow not found", () => {
    assert.throws(() => engine.init({ taskFilePath: taskFile, workflowType: "nonexistent" }), /not found/);
  });

  it("initializes at start node by default", () => {
    const result = engine.init({ taskFilePath: taskFile, workflowType: "simple" });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
    assert.ok(result.instructions.includes("## Queued"));
    assert.ok(result.instructions.includes("→ Call Start()"));
  });

  it("returns prose instructions", () => {
    const result = engine.init({ taskFilePath: taskFile, workflowType: "simple" });
    assert.ok(typeof result.instructions === "string");
    assert.ok(result.instructions.length > 0);
  });

  it("can init at specific step", () => {
    const result = engine.init({ taskFilePath: taskFile, workflowType: "simple", stepId: "task1" });
    assert.strictEqual(result.currentStep, "task1");
    assert.ok(result.instructions.includes("## Task 1"));
    assert.ok(result.instructions.includes("Agent: Developer"));
  });

  it("stores description in metadata", () => {
    const result = engine.init({ taskFilePath: taskFile, workflowType: "simple", description: "Test task" });
    assert.strictEqual(result.metadata.userDescription, "Test task");
    assert.strictEqual(result.metadata.workflowType, "simple");
  });

  it("stores stepName in metadata", () => {
    const result = engine.init({ taskFilePath: taskFile, workflowType: "simple", stepId: "task1" });
    assert.strictEqual(result.metadata.stepName, "Task 1");
  });

  it("initializes retryCount to 0", () => {
    const result = engine.init({ taskFilePath: taskFile, workflowType: "simple" });
    assert.strictEqual(result.metadata.retryCount, 0);
  });

  it("is idempotent - returns current state if already initialized", () => {
    // First init
    engine.init({ taskFilePath: taskFile, workflowType: "simple", description: "Original" });

    // Second init without workflowType should return current state
    const result = engine.init({ taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.metadata.userDescription, "Original");
  });
});

// =============================================================================
// WorkflowEngine.start (advance from start node)
// =============================================================================

describe("WorkflowEngine.start", () => {
  let store;
  let engine;
  let taskDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);

    taskDir = join(tmpdir(), `flow-test-${Date.now()}`);
    mkdirSync(taskDir, { recursive: true });
    taskFile = join(taskDir, "test-task.json");
  });

  afterEach(() => {
    try {
      rmSync(taskDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => engine.start({}), /taskFilePath is required/);
  });

  it("throws if task not initialized", () => {
    assert.throws(() => engine.start({ taskFilePath: taskFile }), /not found/);
  });

  it("advances from start node to first real step", () => {
    engine.init({ taskFilePath: taskFile, workflowType: "simple" });
    const result = engine.start({ taskFilePath: taskFile });

    assert.strictEqual(result.currentStep, "task1");
    assert.strictEqual(result.terminal, null);
    assert.ok(result.instructions.includes("## Task 1"));
  });

  it("is idempotent - returns current state if not at start node", () => {
    engine.init({ taskFilePath: taskFile, workflowType: "simple" });
    engine.start({ taskFilePath: taskFile }); // Advance to task1

    // Call start again - should return current state
    const result = engine.start({ taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "task1");
  });
});

// =============================================================================
// WorkflowEngine.current
// =============================================================================

describe("WorkflowEngine.current", () => {
  let store;
  let engine;
  let taskDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);

    // Create temp task file
    taskDir = join(tmpdir(), `flow-test-${Date.now()}`);
    mkdirSync(taskDir, { recursive: true });
    taskFile = join(taskDir, "test-task.json");
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => engine.current({}), /taskFilePath is required/);
  });

  it("throws if task file not found", () => {
    assert.throws(() => engine.current({ taskFilePath: "/nonexistent/task.json" }), /not found/);
  });

  it("throws if task has no workflow metadata", () => {
    writeFileSync(taskFile, JSON.stringify({ description: "test" }));
    assert.throws(() => engine.current({ taskFilePath: taskFile }), /no workflow metadata/);
  });

  it("returns current step info", () => {
    // Initialize task
    engine.init({ workflowType: "simple", taskFilePath: taskFile });

    const result = engine.current({ taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
    assert.ok(result.instructions.includes("## Queued"));
  });

  it("reads task metadata correctly", () => {
    engine.init({ workflowType: "simple", taskFilePath: taskFile, description: "My task" });

    const result = engine.current({ taskFilePath: taskFile });
    assert.strictEqual(result.metadata.workflowType, "simple");
    assert.strictEqual(result.metadata.userDescription, "My task");
  });

  afterEach(() => {
    try {
      rmSync(taskDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});

// =============================================================================
// WorkflowEngine.next
// =============================================================================

describe("WorkflowEngine.next", () => {
  let store;
  let engine;
  let taskDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("simple", simpleWorkflow);
    store.loadDefinition("retry", retryWorkflow);

    taskDir = join(tmpdir(), `flow-test-${Date.now()}`);
    mkdirSync(taskDir, { recursive: true });
    taskFile = join(taskDir, "test-task.json");
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => engine.next({}), /taskFilePath is required/);
  });

  it("throws if result not provided", () => {
    engine.init({ workflowType: "simple", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> task1
    assert.throws(() => engine.next({ taskFilePath: taskFile }), /result is required/);
  });

  it("advances to next step on passed", () => {
    engine.init({ workflowType: "simple", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> task1

    const result = engine.next({ taskFilePath: taskFile, result: "passed" }); // task1 -> task2
    assert.strictEqual(result.currentStep, "task2");
    assert.ok(result.instructions.includes("## Task 2"));
  });

  it("advances to failure on failed", () => {
    engine.init({ workflowType: "simple", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> task1

    const result = engine.next({ taskFilePath: taskFile, result: "failed" }); // task1 -> end_failure
    assert.strictEqual(result.currentStep, "end_failure");
    assert.strictEqual(result.terminal, "failure");
    assert.ok(result.instructions.includes("## Failed"));
  });

  it("reaches success terminal", () => {
    engine.init({ workflowType: "simple", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> task1
    engine.next({ taskFilePath: taskFile, result: "passed" }); // task1 -> task2

    const result = engine.next({ taskFilePath: taskFile, result: "passed" }); // task2 -> end_success
    assert.strictEqual(result.currentStep, "end_success");
    assert.strictEqual(result.terminal, "success");
    assert.ok(result.instructions.includes("## Complete"));
  });

  it("retries on failure when retries available", () => {
    engine.init({ workflowType: "retry", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> work

    // First failure - should retry (retryCount: 0 -> 1)
    let result = engine.next({ taskFilePath: taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "work");
    assert.strictEqual(result.metadata.retryCount, 1);

    // Second failure - should retry (retryCount: 1 -> 2)
    result = engine.next({ taskFilePath: taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "work");
    assert.strictEqual(result.metadata.retryCount, 2);

    // Third failure - should escalate to HITL (retryCount: 2, maxRetries: 2)
    result = engine.next({ taskFilePath: taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "end_hitl");
    assert.strictEqual(result.terminal, "hitl");
    assert.ok(result.instructions.includes("## HITL"));
  });

  it("resets retryCount on successful advance", () => {
    engine.init({ workflowType: "retry", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> work
    engine.next({ taskFilePath: taskFile, result: "failed" }); // retry 1

    const result = engine.next({ taskFilePath: taskFile, result: "passed" }); // work -> end_success
    assert.strictEqual(result.metadata.retryCount, 0);
  });

  it("preserves retryCount through retry loop to prior step", () => {
    store.loadDefinition("retry-loop", retryLoopWorkflow);
    engine.init({ workflowType: "retry-loop", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> compute

    // First pass through compute -> check
    engine.next({ taskFilePath: taskFile, result: "passed" }); // compute -> check

    // First failure at check - should retry back to compute (retryCount: 0 -> 1)
    let result = engine.next({ taskFilePath: taskFile, result: "failed" }); // check -> compute
    assert.strictEqual(result.currentStep, "compute");
    assert.strictEqual(result.metadata.retryCount, 1);
    assert.strictEqual(result.metadata.retrySourceGate, "check");

    // Pass through compute again - retryCount should be preserved
    result = engine.next({ taskFilePath: taskFile, result: "passed" }); // compute -> check
    assert.strictEqual(result.currentStep, "check");
    assert.strictEqual(result.metadata.retryCount, 1); // NOT reset to 0!
    assert.strictEqual(result.metadata.retrySourceGate, "check");

    // Second failure at check - should retry (retryCount: 1 -> 2)
    result = engine.next({ taskFilePath: taskFile, result: "failed" }); // check -> compute
    assert.strictEqual(result.currentStep, "compute");
    assert.strictEqual(result.metadata.retryCount, 2);

    // Pass through compute again
    result = engine.next({ taskFilePath: taskFile, result: "passed" }); // compute -> check
    assert.strictEqual(result.currentStep, "check");
    assert.strictEqual(result.metadata.retryCount, 2); // preserved

    // Third failure at check - should escalate to HITL (maxRetries: 2 exceeded)
    result = engine.next({ taskFilePath: taskFile, result: "failed" }); // check -> end_hitl
    assert.strictEqual(result.currentStep, "end_hitl");
    assert.strictEqual(result.terminal, "hitl");
  });

  it("resets retryCount when gate passes after retries", () => {
    store.loadDefinition("retry-loop", retryLoopWorkflow);
    engine.init({ workflowType: "retry-loop", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> compute
    engine.next({ taskFilePath: taskFile, result: "passed" }); // compute -> check
    engine.next({ taskFilePath: taskFile, result: "failed" }); // check -> compute (retry 1)
    engine.next({ taskFilePath: taskFile, result: "passed" }); // compute -> check

    // Now pass the check - retryCount should reset
    const result = engine.next({ taskFilePath: taskFile, result: "passed" }); // check -> end_success
    assert.strictEqual(result.currentStep, "end_success");
    assert.strictEqual(result.metadata.retryCount, 0);
    assert.strictEqual(result.metadata.retrySourceGate, undefined);
  });

  it("persists state to task file", () => {
    engine.init({ workflowType: "simple", taskFilePath: taskFile, description: "Test" });
    engine.start({ taskFilePath: taskFile }); // start -> task1

    const task = readTaskFile(taskFile);
    assert.strictEqual(task.metadata.currentStep, "task1");
    assert.strictEqual(task.metadata.workflowType, "simple");
    assert.strictEqual(task.status, "in_progress");
  });

  it("updates task status to completed on success terminal", () => {
    engine.init({ workflowType: "simple", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> task1
    engine.next({ taskFilePath: taskFile, result: "passed" }); // task1 -> task2
    engine.next({ taskFilePath: taskFile, result: "passed" }); // task2 -> end_success

    const task = readTaskFile(taskFile);
    assert.strictEqual(task.status, "completed");
  });

  afterEach(() => {
    try {
      rmSync(taskDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});

// =============================================================================
// Fork/Join workflows
// =============================================================================

describe("Fork/Join instructions", () => {
  let store;
  let engine;
  let taskDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("fork", forkWorkflow);

    taskDir = join(tmpdir(), `flow-test-${Date.now()}`);
    mkdirSync(taskDir, { recursive: true });
    taskFile = join(taskDir, "test-task.json");
  });

  afterEach(() => {
    try {
      rmSync(taskDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("returns fork instructions with branch list", () => {
    const result = engine.init({ workflowType: "fork", stepId: "fork_work", taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "fork_work");
    assert.ok(result.instructions.includes("## Fork Work"));
    assert.ok(result.instructions.includes("Branches:"));
    assert.ok(result.instructions.includes("branch_a"));
    assert.ok(result.instructions.includes("branch_b"));
    assert.ok(result.instructions.includes("Branch A"));
    assert.ok(result.instructions.includes("Branch B"));
  });

  it("includes join node and max concurrency in fork instructions", () => {
    const result = engine.init({ workflowType: "fork", stepId: "fork_work", taskFilePath: taskFile });
    assert.ok(result.instructions.includes("Join: join_work"));
    assert.ok(result.instructions.includes("Max concurrency: 3"));
  });

  it("returns join instructions", () => {
    const result = engine.init({ workflowType: "fork", stepId: "join_work", taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "join_work");
    assert.ok(result.instructions.includes("## Join Work"));
    assert.ok(result.instructions.includes("Evaluate branch results"));
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe("Edge cases", () => {
  let store;
  let engine;
  let taskDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);

    taskDir = join(tmpdir(), `flow-test-${Date.now()}`);
    mkdirSync(taskDir, { recursive: true });
    taskFile = join(taskDir, "test-task.json");
  });

  afterEach(() => {
    try {
      rmSync(taskDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("handles workflow with no start node", () => {
    store.loadDefinition("bad", {
      nodes: { task: { type: "task", name: "Task" } },
      edges: [],
    });
    assert.throws(() => engine.init({ workflowType: "bad", taskFilePath: taskFile }), /no start node/);
  });

  it("handles invalid step ID", () => {
    store.loadDefinition("simple", simpleWorkflow);
    assert.throws(
      () => engine.init({ workflowType: "simple", stepId: "nonexistent", taskFilePath: taskFile }),
      /not found/
    );
  });

  it("handles workflow with no outgoing edges from step", () => {
    store.loadDefinition("dead-end", {
      nodes: {
        start: { type: "start" },
        dead: { type: "task", name: "Dead End" },
      },
      edges: [{ from: "start", to: "dead" }],
    });

    engine.init({ workflowType: "dead-end", taskFilePath: taskFile });
    engine.start({ taskFilePath: taskFile }); // start -> dead

    const result = engine.next({ taskFilePath: taskFile, result: "passed" });
    assert.ok(result.error);
    assert.strictEqual(result.error, "no_outgoing_edges");
  });
});
