import { describe, it } from "node:test";
import assert from "node:assert";
import { buildWorkflowSelectionDialog, buildOption } from "./dialog.js";

describe("buildOption", () => {
  it("should build option from workflow summary", () => {
    const workflow = {
      id: "test-wf",
      name: "Test Workflow",
      description: "A test workflow",
      stepCount: 5,
    };
    const option = buildOption(workflow);
    assert.strictEqual(option.label, "Test Workflow");
    assert.strictEqual(option.description, "A test workflow (5 steps)");
  });
});

describe("buildWorkflowSelectionDialog", () => {
  const sampleWorkflows = [
    { id: "feature-development", name: "Feature Development", description: "Build new features", stepCount: 10 },
    { id: "bug-fix", name: "Bug Fix", description: "Fix bugs", stepCount: 8 },
    { id: "quick-task", name: "Quick Task", description: "Simple tasks", stepCount: 3 },
    { id: "agile-task", name: "Agile Task", description: "Agile workflow", stepCount: 5 },
  ];

  it("should return object with schemaVersion", () => {
    const result = buildWorkflowSelectionDialog(sampleWorkflows);
    assert.strictEqual(result.schemaVersion, 2);
  });

  it("should include workflows array", () => {
    const result = buildWorkflowSelectionDialog(sampleWorkflows);
    assert.deepStrictEqual(result.workflows, sampleWorkflows);
  });

  it("should have three dialog panels", () => {
    const result = buildWorkflowSelectionDialog(sampleWorkflows);
    assert.strictEqual(result.dialog.length, 3);
  });

  it("should have Primary panel with primary workflows", () => {
    const result = buildWorkflowSelectionDialog(sampleWorkflows);
    const primary = result.dialog[0];
    assert.strictEqual(primary.header, "Primary");
    assert.strictEqual(primary.question, "Which workflow?");
    assert.strictEqual(primary.multiSelect, false);
    // Should have feature-development and bug-fix
    const labels = primary.options.map((o) => o.label);
    assert.ok(labels.includes("Feature Development"));
    assert.ok(labels.includes("Bug Fix"));
  });

  it("should have Other panel with secondary workflows", () => {
    const result = buildWorkflowSelectionDialog(sampleWorkflows);
    const other = result.dialog[1];
    assert.strictEqual(other.header, "Other");
    const labels = other.options.map((o) => o.label);
    assert.ok(labels.includes("Quick Task"));
    assert.ok(labels.includes("Agile Task"));
  });

  it("should have Docs panel with yes/no options", () => {
    const result = buildWorkflowSelectionDialog(sampleWorkflows);
    const docs = result.dialog[2];
    assert.strictEqual(docs.header, "Docs");
    assert.strictEqual(docs.options.length, 2);
    assert.strictEqual(docs.options[0].label, "Yes");
    assert.strictEqual(docs.options[1].label, "No");
  });

  it("should filter out non-existent workflows", () => {
    // Only provide feature-development
    const result = buildWorkflowSelectionDialog([
      { id: "feature-development", name: "Feature", description: "Desc", stepCount: 5 },
    ]);
    const primary = result.dialog[0];
    // Should only have one option
    assert.strictEqual(primary.options.length, 1);
    assert.strictEqual(primary.options[0].label, "Feature");
  });

  it("should handle empty workflow list", () => {
    const result = buildWorkflowSelectionDialog([]);
    assert.strictEqual(result.schemaVersion, 2);
    assert.deepStrictEqual(result.workflows, []);
    // Primary and Other panels should have empty options
    assert.strictEqual(result.dialog[0].options.length, 0);
    assert.strictEqual(result.dialog[1].options.length, 0);
    // Docs panel should still have options
    assert.strictEqual(result.dialog[2].options.length, 2);
  });
});
