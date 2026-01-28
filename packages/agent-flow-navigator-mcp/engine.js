/**
 * Workflow Engine
 *
 * Evaluates DAG transitions based on node outputs and retry state.
 *
 * Schema:
 * - nodes: { [id]: { type, name, maxRetries?, ... } }
 * - edges: [{ from, to, on?, label? }]
 *
 * Retry logic convention:
 * - maxRetries on the node defines how many retries are allowed
 * - Edge to non-end node = retry (taken if retries remaining)
 * - Edge to end node = escalation (taken if retries exhausted)
 */

import { existsSync, readFileSync } from "fs";

/**
 * Read and parse a task file
 * @param {string} taskFilePath - Path to task JSON file
 * @returns {Object|null} Task object or null if not found/invalid
 */
export function readTaskFile(taskFilePath) {
  if (!taskFilePath || !existsSync(taskFilePath)) return null;
  try {
    return JSON.parse(readFileSync(taskFilePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Check if a node is a terminal node (start or end)
 */
export function isTerminalNode(node) {
  if (!node) return false;
  return node.type === "start" || node.type === "end";
}

/**
 * Get terminal type for a node
 * Returns: "start" | "success" | "hitl" | "failure" | null
 */
export function getTerminalType(node) {
  if (!node) return null;
  if (node.type === "start") return "start";
  if (node.type === "end") {
    if (node.escalation === "hitl") return "hitl";
    return node.result === "success" ? "success" : "failure";
  }
  return null;
}

/**
 * Convert agent ID to subagent reference
 * e.g., "developer" -> "@flow:developer"
 */
export function toSubagentRef(agentId) {
  if (!agentId) return null;
  if (agentId.startsWith("@")) return agentId;
  // Namespaced: "org:developer" -> "@org:developer"
  if (agentId.includes(":")) return `@${agentId}`;
  // Simple: "developer" -> "@flow:developer"
  return `@flow:${agentId}`;
}

/**
 * Generate baseline instructions based on step type
 */
export function getBaselineInstructions(stepId, stepName) {
  const id = stepId.toLowerCase();
  const name = (stepName || "").toLowerCase();

  // Analysis/Planning steps
  if (id.includes("analyze") || id.includes("analysis") || name.includes("analyze")) {
    return "Review the task requirements carefully. Identify key constraints, dependencies, and acceptance criteria. Create a clear plan before proceeding.";
  }
  if (id.includes("plan") || id.includes("design") || name.includes("plan")) {
    return "Design the solution architecture. Consider edge cases, error handling, and how this fits with existing code. Document your approach.";
  }
  if (id.includes("investigate") || id.includes("reproduce")) {
    return "Gather evidence and understand the root cause. Document reproduction steps and any patterns observed.";
  }

  // Implementation steps
  if (id.includes("implement") || id.includes("build") || id.includes("develop") || id.includes("fix")) {
    return "Write clean, well-structured code following project conventions. Keep changes focused and minimal. Add comments only where the logic isn't self-evident.";
  }
  if (id.includes("refactor")) {
    return "Improve code structure without changing behavior. Ensure all tests pass before and after changes.";
  }

  // Testing steps
  if (id.includes("test") || id.includes("verify") || id.includes("validate")) {
    return "Verify the implementation works correctly. Test happy paths, edge cases, and error conditions. Document any issues found.";
  }

  // Review steps
  if (id.includes("review")) {
    return "Check for correctness, code quality, and adherence to project standards. Verify the implementation meets requirements.";
  }

  // Documentation steps
  if (id.includes("document") || id.includes("readme")) {
    return "Write clear, concise documentation. Focus on what users need to know, not implementation details.";
  }

  // Commit/PR steps
  if (id.includes("commit")) {
    return "Stage relevant changes and create a descriptive commit message. Follow project commit conventions.";
  }
  if (id.includes("pr") || id.includes("pull_request") || id.includes("pull-request")) {
    return "Create a pull request with a clear title and description. Link related issues and describe what was changed and why.";
  }

  // Context/optimization steps
  if (id.includes("context") || id.includes("optimize") || id.includes("compress")) {
    return "Analyze the current state and identify improvements. Focus on clarity and efficiency.";
  }

  // Extract/transform steps
  if (id.includes("extract") || id.includes("ir_")) {
    return "Extract the relevant information systematically. Preserve important details while filtering noise.";
  }

  // Default
  return "Complete this step thoroughly. Document your findings and any decisions made.";
}

/**
 * Build orchestrator instructions for task creation/update
 * Returns null for terminal nodes (no further work)
 */
function buildOrchestratorInstructions(workflowType, stepId, stage, subagent, stepInstructions, description) {
  if (!stepInstructions) return null; // Terminal nodes have no instructions

  const delegationPrefix = subagent ? `Invoke ${subagent} to complete the following task: ` : "";

  return `${delegationPrefix}${stepInstructions.guidance}

${description || "{task description}"}`;
}

/**
 * Build unified response shape for Navigate
 * Minimal output: only what Orchestrator needs for control flow and delegation
 */
function buildNavigateResponse(
  workflowType,
  stepId,
  stepDef,
  action,
  retriesIncremented = false,
  retryCount = 0,
  description = null
) {
  const stage = stepDef.stage || null;
  const subagent = stepDef.agent ? toSubagentRef(stepDef.agent) : null;

  // Build step instructions from workflow definition + baseline
  const isTerminal = isTerminalNode(stepDef);
  const stepInstructions = isTerminal
    ? null
    : {
        name: stepDef.name || stepId,
        description: stepDef.description || null,
        guidance: stepDef.instructions || getBaselineInstructions(stepId, stepDef.name),
      };

  // Build orchestrator instructions for all non-terminal actions
  const orchestratorInstructions = isTerminal
    ? null
    : buildOrchestratorInstructions(workflowType, stepId, stage, subagent, stepInstructions, description);

  // Build metadata for task storage
  const metadata = {
    workflowType,
    currentStep: stepId,
    retryCount: retriesIncremented ? retryCount + 1 : retryCount,
  };

  return {
    currentStep: stepId,
    stage,
    subagent,
    stepInstructions,
    terminal: getTerminalType(stepDef),
    action,
    retriesIncremented,
    orchestratorInstructions,
    metadata,
  };
}

export class WorkflowEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Build adjacency list from edges array
   */
  buildEdgeGraph(workflowId) {
    const def = this.store.getDefinition(workflowId);
    if (!def) throw new Error(`Workflow ${workflowId} not found`);

    if (!def.nodes) {
      throw new Error(`Workflow ${workflowId} must have nodes`);
    }

    const graph = {
      nodes: def.nodes,
      edges: new Map(), // from -> [{ to, on, label }]
      reverseEdges: new Map(), // to -> [from] for dependency checking
    };

    if (!def.edges || !Array.isArray(def.edges)) {
      throw new Error(`Workflow ${workflowId} must have edges array`);
    }

    for (const edge of def.edges) {
      const { from, to, on = null, label = null } = edge;

      if (!graph.edges.has(from)) {
        graph.edges.set(from, []);
      }
      graph.edges.get(from).push({ to, on, label });

      if (!graph.reverseEdges.has(to)) {
        graph.reverseEdges.set(to, []);
      }
      graph.reverseEdges.get(to).push(from);
    }

    return graph;
  }

  /**
   * Check if a node is an end node
   */
  isEndNode(node) {
    return node?.type === "end";
  }

  /**
   * Evaluate which edge to take based on result and retry count
   */
  evaluateEdge(workflowId, currentStep, result, retryCount = 0) {
    const graph = this.buildEdgeGraph(workflowId);
    const outgoingEdges = graph.edges.get(currentStep) || [];
    const currentNode = graph.nodes[currentStep];

    if (outgoingEdges.length === 0) {
      return {
        nextStep: null,
        action: "no_outgoing_edges",
        currentStep,
      };
    }

    const maxRetries = currentNode?.maxRetries || 0;
    const unconditionalEdges = outgoingEdges.filter((e) => !e.on);
    const matchingEdges = outgoingEdges.filter((e) => e.on === result);

    // No result provided - use unconditional edge
    if (!result && unconditionalEdges.length > 0) {
      const edge = unconditionalEdges[0];
      return {
        nextStep: edge.to,
        action: "unconditional",
        edge,
      };
    }

    // No matching edges at all
    if (matchingEdges.length === 0 && unconditionalEdges.length === 0) {
      return {
        nextStep: null,
        action: "no_matching_edge",
        currentStep,
        result,
        retryCount,
        availableEdges: outgoingEdges.map((e) => ({ to: e.to, on: e.on })),
      };
    }

    // Separate retry edges (to non-end) from escalation edges (to end)
    const retryEdges = matchingEdges.filter((e) => !this.isEndNode(graph.nodes[e.to]));
    const escalateEdges = matchingEdges.filter((e) => this.isEndNode(graph.nodes[e.to]));

    // Handle failed with both retry and escalation paths
    if (result === "failed" && retryEdges.length > 0 && escalateEdges.length > 0) {
      if (retryCount < maxRetries) {
        const edge = retryEdges[0];
        return {
          nextStep: edge.to,
          action: "retry",
          retriesUsed: retryCount + 1,
          retriesRemaining: maxRetries - retryCount - 1,
          maxRetries,
          edge,
        };
      } else {
        const edge = escalateEdges[0];
        return {
          nextStep: edge.to,
          action: "escalate",
          reason: "max_retries_exceeded",
          retriesUsed: retryCount,
          maxRetries,
          edge,
        };
      }
    }

    // Single matching conditional edge
    if (matchingEdges.length > 0) {
      const edge = matchingEdges[0];
      return {
        nextStep: edge.to,
        action: "conditional",
        condition: result,
        edge,
      };
    }

    // Fall back to unconditional
    if (unconditionalEdges.length > 0) {
      const edge = unconditionalEdges[0];
      return {
        nextStep: edge.to,
        action: "unconditional",
        edge,
      };
    }

    return {
      nextStep: null,
      action: "no_matching_edge",
      currentStep,
      result,
      retryCount,
    };
  }

  /**
   * Navigate through workflow: start, get current state, or advance
   *
   * Two calling modes:
   * 1. Task file mode: Pass taskFilePath to read workflow state from task metadata
   * 2. Direct mode: Pass workflowType directly (for starting workflows)
   *
   * @param {Object} options - Navigation options
   * @param {string} [options.taskFilePath] - Path to task file (for advance/current)
   * @param {string} [options.workflowType] - Workflow ID (for start only)
   * @param {string} [options.result] - Step result: "passed" | "failed" (for advance)
   * @param {string} [options.description] - User's task description
   * @returns {Object} Navigation response with currentStep, stepInstructions, terminal, action, metadata, etc.
   */
  navigate({ taskFilePath, workflowType, result, description } = {}) {
    let currentStep = null;
    let retryCount = 0;

    // Task file mode: read workflow state from task metadata
    if (taskFilePath) {
      const task = readTaskFile(taskFilePath);
      if (!task) {
        throw new Error(`Task file not found: ${taskFilePath}`);
      }
      if (!task.metadata) {
        throw new Error("Task has no metadata");
      }

      const {
        userDescription,
        workflowType: metaWorkflow,
        currentStep: metaStep,
        retryCount: metaRetry = 0,
      } = task.metadata;
      workflowType = metaWorkflow;
      currentStep = metaStep;
      retryCount = metaRetry;
      description = description || userDescription;
    }

    // Validate workflowType
    if (!workflowType) {
      throw new Error("workflowType is required (either directly or via task metadata)");
    }

    const wfDef = this.store.getDefinition(workflowType);
    if (!wfDef) {
      throw new Error(`Workflow '${workflowType}' not found. Use ListWorkflows to see available workflows.`);
    }

    if (!wfDef.nodes) {
      throw new Error(`Workflow '${workflowType}' must have nodes`);
    }

    const { nodes } = wfDef;

    // Case 1: No currentStep - start at first work step
    if (!currentStep) {
      const startEntry = Object.entries(nodes).find(([, node]) => node.type === "start");
      if (!startEntry) {
        throw new Error(`Workflow '${workflowType}' has no start node`);
      }
      const startStepId = startEntry[0];

      const firstEdge = wfDef.edges.find((e) => e.from === startStepId);
      if (!firstEdge) {
        throw new Error(`No edge from start step in workflow '${workflowType}'`);
      }

      const firstStepDef = nodes[firstEdge.to];
      if (!firstStepDef) {
        throw new Error(`First step '${firstEdge.to}' not found in workflow`);
      }

      return buildNavigateResponse(workflowType, firstEdge.to, firstStepDef, "start", false, 0, description);
    }

    // Case 2: currentStep but no result - return current state
    if (!result) {
      const stepDef = nodes[currentStep];
      if (!stepDef) {
        throw new Error(`Step '${currentStep}' not found in workflow '${workflowType}'`);
      }

      return buildNavigateResponse(workflowType, currentStep, stepDef, "current", false, retryCount, description);
    }

    // Case 3: currentStep and result - advance to next step
    const evaluation = this.evaluateEdge(workflowType, currentStep, result, retryCount);

    if (!evaluation.nextStep) {
      return {
        error: `No matching edge from '${currentStep}' with result '${result}'`,
        currentStep,
        evaluation,
      };
    }

    const nextStepDef = nodes[evaluation.nextStep];
    if (!nextStepDef) {
      throw new Error(`Next step '${evaluation.nextStep}' not found in workflow`);
    }

    // Determine action and whether retries incremented
    const isRetry = evaluation.action === "retry";
    let action;
    if (isRetry) {
      action = "retry";
    } else if (getTerminalType(nextStepDef) === "hitl") {
      action = "escalate";
    } else {
      action = "advance";
    }

    return buildNavigateResponse(
      workflowType,
      evaluation.nextStep,
      nextStepDef,
      action,
      isRetry,
      retryCount,
      description
    );
  }
}
