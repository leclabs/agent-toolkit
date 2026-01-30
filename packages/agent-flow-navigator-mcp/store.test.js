import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { WorkflowStore, validateWorkflow } from "./store.js";

describe("validateWorkflow", () => {
  it("should return true for valid workflow", () => {
    const workflow = {
      nodes: { start: { type: "start" } },
      edges: [{ from: "start", to: "end" }],
    };
    assert.strictEqual(validateWorkflow("test", workflow), true);
  });

  it("should return false for missing nodes", () => {
    const workflow = { edges: [] };
    assert.strictEqual(validateWorkflow("test", workflow), false);
  });

  it("should return false for non-object nodes", () => {
    const workflow = { nodes: "invalid", edges: [] };
    assert.strictEqual(validateWorkflow("test", workflow), false);
  });

  it("should return false for missing edges", () => {
    const workflow = { nodes: {} };
    assert.strictEqual(validateWorkflow("test", workflow), false);
  });

  it("should return false for non-array edges", () => {
    const workflow = { nodes: {}, edges: "invalid" };
    assert.strictEqual(validateWorkflow("test", workflow), false);
  });
});

describe("WorkflowStore", () => {
  let store;

  beforeEach(() => {
    store = new WorkflowStore();
  });

  describe("loadDefinition", () => {
    it("should load and return workflow id", () => {
      const wf = { name: "Test", nodes: {}, edges: [] };
      const id = store.loadDefinition("test-wf", wf);
      assert.strictEqual(id, "test-wf");
    });

    it("should overwrite existing workflow", () => {
      store.loadDefinition("test", { name: "Original" });
      store.loadDefinition("test", { name: "Updated" });
      assert.strictEqual(store.getDefinition("test").name, "Updated");
    });
  });

  describe("getDefinition", () => {
    it("should return loaded workflow", () => {
      const wf = { name: "Test", nodes: {}, edges: [] };
      store.loadDefinition("test", wf);
      assert.deepStrictEqual(store.getDefinition("test"), wf);
    });

    it("should return undefined for non-existent workflow", () => {
      assert.strictEqual(store.getDefinition("nonexistent"), undefined);
    });
  });

  describe("listWorkflows", () => {
    it("should return empty array when no workflows loaded", () => {
      assert.deepStrictEqual(store.listWorkflows(), []);
    });

    it("should return workflow summaries", () => {
      store.loadDefinition("wf1", {
        name: "Workflow One",
        description: "First workflow",
        nodes: { a: {}, b: {}, c: {} },
        edges: [],
      });
      store.loadDefinition("wf2", {
        name: "Workflow Two",
        description: "Second workflow",
        nodes: { x: {}, y: {} },
        edges: [],
      });

      const list = store.listWorkflows();
      assert.strictEqual(list.length, 2);

      const wf1 = list.find((w) => w.id === "wf1");
      assert.strictEqual(wf1.name, "Workflow One");
      assert.strictEqual(wf1.description, "First workflow");
      assert.strictEqual(wf1.stepCount, 3);

      const wf2 = list.find((w) => w.id === "wf2");
      assert.strictEqual(wf2.name, "Workflow Two");
      assert.strictEqual(wf2.stepCount, 2);
    });

    it("should use id as name fallback", () => {
      store.loadDefinition("my-workflow", { nodes: {}, edges: [] });
      const list = store.listWorkflows();
      assert.strictEqual(list[0].name, "my-workflow");
    });

    it("should use empty string as description fallback", () => {
      store.loadDefinition("test", { nodes: {}, edges: [] });
      const list = store.listWorkflows();
      assert.strictEqual(list[0].description, "");
    });
  });

  describe("listWorkflows with external filter", () => {
    it("should filter to external sources with 'external' filter", () => {
      store.loadDefinition("cat-wf", { name: "Catalog", nodes: {}, edges: [] }, "catalog");
      store.loadDefinition("proj-wf", { name: "Project", nodes: {}, edges: [] }, "project");
      store.loadDefinition("ext-wf", { name: "External", nodes: {}, edges: [] }, "external", "/plugins/fusion");

      const list = store.listWorkflows("external");
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, "ext-wf");
      assert.strictEqual(list[0].source, "external");
    });

    it("should return multiple external workflows", () => {
      store.loadDefinition("wf-a", { name: "A", nodes: {}, edges: [] }, "external", "/plugins/a");
      store.loadDefinition("wf-b", { name: "B", nodes: {}, edges: [] }, "external", "/plugins/b");
      store.loadDefinition("wf-c", { name: "C", nodes: {}, edges: [] }, "catalog");

      const list = store.listWorkflows("external");
      assert.strictEqual(list.length, 2);
      const ids = list.map((w) => w.id);
      assert.ok(ids.includes("wf-a"));
      assert.ok(ids.includes("wf-b"));
    });

    it("should return empty array when no external workflows exist", () => {
      store.loadDefinition("cat", { name: "Cat", nodes: {}, edges: [] }, "catalog");
      store.loadDefinition("proj", { name: "Proj", nodes: {}, edges: [] }, "project");

      const list = store.listWorkflows("external");
      assert.deepStrictEqual(list, []);
    });

    it("should include external workflows in 'all' filter", () => {
      store.loadDefinition("cat", { name: "Cat", nodes: {}, edges: [] }, "catalog");
      store.loadDefinition("ext", { name: "Ext", nodes: {}, edges: [] }, "external", "/plugins/ext");

      const list = store.listWorkflows("all");
      assert.strictEqual(list.length, 2);
    });

    it("should not include external workflows in 'catalog' filter", () => {
      store.loadDefinition("cat", { name: "Cat", nodes: {}, edges: [] }, "catalog");
      store.loadDefinition("ext", { name: "Ext", nodes: {}, edges: [] }, "external", "/plugins/ext");

      const list = store.listWorkflows("catalog");
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].id, "cat");
    });

    it("should store external source correctly", () => {
      store.loadDefinition("ext-wf", { name: "Ext", nodes: {}, edges: [] }, "external", "/plugins/fusion");

      assert.strictEqual(store.getSource("ext-wf"), "external");
    });
  });

  describe("hasExternalWorkflows", () => {
    it("should return false when no external workflows exist", () => {
      store.loadDefinition("cat", { name: "Cat", nodes: {}, edges: [] }, "catalog");
      store.loadDefinition("proj", { name: "Proj", nodes: {}, edges: [] }, "project");

      assert.strictEqual(store.hasExternalWorkflows(), false);
    });

    it("should return true when external workflows exist", () => {
      store.loadDefinition("cat", { name: "Cat", nodes: {}, edges: [] }, "catalog");
      store.loadDefinition("ext", { name: "Ext", nodes: {}, edges: [] }, "external", "/plugins/fusion");

      assert.strictEqual(store.hasExternalWorkflows(), true);
    });

    it("should return false for empty store", () => {
      assert.strictEqual(store.hasExternalWorkflows(), false);
    });
  });

  describe("sourceRoot tracking", () => {
    it("should store and retrieve sourceRoot per workflow", () => {
      store.loadDefinition("ext-wf", { name: "Ext", nodes: {}, edges: [] }, "external", "/plugins/fusion");

      assert.strictEqual(store.getSourceRoot("ext-wf"), "/plugins/fusion");
    });

    it("should return undefined for workflow without sourceRoot", () => {
      store.loadDefinition("cat-wf", { name: "Cat", nodes: {}, edges: [] }, "catalog");

      assert.strictEqual(store.getSourceRoot("cat-wf"), undefined);
    });

    it("should return undefined for non-existent workflow", () => {
      assert.strictEqual(store.getSourceRoot("nonexistent"), undefined);
    });

    it("should clear sourceRoots on clear()", () => {
      store.loadDefinition("ext-wf", { name: "Ext", nodes: {}, edges: [] }, "external", "/plugins/fusion");
      assert.strictEqual(store.getSourceRoot("ext-wf"), "/plugins/fusion");

      store.clear();
      assert.strictEqual(store.getSourceRoot("ext-wf"), undefined);
    });

    it("should not set sourceRoot when null", () => {
      store.loadDefinition("cat-wf", { name: "Cat", nodes: {}, edges: [] }, "catalog", null);

      assert.strictEqual(store.getSourceRoot("cat-wf"), undefined);
    });
  });

  describe("has", () => {
    it("should return true for existing workflow", () => {
      store.loadDefinition("test", { nodes: {}, edges: [] });
      assert.strictEqual(store.has("test"), true);
    });

    it("should return false for non-existent workflow", () => {
      assert.strictEqual(store.has("nonexistent"), false);
    });
  });

  describe("clear", () => {
    it("should remove all workflows", () => {
      store.loadDefinition("wf1", { nodes: {}, edges: [] });
      store.loadDefinition("wf2", { nodes: {}, edges: [] });
      assert.strictEqual(store.size, 2);

      store.clear();
      assert.strictEqual(store.size, 0);
      assert.strictEqual(store.has("wf1"), false);
    });
  });

  describe("size", () => {
    it("should return 0 for empty store", () => {
      assert.strictEqual(store.size, 0);
    });

    it("should return correct count", () => {
      store.loadDefinition("wf1", { nodes: {}, edges: [] });
      store.loadDefinition("wf2", { nodes: {}, edges: [] });
      store.loadDefinition("wf3", { nodes: {}, edges: [] });
      assert.strictEqual(store.size, 3);
    });
  });
});
