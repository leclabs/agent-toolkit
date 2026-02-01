import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { WorkflowEngine } from "./engine.js";
import { WorkflowStore, validateWorkflow } from "./store.js";
import { buildWorkflowSummary } from "./catalog.js";
import { generateDiagram } from "./diagram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MURDER_BOARD_PATH = join(__dirname, "catalog", "workflows", "build-review-murder-board.json");
const QUICK_PATH = join(__dirname, "catalog", "workflows", "build-review-quick.json");

/**
 * Load the build-review-murder-board workflow JSON from the catalog
 */
function loadMurderBoardWorkflow() {
  return JSON.parse(readFileSync(MURDER_BOARD_PATH, "utf-8"));
}

/**
 * Load the build-review-quick workflow JSON from the catalog
 */
function loadQuickWorkflow() {
  return JSON.parse(readFileSync(QUICK_PATH, "utf-8"));
}

// =============================================================================
// Build-Review Murder Board - JSON structure validation
// =============================================================================

describe("build-review-murder-board workflow JSON structure", () => {
  let workflow;

  beforeEach(() => {
    workflow = loadMurderBoardWorkflow();
  });

  it("should have id 'build-review-murder-board'", () => {
    assert.strictEqual(workflow.id, "build-review-murder-board");
  });

  it("should have name 'Build-Review Murder Board'", () => {
    assert.strictEqual(workflow.name, "Build-Review Murder Board");
  });

  it("should have a description", () => {
    assert.ok(workflow.description);
    assert.ok(workflow.description.length > 0);
  });

  it("should pass validateWorkflow", () => {
    assert.strictEqual(validateWorkflow("build-review-murder-board", workflow), true);
  });

  it("should have expected node count", () => {
    const nodeIds = Object.keys(workflow.nodes);
    // start, build, review, lint_format, commit, end_success, hitl_blocked
    assert.strictEqual(nodeIds.length, 7);
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

  it("should have HITL escalation node", () => {
    const hitl = workflow.nodes.hitl_blocked;
    assert.ok(hitl);
    assert.strictEqual(hitl.type, "end");
    assert.strictEqual(hitl.result, "blocked");
    assert.strictEqual(hitl.escalation, "hitl");
  });

  it("should have two gate nodes with maxRetries", () => {
    const gates = ["review", "lint_format"];
    for (const gateId of gates) {
      const node = workflow.nodes[gateId];
      assert.ok(node, `Gate node '${gateId}' should exist`);
      assert.strictEqual(node.type, "gate", `'${gateId}' should be type gate`);
      assert.ok(typeof node.maxRetries === "number", `'${gateId}' should have maxRetries`);
    }
  });

  it("should have review gate with maxRetries 3", () => {
    assert.strictEqual(workflow.nodes.review.maxRetries, 3);
  });

  it("should have lint_format gate with maxRetries 3", () => {
    assert.strictEqual(workflow.nodes.lint_format.maxRetries, 3);
  });

  it("should assign correct stages to nodes", () => {
    assert.strictEqual(workflow.nodes.build.stage, "development");
    assert.strictEqual(workflow.nodes.review.stage, "verification");
    assert.strictEqual(workflow.nodes.lint_format.stage, "delivery");
    assert.strictEqual(workflow.nodes.commit.stage, "delivery");
  });

  it("should assign correct agents to nodes", () => {
    assert.strictEqual(workflow.nodes.build.agent, "Developer");
    assert.strictEqual(workflow.nodes.review.agent, "Reviewer");
    assert.strictEqual(workflow.nodes.lint_format.agent, "Developer");
    assert.strictEqual(workflow.nodes.commit.agent, "Developer");
  });

  it("should have murder board config with scrutinyLevel 5, blindShot true, approvalThreshold 80", () => {
    const config = workflow.nodes.review.config;
    assert.ok(config, "review node should have a config object");
    assert.strictEqual(config.scrutinyLevel, 5);
    assert.strictEqual(config.blindShot, true);
    assert.strictEqual(config.approvalThreshold, 80);
  });
});

// =============================================================================
// Build-Review Quick - JSON structure validation
// =============================================================================

describe("build-review-quick workflow JSON structure", () => {
  let workflow;

  beforeEach(() => {
    workflow = loadQuickWorkflow();
  });

  it("should have id 'build-review-quick'", () => {
    assert.strictEqual(workflow.id, "build-review-quick");
  });

  it("should have name 'Build-Review Quick'", () => {
    assert.strictEqual(workflow.name, "Build-Review Quick");
  });

  it("should have a description", () => {
    assert.ok(workflow.description);
    assert.ok(workflow.description.length > 0);
  });

  it("should pass validateWorkflow", () => {
    assert.strictEqual(validateWorkflow("build-review-quick", workflow), true);
  });

  it("should have expected node count", () => {
    const nodeIds = Object.keys(workflow.nodes);
    // start, build, review, lint_format, commit, end_success, hitl_blocked
    assert.strictEqual(nodeIds.length, 7);
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

  it("should have HITL escalation node", () => {
    const hitl = workflow.nodes.hitl_blocked;
    assert.ok(hitl);
    assert.strictEqual(hitl.type, "end");
    assert.strictEqual(hitl.result, "blocked");
    assert.strictEqual(hitl.escalation, "hitl");
  });

  it("should have review gate with maxRetries 2", () => {
    assert.strictEqual(workflow.nodes.review.maxRetries, 2);
  });

  it("should have lint_format gate with maxRetries 3", () => {
    assert.strictEqual(workflow.nodes.lint_format.maxRetries, 3);
  });

  it("should have quick config with scrutinyLevel 1", () => {
    const config = workflow.nodes.review.config;
    assert.ok(config, "review node should have a config object");
    assert.strictEqual(config.scrutinyLevel, 1);
  });

  it("should not have blindShot or approvalThreshold in quick config", () => {
    const config = workflow.nodes.review.config;
    assert.strictEqual(config.blindShot, undefined);
    assert.strictEqual(config.approvalThreshold, undefined);
  });
});

// =============================================================================
// Build-Review Murder Board - Engine navigation (happy path)
// =============================================================================

describe("build-review-murder-board engine navigation - happy path", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-murder-board", loadMurderBoardWorkflow());
  });

  it("should start at build", () => {
    const result = engine.navigate({ workflowType: "build-review-murder-board" });
    assert.strictEqual(result.currentStep, "build");
    assert.strictEqual(result.action, "start");
  });

  it("should advance from build to review", () => {
    const result = engine.evaluateEdge("build-review-murder-board", "build", "passed", 0);
    assert.strictEqual(result.nextStep, "review");
  });

  it("should advance from review passed to lint_format", () => {
    const result = engine.evaluateEdge("build-review-murder-board", "review", "passed", 0);
    assert.strictEqual(result.nextStep, "lint_format");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from lint_format passed to commit", () => {
    const result = engine.evaluateEdge("build-review-murder-board", "lint_format", "passed", 0);
    assert.strictEqual(result.nextStep, "commit");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from commit to end_success", () => {
    const result = engine.evaluateEdge("build-review-murder-board", "commit", "passed", 0);
    assert.strictEqual(result.nextStep, "end_success");
  });

  it("should recognize end_success as terminal", () => {
    const result = engine.evaluateEdge("build-review-murder-board", "end_success", "passed", 0);
    assert.strictEqual(result.nextStep, null);
    assert.strictEqual(result.action, "no_outgoing_edges");
  });
});

// =============================================================================
// Build-Review Quick - Engine navigation (happy path)
// =============================================================================

describe("build-review-quick engine navigation - happy path", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-quick", loadQuickWorkflow());
  });

  it("should start at build", () => {
    const result = engine.navigate({ workflowType: "build-review-quick" });
    assert.strictEqual(result.currentStep, "build");
    assert.strictEqual(result.action, "start");
  });

  it("should advance from build to review", () => {
    const result = engine.evaluateEdge("build-review-quick", "build", "passed", 0);
    assert.strictEqual(result.nextStep, "review");
  });

  it("should advance from review passed to lint_format", () => {
    const result = engine.evaluateEdge("build-review-quick", "review", "passed", 0);
    assert.strictEqual(result.nextStep, "lint_format");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from lint_format passed to commit", () => {
    const result = engine.evaluateEdge("build-review-quick", "lint_format", "passed", 0);
    assert.strictEqual(result.nextStep, "commit");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from commit to end_success", () => {
    const result = engine.evaluateEdge("build-review-quick", "commit", "passed", 0);
    assert.strictEqual(result.nextStep, "end_success");
  });
});

