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
const REFACTOR_PATH = join(__dirname, "catalog", "workflows", "refactor.json");

/**
 * Load the refactor workflow JSON from the catalog
 */
function loadRefactorWorkflow() {
  return JSON.parse(readFileSync(REFACTOR_PATH, "utf-8"));
}

// =============================================================================
// Refactor workflow - JSON structure validation
// =============================================================================

describe("refactor workflow JSON structure", () => {
  let workflow;

  beforeEach(() => {
    workflow = loadRefactorWorkflow();
  });

  it("should have id 'refactor'", () => {
    assert.strictEqual(workflow.id, "refactor");
  });

  it("should have name 'Refactor'", () => {
    assert.strictEqual(workflow.name, "Refactor");
  });

  it("should have a description", () => {
    assert.ok(workflow.description);
    assert.ok(workflow.description.length > 0);
  });

  it("should pass validateWorkflow", () => {
    assert.strictEqual(validateWorkflow("refactor", workflow), true);
  });

  it("should have expected node count", () => {
    const nodeIds = Object.keys(workflow.nodes);
    // start, analyze_structure, identify_debt, classify_components,
    // design_refactor, plan_review, extract_core, isolate_shell,
    // write_tests, run_tests, code_review, lint_format, commit,
    // end_success, hitl_analysis_failed, hitl_dev_failed
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
    const hitlAnalysis = workflow.nodes.hitl_analysis_failed;
    assert.ok(hitlAnalysis);
    assert.strictEqual(hitlAnalysis.type, "end");
    assert.strictEqual(hitlAnalysis.result, "blocked");
    assert.strictEqual(hitlAnalysis.escalation, "hitl");

    const hitlDev = workflow.nodes.hitl_dev_failed;
    assert.ok(hitlDev);
    assert.strictEqual(hitlDev.type, "end");
    assert.strictEqual(hitlDev.result, "blocked");
    assert.strictEqual(hitlDev.escalation, "hitl");
  });

  it("should have four gate nodes with maxRetries", () => {
    const gates = ["plan_review", "run_tests", "code_review", "lint_format"];
    for (const gateId of gates) {
      const node = workflow.nodes[gateId];
      assert.ok(node, `Gate node '${gateId}' should exist`);
      assert.strictEqual(node.type, "gate", `'${gateId}' should be type gate`);
      assert.ok(typeof node.maxRetries === "number", `'${gateId}' should have maxRetries`);
    }
  });

  it("should have plan_review with maxRetries 2", () => {
    assert.strictEqual(workflow.nodes.plan_review.maxRetries, 2);
  });

  it("should have run_tests with maxRetries 3", () => {
    assert.strictEqual(workflow.nodes.run_tests.maxRetries, 3);
  });

  it("should have code_review with maxRetries 2", () => {
    assert.strictEqual(workflow.nodes.code_review.maxRetries, 2);
  });

  it("should have lint_format with maxRetries 3", () => {
    assert.strictEqual(workflow.nodes.lint_format.maxRetries, 3);
  });

  it("should assign correct stages to nodes", () => {
    assert.strictEqual(workflow.nodes.analyze_structure.stage, "analysis");
    assert.strictEqual(workflow.nodes.identify_debt.stage, "analysis");
    assert.strictEqual(workflow.nodes.classify_components.stage, "analysis");
    assert.strictEqual(workflow.nodes.design_refactor.stage, "planning");
    assert.strictEqual(workflow.nodes.plan_review.stage, "planning");
    assert.strictEqual(workflow.nodes.extract_core.stage, "development");
    assert.strictEqual(workflow.nodes.isolate_shell.stage, "development");
    assert.strictEqual(workflow.nodes.write_tests.stage, "development");
    assert.strictEqual(workflow.nodes.run_tests.stage, "verification");
    assert.strictEqual(workflow.nodes.code_review.stage, "verification");
    assert.strictEqual(workflow.nodes.lint_format.stage, "delivery");
    assert.strictEqual(workflow.nodes.commit.stage, "delivery");
  });

  it("should assign correct agents to nodes", () => {
    assert.strictEqual(workflow.nodes.analyze_structure.agent, "Planner");
    assert.strictEqual(workflow.nodes.identify_debt.agent, "Planner");
    assert.strictEqual(workflow.nodes.classify_components.agent, "Planner");
    assert.strictEqual(workflow.nodes.design_refactor.agent, "Planner");
    assert.strictEqual(workflow.nodes.plan_review.agent, "Reviewer");
    assert.strictEqual(workflow.nodes.extract_core.agent, "Developer");
    assert.strictEqual(workflow.nodes.isolate_shell.agent, "Developer");
    assert.strictEqual(workflow.nodes.write_tests.agent, "Tester");
    assert.strictEqual(workflow.nodes.run_tests.agent, "Tester");
    assert.strictEqual(workflow.nodes.code_review.agent, "Reviewer");
    assert.strictEqual(workflow.nodes.lint_format.agent, "Developer");
    assert.strictEqual(workflow.nodes.commit.agent, "Developer");
  });
});

