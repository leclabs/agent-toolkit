import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateFlowReadme,
  generateWorkflowsReadme,
  isValidWorkflowForCopy,
  requireWorkflowIds,
  isValidAgentForCopy,
  requireAgentIds,
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

describe("requireWorkflowIds", () => {
  it("should throw when ids is empty", () => {
    assert.throws(() => requireWorkflowIds([]), { message: /workflowIds is required/ });
  });

  it("should throw when ids is undefined", () => {
    assert.throws(() => requireWorkflowIds(undefined), { message: /workflowIds is required/ });
  });

  it("should throw when ids is null", () => {
    assert.throws(() => requireWorkflowIds(null), { message: /workflowIds is required/ });
  });

  it("should not throw when ids are provided", () => {
    assert.doesNotThrow(() => requireWorkflowIds(["wf1", "wf2"]));
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

describe("requireAgentIds", () => {
  it("should throw when ids is empty", () => {
    assert.throws(() => requireAgentIds([]), { message: /agentIds is required/ });
  });

  it("should throw when ids is undefined", () => {
    assert.throws(() => requireAgentIds(undefined), { message: /agentIds is required/ });
  });

  it("should throw when ids is null", () => {
    assert.throws(() => requireAgentIds(null), { message: /agentIds is required/ });
  });

  it("should not throw when ids are provided", () => {
    assert.doesNotThrow(() => requireAgentIds(["developer", "tester"]));
  });
});
