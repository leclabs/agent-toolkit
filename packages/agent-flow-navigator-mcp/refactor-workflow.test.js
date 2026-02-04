import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync, mkdtempSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
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
// Refactor workflow - Engine navigation (new API: init/start/current/next)
// =============================================================================

describe("refactor workflow engine navigation", () => {
  let store;
  let engine;
  let tmpDir;
  let taskFile;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);
    store.loadDefinition("refactor", loadRefactorWorkflow());

    tmpDir = mkdtempSync(join(tmpdir(), "nav-"));
    taskFile = join(tmpDir, "1.json");
  });

  it("should init at start node", () => {
    const result = engine.init({ workflowType: "refactor", taskFilePath: taskFile });
    assert.strictEqual(result.currentStep, "start");
    assert.strictEqual(result.terminal, "start");
  });

  it("should return instructions", () => {
    const result = engine.init({ workflowType: "refactor", taskFilePath: taskFile });
    assert.ok(result.instructions.includes("## Queued"));
    assert.ok(result.instructions.includes("→ Call Start()"));
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