// =============================================================================
// Refactor workflow - Engine navigation (happy path)
// =============================================================================

describe("refactor workflow engine navigation - happy path", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("refactor", loadRefactorWorkflow());
  });

  it("should start at analyze_structure", () => {
    const result = engine.navigate({ workflowType: "refactor" });
    assert.strictEqual(result.currentStep, "analyze_structure");
    assert.strictEqual(result.action, "start");
  });

  it("should follow the linear analysis chain: analyze_structure -> identify_debt -> classify_components", () => {
    // analyze_structure -> identify_debt (unconditional)
    const r1 = engine.evaluateEdge("refactor", "analyze_structure", "passed", 0);
    assert.strictEqual(r1.nextStep, "identify_debt");

    // identify_debt -> classify_components (unconditional)
    const r2 = engine.evaluateEdge("refactor", "identify_debt", "passed", 0);
    assert.strictEqual(r2.nextStep, "classify_components");

    // classify_components -> design_refactor (unconditional)
    const r3 = engine.evaluateEdge("refactor", "classify_components", "passed", 0);
    assert.strictEqual(r3.nextStep, "design_refactor");
  });

  it("should advance from design_refactor to plan_review", () => {
    const result = engine.evaluateEdge("refactor", "design_refactor", "passed", 0);
    assert.strictEqual(result.nextStep, "plan_review");
  });

  it("should advance from plan_review passed to extract_core", () => {
    const result = engine.evaluateEdge("refactor", "plan_review", "passed", 0);
    assert.strictEqual(result.nextStep, "extract_core");
    assert.strictEqual(result.action, "conditional");
  });

  it("should follow development chain: extract_core -> isolate_shell -> write_tests -> run_tests", () => {
    const r1 = engine.evaluateEdge("refactor", "extract_core", "passed", 0);
    assert.strictEqual(r1.nextStep, "isolate_shell");

    const r2 = engine.evaluateEdge("refactor", "isolate_shell", "passed", 0);
    assert.strictEqual(r2.nextStep, "write_tests");

    const r3 = engine.evaluateEdge("refactor", "write_tests", "passed", 0);
    assert.strictEqual(r3.nextStep, "run_tests");
  });

  it("should advance from run_tests passed to code_review", () => {
    const result = engine.evaluateEdge("refactor", "run_tests", "passed", 0);
    assert.strictEqual(result.nextStep, "code_review");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from code_review passed to lint_format", () => {
    const result = engine.evaluateEdge("refactor", "code_review", "passed", 0);
    assert.strictEqual(result.nextStep, "lint_format");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from lint_format passed to commit", () => {
    const result = engine.evaluateEdge("refactor", "lint_format", "passed", 0);
    assert.strictEqual(result.nextStep, "commit");
    assert.strictEqual(result.action, "conditional");
  });

  it("should advance from commit to end_success", () => {
    const result = engine.evaluateEdge("refactor", "commit", "passed", 0);
    assert.strictEqual(result.nextStep, "end_success");
  });

  it("should recognize end_success as terminal", () => {
    const result = engine.evaluateEdge("refactor", "end_success", "passed", 0);
    assert.strictEqual(result.nextStep, null);
    assert.strictEqual(result.action, "no_outgoing_edges");
  });
});

