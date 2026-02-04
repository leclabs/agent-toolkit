import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { getTerminalType, readTaskFile } from "./engine.js";
import { writeFileSync } from "fs";
import {
  createTestContext,
  cleanupTestContext,
  simpleWorkflow,
  retryWorkflow,
  forkWorkflow,
  retryLoopWorkflow,
} from "./test-helpers.js";

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
  let ctx;

  beforeEach(() => {
    ctx = createTestContext({ customWorkflows: { simple: simpleWorkflow } });
  });

  afterEach(() => {
    cleanupTestContext(ctx);
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => ctx.engine.init({}), /taskFilePath is required/);
  });

  it("throws if workflowType not provided for new init", () => {
    assert.throws(() => ctx.engine.init({ taskFilePath: ctx.taskFile }), /workflowType is required/);
  });

  it("throws if workflow not found", () => {
    assert.throws(() => ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "nonexistent" }), /not found/);
  });

  it("initializes at start node by default", () => {
    const result = ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple" });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
    assert.ok(result.instructions.includes("## Queued"));
    assert.ok(result.instructions.includes("→ Call Start()"));
  });

  it("returns prose instructions", () => {
    const result = ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple" });
    assert.ok(typeof result.instructions === "string");
    assert.ok(result.instructions.length > 0);
  });

  it("can init at specific step", () => {
    const result = ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple", stepId: "task1" });
    assert.strictEqual(result.currentStep, "task1");
    assert.ok(result.instructions.includes("## Task 1"));
    assert.ok(result.instructions.includes("Agent: Developer"));
  });

  it("stores description in metadata", () => {
    const result = ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple", description: "Test task" });
    assert.strictEqual(result.metadata.userDescription, "Test task");
    assert.strictEqual(result.metadata.workflowType, "simple");
  });

  it("stores stepName in metadata", () => {
    const result = ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple", stepId: "task1" });
    assert.strictEqual(result.metadata.stepName, "Task 1");
  });

  it("initializes retryCount to 0", () => {
    const result = ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple" });
    assert.strictEqual(result.metadata.retryCount, 0);
  });

  it("is idempotent - returns current state if already initialized", () => {
    // First init
    ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple", description: "Original" });

    // Second init without workflowType should return current state
    const result = ctx.engine.init({ taskFilePath: ctx.taskFile });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.metadata.userDescription, "Original");
  });
});

// =============================================================================
// WorkflowEngine.start (advance from start node)
// =============================================================================

describe("WorkflowEngine.start", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext({ customWorkflows: { simple: simpleWorkflow } });
  });

  afterEach(() => {
    cleanupTestContext(ctx);
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => ctx.engine.start({}), /taskFilePath is required/);
  });

  it("throws if task not initialized", () => {
    assert.throws(() => ctx.engine.start({ taskFilePath: ctx.taskFile }), /not found/);
  });

  it("advances from start node to first real step", () => {
    ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple" });
    const result = ctx.engine.start({ taskFilePath: ctx.taskFile });

    assert.strictEqual(result.currentStep, "task1");
    assert.strictEqual(result.terminal, null);
    assert.ok(result.instructions.includes("## Task 1"));
  });

  it("is idempotent - returns current state if not at start node", () => {
    ctx.engine.init({ taskFilePath: ctx.taskFile, workflowType: "simple" });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // Advance to task1

    // Call start again - should return current state
    const result = ctx.engine.start({ taskFilePath: ctx.taskFile });
    assert.strictEqual(result.currentStep, "task1");
  });
});

// =============================================================================
// WorkflowEngine.current
// =============================================================================

describe("WorkflowEngine.current", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext({ customWorkflows: { simple: simpleWorkflow } });
  });

  afterEach(() => {
    cleanupTestContext(ctx);
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => ctx.engine.current({}), /taskFilePath is required/);
  });

  it("throws if task file not found", () => {
    assert.throws(() => ctx.engine.current({ taskFilePath: "/nonexistent/task.json" }), /not found/);
  });

  it("throws if task has no workflow metadata", () => {
    writeFileSync(ctx.taskFile, JSON.stringify({ description: "test" }));
    assert.throws(() => ctx.engine.current({ taskFilePath: ctx.taskFile }), /no workflow metadata/);
  });

  it("returns current step info", () => {
    ctx.engine.init({ workflowType: "simple", taskFilePath: ctx.taskFile });

    const result = ctx.engine.current({ taskFilePath: ctx.taskFile });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
    assert.ok(result.instructions.includes("## Queued"));
  });

  it("reads task metadata correctly", () => {
    ctx.engine.init({ workflowType: "simple", taskFilePath: ctx.taskFile, description: "My task" });

    const result = ctx.engine.current({ taskFilePath: ctx.taskFile });
    assert.strictEqual(result.metadata.workflowType, "simple");
    assert.strictEqual(result.metadata.userDescription, "My task");
  });
});

