/**
 * Workflow Engine (Simplified)
 *
 * A graph walker with three operations:
 * - start: Initialize workflow at any step
 * - current: Read current position (read-only)
 * - next: Advance based on outcome
 *
 * All nodes are treated uniformly. Fork/join semantics are determined by
 * the orchestrator based on node instructions and outgoing edges.
 *
 * Schema:
 * - nodes: { [id]: { type, name, description?, agent?, maxRetries?, ... } }
 * - edges: [{ from, to, on?, label? }]
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";

/**
 * Expand tilde to home directory
 */
function expandPath(p) {
  if (!p) return p;
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

/**
 * Read and parse a task file
 */
export function readTaskFile(taskFilePath) {
  const resolved = expandPath(taskFilePath);
  if (!resolved || !existsSync(resolved)) return null;
  try {
    return JSON.parse(readFileSync(resolved, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Check if node is terminal (start or end)
 */
export function isTerminalNode(node) {
  if (!node) return false;
  return node.type === "start" || node.type === "end";
}

/**
 * Return agent ID as-is (pass-through for workflow definitions)
 */
export function toSubagentRef(agentId) {
  return agentId || null;
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
 * Workflow emoji mapping for task subjects
 */
const WORKFLOW_EMOJIS = {
  "feature-development": "✨",
  "bug-fix": "🐛",
  "bug-hunt": "🔍",
  "agile-task": "📋",
  "context-optimization": "🔧",
  "quick-task": "⚡",
  "ui-reconstruction": "🎨",
  "test-coverage": "🧪",
};

/**
 * Build formatted task subject for write-through
 */
function buildTaskSubject(taskId, userDescription, workflowType, stepId, terminal) {
  const emoji = WORKFLOW_EMOJIS[workflowType] || "";
  const line1 = `#${taskId} ${userDescription}${emoji ? ` ${emoji}` : ""}`;

  let line2;
  if (terminal === "success") {
    line2 = `→ ${workflowType} · completed ✓`;
  } else if (terminal === "hitl" || terminal === "failure") {
    line2 = `→ ${workflowType} · ${stepId} · HITL`;
  } else {
    line2 = `→ ${workflowType} · ${stepId}`;
  }

  return `${line1}\n${line2}`;
}

/**
 * Resolve ./ prefixed paths in prose text against sourceRoot
 */
function resolveProseRefs(text, sourceRoot) {
  if (!text || !sourceRoot) return text;
  return text.replace(/\.\/[\w\-./]+/g, (match) => join(sourceRoot, match));
}

/**
 * Write-through: persist state to task file
 */
function writeThrough(taskFilePath, response) {
  const resolved = expandPath(taskFilePath);
  const task = readTaskFile(resolved);
  if (!task) return;

  const filenameId = basename(resolved, ".json");
  task.id = filenameId;
  task.metadata = { ...task.metadata, ...response.metadata };

  // Set status based on terminal state
  if (!response.terminal || response.terminal === "start") {
    task.status = "in_progress";
  } else if (response.terminal === "success") {
    task.status = "completed";
  }
  // HITL and failure keep current status

  // Update subject
  task.subject = buildTaskSubject(
    filenameId,
    response.metadata.userDescription || "",
    response.metadata.workflowType,
    response.currentStep,
    response.terminal
  );

  // Update activeForm
  task.activeForm = response.terminal === "success"
    ? "Completed"
    : response.terminal === "hitl" || response.terminal === "failure"
      ? "HITL - Needs help"
      : response.node?.name || response.currentStep;

  writeFileSync(resolved, JSON.stringify(task, null, 2));
}

/**
 * Build response shape (same for all three operations)
 */
function buildResponse(workflowType, stepId, node, edges, sourceRoot, description, retryCount = 0) {
  return {
    currentStep: stepId,
    node: node ? {
      type: node.type,
      name: node.name || stepId,
      description: resolveProseRefs(node.description, sourceRoot) || null,
      instructions: resolveProseRefs(node.instructions, sourceRoot) || null,
      agent: node.agent || null,
      stage: node.stage || null,
      maxRetries: node.maxRetries || 0,
    } : null,
    edges: edges || [],
    terminal: getTerminalType(node),
    metadata: {
      workflowType,
      currentStep: stepId,
      retryCount,
      userDescription: description || null,
    },
  };
}

export class WorkflowEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Get workflow definition and validate
   */
  getWorkflow(workflowType) {
    const def = this.store.getDefinition(workflowType);
    if (!def) {
      throw new Error(`Workflow '${workflowType}' not found`);
    }
    if (!def.nodes) {
      throw new Error(`Workflow '${workflowType}' must have nodes`);
    }
    if (!def.edges || !Array.isArray(def.edges)) {
      throw new Error(`Workflow '${workflowType}' must have edges array`);
    }
    return def;
  }

  /**
   * Get outgoing edges from a step
   */
  getOutgoingEdges(workflowType, stepId) {
    const def = this.getWorkflow(workflowType);
    return def.edges
      .filter(e => e.from === stepId)
      .map(e => ({ to: e.to, on: e.on || null, label: e.label || null }));
  }

  /**
   * Find start node in workflow
   */
  findStartNode(workflowType) {
    const def = this.getWorkflow(workflowType);
    const entry = Object.entries(def.nodes).find(([, node]) => node.type === "start");
    if (!entry) {
      throw new Error(`Workflow '${workflowType}' has no start node`);
    }
    return entry[0];
  }

  /**
   * Evaluate which edge to take based on result and retry count
   */
  evaluateTransition(workflowType, currentStep, result, retryCount = 0) {
    const def = this.getWorkflow(workflowType);
    const edges = this.getOutgoingEdges(workflowType, currentStep);
    const currentNode = def.nodes[currentStep];

    if (edges.length === 0) {
      return { nextStep: null, error: "no_outgoing_edges" };
    }

    const maxRetries = currentNode?.maxRetries || 0;
    const unconditional = edges.filter(e => !e.on);
    const matching = edges.filter(e => e.on === result);

    // No result - use unconditional edge
    if (!result && unconditional.length > 0) {
      return { nextStep: unconditional[0].to, action: "unconditional" };
    }

    // Separate retry edges (to non-end) from escalation edges (to end)
    const retryEdges = matching.filter(e => def.nodes[e.to]?.type !== "end");
    const escalateEdges = matching.filter(e => def.nodes[e.to]?.type === "end");

    // Failed with both retry and escalation paths
    if (result === "failed" && retryEdges.length > 0 && escalateEdges.length > 0) {
      if (retryCount < maxRetries) {
        return { nextStep: retryEdges[0].to, action: "retry", newRetryCount: retryCount + 1 };
      } else {
        return { nextStep: escalateEdges[0].to, action: "escalate" };
      }
    }

    // Conditional match
    if (matching.length > 0) {
      return { nextStep: matching[0].to, action: "conditional", resetRetries: true };
    }

    // Fallback to unconditional
    if (unconditional.length > 0) {
      return { nextStep: unconditional[0].to, action: "unconditional" };
    }

    return { nextStep: null, error: "no_matching_edge", result };
  }

  /**
   * Start: Initialize workflow on task at any step
   */
  start({ taskFilePath, workflowType, description, stepId }) {
    if (!workflowType) {
      throw new Error("workflowType is required");
    }

    const def = this.getWorkflow(workflowType);
    const sourceRoot = this.store.getSourceRoot?.(workflowType) || null;

    // Default to start node if no stepId provided
    const targetStepId = stepId || this.findStartNode(workflowType);
    const targetNode = def.nodes[targetStepId];

    if (!targetNode) {
      throw new Error(`Step '${targetStepId}' not found in workflow '${workflowType}'`);
    }

    const edges = this.getOutgoingEdges(workflowType, targetStepId);
    const response = buildResponse(workflowType, targetStepId, targetNode, edges, sourceRoot, description, 0);

    if (taskFilePath) {
      writeThrough(taskFilePath, response);
    }

    return response;
  }

  /**
   * Current: Read current position (read-only)
   */
  current({ taskFilePath }) {
    if (!taskFilePath) {
      throw new Error("taskFilePath is required");
    }

    const task = readTaskFile(taskFilePath);
    if (!task) {
      throw new Error(`Task file not found: ${taskFilePath}`);
    }

    const { workflowType, currentStep, retryCount = 0, userDescription } = task.metadata || {};
    if (!workflowType || !currentStep) {
      throw new Error("Task has no workflow metadata. Use Start to initialize.");
    }

    const def = this.getWorkflow(workflowType);
    const sourceRoot = this.store.getSourceRoot?.(workflowType) || null;
    const node = def.nodes[currentStep];

    if (!node) {
      throw new Error(`Step '${currentStep}' not found in workflow '${workflowType}'`);
    }

    const edges = this.getOutgoingEdges(workflowType, currentStep);
    return buildResponse(workflowType, currentStep, node, edges, sourceRoot, userDescription, retryCount);
  }

  /**
   * Next: Advance based on outcome
   */
  next({ taskFilePath, result }) {
    if (!taskFilePath) {
      throw new Error("taskFilePath is required");
    }
    if (!result) {
      throw new Error("result is required ('passed' or 'failed')");
    }

    const task = readTaskFile(taskFilePath);
    if (!task) {
      throw new Error(`Task file not found: ${taskFilePath}`);
    }

    const { workflowType, currentStep, retryCount = 0, userDescription } = task.metadata || {};
    if (!workflowType || !currentStep) {
      throw new Error("Task has no workflow metadata. Use Start to initialize.");
    }

    const def = this.getWorkflow(workflowType);
    const sourceRoot = this.store.getSourceRoot?.(workflowType) || null;

    // Evaluate transition
    const transition = this.evaluateTransition(workflowType, currentStep, result, retryCount);

    if (!transition.nextStep) {
      return {
        error: transition.error || "no_transition",
        currentStep,
        result,
        metadata: { workflowType, currentStep, retryCount, userDescription },
      };
    }

    const nextNode = def.nodes[transition.nextStep];
    if (!nextNode) {
      throw new Error(`Next step '${transition.nextStep}' not found in workflow`);
    }

    // Compute new retry count
    let newRetryCount = retryCount;
    if (transition.action === "retry") {
      newRetryCount = transition.newRetryCount;
    } else if (transition.resetRetries) {
      newRetryCount = 0;
    }

    const edges = this.getOutgoingEdges(workflowType, transition.nextStep);
    const response = buildResponse(workflowType, transition.nextStep, nextNode, edges, sourceRoot, userDescription, newRetryCount);

    if (taskFilePath) {
      writeThrough(taskFilePath, response);
    }

    return response;
  }
}
