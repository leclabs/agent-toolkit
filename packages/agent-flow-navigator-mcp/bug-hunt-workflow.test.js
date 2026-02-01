import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { WorkflowEngine } from "./engine.js";
import { WorkflowStore, validateWorkflow } from "./store.js";
import { buildWorkflowSummary } from "./catalog.js";
import { generateDiagram } from "./diagram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUG_HUNT_PATH = join(__dirname, "catalog", "workflows", "bug-hunt.json");

/**
 * Load the bug-hunt workflow JSON from the catalog
 */
function loadBugHuntWorkflow() {
  return JSON.parse(readFileSync(BUG_HUNT_PATH, "utf-8"));
}

// =============================================================================
// Bug Hunt workflow - JSON structure validation
// =============================================================================

describe("bug-hunt workflow JSON structure", () => {
  let workflow;

  beforeEach(() => {
    workflow = loadBugHuntWorkflow();
  });

  it("should have id 'bug-hunt'", () => {
    assert.strictEqual(workflow.id, "bug-hunt");
  });

  it("should have name 'Bug Hunt'", () => {
    assert.strictEqual(workflow.name, "Bug Hunt");
  });

  it("should have a description", () => {
    assert.ok(workflow.description);
    assert.ok(workflow.description.length > 0);
  });

  it("should pass validateWorkflow", () => {
    assert.strictEqual(validateWorkflow("bug-hunt", workflow), true);
  });

  it("should have expected node count", () => {
    const nodeIds = Object.keys(workflow.nodes);
    // start, triage, fork_investigate, reproduce, code_archaeology, git_forensics,
    // join_investigate, synthesize, write_fix, add_regression_test, verify_fix,
    // lint_format, commit, end_success, hitl_inconclusive, hitl_fix_failed
    assert.strictEqual(nodeIds.length, 16);
  });

  it("should have a start node", () => {
    assert.ok(workflow.nodes.start);
    assert.strictEqual(workflow.nodes.start.type, "start");
  });

  it("should have a success end node", () => {
    assert.ok(workflow.nodes.end_success);
    assert.strictEqual(workflow.nodes.end_success.type, "end");
    assert.strictEqual(workflow.nodes.end_success.result, "success");
  });

  it("should have two HITL escalation nodes", () => {
    const hitlInconclusive = workflow.nodes.hitl_inconclusive;
    assert.ok(hitlInconclusive);
    assert.strictEqual(hitlInconclusive.type, "end");
    assert.strictEqual(hitlInconclusive.result, "blocked");
    assert.strictEqual(hitlInconclusive.escalation, "hitl");

    const hitlFixFailed = workflow.nodes.hitl_fix_failed;
    assert.ok(hitlFixFailed);
    assert.strictEqual(hitlFixFailed.type, "end");
    assert.strictEqual(hitlFixFailed.result, "blocked");
    assert.strictEqual(hitlFixFailed.escalation, "hitl");
  });

  it("should have a fork node with three branches", () => {
    const fork = workflow.nodes.fork_investigate;
    assert.ok(fork);
    assert.strictEqual(fork.type, "fork");
    assert.strictEqual(fork.join, "join_investigate");
    assert.ok(fork.branches.reproduce);
    assert.ok(fork.branches.code_archaeology);
    assert.ok(fork.branches.git_forensics);
    assert.strictEqual(fork.branches.reproduce.entryStep, "reproduce");
    assert.strictEqual(fork.branches.code_archaeology.entryStep, "code_archaeology");
    assert.strictEqual(fork.branches.git_forensics.entryStep, "git_forensics");
  });

  it("should have a join node referencing the fork", () => {
    const join = workflow.nodes.join_investigate;
    assert.ok(join);
    assert.strictEqual(join.type, "join");
    assert.strictEqual(join.fork, "fork_investigate");
    assert.strictEqual(join.strategy, "all-pass");
  });

  it("should have two gate nodes with maxRetries", () => {
    const gates = ["verify_fix", "lint_format"];
    for (const gateId of gates) {
      const node = workflow.nodes[gateId];
      assert.ok(node, `Gate node '${gateId}' should exist`);
      assert.strictEqual(node.type, "gate", `'${gateId}' should be type gate`);
      assert.ok(typeof node.maxRetries === "number", `'${gateId}' should have maxRetries`);
    }
  });

  it("should have verify_fix with maxRetries 3", () => {
    assert.strictEqual(workflow.nodes.verify_fix.maxRetries, 3);
  });

  it("should have lint_format with maxRetries 3", () => {
    assert.strictEqual(workflow.nodes.lint_format.maxRetries, 3);
  });

  it("should assign correct stages to nodes", () => {
    assert.strictEqual(workflow.nodes.triage.stage, "planning");
    assert.strictEqual(workflow.nodes.reproduce.stage, "investigation");
    assert.strictEqual(workflow.nodes.code_archaeology.stage, "investigation");
    assert.strictEqual(workflow.nodes.git_forensics.stage, "investigation");
    assert.strictEqual(workflow.nodes.synthesize.stage, "planning");
    assert.strictEqual(workflow.nodes.write_fix.stage, "development");
    assert.strictEqual(workflow.nodes.add_regression_test.stage, "development");
    assert.strictEqual(workflow.nodes.verify_fix.stage, "verification");
    assert.strictEqual(workflow.nodes.lint_format.stage, "delivery");
    assert.strictEqual(workflow.nodes.commit.stage, "delivery");
  });

  it("should assign correct agents to nodes", () => {
    assert.strictEqual(workflow.nodes.triage.agent, "Investigator");
    assert.strictEqual(workflow.nodes.reproduce.agent, "Tester");
    assert.strictEqual(workflow.nodes.code_archaeology.agent, "Investigator");
    assert.strictEqual(workflow.nodes.git_forensics.agent, "Investigator");
    assert.strictEqual(workflow.nodes.synthesize.agent, "Architect");
    assert.strictEqual(workflow.nodes.write_fix.agent, "Developer");
    assert.strictEqual(workflow.nodes.add_regression_test.agent, "Tester");
    assert.strictEqual(workflow.nodes.verify_fix.agent, "Tester");
    assert.strictEqual(workflow.nodes.lint_format.agent, "Developer");
    assert.strictEqual(workflow.nodes.commit.agent, "Developer");
  });
});

