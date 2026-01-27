export class WorkflowEngine {
  constructor(store) {
    this.store = store;
  }

  // Returns array of arrays (levels) for parallel execution
  // [[A, B], [C]] -> A and B can run in parallel, C runs after both
  getTopologicalLevels(workflowId) {
    const def = this.store.getDefinition(workflowId);
    if (!def) throw new Error("Workflow not found");

    const steps = Object.keys(def.steps);
    const inDegree = {};
    const adj = {};

    steps.forEach((n) => {
      inDegree[n] = 0;
      adj[n] = [];
    });

    steps.forEach((stepId) => {
      const step = def.steps[stepId];
      (step.dependencies || []).forEach((parent) => {
        adj[parent].push(stepId);
        inDegree[stepId]++;
      });
    });

    const queue = steps.filter((n) => inDegree[n] === 0);
    const levels = [];

    while (queue.length > 0) {
      const levelSize = queue.length;
      const currentLevel = [];

      for (let i = 0; i < levelSize; i++) {
        const u = queue.shift();
        currentLevel.push(u);

        adj[u].forEach((v) => {
          inDegree[v]--;
          if (inDegree[v] === 0) queue.push(v);
        });
      }
      levels.push(currentLevel);
    }

    // Cycle check omitted for brevity in this simplified version
    return levels;
  }

  // Smart Query: What should the agent do next?
  // Returns list of Task objects that are READY and HIGH PRIORITY
  getNextTasks(runId) {
    const run = this.store.getRun(runId);
    if (!run) throw new Error("Run not found");

    const def = this.store.getDefinition(run.workflowId);
    const readyTasks = [];

    // Check every task
    Object.values(run.steps).forEach((step) => {
      // 1. Must be PENDING
      if (step.status !== "PENDING") return;

      // 2. Deputies must be satisfied
      const step = def.steps[step.id];
      const parents = step.dependencies || [];

      const allParentsDone = parents.every((pId) => {
        const pStatus = run.steps[pId].status;
        // Dependencies met if parent is COMPLETED or SKIPPED
        return pStatus === "COMPLETED" || pStatus === "SKIPPED";
      });

      if (allParentsDone) {
        readyTasks.push({ ...step, ...step }); // Merge runtime state with static config
      }
    });

    // 3. Sort by Priority (High to Low), then by defined order
    readyTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return readyTasks;
  }
}