// =============================================================================
// Refactor workflow - Gate retry/escalation behavior
// =============================================================================

describe("refactor workflow gate behavior", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("refactor", loadRefactorWorkflow());
  });

  // --- plan_review gate (maxRetries: 2) ---

  describe("plan_review gate", () => {
    it("should retry to design_refactor on failure with retries remaining", () => {
      const result = engine.evaluateEdge("refactor", "plan_review", "failed", 0);
      assert.strictEqual(result.nextStep, "design_refactor");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 1);
    });

    it("should retry on second failure (retryCount = 1)", () => {
      const result = engine.evaluateEdge("refactor", "plan_review", "failed", 1);
      assert.strictEqual(result.nextStep, "design_refactor");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 0);
    });

    it("should escalate to hitl_analysis_failed when retries exhausted", () => {
      const result = engine.evaluateEdge("refactor", "plan_review", "failed", 2);
      assert.strictEqual(result.nextStep, "hitl_analysis_failed");
      assert.strictEqual(result.action, "escalate");
    });
  });

  // --- run_tests gate (maxRetries: 3) ---

  describe("run_tests gate", () => {
    it("should retry to extract_core on failure with retries remaining", () => {
      const result = engine.evaluateEdge("refactor", "run_tests", "failed", 0);
      assert.strictEqual(result.nextStep, "extract_core");
      assert.strictEqual(result.action, "retry");
    });

    it("should still retry on third failure (retryCount = 2)", () => {
      const result = engine.evaluateEdge("refactor", "run_tests", "failed", 2);
      assert.strictEqual(result.nextStep, "extract_core");
      assert.strictEqual(result.action, "retry");
      assert.strictEqual(result.retriesRemaining, 0);
    });

    it("should escalate to hitl_dev_failed when retries exhausted", () => {
      const result = engine.evaluateEdge("refactor", "run_tests", "failed", 3);
      assert.strictEqual(result.nextStep, "hitl_dev_failed");
      assert.strictEqual(result.action, "escalate");
    });
  });

  // --- code_review gate (maxRetries: 2) ---

  describe("code_review gate", () => {
    it("should retry to extract_core on failure with retries remaining", () => {
      const result = engine.evaluateEdge("refactor", "code_review", "failed", 0);
      assert.strictEqual(result.nextStep, "extract_core");
      assert.strictEqual(result.action, "retry");
    });

    it("should escalate to hitl_dev_failed when retries exhausted", () => {
      const result = engine.evaluateEdge("refactor", "code_review", "failed", 2);
      assert.strictEqual(result.nextStep, "hitl_dev_failed");
      assert.strictEqual(result.action, "escalate");
    });
  });

  // --- lint_format gate (maxRetries: 3) ---

  describe("lint_format gate", () => {
    it("should retry to extract_core on failure with retries remaining", () => {
      const result = engine.evaluateEdge("refactor", "lint_format", "failed", 0);
      assert.strictEqual(result.nextStep, "extract_core");
      assert.strictEqual(result.action, "retry");
    });

    it("should escalate to hitl_dev_failed when retries exhausted", () => {
      const result = engine.evaluateEdge("refactor", "lint_format", "failed", 3);
      assert.strictEqual(result.nextStep, "hitl_dev_failed");
      assert.strictEqual(result.action, "escalate");
    });
  });
});

// =============================================================================
// Refactor workflow - Catalog integration
// =============================================================================