// =============================================================================
// Bug Hunt workflow - Engine navigation (happy path)
// =============================================================================

describe("bug-hunt workflow engine navigation - happy path", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should start at triage", () => {
    const result = engine.navigate({ workflowType: "bug-hunt" });
    assert.strictEqual(result.currentStep, "triage");
    assert.strictEqual(result.action, "start");
  });

  it("should advance from triage to fork_investigate", () => {
    const result = engine.evaluateEdge("bug-hunt", "triage", "passed", 0);
    assert.strictEqual(result.nextStep, "fork_investigate");
  });

  it("should return fork response when navigating to fork_investigate", () => {
    const nav = engine.navigate({
      workflowType: "bug-hunt",
      taskFilePath: null,
    });
    assert.strictEqual(nav.currentStep, "triage");

    // Start at triage, then simulate advancing to fork
    const forkEdge = engine.evaluateEdge("bug-hunt", "triage", "passed", 0);
    assert.strictEqual(forkEdge.nextStep, "fork_investigate");

    // The fork node should have branches metadata
    const workflow = loadBugHuntWorkflow();
    const forkNode = workflow.nodes.fork_investigate;
    assert.strictEqual(Object.keys(forkNode.branches).length, 3);
  });

  it("should advance from each branch to join_investigate", () => {
    const r1 = engine.evaluateEdge("bug-hunt", "reproduce", "passed", 0);
    assert.strictEqual(r1.nextStep, "join_investigate");

    const r2 = engine.evaluateEdge("bug-hunt", "code_archaeology", "passed", 0);
    assert.strictEqual(r2.nextStep, "join_investigate");

    const r3 = engine.evaluateEdge("bug-hunt", "git_forensics", "passed", 0);
    assert.strictEqual(r3.nextStep, "join_investigate");
  });

  it("should advance from join_investigate passed to synthesize", () => {
    const result = engine.evaluateEdge("bug-hunt", "join_investigate", "passed", 0);
    assert.strictEqual(result.nextStep, "synthesize");
    assert.strictEqual(result.action, "conditional");
  });

  it("should follow the fix chain: synthesize -> write_fix -> add_regression_test -> verify_fix", () => {
    const r1 = engine.evaluateEdge("bug-hunt", "synthesize", "passed", 0);
    assert.strictEqual(r1.nextStep, "write_fix");

    const r2 = engine.evaluateEdge("bug-hunt", "write_fix", "passed", 0);
    assert.strictEqual(r2.nextStep, "add_regression_test");

    const r3 = engine.evaluateEdge("bug-hunt", "add_regression_test", "passed", 0);
    assert.strictEqual(r3.nextStep, "verify_fix");
  });

  it("should advance from verify_fix passed to lint_format", () => {
    const result = engine.evaluateEdge("bug-hunt", "verify_fix", "passed", 0);
    assert.strictEqual(result.nextStep, "lint_format");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from lint_format passed to commit", () => {
    const result = engine.evaluateEdge("bug-hunt", "lint_format", "passed", 0);
    assert.strictEqual(result.nextStep, "commit");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from commit to end_success", () => {
    const result = engine.evaluateEdge("bug-hunt", "commit", "passed", 0);
    assert.strictEqual(result.nextStep, "end_success");
  });

  it("should recognize end_success as terminal", () => {
    const result = engine.evaluateEdge("bug-hunt", "end_success", "passed", 0);
    assert.strictEqual(result.nextStep, null);
    assert.strictEqual(result.action, "no_outgoing_edges");
  });
});

