/**
 * test-helpers.js - Shared test utilities for navigator MCP tests
 */

import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { WorkflowEngine } from "./engine.js";
import { WorkflowStore } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create a test context with store, engine, and temp directory
 * @param {Object} [options] - Options
 * @param {string[]} [options.workflows] - Workflow IDs to load from catalog
 * @param {Object} [options.customWorkflows] - Custom workflow definitions {id: definition}
 * @returns {{store: WorkflowStore, engine: WorkflowEngine, tmpDir: string, taskFile: string}}
 */
export function createTestContext(options = {}) {
  const store = new WorkflowStore();
  const engine = new WorkflowEngine(store);
  const tmpDir = mkdtempSync(join(tmpdir(), "flow-test-"));
  const taskFile = join(tmpDir, "test-task.json");

  // Load catalog workflows
  if (options.workflows) {
    for (const id of options.workflows) {
      const workflow = loadCatalogWorkflow(id);
      store.loadDefinition(id, workflow);
    }
  }

  // Load custom workflow definitions
  if (options.customWorkflows) {
    for (const [id, definition] of Object.entries(options.customWorkflows)) {
      store.loadDefinition(id, definition);
    }
  }

  return { store, engine, tmpDir, taskFile };
}

/**
 * Clean up a test context (remove temp directory)
 * @param {{tmpDir: string}} ctx - Test context
 */
export function cleanupTestContext(ctx) {
  if (ctx?.tmpDir) {
    try {
      rmSync(ctx.tmpDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Load a workflow from the catalog
 * @param {string} id - Workflow ID (without .json extension)
 * @returns {Object} Workflow definition
 */
export function loadCatalogWorkflow(id) {
  const path = join(__dirname, "catalog", "workflows", `${id}.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Simple workflow for basic testing
 */
export const simpleWorkflow = {
  nodes: {
    start: { type: "start", name: "Start" },
    task1: { type: "task", name: "Task 1", agent: "Developer", description: "First task" },
    task2: { type: "task", name: "Task 2" },
    end_success: { type: "end", result: "success" },
    end_failure: { type: "end", result: "failure" },
  },
  edges: [
    { from: "start", to: "task1" },
    { from: "task1", to: "task2", on: "passed" },
    { from: "task1", to: "end_failure", on: "failed" },
    { from: "task2", to: "end_success", on: "passed" },
    { from: "task2", to: "end_failure", on: "failed" },
  ],
};

/**
 * Workflow with retry support for testing retry behavior
 */
export const retryWorkflow = {
  nodes: {
    start: { type: "start" },
    work: { type: "task", name: "Work", maxRetries: 2 },
    end_success: { type: "end", result: "success" },
    end_hitl: { type: "end", result: "failure", escalation: "hitl" },
  },
  edges: [
    { from: "start", to: "work" },
    { from: "work", to: "end_success", on: "passed" },
    { from: "work", to: "work", on: "failed" },
    { from: "work", to: "end_hitl", on: "failed" },
  ],
};

/**
 * Workflow with fork/join for testing parallel execution
 */
export const forkWorkflow = {
  nodes: {
    start: { type: "start" },
    fork_work: { type: "fork", name: "Fork Work", join: "join_work", maxConcurrency: 3 },
    branch_a: { type: "task", name: "Branch A", agent: "Developer", description: "First branch" },
    branch_b: { type: "task", name: "Branch B", agent: "Tester", description: "Second branch" },
    join_work: { type: "join", name: "Join Work", fork: "fork_work" },
    end_success: { type: "end", result: "success" },
  },
  edges: [
    { from: "start", to: "fork_work" },
    { from: "fork_work", to: "branch_a" },
    { from: "fork_work", to: "branch_b" },
    { from: "branch_a", to: "join_work", on: "passed" },
    { from: "branch_b", to: "join_work", on: "passed" },
    { from: "join_work", to: "end_success", on: "passed" },
  ],
};

/**
 * Workflow with retry loop to prior step (gate -> task on failed)
 */
export const retryLoopWorkflow = {
  nodes: {
    start: { type: "start" },
    compute: { type: "task", name: "Compute" },
    check: { type: "gate", name: "Check", maxRetries: 2 },
    end_success: { type: "end", result: "success" },
    end_hitl: { type: "end", result: "failure", escalation: "hitl" },
  },
  edges: [
    { from: "start", to: "compute" },
    { from: "compute", to: "check", on: "passed" },
    { from: "check", to: "end_success", on: "passed" },
    { from: "check", to: "compute", on: "failed" },
    { from: "check", to: "end_hitl", on: "failed" },
  ],
};