describe("refactor workflow catalog integration", () => {
  it("should produce a valid workflow summary via buildWorkflowSummary", () => {
    const workflow = loadRefactorWorkflow();
    const summary = buildWorkflowSummary("refactor", workflow);

    assert.strictEqual(summary.id, "refactor");
    assert.strictEqual(summary.name, "Refactor");
    assert.ok(summary.description.length > 0);
    assert.strictEqual(summary.stepCount, 16);
  });
});

// =============================================================================
// Refactor workflow - Diagram generation
// =============================================================================

describe("refactor workflow diagram generation", () => {
  it("should generate a mermaid diagram without errors", () => {
    const workflow = loadRefactorWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes("```mermaid"));
    assert.ok(diagram.includes("flowchart TD"));
    assert.ok(diagram.includes("## Workflow: Refactor"));
  });

  it("should include all gate nodes as diamonds in the diagram", () => {
    const workflow = loadRefactorWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes('plan_review{"Review Plan<br/><small>👀 Reviewer ↻2</small>"}'));
    assert.ok(diagram.includes('run_tests{"Run Tests<br/><small>🧪 Tester ↻3</small>"}'));
    assert.ok(diagram.includes('code_review{"Code Review<br/><small>👀 Reviewer ↻2</small>"}'));
    assert.ok(diagram.includes('lint_format{"Lint and Format<br/><small>🔧 Developer ↻3</small>"}'));
  });

  it("should highlight a step when currentStep is provided", () => {
    const workflow = loadRefactorWorkflow();
    const diagram = generateDiagram(workflow, "extract_core");

    assert.ok(diagram.includes("class extract_core currentStep"));
  });

  it("should include the step instructions table with all task nodes", () => {
    const workflow = loadRefactorWorkflow();
    const diagram = generateDiagram(workflow);

    assert.ok(diagram.includes("### Step Instructions"));
    assert.ok(diagram.includes("analyze_structure"));
    assert.ok(diagram.includes("extract_core"));
    assert.ok(diagram.includes("write_tests"));
    assert.ok(diagram.includes("commit"));
  });
});

// =============================================================================
// Refactor workflow - Edge case: full walkthrough simulation
// =============================================================================

describe("refactor workflow full walkthrough", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("refactor", loadRefactorWorkflow());
  });

  it("should complete a full happy-path traversal from start to end_success", () => {
    // This simulates the entire happy path using evaluateEdge
    const steps = [
      { from: "start", expected: "analyze_structure" },
      { from: "analyze_structure", expected: "identify_debt" },
      { from: "identify_debt", expected: "classify_components" },
      { from: "classify_components", expected: "design_refactor" },
      { from: "design_refactor", expected: "plan_review" },
      { from: "plan_review", expected: "extract_core", result: "passed" },
      { from: "extract_core", expected: "isolate_shell" },
      { from: "isolate_shell", expected: "write_tests" },
      { from: "write_tests", expected: "run_tests" },
      { from: "run_tests", expected: "code_review", result: "passed" },
      { from: "code_review", expected: "lint_format", result: "passed" },
      { from: "lint_format", expected: "commit", result: "passed" },
      { from: "commit", expected: "end_success" },
    ];

    for (const step of steps) {
      const result = engine.evaluateEdge("refactor", step.from, step.result || "passed", 0);
      assert.strictEqual(
        result.nextStep,
        step.expected,
        `From '${step.from}' expected '${step.expected}' but got '${result.nextStep}'`
      );
    }
  });

  it("should reach hitl_analysis_failed after plan_review exhausts retries", () => {
    // Simulate: plan_review fails twice (retry), then escalates
    const retry1 = engine.evaluateEdge("refactor", "plan_review", "failed", 0);
    assert.strictEqual(retry1.nextStep, "design_refactor");
    assert.strictEqual(retry1.action, "retry");

    const retry2 = engine.evaluateEdge("refactor", "plan_review", "failed", 1);
    assert.strictEqual(retry2.nextStep, "design_refactor");
    assert.strictEqual(retry2.action, "retry");

    const escalate = engine.evaluateEdge("refactor", "plan_review", "failed", 2);
    assert.strictEqual(escalate.nextStep, "hitl_analysis_failed");
    assert.strictEqual(escalate.action, "escalate");
  });

  it("should reach hitl_dev_failed after run_tests exhausts retries", () => {
    // run_tests has maxRetries: 3
    const retry1 = engine.evaluateEdge("refactor", "run_tests", "failed", 0);
    assert.strictEqual(retry1.action, "retry");

    const retry2 = engine.evaluateEdge("refactor", "run_tests", "failed", 1);
    assert.strictEqual(retry2.action, "retry");

    const retry3 = engine.evaluateEdge("refactor", "run_tests", "failed", 2);
    assert.strictEqual(retry3.action, "retry");

    const escalate = engine.evaluateEdge("refactor", "run_tests", "failed", 3);
    assert.strictEqual(escalate.nextStep, "hitl_dev_failed");
    assert.strictEqual(escalate.action, "escalate");
  });
});

