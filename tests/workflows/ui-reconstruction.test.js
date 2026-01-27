import { describe, beforeEach, it } from "node:test";
import assert from "node:assert";
import { WorkflowStore } from "../../plugins/workflow-engine/store.js";
import { WorkflowEngine } from "../../plugins/workflow-engine/engine.js";
import fs from "fs";
import path from "path";

describe("Workflow: UI Reconstruction (Granular Steps)", () => {
  let store;
  let engine;
  let runId;

  beforeEach(() => {
    store = new WorkflowStore();
    engine = new WorkflowEngine(store);

    const defPath = path.resolve("workflows/definitions/ui-reconstruction.json");
    const def = JSON.parse(fs.readFileSync(defPath, "utf8"));
    store.loadDefinition("ui-reconstruction", def);

    runId = store.createRun("ui-reconstruction");
  });

  it("should handle cascading reset when Stage 1 Review fails", async () => {
    let reviewFailures = 0;
    let completed = false;
    let ticks = 0;

    // Path of Analysis Steps
    const analysisSteps = [
      "ir_component_tree",
      "ir_feature_boundary",
      "ir_interactivity",
      "ir_business_object",
      "ir_annotate",
      "ir_ascii",
    ];

    while (ticks < 200) {
      ticks++;
      const nextTasks = engine.getNextTasks(runId);

      if (nextTasks.length === 0) {
        const runStatus = store.getRun(runId);
        const allDone = Object.values(runStatus.steps).every((s) => s.status === "COMPLETED");
        if (allDone) {
          completed = true;
          break;
        }
        continue;
      }

      for (const task of nextTasks) {
        store.updateTaskStatus(runId, task.id, "IN_PROGRESS");

        if (task.id === "s1_review") {
          if (reviewFailures === 0) {
            // Fail IR Review
            store.updateTaskStatus(runId, "s1_review", "FAILED");

            // ORCHESTRATOR LOGIC:
            // When rejecting IR, we arguably need to restart the WHOLE analysis chain
            // starting from the root: ir_component_tree.
            // Resetting the root should imply downstream tasks are "waiting" again
            // (conceptually), but in our engine, they stay COMPLETED until we reset them.
            // So we must explicitly reset ALL analysis steps to PENDING to force re-execution.

            analysisSteps.forEach((stepId) => {
              store.updateTaskStatus(runId, stepId, "PENDING");
            });

            // Reset self
            store.updateTaskStatus(runId, "s1_review", "PENDING");

            reviewFailures++;
          } else {
            store.updateTaskStatus(runId, task.id, "COMPLETED");
          }
        } else {
          store.updateTaskStatus(runId, task.id, "COMPLETED");
        }
      }
    }

    assert.strictEqual(completed, true);
    assert.ok(reviewFailures > 0, "Should have failed IR review once");

    const run = store.getRun(runId);
    // Verify retry counts on the first step to confirm it actually ran again
    assert.strictEqual(run.steps["ir_component_tree"].retryCount, 1);
  });
});