// =============================================================================
// Build-Review Murder Board - Review gate retry/escalation behavior
// =============================================================================

describe("build-review-murder-board review gate behavior", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-murder-board", loadMurderBoardWorkflow());
  });

  describe("review gate (maxRetries: 3)", () => {
    it("should retry to build on first failure", () => {
      const result = engine.evaluateEdge("build-review-murder-board", "review", "failed", 0);
      assert.strictEqual(result.nextStep, "build");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 2);
    });

    it("should retry to build on second failure", () => {
      const result = engine.evaluateEdge("build-review-murder-board", "review", "failed", 1);
      assert.strictEqual(result.nextStep, "build");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 1);
    });

    it("should retry to build on third failure", () => {
      const result = engine.evaluateEdge("build-review-murder-board", "review", "failed", 2);
      assert.strictEqual(result.nextStep, "build");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 0);
    });

    it("should escalate to hitl_blocked when retries exhausted", () => {
      const result = engine.evaluateEdge("build-review-murder-board", "review", "failed", 3);
      assert.strictEqual(result.nextStep, "hitl_blocked");
      assert.strictEqual(result.action, "escalate");
    });
  });

  describe("lint_format gate (maxRetries: 3)", () => {
    it("should retry to build on failure with retries remaining", () => {
      const result = engine.evaluateEdge("build-review-murder-board", "lint_format", "failed", 0);
      assert.strictEqual(result.nextStep, "build");
      assert.strictEqual(result.action, "retry");
    });

    it("should escalate to hitl_blocked when retries exhausted", () => {
      const result = engine.evaluateEdge("build-review-murder-board", "lint_format", "failed", 3);
      assert.strictEqual(result.nextStep, "hitl_blocked");
      assert.strictEqual(result.action, "escalate");
    });
  });
});