// =============================================================================
// Bug Hunt workflow - Fork/Join behavior
// =============================================================================

describe("bug-hunt workflow fork/join behavior", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should return fork metadata when advancing to fork_investigate", () => {
    // Navigate: start -> triage, then advance triage -> fork_investigate
    const nav = engine.navigate({ workflowType: "bug-hunt" });
    assert.strictEqual(nav.currentStep, "triage");

    // Simulate advancing from triage to fork_investigate via navigate
    // We need to check the fork response shape
    const workflow = loadBugHuntWorkflow();
    const forkNode = workflow.nodes.fork_investigate;
    assert.strictEqual(forkNode.type, "fork");
    assert.deepStrictEqual(Object.keys(forkNode.branches).sort(), ["code_archaeology", "git_forensics", "reproduce"]);
    assert.strictEqual(forkNode.join, "join_investigate");
  });

  it("should advance from join_investigate to hitl_inconclusive on failed", () => {
    const result = engine.evaluateEdge("bug-hunt", "join_investigate", "failed", 0);
    assert.strictEqual(result.nextStep, "hitl_inconclusive");
  });

  it("should return join metadata when getting current state at join_investigate", () => {
    const workflow = loadBugHuntWorkflow();
    const joinNode = workflow.nodes.join_investigate;
    assert.strictEqual(joinNode.type, "join");
    assert.strictEqual(joinNode.fork, "fork_investigate");
    assert.strictEqual(joinNode.strategy, "all-pass");
  });

  it("should advance from fork node with passed result to post-join step (synthesize)", () => {
    // Simulate: parent task is at fork_investigate, orchestrator completed all branches
    // Calling navigate with result should route through the join to synthesize
    const tmpDir = mkdtempSync(join(tmpdir(), "nav-fork-"));
    const taskFile = join(tmpDir, "1.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "test",
        description: "test",
        activeForm: "test",
        status: "in_progress",
        metadata: { workflowType: "bug-hunt", currentStep: "fork_investigate", retryCount: 0 },
      })
    );

    const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

    assert.strictEqual(result.currentStep, "synthesize");
    assert.strictEqual(result.action, "advance");
    assert.strictEqual(result.subagent, "flow:Architect");
    assert.strictEqual(result.terminal, null);

    rmSync(tmpDir, { recursive: true });
  });

  it("should advance from fork node with failed result to hitl_inconclusive", () => {
    // Simulate: parent task at fork, one branch failed, all-pass strategy → failed
    const tmpDir = mkdtempSync(join(tmpdir(), "nav-fork-"));
    const taskFile = join(tmpDir, "1.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "test",
        description: "test",
        activeForm: "test",
        status: "in_progress",
        metadata: { workflowType: "bug-hunt", currentStep: "fork_investigate", retryCount: 0 },
      })
    );

    const result = engine.navigate({ taskFilePath: taskFile, result: "failed" });

    assert.strictEqual(result.currentStep, "hitl_inconclusive");
    assert.strictEqual(result.terminal, "hitl");

    rmSync(tmpDir, { recursive: true });
  });

  it("should return enriched fork response with per-branch step info", () => {
    // Navigate to fork_investigate via triage → fork
    const tmpDir = mkdtempSync(join(tmpdir(), "nav-fork-enriched-"));
    const taskFile = join(tmpDir, "1.json");
    writeFileSync(
      taskFile,
      JSON.stringify({
        id: "1",
        subject: "test",
        description: "test",
        activeForm: "test",
        status: "in_progress",
        metadata: { workflowType: "bug-hunt", currentStep: "triage", retryCount: 0 },
      })
    );

    const result = engine.navigate({ taskFilePath: taskFile, result: "passed" });

    assert.strictEqual(result.currentStep, "fork_investigate");
    assert.strictEqual(result.action, "fork");
    assert.ok(result.fork);
    assert.strictEqual(result.fork.joinStep, "join_investigate");
    assert.strictEqual(result.fork.joinStrategy, "all-pass");

    // Reproduce branch
    const reproduce = result.fork.branches.reproduce;
    assert.strictEqual(reproduce.entryStep, "reproduce");
    assert.strictEqual(reproduce.subagent, "flow:Tester");
    assert.strictEqual(reproduce.stage, "investigation");
    assert.ok(reproduce.stepInstructions);
    assert.strictEqual(reproduce.stepInstructions.name, "Reproduce Bug");
    assert.ok(reproduce.orchestratorInstructions);
    assert.strictEqual(reproduce.multiStep, false); // reproduce → join_investigate directly
    assert.strictEqual(reproduce.maxRetries, 0);
    assert.ok(reproduce.metadata);
    assert.strictEqual(reproduce.metadata.workflowType, "bug-hunt");
    assert.strictEqual(reproduce.metadata.currentStep, "reproduce");

    // Code archaeology branch
    const archaeology = result.fork.branches.code_archaeology;
    assert.strictEqual(archaeology.entryStep, "code_archaeology");
    assert.strictEqual(archaeology.subagent, "flow:Investigator");
    assert.strictEqual(archaeology.stage, "investigation");
    assert.strictEqual(archaeology.multiStep, false); // code_archaeology → join_investigate directly

    // Git forensics branch
    const forensics = result.fork.branches.git_forensics;
    assert.strictEqual(forensics.entryStep, "git_forensics");
    assert.strictEqual(forensics.subagent, "flow:Investigator");
    assert.strictEqual(forensics.stage, "investigation");
    assert.strictEqual(forensics.multiStep, false); // git_forensics → join_investigate directly

    rmSync(tmpDir, { recursive: true });
  });

  it("should return enriched fork response at start with stepId", () => {
    const result = engine.navigate({ workflowType: "bug-hunt", stepId: "fork_investigate" });

    assert.strictEqual(result.currentStep, "fork_investigate");
    assert.strictEqual(result.action, "fork");
    assert.strictEqual(result.fork.joinStrategy, "all-pass");

    // All 3 branches should have enriched data
    for (const branchName of ["reproduce", "code_archaeology", "git_forensics"]) {
      const branch = result.fork.branches[branchName];
      assert.ok(branch.subagent, `${branchName} should have subagent`);
      assert.ok(branch.stage, `${branchName} should have stage`);
      assert.ok(branch.stepInstructions, `${branchName} should have stepInstructions`);
      assert.ok(branch.orchestratorInstructions, `${branchName} should have orchestratorInstructions`);
      assert.strictEqual(branch.multiStep, false, `${branchName} should be single-step`);
      assert.ok(branch.metadata, `${branchName} should have metadata`);
    }
  });
});

