import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildWorkflowSummary,
  buildCatalogSelectionOptions,
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

  it("should have schemaVersion 2", () => {
    const result = buildCatalogResponse(workflows);
    assert.strictEqual(result.schemaVersion, 2);
  });

  it("should include workflows array", () => {
    const result = buildCatalogResponse(workflows);
    assert.deepStrictEqual(result.workflows, workflows);
  });

  it("should include selectionOptions", () => {
    const result = buildCatalogResponse(workflows);
    assert.ok(Array.isArray(result.selectionOptions));
    assert.strictEqual(result.selectionOptions.length, 2);
  });
});

describe("buildEmptyCatalogResponse", () => {
  it("should have schemaVersion 2", () => {
    const result = buildEmptyCatalogResponse();
    assert.strictEqual(result.schemaVersion, 2);
  });

  it("should have empty workflows array", () => {
    const result = buildEmptyCatalogResponse();
    assert.deepStrictEqual(result.workflows, []);
  });

  it("should have empty selectionOptions array", () => {
    const result = buildEmptyCatalogResponse();
    assert.deepStrictEqual(result.selectionOptions, []);
  });
});
