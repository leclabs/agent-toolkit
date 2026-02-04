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

  it("should have a fork node with three branch edges", () => {
    const fork = workflow.nodes.fork_investigate;
    assert.ok(fork);
    assert.strictEqual(fork.type, "fork");
    const branchEdges = workflow.edges.filter((e) => e.from === "fork_investigate");
    assert.strictEqual(branchEdges.length, 3);
    const targets = branchEdges.map((e) => e.to);
    assert.ok(targets.includes("reproduce"));
    assert.ok(targets.includes("code_archaeology"));
    assert.ok(targets.includes("git_forensics"));
  });

  it("should have a join node referencing the fork", () => {
    const join = workflow.nodes.join_investigate;
    assert.ok(join);
    assert.strictEqual(join.type, "join");
    assert.strictEqual(join.fork, "fork_investigate");
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

  it("should assign correct stages to nodes", () => {
    assert.strictEqual(workflow.nodes.triage.stage, "planning");
    assert.strictEqual(workflow.nodes.reproduce.stage, "investigation");
    assert.strictEqual(workflow.nodes.synthesize.stage, "planning");
    assert.strictEqual(workflow.nodes.write_fix.stage, "development");
    assert.strictEqual(workflow.nodes.verify_fix.stage, "verification");
    assert.strictEqual(workflow.nodes.commit.stage, "delivery");
  });

  it("should assign correct agents to nodes", () => {
    assert.strictEqual(workflow.nodes.triage.agent, "Investigator");
    assert.strictEqual(workflow.nodes.reproduce.agent, "Tester");
    assert.strictEqual(workflow.nodes.synthesize.agent, "Architect");
    assert.strictEqual(workflow.nodes.write_fix.agent, "Developer");
    assert.strictEqual(workflow.nodes.verify_fix.agent, "Tester");
    assert.strictEqual(workflow.nodes.commit.agent, "Developer");
  });
});

// =============================================================================
// Bug Hunt workflow - Engine navigation (new API: init/start/current/next)
// =============================================================================

describe("bug-hunt workflow engine navigation", () => {
  let store;
  let engine;
  let tmpDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());

    tmpDir = mkdtempSync(join(tmpdir(), "nav-"));
    taskFile = join(tmpDir, "1.json");
  });

  it("should init at start node", () => {
    const result = engine.init({ workflowType: "bug-hunt", taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
  });

  it("should return instructions from init", () => {
    const result = engine.init({ workflowType: "bug-hunt", taskFilePath: taskFile });
    assert.ok(result.instructions.includes("## Queued"));
    assert.ok(result.instructions.includes("→ Call Start()"));
  });

  it("should advance from start to triage", () => {
    engine.init({ workflowType: "bug-hunt", taskFilePath: taskFile });
    const result = engine.start({ taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "triage");
    assert.ok(result.instructions.includes("Agent: Investigator"));
  });

  it("should init at specific step with stepId", () => {
    const result = engine.init({ workflowType: "bug-hunt", stepId: "write_fix", taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "write_fix");
    assert.ok(result.instructions.includes("Agent: Developer"));
  });

  it("should return fork instructions with branch list", () => {
    const result = engine.init({ workflowType: "bug-hunt", stepId: "fork_investigate", taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "fork_investigate");
    assert.ok(result.instructions.includes("## Fork Investigation"));
    assert.ok(result.instructions.includes("Branches:"));
    assert.ok(result.instructions.includes("reproduce"));
    assert.ok(result.instructions.includes("code_archaeology"));
    assert.ok(result.instructions.includes("git_forensics"));
  });
});

// =============================================================================
// Bug Hunt workflow - Transition evaluation
// =============================================================================

describe("bug-hunt workflow transitions", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should advance from triage to fork_investigate on passed", () => {
    const result = engine.evaluateTransition("bug-hunt", "triage", "passed", 0);
    assert.strictEqual(result.nextStep, "fork_investigate");
  });

  it("should advance from synthesize to write_fix", () => {
    const result = engine.evaluateTransition("bug-hunt", "synthesize", "passed", 0);
    assert.strictEqual(result.nextStep, "write_fix");
  });

  it("should advance from commit to end_success", () => {
    const result = engine.evaluateTransition("bug-hunt", "commit", "passed", 0);
    assert.strictEqual(result.nextStep, "end_success");
  });

  it("should have no outgoing edges from end_success", () => {
    const result = engine.evaluateTransition("bug-hunt", "end_success", "passed", 0);
    assert.strictEqual(result.nextStep, null);
    assert.strictEqual(result.error, "no_outgoing_edges");
  });
});

