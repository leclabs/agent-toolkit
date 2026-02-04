import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { WorkflowEngine } from "./engine.js";
import { WorkflowStore, validateWorkflow } from "./store.js";
import { generateDiagram } from "./diagram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadWorkflow(name) {
  const path = join(__dirname, "catalog", "workflows", `${name}.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

// =============================================================================
// Build Review Workflows - JSON structure validation
// =============================================================================

describe("build-review-quick workflow JSON structure", () => {
  let workflow;

  beforeEach(() => {
    workflow = loadWorkflow("build-review-quick");
  });

  it("should have id 'build-review-quick'", () => {
    assert.strictEqual(workflow.id, "build-review-quick");
  });

  it("should pass validateWorkflow", () => {
    assert.strictEqual(validateWorkflow("build-review-quick", workflow), true);
  });

  it("should have start and end nodes", () => {
    assert.ok(workflow.nodes.start);
    assert.strictEqual(workflow.nodes.start.type, "start");
    assert.ok(workflow.nodes.end_success);
    assert.strictEqual(workflow.nodes.end_success.type, "end");
  });
});

describe("build-review-murder-board workflow JSON structure", () => {
  let workflow;

  beforeEach(() => {
    workflow = loadWorkflow("build-review-murder-board");
  });

  it("should have id 'build-review-murder-board'", () => {
    assert.strictEqual(workflow.id, "build-review-murder-board");
  });

  it("should pass validateWorkflow", () => {
    assert.strictEqual(validateWorkflow("build-review-murder-board", workflow), true);
  });

  it("should have start and end nodes", () => {
    assert.ok(workflow.nodes.start);
    assert.strictEqual(workflow.nodes.start.type, "start");
    assert.ok(workflow.nodes.end_success);
    assert.strictEqual(workflow.nodes.end_success.type, "end");
  });
});

// =============================================================================
// Build Review Workflows - Engine navigation
// =============================================================================

describe("build-review-quick workflow engine navigation", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-quick", loadWorkflow("build-review-quick"));
  });

  it("should start at start node", () => {
    const result = engine.start({ workflowType: "build-review-quick" });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
  });

  it("should return outgoing edges", () => {
    const result = engine.start({ workflowType: "build-review-quick" });
    assert.ok(result.edges.length > 0);
  });
});

describe("build-review-murder-board workflow engine navigation", () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-murder-board", loadWorkflow("build-review-murder-board"));
  });

  it("should start at start node", () => {
    const result = engine.start({ workflowType: "build-review-murder-board" });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
  });

  it("should return outgoing edges", () => {
    const result = engine.start({ workflowType: "build-review-murder-board" });
    assert.ok(result.edges.length > 0);
  });
});

// =============================================================================
// Build Review Workflows - Diagram generation
// =============================================================================

describe("build-review workflows diagram generation", () => {
  it("should generate diagram for build-review-quick", () => {
    const workflow = loadWorkflow("build-review-quick");
    const diagram = generateDiagram(workflow);
    assert.ok(diagram.includes("```mermaid"));
    assert.ok(diagram.includes("flowchart TD"));
  });

  it("should generate diagram for build-review-murder-board", () => {
    const workflow = loadWorkflow("build-review-murder-board");
    const diagram = generateDiagram(workflow);
    assert.ok(diagram.includes("```mermaid"));
    assert.ok(diagram.includes("flowchart TD"));
  });
});