// =============================================================================
// Build-Review Quick - Review gate retry/escalation behavior
// =============================================================================

describe("build-review-quick review gate behavior", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-quick", loadQuickWorkflow());
  });

  describe("review gate (maxRetries: 2)", () => {
    it("should retry to build on first failure", () => {
      const result = engine.evaluateEdge("build-review-quick", "review", "failed", 0);
      assert.strictEqual(result.nextStep, "build");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 1);
    });

    it("should retry to build on second failure", () => {
      const result = engine.evaluateEdge("build-review-quick", "review", "failed", 1);
      assert.strictEqual(result.nextStep, "build");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 0);
    });

    it("should escalate to hitl_blocked when retries exhausted", () => {
      const result = engine.evaluateEdge("build-review-quick", "review", "failed", 2);
      assert.strictEqual(result.nextStep, "hitl_blocked");
      assert.strictEqual(result.action, "escalate");
    });
  });
});

// =============================================================================
// Build-Review - Full walkthrough simulations
// =============================================================================

describe("build-review-murder-board full walkthrough", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-murder-board", loadMurderBoardWorkflow());
  });

  it("should complete a full happy-path traversal: build -> review pass -> lint_format pass -> commit -> end_success", () => {
    const steps = [
      { from: "start", expected: "build" },
      { from: "build", expected: "review" },
      { from: "review", expected: "lint_format", result: "passed" },
      { from: "lint_format", expected: "commit", result: "passed" },
      { from: "commit", expected: "end_success" },
    ];

    for (const step of steps) {
      const result = engine.evaluateEdge("build-review-murder-board", step.from, step.result || "passed", 0);
      assert.strictEqual(
        result.nextStep,
        step.expected,
        `From '${step.from}' expected '${step.expected}' but got '${result.nextStep}'`
      );
    }
  });

  it("should complete a retry loop: review fail -> build -> review pass -> lint_format pass -> commit -> end", () => {
    // review fails, retries back to build
    const retry1 = engine.evaluateEdge("build-review-murder-board", "review", "failed", 0);
    assert.strictEqual(retry1.nextStep, "build");
    assert.strictEqual(retry1.action, "retry");

    // build again
    const build2 = engine.evaluateEdge("build-review-murder-board", "build", "passed", 0);
    assert.strictEqual(build2.nextStep, "review");

    // review passes on second attempt
    const review2 = engine.evaluateEdge("build-review-murder-board", "review", "passed", 0);
    assert.strictEqual(review2.nextStep, "lint_format");

    // lint passes
    const lint = engine.evaluateEdge("build-review-murder-board", "lint_format", "passed", 0);
    assert.strictEqual(lint.nextStep, "commit");

    // commit
    const commit = engine.evaluateEdge("build-review-murder-board", "commit", "passed", 0);
    assert.strictEqual(commit.nextStep, "end_success");
  });

  it("should reach hitl_blocked after review exhausts all 3 retries", () => {
    const retry1 = engine.evaluateEdge("build-review-murder-board", "review", "failed", 0);
    assert.strictEqual(retry1.nextStep, "build");
    assert.strictEqual(retry1.action, "retry");

    const retry2 = engine.evaluateEdge("build-review-murder-board", "review", "failed", 1);
    assert.strictEqual(retry2.nextStep, "build");
    assert.strictEqual(retry2.action, "retry");

    const retry3 = engine.evaluateEdge("build-review-murder-board", "review", "failed", 2);
    assert.strictEqual(retry3.nextStep, "build");
    assert.strictEqual(retry3.action, "retry");

    const escalate = engine.evaluateEdge("build-review-murder-board", "review", "failed", 3);
    assert.strictEqual(escalate.nextStep, "hitl_blocked");
    assert.strictEqual(escalate.action, "escalate");
  });
});