// =============================================================================
// WorkflowEngine.next
// =============================================================================

describe("WorkflowEngine.next", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext({
      customWorkflows: {
        simple: simpleWorkflow,
        retry: retryWorkflow,
      },
    });
  });

  afterEach(() => {
    cleanupTestContext(ctx);
  });

  it("throws if taskFilePath not provided", () => {
    assert.throws(() => ctx.engine.next({}), /taskFilePath is required/);
  });

  it("throws if result not provided", () => {
    ctx.engine.init({ workflowType: "simple", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> task1
    assert.throws(() => ctx.engine.next({ taskFilePath: ctx.taskFile }), /result is required/);
  });

  it("advances to next step on passed", () => {
    ctx.engine.init({ workflowType: "simple", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> task1

    const result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // task1 -> task2
    assert.strictEqual(result.currentStep, "task2");
    assert.ok(result.instructions.includes("## Task 2"));
  });

  it("advances to failure on failed", () => {
    ctx.engine.init({ workflowType: "simple", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> task1

    const result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" }); // task1 -> end_failure
    assert.strictEqual(result.currentStep, "end_failure");
    assert.strictEqual(result.terminal, "failure");
    assert.ok(result.instructions.includes("## Failed"));
  });

  it("reaches success terminal", () => {
    ctx.engine.init({ workflowType: "simple", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> task1
    ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // task1 -> task2

    const result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // task2 -> end_success
    assert.strictEqual(result.currentStep, "end_success");
    assert.strictEqual(result.terminal, "success");
    assert.ok(result.instructions.includes("## Complete"));
  });

  it("retries on failure when retries available", () => {
    ctx.engine.init({ workflowType: "retry", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> work

    // First failure - should retry (retryCount: 0 -> 1)
    let result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "work");
    assert.strictEqual(result.metadata.retryCount, 1);

    // Second failure - should retry (retryCount: 1 -> 2)
    result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "work");
    assert.strictEqual(result.metadata.retryCount, 2);

    // Third failure - should escalate to HITL (retryCount: 2, maxRetries: 2)
    result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" });
    assert.strictEqual(result.currentStep, "end_hitl");
    assert.strictEqual(result.terminal, "hitl");
    assert.ok(result.instructions.includes("## HITL"));
  });

  it("resets retryCount on successful advance", () => {
    ctx.engine.init({ workflowType: "retry", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> work
    ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" }); // retry 1

    const result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // work -> end_success
    assert.strictEqual(result.metadata.retryCount, 0);
  });

  it("preserves retryCount through retry loop to prior step", () => {
    ctx.store.loadDefinition("retry-loop", retryLoopWorkflow);
    ctx.engine.init({ workflowType: "retry-loop", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> compute

    // First pass through compute -> check
    ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // compute -> check

    // First failure at check - should retry back to compute (retryCount: 0 -> 1)
    let result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" }); // check -> compute
    assert.strictEqual(result.currentStep, "compute");
    assert.strictEqual(result.metadata.retryCount, 1);
    assert.strictEqual(result.metadata.retrySourceGate, "check");

    // Pass through compute again - retryCount should be preserved
    result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // compute -> check
    assert.strictEqual(result.currentStep, "check");
    assert.strictEqual(result.metadata.retryCount, 1); // NOT reset to 0!
    assert.strictEqual(result.metadata.retrySourceGate, "check");

    // Second failure at check - should retry (retryCount: 1 -> 2)
    result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" }); // check -> compute
    assert.strictEqual(result.currentStep, "compute");
    assert.strictEqual(result.metadata.retryCount, 2);

    // Pass through compute again
    result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // compute -> check
    assert.strictEqual(result.currentStep, "check");
    assert.strictEqual(result.metadata.retryCount, 2); // preserved

    // Third failure at check - should escalate to HITL (maxRetries: 2 exceeded)
    result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" }); // check -> end_hitl
    assert.strictEqual(result.currentStep, "end_hitl");
    assert.strictEqual(result.terminal, "hitl");
  });

  it("resets retryCount when gate passes after retries", () => {
    ctx.store.loadDefinition("retry-loop", retryLoopWorkflow);
    ctx.engine.init({ workflowType: "retry-loop", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> compute
    ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // compute -> check
    ctx.engine.next({ taskFilePath: ctx.taskFile, result: "failed" }); // check -> compute (retry 1)
    ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // compute -> check

    // Now pass the check - retryCount should reset
    const result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // check -> end_success
    assert.strictEqual(result.currentStep, "end_success");
    assert.strictEqual(result.metadata.retryCount, 0);
    assert.strictEqual(result.metadata.retrySourceGate, undefined);
  });

  it("persists state to task file", () => {
    ctx.engine.init({ workflowType: "simple", taskFilePath: ctx.taskFile, description: "Test" });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> task1

    const task = readTaskFile(ctx.taskFile);
    assert.strictEqual(task.metadata.currentStep, "task1");
    assert.strictEqual(task.metadata.workflowType, "simple");
    assert.strictEqual(task.status, "in_progress");
  });

  it("updates task status to completed on success terminal", () => {
    ctx.engine.init({ workflowType: "simple", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> task1
    ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // task1 -> task2
    ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" }); // task2 -> end_success

    const task = readTaskFile(ctx.taskFile);
    assert.strictEqual(task.status, "completed");
  });
});

// =============================================================================
// Fork/Join workflows
// =============================================================================

describe("Fork/Join instructions", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext({ customWorkflows: { fork: forkWorkflow } });
  });

  afterEach(() => {
    cleanupTestContext(ctx);
  });

  it("returns fork instructions with branch list", () => {
    const result = ctx.engine.init({ workflowType: "fork", stepId: "fork_work", taskFilePath: ctx.taskFile });
    assert.strictEqual(result.currentStep, "fork_work");
    assert.ok(result.instructions.includes("## Fork Work"));
    assert.ok(result.instructions.includes("Branches:"));
    assert.ok(result.instructions.includes("branch_a"));
    assert.ok(result.instructions.includes("branch_b"));
    assert.ok(result.instructions.includes("Branch A"));
    assert.ok(result.instructions.includes("Branch B"));
  });

  it("includes join node and max concurrency in fork instructions", () => {
    const result = ctx.engine.init({ workflowType: "fork", stepId: "fork_work", taskFilePath: ctx.taskFile });
    assert.ok(result.instructions.includes("Join: join_work"));
    assert.ok(result.instructions.includes("Max concurrency: 3"));
  });

  it("returns join instructions", () => {
    const result = ctx.engine.init({ workflowType: "fork", stepId: "join_work", taskFilePath: ctx.taskFile });
    assert.strictEqual(result.currentStep, "join_work");
    assert.ok(result.instructions.includes("## Join Work"));
    assert.ok(result.instructions.includes("Evaluate branch results"));
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe("Edge cases", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    cleanupTestContext(ctx);
  });

  it("handles workflow with no start node", () => {
    ctx.store.loadDefinition("bad", {
      nodes: { task: { type: "task", name: "Task" } },
      edges: [],
    });
    assert.throws(() => ctx.engine.init({ workflowType: "bad", taskFilePath: ctx.taskFile }), /no start node/);
  });

  it("handles invalid step ID", () => {
    ctx.store.loadDefinition("simple", simpleWorkflow);
    assert.throws(
      () => ctx.engine.init({ workflowType: "simple", stepId: "nonexistent", taskFilePath: ctx.taskFile }),
      /not found/
    );
  });

  it("handles workflow with no outgoing edges from step", () => {
    ctx.store.loadDefinition("dead-end", {
      nodes: {
        start: { type: "start" },
        dead: { type: "task", name: "Dead End" },
      },
      edges: [{ from: "start", to: "dead" }],
    });

    ctx.engine.init({ workflowType: "dead-end", taskFilePath: ctx.taskFile });
    ctx.engine.start({ taskFilePath: ctx.taskFile }); // start -> dead

    const result = ctx.engine.next({ taskFilePath: ctx.taskFile, result: "passed" });
    assert.ok(result.error);
    assert.strictEqual(result.error, "no_outgoing_edges");
  });
});