// =============================================================================
// Bug Hunt workflow - Gate retry/escalation behavior
// =============================================================================

describe("bug-hunt workflow gate behavior", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  // --- verify_fix gate (maxRetries: 3) ---

  describe("verify_fix gate", () => {
    it("should retry to write_fix on failure with retries remaining", () => {
      const result = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 0);
      assert.strictEqual(result.nextStep, "write_fix");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 2);
    });

    it("should retry on second failure (retryCount = 1)", () => {
      const result = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 1);
      assert.strictEqual(result.nextStep, "write_fix");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 1);
    });

    it("should retry on third failure (retryCount = 2)", () => {
      const result = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 2);
      assert.strictEqual(result.nextStep, "write_fix");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 0);
    });

    it("should escalate to hitl_fix_failed when retries exhausted", () => {
      const result = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 3);
      assert.strictEqual(result.nextStep, "hitl_fix_failed");
      assert.strictEqual(result.action, "escalate");
    });
  });

  // --- lint_format gate (maxRetries: 3) ---

  describe("lint_format gate", () => {
    it("should retry to write_fix on failure with retries remaining", () => {
      const result = engine.evaluateEdge("bug-hunt", "lint_format", "failed", 0);
      assert.strictEqual(result.nextStep, "write_fix");
      assert.strictEqual(result.action, "retry");
    });

    it("should escalate to hitl_fix_failed when retries exhausted", () => {
      const result = engine.evaluateEdge("bug-hunt", "lint_format", "failed", 3);
      assert.strictEqual(result.nextStep, "hitl_fix_failed");
      assert.strictEqual(result.action, "escalate");
    });
  });
});

