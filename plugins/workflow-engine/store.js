export class WorkflowStore {
  constructor() {
    this.workflows = new Map(); // Definition cache
    this.runs = new Map(); // Runtime state
  }

  // Load a workflow definition
  // Definition: {
  //   steps: {
  //     [id]: { id, priority, dependencies: [], agentConfig: {}, ... }
  //   }
  // }
  loadDefinition(id, definition) {
    this.workflows.set(id, definition);
    return id;
  }

  getDefinition(id) {
    return this.workflows.get(id);
  }

  createRun(workflowId) {
    const def = this.getDefinition(workflowId);
    if (!def) throw new Error(`Workflow ${workflowId} not found`);

    const runId = `run-${Date.now()}`;
    const initialSteps = {};

    // Initialize steps with granular status
    Object.values(def.steps).forEach((step) => {
      initialSteps[step.id] = {
        id: step.id,
        status: "PENDING", // PENDING, IN_PROGRESS, COMPLETED, FAILED, PAUSED, SKIPPED, CANCELED
        output: null,
        error: null,
        output: null,
        error: null,
        priority: step.priority || 0,
        retryCount: 0,
      };
    });

    this.runs.set(runId, {
      id: runId,
      workflowId,
      status: "RUNNING",
      steps: initialSteps,
    });

    return runId;
  }

  getRun(runId) {
    return this.runs.get(runId);
  }

  // Pure-ish mutation
  updateTaskStatus(runId, taskId, status, output = null, error = null) {
    const run = this.runs.get(runId);
    if (!run) throw new Error("Run not found");
    if (!run.steps[taskId]) throw new Error("Task not found");

    const currentStep = run.steps[taskId];
    let newStatus = status;
    let newError = error;
    let newRetryCount = currentStep.retryCount || 0;

    // Check for Loop/Retry (Transition to PENDING from non-PENDING)
    if (status === "PENDING" && currentStep.status !== "PENDING") {
      newRetryCount++;

      const def = this.getDefinition(run.workflowId);
      const step = def.steps[taskId];
      const maxIterations = step.maxIterations !== undefined ? step.maxIterations : 3; // Default 3

      if (newRetryCount > maxIterations) {
        newStatus = "FAILED";
        newError = `Max iterations (${maxIterations}) exceeded. Task stuck in loop.`;
      }
    }

    run.steps[taskId] = {
      ...currentStep,
      status: newStatus,
      output: output !== null ? output : currentStep.output,
      error: newError !== null ? newError : currentStep.error,
      retryCount: newRetryCount,
    };

    this.runs.set(runId, run);
    return run.steps[taskId];
  }
}