describe("build-review-quick full walkthrough", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-quick", loadQuickWorkflow());
  });

  it("should complete a full happy-path traversal: build -> review pass -> lint_format pass -> commit -> end_success", () => {
    const steps = [
      { from: "start", expected: "build" },
      { from: "build", expected: "review" },
      { from: "review", expected: "lint_format", result: "passed" },
      { from: "lint_format", expected: "commit", result: "passed" },
      { from: "commit", expected: "end_success" },
    ];

    for (const step of steps) {
      const result = engine.evaluateEdge("build-review-quick", step.from, step.result || "passed", 0);
      assert.strictEqual(
        result.nextStep,
        step.expected,
        `From '${step.from}' expected '${step.expected}' but got '${result.nextStep}'`
      );
    }
  });

  it("should reach hitl_blocked after review exhausts all 2 retries", () => {
    const retry1 = engine.evaluateEdge("build-review-quick", "review", "failed", 0);
    assert.strictEqual(retry1.action, "retry");

    const retry2 = engine.evaluateEdge("build-review-quick", "review", "failed", 1);
    assert.strictEqual(retry2.action, "retry");

    const escalate = engine.evaluateEdge("build-review-quick", "review", "failed", 2);
    assert.strictEqual(escalate.nextStep, "hitl_blocked");
    assert.strictEqual(escalate.action, "escalate");
  });
});