// =============================================================================
// Bug Hunt workflow - Catalog integration
// =============================================================================

describe("bug-hunt workflow catalog integration", () => {
  it("should produce a valid workflow summary via buildWorkflowSummary", () => {
    const workflow = loadBugHuntWorkflow();
    const summary = buildWorkflowSummary("bug-hunt", workflow);

    assert.strictEqual(summary.id, "bug-hunt");
    assert.strictEqual(summary.name, "Bug Hunt");
    assert.ok(summary.description.length > 0);
    assert.strictEqual(summary.stepCount, 16);
  });
});

// =============================================================================
// Bug Hunt workflow - Diagram generation
// =============================================================================

describe("bug-hunt workflow diagram generation", () => {
  it("should generate a mermaid diagram without errors", () => {
    const workflow = loadBugHuntWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes("```mermaid"));
    assert.ok(diagram.includes("flowchart TD"));
    assert.ok(diagram.includes("## Workflow: Bug Hunt"));
  });

  it("should include gate nodes as diamonds in the diagram", () => {
    const workflow = loadBugHuntWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes('verify_fix{"Verify Fix"}'));
    assert.ok(diagram.includes('lint_format{"Lint and Format"}'));
  });

  it("should highlight a step when currentStep is provided", () => {
    const workflow = loadBugHuntWorkflow();
    const diagram = generateDiagram(workflow, "synthesize");

    assert.ok(diagram.includes("class synthesize currentStep"));
  });

  it("should include the step instructions table with key nodes", () => {
    const workflow = loadBugHuntWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes("### Step Instructions"));
    assert.ok(diagram.includes("triage"));
    assert.ok(diagram.includes("reproduce"));
    assert.ok(diagram.includes("synthesize"));
    assert.ok(diagram.includes("write_fix"));
    assert.ok(diagram.includes("commit"));
  });
});

// =============================================================================
// Bug Hunt workflow - Mid-flow start with stepId
// =============================================================================

