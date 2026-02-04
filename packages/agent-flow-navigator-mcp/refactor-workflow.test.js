import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { WorkflowEngine } from "./engine.js";
import { WorkflowStore, validateWorkflow } from "./store.js";
import { generateDiagram } from "./diagram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadRefactorWorkflow() {
  return JSON.parse(readFileSync(join(__dirname, "catalog", "workflows", "refactor.json"), "utf-8"));
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

  it("should pass validateWorkflow", () => {
    assert.strictEqual(validateWorkflow("refactor", workflow), true);
  });

  it("should have start and end nodes", () => {
    assert.ok(workflow.nodes.start);
    assert.strictEqual(workflow.nodes.start.type, "start");
    assert.ok(workflow.nodes.end_success);
    assert.strictEqual(workflow.nodes.end_success.type, "end");
  });
});

// =============================================================================
// Refactor workflow - Engine navigation
// =============================================================================

describe("refactor workflow engine navigation", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("refactor", loadRefactorWorkflow());
  });

  it("should start at start node", () => {
    const result = engine.start({ workflowType: "refactor" });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
  });

  it("should return outgoing edges", () => {
    const result = engine.start({ workflowType: "refactor" });
    assert.ok(result.edges.length > 0);
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
  });
});
