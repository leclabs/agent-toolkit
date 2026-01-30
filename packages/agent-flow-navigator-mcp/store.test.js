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

    describe("context metadata in listWorkflows", () => {
      it("should include context metadata when workflow declares context fields (AC-1)", () => {
        store.loadDefinition("ctx-wf", {
          name: "Context Workflow",
          description: "Has context",
          nodes: { a: {} },
          edges: [],
          required_skills: ["/commit", "/review-pr"],
          context_skills: ["/flow:prime"],
          context_files: ["ARCHITECTURE.md"],
        });

        const list = store.listWorkflows();
        const wf = list.find((w) => w.id === "ctx-wf");

        assert.ok(wf.context);
        assert.deepStrictEqual(wf.context.required_skills, ["/commit", "/review-pr"]);
        assert.deepStrictEqual(wf.context.context_skills, ["/flow:prime"]);
        assert.deepStrictEqual(wf.context.context_files, ["ARCHITECTURE.md"]);
      });

      it("should return empty arrays for workflow without context fields (AC-2)", () => {
        store.loadDefinition("plain-wf", {
          name: "Plain Workflow",
          nodes: { a: {} },
          edges: [],
        });

        const list = store.listWorkflows();
        const wf = list.find((w) => w.id === "plain-wf");

        assert.ok(wf.context);
        assert.deepStrictEqual(wf.context.required_skills, []);
        assert.deepStrictEqual(wf.context.context_skills, []);
        assert.deepStrictEqual(wf.context.context_files, []);
      });

      it("should default missing context fields to empty arrays", () => {
        store.loadDefinition("partial-wf", {
          name: "Partial Context",
          nodes: { a: {} },
          edges: [],
          required_skills: ["/commit"],
          // context_skills and context_files not declared
        });

        const list = store.listWorkflows();
        const wf = list.find((w) => w.id === "partial-wf");

        assert.deepStrictEqual(wf.context.required_skills, ["/commit"]);
        assert.deepStrictEqual(wf.context.context_skills, []);
        assert.deepStrictEqual(wf.context.context_files, []);
      });
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