// =============================================================================
// Refactor workflow - HITL resume behavior
// =============================================================================

describe("refactor workflow HITL resume", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("refactor", loadRefactorWorkflow());
  });

  it("should have recovery edges from both HITL nodes", () => {
    const workflow = loadRefactorWorkflow();

    const analysisRecovery = workflow.edges.find((e) => e.from === "hitl_analysis_failed" && e.on === "passed");
    assert.ok(analysisRecovery, "hitl_analysis_failed should have a recovery edge");
    assert.strictEqual(analysisRecovery.to, "design_refactor");

    const devRecovery = workflow.edges.find((e) => e.from === "hitl_dev_failed" && e.on === "passed");
    assert.ok(devRecovery, "hitl_dev_failed should have a recovery edge");
    assert.strictEqual(devRecovery.to, "extract_core");
  });

  it("should advance from hitl_analysis_failed to design_refactor on passed", () => {
    const result = engine.evaluateEdge("refactor", "hitl_analysis_failed", "passed", 0);
    assert.strictEqual(result.nextStep, "design_refactor");
  });

  it("should advance from hitl_dev_failed to extract_core on passed", () => {
    const result = engine.evaluateEdge("refactor", "hitl_dev_failed", "passed", 0);
    assert.strictEqual(result.nextStep, "extract_core");
  });

  it("should resume workflow end-to-end after analysis HITL recovery", () => {
    // Escalate to hitl_analysis_failed
    const escalate = engine.evaluateEdge("refactor", "plan_review", "failed", 2);
    assert.strictEqual(escalate.nextStep, "hitl_analysis_failed");
    assert.strictEqual(escalate.action, "escalate");

    // Human resolves → resume at design_refactor
    const resume = engine.evaluateEdge("refactor", "hitl_analysis_failed", "passed", 0);
    assert.strictEqual(resume.nextStep, "design_refactor");

    // Continue: design_refactor -> plan_review -> extract_core ...
    const planReview = engine.evaluateEdge("refactor", "design_refactor", "passed", 0);
    assert.strictEqual(planReview.nextStep, "plan_review");

    const extract = engine.evaluateEdge("refactor", "plan_review", "passed", 0);
    assert.strictEqual(extract.nextStep, "extract_core");
  });

  it("should resume workflow end-to-end after dev HITL recovery", () => {
    // Escalate to hitl_dev_failed
    const escalate = engine.evaluateEdge("refactor", "run_tests", "failed", 3);
    assert.strictEqual(escalate.nextStep, "hitl_dev_failed");
    assert.strictEqual(escalate.action, "escalate");

    // Human resolves → resume at extract_core
    const resume = engine.evaluateEdge("refactor", "hitl_dev_failed", "passed", 0);
    assert.strictEqual(resume.nextStep, "extract_core");

    // Continue happy path from extract_core
    const isolate = engine.evaluateEdge("refactor", "extract_core", "passed", 0);
    assert.strictEqual(isolate.nextStep, "isolate_shell");
  });
});
