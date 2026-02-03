import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateFlowReadme,
  generateWorkflowsReadme,
  isValidWorkflowForCopy,
  computeWorkflowsToCopy,
  isValidAgentForCopy,
  computeAgentsToCopy,
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

  it("should throw when requestedIds is empty", () => {
    assert.throws(() => computeWorkflowsToCopy([], availableIds), { message: /workflowIds is required/ });
  });

  it("should throw when requestedIds is undefined", () => {
    assert.throws(() => computeWorkflowsToCopy(undefined, availableIds), { message: /workflowIds is required/ });
  });

  it("should throw when requestedIds is null", () => {
    assert.throws(() => computeWorkflowsToCopy(null, availableIds), { message: /workflowIds is required/ });
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

describe("isValidAgentForCopy", () => {
  it("should return true for valid agent with frontmatter", () => {
    assert.strictEqual(isValidAgentForCopy("---\nname: Developer\n---\nBody"), true);
  });

  it("should return false for null", () => {
    assert.strictEqual(isValidAgentForCopy(null), false);
  });

  it("should return false for undefined", () => {
    assert.strictEqual(isValidAgentForCopy(undefined), false);
  });

  it("should return false for non-string", () => {
    assert.strictEqual(isValidAgentForCopy(42), false);
  });

  it("should return false for content without frontmatter", () => {
    assert.strictEqual(isValidAgentForCopy("No frontmatter here"), false);
  });

  it("should return false for empty string", () => {
    assert.strictEqual(isValidAgentForCopy(""), false);
  });
});

describe("computeAgentsToCopy", () => {
  it("should throw when requestedIds is empty", () => {
    assert.throws(() => computeAgentsToCopy([]), { message: /agentIds is required/ });
  });

  it("should throw when requestedIds is undefined", () => {
    assert.throws(() => computeAgentsToCopy(undefined), { message: /agentIds is required/ });
  });

  it("should throw when requestedIds is null", () => {
    assert.throws(() => computeAgentsToCopy(null), { message: /agentIds is required/ });
  });

  it("should return requested IDs when specified", () => {
    const result = computeAgentsToCopy(["developer", "tester"]);
    assert.deepStrictEqual(result, ["developer", "tester"]);
  });
});