// =============================================================================
// Bug Hunt workflow - Gate retry/escalation
// =============================================================================

describe("bug-hunt workflow gate retry behavior", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should retry verify_fix on failure within limit", () => {
    const result = engine.evaluateTransition("bug-hunt", "verify_fix", "failed", 0);
    assert.strictEqual(result.nextStep, "write_fix");
    assert.strictEqual(result.action, "retry");
  });

  it("should escalate verify_fix to hitl after max retries", () => {
    const result = engine.evaluateTransition("bug-hunt", "verify_fix", "failed", 3);
    assert.strictEqual(result.nextStep, "hitl_fix_failed");
    assert.strictEqual(result.action, "escalate");
  });

  it("should retry lint_format on failure within limit", () => {
    const result = engine.evaluateTransition("bug-hunt", "lint_format", "failed", 0);
    assert.strictEqual(result.nextStep, "write_fix");
    assert.strictEqual(result.action, "retry");
  });

  it("should escalate lint_format to hitl after max retries", () => {
    const result = engine.evaluateTransition("bug-hunt", "lint_format", "failed", 3);
    assert.strictEqual(result.nextStep, "hitl_fix_failed");
    assert.strictEqual(result.action, "escalate");
  });
});

// =============================================================================
// Bug Hunt workflow - HITL recovery
// =============================================================================

describe("bug-hunt workflow HITL recovery", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should have recovery edge from hitl_inconclusive to triage", () => {
    const result = engine.evaluateTransition("bug-hunt", "hitl_inconclusive", "passed", 0);
    assert.strictEqual(result.nextStep, "triage");
  });

  it("should have recovery edge from hitl_fix_failed to write_fix", () => {
    const result = engine.evaluateTransition("bug-hunt", "hitl_fix_failed", "passed", 0);
    assert.strictEqual(result.nextStep, "write_fix");
  });
});

// =============================================================================
// Bug Hunt workflow - Catalog and diagram
// =============================================================================

describe("bug-hunt workflow catalog integration", () => {
  it("should produce a valid workflow summary", () => {
    const workflow = loadBugHuntWorkflow();
    const summary = buildWorkflowSummary("bug-hunt", workflow);

    assert.strictEqual(summary.id, "bug-hunt");
    assert.strictEqual(summary.name, "Bug Hunt");
    assert.ok(summary.description.length > 0);
    assert.strictEqual(summary.stepCount, 16);
  });
});

describe("bug-hunt workflow diagram generation", () => {
  it("should generate a mermaid diagram without errors", () => {
    const workflow = loadBugHuntWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes("```mermaid"));
    assert.ok(diagram.includes("flowchart TD"));
    assert.ok(diagram.includes("## Workflow: Bug Hunt"));
  });

  it("should highlight a step when currentStep is provided", () => {
    const workflow = loadBugHuntWorkflow();
    const diagram = generateDiagram(workflow, "synthesize");

    assert.ok(diagram.includes("class synthesize currentStep"));
  });
});

// =============================================================================
// Bug Hunt workflow - Full walkthrough
// =============================================================================

describe("bug-hunt workflow full walkthrough", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("bug-hunt", loadBugHuntWorkflow());
  });

  it("should complete happy path from start to end_success", () => {
    const steps = [
      { from: "start", expected: "triage" },
      { from: "triage", expected: "fork_investigate" },
      { from: "reproduce", expected: "join_investigate" },
      { from: "code_archaeology", expected: "join_investigate" },
      { from: "git_forensics", expected: "join_investigate" },
      { from: "join_investigate", expected: "synthesize", result: "passed" },
      { from: "synthesize", expected: "write_fix" },
      { from: "write_fix", expected: "add_regression_test" },
      { from: "add_regression_test", expected: "verify_fix" },
      { from: "verify_fix", expected: "lint_format", result: "passed" },
      { from: "lint_format", expected: "commit", result: "passed" },
      { from: "commit", expected: "end_success" },
    ];

    for (const step of steps) {
      const result = engine.evaluateTransition("bug-hunt", step.from, step.result || "passed", 0);
      assert.strictEqual(
        result.nextStep,
        step.expected,
        `From '${step.from}' expected '${step.expected}' but got '${result.nextStep}'`
      );
    }
  });

  it("should reach hitl_inconclusive when join fails", () => {
    const result = engine.evaluateTransition("bug-hunt", "join_investigate", "failed", 0);
    assert.strictEqual(result.nextStep, "hitl_inconclusive");
  });
});
