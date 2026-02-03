import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildWorkflowSummary,
  buildCatalogSelectionOptions,
  buildAgentSummary,
  buildAgentSelectionOptions,
  parseFrontmatter,
  buildCatalogResponse,
  buildEmptyCatalogResponse,
} from "./catalog.js";

describe("buildWorkflowSummary", () => {
  it("should use content.id when available", () => {
    const result = buildWorkflowSummary("file-id", { id: "content-id", name: "Test" });
    assert.strictEqual(result.id, "content-id");
  });

  it("should fall back to fileId when no content.id", () => {
    const result = buildWorkflowSummary("file-id", { name: "Test" });
    assert.strictEqual(result.id, "file-id");
  });

  it("should use content.name when available", () => {
    const result = buildWorkflowSummary("file-id", { name: "Test Name" });
    assert.strictEqual(result.name, "Test Name");
  });

  it("should fall back to content.id for name", () => {
    const result = buildWorkflowSummary("file-id", { id: "content-id" });
    assert.strictEqual(result.name, "content-id");
  });

  it("should fall back to fileId for name", () => {
    const result = buildWorkflowSummary("file-id", {});
    assert.strictEqual(result.name, "file-id");
  });

  it("should use content.description when available", () => {
    const result = buildWorkflowSummary("file-id", { description: "Test desc" });
    assert.strictEqual(result.description, "Test desc");
  });

  it("should use empty string for missing description", () => {
    const result = buildWorkflowSummary("file-id", {});
    assert.strictEqual(result.description, "");
  });

  it("should count nodes for stepCount", () => {
    const result = buildWorkflowSummary("file-id", {
      nodes: { a: {}, b: {}, c: {} },
    });
    assert.strictEqual(result.stepCount, 3);
  });

  it("should handle missing nodes", () => {
    const result = buildWorkflowSummary("file-id", {});
    assert.strictEqual(result.stepCount, 0);
  });
});

describe("parseFrontmatter", () => {
  it("should parse name and description", () => {
    const content = "---\nname: Developer\ndescription: Writes code\n---\n\nBody";
    const result = parseFrontmatter(content);
    assert.strictEqual(result.name, "Developer");
    assert.strictEqual(result.description, "Writes code");
  });

  it("should parse model field", () => {
    const content = "---\nname: Context Engineer\nmodel: opus\n---\n\nBody";
    const result = parseFrontmatter(content);
    assert.strictEqual(result.model, "opus");
  });

  it("should return empty object for no frontmatter", () => {
    const result = parseFrontmatter("No frontmatter here");
    assert.deepStrictEqual(result, {});
  });

  it("should return empty object for empty frontmatter", () => {
    const result = parseFrontmatter("---\n---\nBody");
    assert.deepStrictEqual(result, {});
  });

  it("should handle description with colons", () => {
    const content = "---\nname: Test\ndescription: Does this: and that\n---\n";
    const result = parseFrontmatter(content);
    assert.strictEqual(result.description, "Does this: and that");
  });
});

describe("buildAgentSummary", () => {
  it("should use frontmatter name", () => {
    const result = buildAgentSummary("developer", { name: "Developer", description: "Writes code" });
    assert.strictEqual(result.id, "developer");
    assert.strictEqual(result.name, "Developer");
    assert.strictEqual(result.description, "Writes code");
  });

  it("should fall back to fileId for name", () => {
    const result = buildAgentSummary("developer", {});
    assert.strictEqual(result.name, "developer");
  });

  it("should use empty string for missing description", () => {
    const result = buildAgentSummary("developer", {});
    assert.strictEqual(result.description, "");
  });

  it("should include model when present", () => {
    const result = buildAgentSummary("ctx", { name: "Context Engineer", model: "opus" });
    assert.strictEqual(result.model, "opus");
  });

  it("should have undefined model when not present", () => {
    const result = buildAgentSummary("developer", { name: "Developer" });
    assert.strictEqual(result.model, undefined);
  });
});