// =============================================================================
// Build-Review - Catalog integration
// =============================================================================

describe("build-review workflow catalog integration", () => {
  it("should produce a valid murder board workflow summary via buildWorkflowSummary", () => {
    const workflow = loadMurderBoardWorkflow();
    const summary = buildWorkflowSummary("build-review-murder-board", workflow);

    assert.strictEqual(summary.id, "build-review-murder-board");
    assert.strictEqual(summary.name, "Build-Review Murder Board");
    assert.ok(summary.description.length > 0);
    assert.strictEqual(summary.stepCount, 7);
  });

  it("should produce a valid quick workflow summary via buildWorkflowSummary", () => {
    const workflow = loadQuickWorkflow();
    const summary = buildWorkflowSummary("build-review-quick", workflow);

    assert.strictEqual(summary.id, "build-review-quick");
    assert.strictEqual(summary.name, "Build-Review Quick");
    assert.ok(summary.description.length > 0);
    assert.strictEqual(summary.stepCount, 7);
  });

  it("should load both variants into the store without error", () => {
    const store = new WorkflowStore();
    store.loadDefinition("build-review-murder-board", loadMurderBoardWorkflow());
    store.loadDefinition("build-review-quick", loadQuickWorkflow());

    assert.ok(store.has("build-review-murder-board"));
    assert.ok(store.has("build-review-quick"));
    assert.strictEqual(store.size, 2);
  });
});

// =============================================================================
// Build-Review - Diagram generation
// =============================================================================

describe("build-review-murder-board diagram generation", () => {
  it("should generate a mermaid diagram without errors", () => {
    const workflow = loadMurderBoardWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes("```mermaid"));
    assert.ok(diagram.includes("flowchart TD"));
    assert.ok(diagram.includes("## Workflow: Build-Review Murder Board"));
  });

  it("should include gate nodes as diamonds in the diagram", () => {
    const workflow = loadMurderBoardWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes('review{"Murder Board Review<br/><small>👀 Reviewer</small>"}'));
    assert.ok(diagram.includes('lint_format{"Lint and Format<br/><small>🔧 Developer</small>"}'));
  });

  it("should highlight a step when currentStep is provided", () => {
    const workflow = loadMurderBoardWorkflow();
    const diagram = generateDiagram(workflow, "build");

    assert.ok(diagram.includes("class build currentStep"));
  });

  it("should include the step instructions table with task nodes", () => {
    const workflow = loadMurderBoardWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes("### Step Instructions"));
    assert.ok(diagram.includes("build"));
    assert.ok(diagram.includes("review"));
    assert.ok(diagram.includes("lint_format"));
    assert.ok(diagram.includes("commit"));
  });
});

describe("build-review-quick diagram generation", () => {
  it("should generate a mermaid diagram without errors", () => {
    const workflow = loadQuickWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes("```mermaid"));
    assert.ok(diagram.includes("flowchart TD"));
    assert.ok(diagram.includes("## Workflow: Build-Review Quick"));
  });

  it("should include gate nodes as diamonds in the diagram", () => {
    const workflow = loadQuickWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes('review{"Quick Review<br/><small>👀 Reviewer</small>"}'));
    assert.ok(diagram.includes('lint_format{"Lint and Format<br/><small>🔧 Developer</small>"}'));
  });

  it("should highlight a step when currentStep is provided", () => {
    const workflow = loadQuickWorkflow();
    const diagram = generateDiagram(workflow, "review");

    assert.ok(diagram.includes("class review currentStep"));
  });
});

// =============================================================================
// Build-Review - Variant differentiation
// =============================================================================

