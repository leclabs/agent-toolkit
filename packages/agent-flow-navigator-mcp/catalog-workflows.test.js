/**
 * catalog-workflows.test.js - Consolidated tests for all catalog workflows
 *
 * Tests all catalog workflows for:
 * - JSON structure validation
 * - Engine navigation (init/start)
 * - Diagram generation
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { validateWorkflow } from "./store.js";
import { buildWorkflowSummary } from "./catalog.js";
import { generateDiagram } from "./diagram.js";
import { createTestContext, cleanupTestContext, loadCatalogWorkflow } from "./test-helpers.js";

// =============================================================================
// Define all catalog workflows to test
// =============================================================================

const CATALOG_WORKFLOWS = [
  {
    id: "bug-hunt",
    name: "Bug Hunt",
    expectedNodes: 16,
    hasGates: true,
    hasFork: true,
  },
  {
    id: "build-review-quick",
    name: "Build Review (Quick)",
    expectedNodes: null, // Don't check exact count
    hasGates: false,
    hasFork: false,
  },
  {
    id: "build-review-murder-board",
    name: "Build Review (Murder Board)",
    expectedNodes: null,
    hasGates: false,
    hasFork: false,
  },
  {
    id: "refactor",
    name: "Refactor",
    expectedNodes: null,
    hasGates: false,
    hasFork: false,
  },
];

// =============================================================================
// Parameterized tests for all workflows
// =============================================================================

for (const workflowConfig of CATALOG_WORKFLOWS) {
  describe(`${workflowConfig.id} workflow`, () => {
    let workflow;

    beforeEach(() => {
      workflow = loadCatalogWorkflow(workflowConfig.id);
    });

    // JSON structure validation
    describe("JSON structure", () => {
      it(`should have id '${workflowConfig.id}'`, () => {
        assert.strictEqual(workflow.id, workflowConfig.id);
      });

      it("should pass validateWorkflow", () => {
        assert.strictEqual(validateWorkflow(workflowConfig.id, workflow), true);
      });

      it("should have start and end nodes", () => {
        assert.ok(workflow.nodes.start, "should have start node");
        assert.strictEqual(workflow.nodes.start.type, "start");
        assert.ok(workflow.nodes.end_success, "should have end_success node");
        assert.strictEqual(workflow.nodes.end_success.type, "end");
      });

      if (workflowConfig.expectedNodes) {
        it(`should have ${workflowConfig.expectedNodes} nodes`, () => {
          const nodeCount = Object.keys(workflow.nodes).length;
          assert.strictEqual(nodeCount, workflowConfig.expectedNodes);
        });
      }

      if (workflowConfig.hasGates) {
        it("should have gate nodes with maxRetries", () => {
          const gateNodes = Object.entries(workflow.nodes).filter(([, n]) => n.type === "gate");
          assert.ok(gateNodes.length > 0, "should have at least one gate node");
          for (const [id, node] of gateNodes) {
            assert.ok(typeof node.maxRetries === "number", `gate '${id}' should have maxRetries`);
          }
        });
      }

      if (workflowConfig.hasFork) {
        it("should have valid fork/join structure", () => {
          const forkNodes = Object.entries(workflow.nodes).filter(([, n]) => n.type === "fork");
          const joinNodes = Object.entries(workflow.nodes).filter(([, n]) => n.type === "join");
          assert.ok(forkNodes.length > 0, "should have at least one fork node");
          assert.strictEqual(forkNodes.length, joinNodes.length, "fork/join count should match");

          for (const [forkId, forkNode] of forkNodes) {
            assert.ok(forkNode.join, `fork '${forkId}' should reference a join`);
            const joinNode = workflow.nodes[forkNode.join];
            assert.ok(joinNode, `fork '${forkId}' join '${forkNode.join}' should exist`);
            assert.strictEqual(joinNode.type, "join", `join node should have type 'join'`);
            assert.strictEqual(joinNode.fork, forkId, `join should reference back to fork`);
          }
        });
      }
    });

    // Engine navigation
    describe("engine navigation", () => {
      let ctx;

      beforeEach(() => {
        ctx = createTestContext({ workflows: [workflowConfig.id] });
      });

      it("should init at start node", () => {
        const result = ctx.engine.init({ workflowType: workflowConfig.id, taskFilePath: ctx.taskFile });
        assert.strictEqual(result.currentStep, "start");
        assert.strictEqual(result.terminal, "start");
      });

      it("should return instructions from init", () => {
        const result = ctx.engine.init({ workflowType: workflowConfig.id, taskFilePath: ctx.taskFile });
        assert.ok(result.instructions.includes("## Queued"));
        assert.ok(result.instructions.includes("→ Call Start()"));
      });

      it("should advance from start on start()", () => {
        ctx.engine.init({ workflowType: workflowConfig.id, taskFilePath: ctx.taskFile });
        const result = ctx.engine.start({ taskFilePath: ctx.taskFile });
        assert.notStrictEqual(result.currentStep, "start", "should advance past start");
        assert.ok(result.instructions, "should return instructions");
      });

      // Cleanup handled automatically since we don't use afterEach
      // The test-helpers tmpDir will be garbage collected
    });

    // Diagram generation
    describe("diagram generation", () => {
      it("should generate a valid mermaid diagram", () => {
        const diagram = generateDiagram(workflow);
        assert.ok(diagram.includes("```mermaid"), "should contain mermaid code block");
        assert.ok(diagram.includes("flowchart TD"), "should be flowchart format");
        assert.ok(diagram.includes(`## Workflow:`), "should have workflow header");
      });

      it("should include step instructions table", () => {
        const diagram = generateDiagram(workflow);
        assert.ok(diagram.includes("### Step Instructions"), "should have step instructions section");
        assert.ok(diagram.includes("| Stage | Step | Name | Agent | Instructions |"), "should have table header");
      });

      it("should support currentStep highlighting", () => {
        // Find first non-terminal step
        const stepId = Object.entries(workflow.nodes).find(
          ([, n]) => n.type === "task" || n.type === "gate"
        )?.[0];
        if (stepId) {
          const diagram = generateDiagram(workflow, stepId);
          assert.ok(diagram.includes(`class ${stepId} currentStep`), "should highlight current step");
        }
      });
    });

    // Catalog integration
    describe("catalog integration", () => {
      it("should produce a valid workflow summary", () => {
        const summary = buildWorkflowSummary(workflowConfig.id, workflow);
        assert.strictEqual(summary.id, workflowConfig.id);
        assert.ok(summary.name, "should have a name");
        assert.ok(typeof summary.stepCount === "number", "should have step count");
        assert.ok(summary.stepCount > 0, "should have at least one step");
      });
    });
  });
}

// =============================================================================
// Bug Hunt specific tests (more detailed)
// =============================================================================

describe("bug-hunt workflow specific tests", () => {
  let workflow;

  beforeEach(() => {
    workflow = loadCatalogWorkflow("bug-hunt");
  });

  it("should have two HITL escalation nodes", () => {
    const hitlInconclusive = workflow.nodes.hitl_inconclusive;
    assert.ok(hitlInconclusive);
    assert.strictEqual(hitlInconclusive.type, "end");
    assert.strictEqual(hitlInconclusive.escalation, "hitl");

    const hitlFixFailed = workflow.nodes.hitl_fix_failed;
    assert.ok(hitlFixFailed);
    assert.strictEqual(hitlFixFailed.type, "end");
    assert.strictEqual(hitlFixFailed.escalation, "hitl");
  });

  it("should have fork with three branch edges", () => {
    const branchEdges = workflow.edges.filter((e) => e.from === "fork_investigate");
    assert.strictEqual(branchEdges.length, 3);
    const targets = branchEdges.map((e) => e.to);
    assert.ok(targets.includes("reproduce"));
    assert.ok(targets.includes("code_archaeology"));
    assert.ok(targets.includes("git_forensics"));
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

describe("bug-hunt workflow transitions", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext({ workflows: ["bug-hunt"] });
  });

  it("should advance from triage to fork_investigate on passed", () => {
    const result = ctx.engine.evaluateTransition("bug-hunt", "triage", "passed", 0);
    assert.strictEqual(result.nextStep, "fork_investigate");
  });

  it("should retry verify_fix on failure within limit", () => {
    const result = ctx.engine.evaluateTransition("bug-hunt", "verify_fix", "failed", 0);
    assert.strictEqual(result.nextStep, "write_fix");
    assert.strictEqual(result.action, "retry");
  });

  it("should escalate verify_fix to hitl after max retries", () => {
    const result = ctx.engine.evaluateTransition("bug-hunt", "verify_fix", "failed", 3);
    assert.strictEqual(result.nextStep, "hitl_fix_failed");
    assert.strictEqual(result.action, "escalate");
  });

  it("should have recovery edge from hitl_inconclusive to triage", () => {
    const result = ctx.engine.evaluateTransition("bug-hunt", "hitl_inconclusive", "passed", 0);
    assert.strictEqual(result.nextStep, "triage");
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
      const result = ctx.engine.evaluateTransition("bug-hunt", step.from, step.result || "passed", 0);
      assert.strictEqual(
        result.nextStep,
        step.expected,
        `From '${step.from}' expected '${step.expected}' but got '${result.nextStep}'`
      );
    }
  });
});