describe("buildAgentSelectionOptions", () => {
  const agents = [
    { id: "developer", name: "Developer", description: "Writes code" },
    { id: "tester", name: "Tester", description: "Tests code" },
  ];

  it("should have All option first", () => {
    const result = buildAgentSelectionOptions(agents);
    assert.strictEqual(result[0].label, "All agents (Recommended)");
  });

  it("should include agent count in All description", () => {
    const result = buildAgentSelectionOptions(agents);
    assert.ok(result[0].description.includes("2 agent"));
  });

  it("should include all agents as options", () => {
    const result = buildAgentSelectionOptions(agents);
    assert.strictEqual(result.length, 3); // All + 2 agents
    assert.strictEqual(result[1].label, "Developer");
    assert.strictEqual(result[2].label, "Tester");
  });

  it("should handle empty agents", () => {
    const result = buildAgentSelectionOptions([]);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].description.includes("0 agent"));
  });
});

describe("buildCatalogSelectionOptions", () => {
  const workflows = [
    { id: "wf1", name: "Workflow One", description: "First", stepCount: 5 },
    { id: "wf2", name: "Workflow Two", description: "Second", stepCount: 3 },
  ];

  it("should have All option first", () => {
    const result = buildCatalogSelectionOptions(workflows);
    assert.strictEqual(result[0].label, "All workflows (Recommended)");
  });

  it("should include workflow count in All description", () => {
    const result = buildCatalogSelectionOptions(workflows);
    assert.ok(result[0].description.includes("2 workflows"));
  });

  it("should include all workflows as options", () => {
    const result = buildCatalogSelectionOptions(workflows);
    assert.strictEqual(result.length, 3); // All + 2 workflows
    assert.strictEqual(result[1].label, "Workflow One");
    assert.strictEqual(result[2].label, "Workflow Two");
  });

  it("should include description and step count", () => {
    const result = buildCatalogSelectionOptions(workflows);
    assert.strictEqual(result[1].description, "First (5 steps)");
    assert.strictEqual(result[2].description, "Second (3 steps)");
  });

  it("should handle empty workflows", () => {
    const result = buildCatalogSelectionOptions([]);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].description.includes("0 workflows"));
  });
});

describe("buildCatalogResponse", () => {
  const workflows = [{ id: "wf1", name: "Workflow One", description: "First", stepCount: 5 }];
  const agents = [{ id: "developer", name: "Developer", description: "Writes code" }];

  it("should have schemaVersion 3", () => {
    const result = buildCatalogResponse(workflows, agents);
    assert.strictEqual(result.schemaVersion, 3);
  });

  it("should include workflows array", () => {
    const result = buildCatalogResponse(workflows, agents);
    assert.deepStrictEqual(result.workflows, workflows);
  });

  it("should include workflowSelectionOptions", () => {
    const result = buildCatalogResponse(workflows, agents);
    assert.ok(Array.isArray(result.workflowSelectionOptions));
    assert.strictEqual(result.workflowSelectionOptions.length, 2);
  });

  it("should include agents array", () => {
    const result = buildCatalogResponse(workflows, agents);
    assert.deepStrictEqual(result.agents, agents);
  });

  it("should include agentSelectionOptions", () => {
    const result = buildCatalogResponse(workflows, agents);
    assert.ok(Array.isArray(result.agentSelectionOptions));
    assert.strictEqual(result.agentSelectionOptions.length, 2);
  });

  it("should default agents to empty array", () => {
    const result = buildCatalogResponse(workflows);
    assert.deepStrictEqual(result.agents, []);
    assert.strictEqual(result.agentSelectionOptions.length, 1); // just "All"
  });
});

describe("buildEmptyCatalogResponse", () => {
  it("should have schemaVersion 3", () => {
    const result = buildEmptyCatalogResponse();
    assert.strictEqual(result.schemaVersion, 3);
  });

  it("should have empty workflows array", () => {
    const result = buildEmptyCatalogResponse();
    assert.deepStrictEqual(result.workflows, []);
  });

  it("should have empty workflowSelectionOptions array", () => {
    const result = buildEmptyCatalogResponse();
    assert.deepStrictEqual(result.workflowSelectionOptions, []);
  });

  it("should have empty agents array", () => {
    const result = buildEmptyCatalogResponse();
    assert.deepStrictEqual(result.agents, []);
  });

  it("should have empty agentSelectionOptions array", () => {
    const result = buildEmptyCatalogResponse();
    assert.deepStrictEqual(result.agentSelectionOptions, []);
  });
});