describe("bug-hunt workflow mid-flow start", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should start at write_fix mid-flow", () => {
    const result = engine.navigate({ workflowType: "bug-hunt", stepId: "write_fix" });

    assert.strictEqual(result.currentStep, "write_fix");
    assert.strictEqual(result.action, "start");
    assert.strictEqual(result.stage, "development");
    assert.strictEqual(result.subagent, "flow:Developer");
    assert.strictEqual(result.terminal, null);
    assert.ok(result.stepInstructions);
    assert.strictEqual(result.metadata.retryCount, 0);
  });

  it("should start at synthesize mid-flow", () => {
    const result = engine.navigate({ workflowType: "bug-hunt", stepId: "synthesize" });

    assert.strictEqual(result.currentStep, "synthesize");
    assert.strictEqual(result.action, "start");
    assert.strictEqual(result.stage, "planning");
    assert.strictEqual(result.subagent, "flow:Architect");
  });

  it("should start at fork_investigate and return fork response", () => {
    const result = engine.navigate({ workflowType: "bug-hunt", stepId: "fork_investigate" });

    assert.strictEqual(result.currentStep, "fork_investigate");
    assert.strictEqual(result.action, "fork");
    assert.ok(result.fork);
    assert.strictEqual(result.fork.joinStep, "join_investigate");
    assert.ok(result.fork.branches.reproduce);
    assert.ok(result.fork.branches.code_archaeology);
    assert.ok(result.fork.branches.git_forensics);
  });

  it("should reject starting at start node", () => {
    assert.throws(() => engine.navigate({ workflowType: "bug-hunt", stepId: "start" }), /Cannot start at start node/);
  });

  it("should reject starting at end_success node", () => {
    assert.throws(
      () => engine.navigate({ workflowType: "bug-hunt", stepId: "end_success" }),
      /Cannot start at end node/
    );
  });
});

// =============================================================================
// Bug Hunt workflow - Full walkthrough simulation
// =============================================================================

describe("bug-hunt workflow full walkthrough", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should complete a full happy-path traversal from start to end_success", () => {
    // This simulates the entire happy path using evaluateEdge
    // Note: fork/join are control-flow nodes handled by the orchestrator,
    // so we test the edges through them
    const steps = [
      { from: "start", expected: "triage" },
      { from: "triage", expected: "fork_investigate" },
      // Fork branches (parallel, each reaches join)
      { from: "reproduce", expected: "join_investigate" },
      { from: "code_archaeology", expected: "join_investigate" },
      { from: "git_forensics", expected: "join_investigate" },
      // Join -> synthesize
      { from: "join_investigate", expected: "synthesize", result: "passed" },
      // Fix chain
      { from: "synthesize", expected: "write_fix" },
      { from: "write_fix", expected: "add_regression_test" },
      { from: "add_regression_test", expected: "verify_fix" },
      { from: "verify_fix", expected: "lint_format", result: "passed" },
      { from: "lint_format", expected: "commit", result: "passed" },
      { from: "commit", expected: "end_success" },
    ];

    for (const step of steps) {
      const result = engine.evaluateEdge("bug-hunt", step.from, step.result || "passed", 0);
      assert.strictEqual(
        result.nextStep,
        step.expected,
        `From '${step.from}' expected '${step.expected}' but got '${result.nextStep}'`
      );
    }
  });

  it("should reach hitl_inconclusive when join fails", () => {
    const result = engine.evaluateEdge("bug-hunt", "join_investigate", "failed", 0);
    assert.strictEqual(result.nextStep, "hitl_inconclusive");
  });

  it("should reach hitl_fix_failed after verify_fix exhausts retries", () => {
    const retry1 = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 0);
    assert.strictEqual(retry1.action, "retry");

    const retry2 = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 1);
    assert.strictEqual(retry2.action, "retry");

    const retry3 = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 2);
    assert.strictEqual(retry3.action, "retry");

    const escalate = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 3);
    assert.strictEqual(escalate.nextStep, "hitl_fix_failed");
    assert.strictEqual(escalate.action, "escalate");
  });

  it("should reach hitl_fix_failed after lint_format exhausts retries", () => {
    const retry1 = engine.evaluateEdge("bug-hunt", "lint_format", "failed", 0);
    assert.strictEqual(retry1.action, "retry");

    const retry2 = engine.evaluateEdge("bug-hunt", "lint_format", "failed", 1);
    assert.strictEqual(retry2.action, "retry");

    const retry3 = engine.evaluateEdge("bug-hunt", "lint_format", "failed", 2);
    assert.strictEqual(retry3.action, "retry");

    const escalate = engine.evaluateEdge("bug-hunt", "lint_format", "failed", 3);
    assert.strictEqual(escalate.nextStep, "hitl_fix_failed");
    assert.strictEqual(escalate.action, "escalate");
  });
});

// =============================================================================
// Bug Hunt workflow - HITL resume behavior
// =============================================================================

