import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync, mkdtempSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
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
// Build Review Workflows - Engine navigation (new API: init/start/current/next)
// =============================================================================

describe("build-review-quick workflow engine navigation", () => {
  let store;
  let engine;
  let tmpDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-quick", loadWorkflow("build-review-quick"));

    tmpDir = mkdtempSync(join(tmpdir(), "nav-"));
    taskFile = join(tmpDir, "1.json");
  });

  it("should init at start node", () => {
    const result = engine.init({ workflowType: "build-review-quick", taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
  });

  it("should return instructions", () => {
    const result = engine.init({ workflowType: "build-review-quick", taskFilePath: taskFile });
    assert.ok(result.instructions.includes("## Queued"));
    assert.ok(result.instructions.includes("→ Call Start()"));
  });
});

describe("build-review-murder-board workflow engine navigation", () => {
  let store;
  let engine;
  let tmpDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("build-review-murder-board", loadWorkflow("build-review-murder-board"));

    tmpDir = mkdtempSync(join(tmpdir(), "nav-"));
    taskFile = join(tmpDir, "1.json");
  });

  it("should init at start node", () => {
    const result = engine.init({ workflowType: "build-review-murder-board", taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
  });

  it("should return instructions", () => {
    const result = engine.init({ workflowType: "build-review-murder-board", taskFilePath: taskFile });
    assert.ok(result.instructions.includes("## Queued"));
    assert.ok(result.instructions.includes("→ Call Start()"));
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