describe("build-review variant differentiation", () => {
  it("murder board has higher scrutinyLevel than quick", () => {
    const mb = loadMurderBoardWorkflow();
    const quick = loadQuickWorkflow();

    assert.ok(mb.nodes.review.config.scrutinyLevel > quick.nodes.review.config.scrutinyLevel);
  });

  it("murder board has more review retries than quick", () => {
    const mb = loadMurderBoardWorkflow();
    const quick = loadQuickWorkflow();

    assert.ok(mb.nodes.review.maxRetries > quick.nodes.review.maxRetries);
  });

  it("both variants share the same node structure", () => {
    const mb = loadMurderBoardWorkflow();
    const quick = loadQuickWorkflow();

    const mbNodeIds = Object.keys(mb.nodes).sort();
    const quickNodeIds = Object.keys(quick.nodes).sort();

    assert.deepStrictEqual(mbNodeIds, quickNodeIds);
  });

  it("both variants share the same edge topology", () => {
    const mb = loadMurderBoardWorkflow();
    const quick = loadQuickWorkflow();

    const edgeKey = (e) => `${e.from}->${e.to}:${e.on || ""}`;
    const mbEdges = mb.edges.map(edgeKey).sort();
    const quickEdges = quick.edges.map(edgeKey).sort();

    assert.deepStrictEqual(mbEdges, quickEdges);
  });
});

// =============================================================================
// Build-Review - HITL resume behavior
// =============================================================================

describe("build-review-murder-board HITL resume", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-murder-board", loadMurderBoardWorkflow());
  });

  it("should have a recovery edge from hitl_blocked to build", () => {
    const workflow = loadMurderBoardWorkflow();
    const recoveryEdge = workflow.edges.find((e) => e.from === "hitl_blocked" && e.on === "passed");
    assert.ok(recoveryEdge, "hitl_blocked should have a recovery edge");
    assert.strictEqual(recoveryEdge.to, "build");
  });

  it("should advance from hitl_blocked to build on passed", () => {
    const result = engine.evaluateEdge("build-review-murder-board", "hitl_blocked", "passed", 0);
    assert.strictEqual(result.nextStep, "build");
  });

  it("should resume workflow end-to-end after HITL recovery", () => {
    // Simulate: escalate to hitl_blocked, then human fixes, resume to build
    const escalate = engine.evaluateEdge("build-review-murder-board", "review", "failed", 3);
    assert.strictEqual(escalate.nextStep, "hitl_blocked");
    assert.strictEqual(escalate.action, "escalate");

    // Human resolves → passed from hitl_blocked
    const resume = engine.evaluateEdge("build-review-murder-board", "hitl_blocked", "passed", 0);
    assert.strictEqual(resume.nextStep, "build");

    // Continue happy path: build -> review -> lint_format -> commit -> end
    const review = engine.evaluateEdge("build-review-murder-board", "build", "passed", 0);
    assert.strictEqual(review.nextStep, "review");

    const lint = engine.evaluateEdge("build-review-murder-board", "review", "passed", 0);
    assert.strictEqual(lint.nextStep, "lint_format");

    const commit = engine.evaluateEdge("build-review-murder-board", "lint_format", "passed", 0);
    assert.strictEqual(commit.nextStep, "commit");

    const end = engine.evaluateEdge("build-review-murder-board", "commit", "passed", 0);
    assert.strictEqual(end.nextStep, "end_success");
  });
});

describe("build-review-quick HITL resume", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-quick", loadQuickWorkflow());
  });

  it("should have a recovery edge from hitl_blocked to build", () => {
    const workflow = loadQuickWorkflow();
    const recoveryEdge = workflow.edges.find((e) => e.from === "hitl_blocked" && e.on === "passed");
    assert.ok(recoveryEdge, "hitl_blocked should have a recovery edge");
    assert.strictEqual(recoveryEdge.to, "build");
  });

  it("should advance from hitl_blocked to build on passed", () => {
    const result = engine.evaluateEdge("build-review-quick", "hitl_blocked", "passed", 0);
    assert.strictEqual(result.nextStep, "build");
  });
});