describe("bug-hunt workflow HITL resume", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should have recovery edges from both HITL nodes", () => {
    const workflow = loadBugHuntWorkflow();

    const inconclusiveRecovery = workflow.edges.find((e) => e.from === "hitl_inconclusive" && e.on === "passed");
    assert.ok(inconclusiveRecovery, "hitl_inconclusive should have a recovery edge");
    assert.strictEqual(inconclusiveRecovery.to, "triage");

    const fixRecovery = workflow.edges.find((e) => e.from === "hitl_fix_failed" && e.on === "passed");
    assert.ok(fixRecovery, "hitl_fix_failed should have a recovery edge");
    assert.strictEqual(fixRecovery.to, "write_fix");
  });

  it("should advance from hitl_inconclusive to triage on passed", () => {
    const result = engine.evaluateEdge("bug-hunt", "hitl_inconclusive", "passed", 0);
    assert.strictEqual(result.nextStep, "triage");
  });

  it("should advance from hitl_fix_failed to write_fix on passed", () => {
    const result = engine.evaluateEdge("bug-hunt", "hitl_fix_failed", "passed", 0);
    assert.strictEqual(result.nextStep, "write_fix");
  });

  it("should resume workflow end-to-end after inconclusive HITL recovery", () => {
    // Join fails → hitl_inconclusive
    const escalate = engine.evaluateEdge("bug-hunt", "join_investigate", "failed", 0);
    assert.strictEqual(escalate.nextStep, "hitl_inconclusive");

    // Human provides context → resume at triage
    const resume = engine.evaluateEdge("bug-hunt", "hitl_inconclusive", "passed", 0);
    assert.strictEqual(resume.nextStep, "triage");

    // Continue: triage -> fork_investigate
    const fork = engine.evaluateEdge("bug-hunt", "triage", "passed", 0);
    assert.strictEqual(fork.nextStep, "fork_investigate");
  });

  it("should resume workflow end-to-end after fix HITL recovery", () => {
    // verify_fix exhausts retries → hitl_fix_failed
    const escalate = engine.evaluateEdge("bug-hunt", "verify_fix", "failed", 3);
    assert.strictEqual(escalate.nextStep, "hitl_fix_failed");
    assert.strictEqual(escalate.action, "escalate");

    // Human resolves → resume at write_fix
    const resume = engine.evaluateEdge("bug-hunt", "hitl_fix_failed", "passed", 0);
    assert.strictEqual(resume.nextStep, "write_fix");

    // Continue happy path from write_fix
    const regTest = engine.evaluateEdge("bug-hunt", "write_fix", "passed", 0);
    assert.strictEqual(regTest.nextStep, "add_regression_test");
  });
});

// =============================================================================
// Context-gather workflow - failure edge and multi-step validation
// =============================================================================

const CONTEXT_GATHER_PATH = join(__dirname, "catalog", "workflows", "context-gather.json");

function loadContextGatherWorkflow() {
  return JSON.parse(readFileSync(CONTEXT_GATHER_PATH, "utf-8"));
}

describe("context-gather workflow edge coverage", () => {
  let store, engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("context-gather", loadContextGatherWorkflow());
  });

  it("should have failure edge from repo_info to join_gather", () => {
    const result = engine.evaluateEdge("context-gather", "repo_info", "failed", 0);
    assert.strictEqual(result.nextStep, "join_gather");
  });

  it("should advance repo_info to repo_analyze on passed", () => {
    const result = engine.evaluateEdge("context-gather", "repo_info", "passed", 0);
    assert.strictEqual(result.nextStep, "repo_analyze");
  });

  it("should mark repo branch as multiStep and system/weather as single-step", () => {
    const result = engine.navigate({ workflowType: "context-gather" });
    assert.strictEqual(result.action, "fork");
    assert.strictEqual(result.fork.branches.repo.multiStep, true);
    assert.strictEqual(result.fork.branches.system.multiStep, false);
    assert.strictEqual(result.fork.branches.weather.multiStep, false);
  });

  it("should use Investigator for system_info branch", () => {
    const result = engine.navigate({ workflowType: "context-gather" });
    assert.strictEqual(result.fork.branches.system.subagent, "flow:Investigator");
  });
});
