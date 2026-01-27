import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateFlowReadme,
  generateWorkflowsReadme,
  isValidWorkflowForCopy,
  computeWorkflowsToCopy,
} from "./copier.js";

describe("generateFlowReadme", () => {
  it("should return a string", () => {
    const result = generateFlowReadme();
    assert.strictEqual(typeof result, "string");
  });

  it("should include Flow Plugin header", () => {
    const result = generateFlowReadme();
    assert.ok(result.includes("# Flow Plugin"));
  });

  it("should include quick start section", () => {
    const result = generateFlowReadme();
    assert.ok(result.includes("## Quick Start"));
  });

  it("should include commands table", () => {
    const result = generateFlowReadme();
    assert.ok(result.includes("## Commands"));
    assert.ok(result.includes("/flow:task-create"));
  });

  it("should include available workflows", () => {
    const result = generateFlowReadme();
    assert.ok(result.includes("## Available Workflows"));
    assert.ok(result.includes("quick-task"));
    assert.ok(result.includes("feature-development"));
  });
});

describe("generateWorkflowsReadme", () => {
  it("should return a string", () => {
    const result = generateWorkflowsReadme();
    assert.strictEqual(typeof result, "string");
  });

  it("should include Flow Workflows header", () => {
    const result = generateWorkflowsReadme();
    assert.ok(result.includes("# Flow Workflows"));
  });

  it("should include directory structure", () => {
    const result = generateWorkflowsReadme();
    assert.ok(result.includes("## Directory Structure"));
    assert.ok(result.includes("workflow.json"));
  });

  it("should include customization instructions", () => {
    const result = generateWorkflowsReadme();
    assert.ok(result.includes("## Customizing Step Instructions"));
  });

  it("should include JSON example", () => {
    const result = generateWorkflowsReadme();
    assert.ok(result.includes('"instructions"'));
  });
});

describe("isValidWorkflowForCopy", () => {
  it("should return true for valid workflow", () => {
    const workflow = { nodes: {}, edges: [] };
    assert.strictEqual(isValidWorkflowForCopy(workflow), true);
  });

  it("should return false for null", () => {
    assert.strictEqual(isValidWorkflowForCopy(null), false);
  });

  it("should return false for undefined", () => {
    assert.strictEqual(isValidWorkflowForCopy(undefined), false);
  });

  it("should return false for missing nodes", () => {
    assert.strictEqual(isValidWorkflowForCopy({ edges: [] }), false);
  });

  it("should return false for missing edges", () => {
    assert.strictEqual(isValidWorkflowForCopy({ nodes: {} }), false);
  });

  it("should return false for empty object", () => {
    assert.strictEqual(isValidWorkflowForCopy({}), false);
  });
});

describe("computeWorkflowsToCopy", () => {
  const availableIds = ["wf1", "wf2", "wf3", "wf4"];

  it("should return all available when no specific requested", () => {
    const result = computeWorkflowsToCopy([], availableIds);
    assert.deepStrictEqual(result, availableIds);
  });

  it("should return all available when requestedIds is undefined", () => {
    const result = computeWorkflowsToCopy(undefined, availableIds);
    assert.deepStrictEqual(result, availableIds);
  });

  it("should return all available when requestedIds is null", () => {
    const result = computeWorkflowsToCopy(null, availableIds);
    assert.deepStrictEqual(result, availableIds);
  });

  it("should return only requested IDs when specified", () => {
    const result = computeWorkflowsToCopy(["wf1", "wf3"], availableIds);
    assert.deepStrictEqual(result, ["wf1", "wf3"]);
  });

  it("should return requested IDs even if not in available", () => {
    const result = computeWorkflowsToCopy(["wf1", "wf99"], availableIds);
    assert.deepStrictEqual(result, ["wf1", "wf99"]);
  });
});
