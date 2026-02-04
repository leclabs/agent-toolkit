/**
 * Workflow Engine v3
 *
 * A graph walker that returns prose instructions to the orchestrator.
 * The graph topology is private - orchestrator receives actionable context.
 *
 * Operations:
 * - start: Initialize workflow at any step
 * - current: Read current position (read-only)
 * - next: Advance based on outcome
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
 * Build prose instructions based on node type
 *
 * Composites workflow node fields into consistent prose format.
 * No substitution - placeholders like {repository} are passed through
 * for the Orchestrator to interpret.
 *
 * Format:
 *   ## [{stage} · ]{name}
 *   [Context: {context_files}]
 *   {description}
 *   [Agent: {agent}]
 *   [Retries: {maxRetries}]
 *   → {call-to-action}
 */
function buildInstructions(node, edges, workflowDef) {
  if (!node) return null;

  const name = node.name || "";
  const desc = node.description || "";
  const stage = node.stage || "";
  const agent = node.agent || "";
  const contextFiles = node.context_files || [];
  const maxRetries = node.maxRetries || 0;

  switch (node.type) {
    case "start": {
      const lines = ["## Queued"];
      if (desc) lines.push("", desc);
      lines.push("", "→ Call Start() to begin work.");
      return lines.join("\n");
    }

    case "task":
    case "gate": {
      // Header with optional stage
      const header = stage ? `## ${stage} · ${name}` : `## ${name}`;
      const lines = [header];

      // Context files (backward compat)
      if (contextFiles.length > 0) {
        lines.push("", `Context: ${contextFiles.join(", ")}`);
      }

      // Description (as-is, placeholders preserved)
      if (desc) lines.push("", desc);

      // Agent (backward compat)
      if (agent) lines.push("", `Agent: ${agent}`);

      // Retries
      if (maxRetries > 0) lines.push(`Retries: ${maxRetries}`);

      // Call to action
      lines.push("", "→ Call Next(passed|failed) when complete.");

      return lines.join("\n");
    }

    case "fork": {
      const lines = [`## ${name || "Fork"}`];

      if (desc) lines.push("", desc);

      // Branch list
      lines.push("", "Branches:");
      edges.forEach((edge) => {
        const targetNode = workflowDef.nodes[edge.to];
        const branchName = targetNode?.name || edge.to;
        lines.push(`- ${edge.to}: ${branchName}`);
      });

      // Join node
      if (node.join) lines.push("", `Join: ${node.join}`);

      // Max concurrency
      if (node.maxConcurrency) lines.push(`Max concurrency: ${node.maxConcurrency}`);

      // Call to action
      lines.push("", "→ Create child tasks for each branch. Call Next(passed|failed) when all complete.");

      return lines.join("\n");
    }

    case "join": {
      const lines = [`## ${name || "Join"}`];
      if (desc) lines.push("", desc);
      lines.push("", "→ Evaluate branch results. Call Next(passed|failed).");
      return lines.join("\n");
    }

    case "end": {
      if (node.escalation === "hitl") {
        const lines = ["## HITL"];
        if (desc) lines.push("", desc);
        lines.push("", "Human intervention required.");
        return lines.join("\n");
      }
      if (node.result === "success") {
        const lines = ["## Complete"];
        if (desc) lines.push("", desc);
        lines.push("", "Workflow finished successfully.");
        return lines.join("\n");
      }
      // failure
      const lines = ["## Failed"];
      if (desc) lines.push("", desc);
      lines.push("", "Workflow ended in failure.");
      return lines.join("\n");
    }

    default:
      return `Unknown node type: ${node.type}`;
  }
}

/**
 * Write-through: persist state to task file
 */
function writeThrough(taskFilePath, response) {
  const resolved = expandPath(taskFilePath);
  let task = readTaskFile(resolved);

  // Create task file if it doesn't exist
  if (!task) {
    task = {};
  }

  const filenameId = basename(resolved, ".json");
  task.id = filenameId;
  task.metadata = { ...task.metadata, ...response.metadata };

  // Set status based on terminal state
  // - "start": leave status unchanged (task stays pending until work begins)
  // - null: work in progress
  // - "success": completed
  // - "hitl"/"failure": keep current status
  if (response.terminal === null) {
    task.status = "in_progress";
  } else if (response.terminal === "success") {
    task.status = "completed";
  }
  // "start", "hitl", "failure" keep current status

  // Update subject
  task.subject = buildTaskSubject(
    filenameId,
    response.metadata.userDescription || "",
    response.metadata.workflowType,
    response.currentStep,
    response.terminal
  );

  // Update activeForm from step name
  const stepName = response.metadata.stepName || response.currentStep;
  task.activeForm = response.terminal === "success"
    ? "Completed"
    : response.terminal === "hitl" || response.terminal === "failure"
      ? "HITL - Needs help"
      : stepName;

  writeFileSync(resolved, JSON.stringify(task, null, 2));
}

/**
 * Build response shape (same for all three operations)
 */
function buildResponse(workflowType, stepId, node, edges, workflowDef, description, retryCount = 0) {
  const terminal = getTerminalType(node);
  const instructions = buildInstructions(node, edges, workflowDef);

  return {
    currentStep: stepId,
    instructions,
    terminal,
    metadata: {
      workflowType,
      currentStep: stepId,
      retryCount,
      userDescription: description || null,
      stepName: node?.name || stepId,
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
   * Init: Initialize workflow on task, or return current state if already initialized
   * - If no workflow attached → initialize at start node, task stays pending
   * - If already initialized → return current step instructions
   */
  init({ taskFilePath, workflowType, description, stepId }) {
    if (!taskFilePath) {
      throw new Error("taskFilePath is required");
    }

    // Check if task already has workflow metadata
    const existingTask = readTaskFile(taskFilePath);
    if (existingTask?.metadata?.workflowType && existingTask?.metadata?.currentStep) {
      // Already initialized - return current state (delegate to current behavior)
      const { workflowType: wfType, currentStep, retryCount = 0, userDescription } = existingTask.metadata;
      const def = this.getWorkflow(wfType);
      const node = def.nodes[currentStep];
      if (!node) {
        throw new Error(`Step '${currentStep}' not found in workflow '${wfType}'`);
      }
      const edges = this.getOutgoingEdges(wfType, currentStep);
      return buildResponse(wfType, currentStep, node, edges, def, userDescription, retryCount);
    }

    // New initialization
    if (!workflowType) {
      throw new Error("workflowType is required for new initialization");
    }

    const def = this.getWorkflow(workflowType);

    // Default to start node if no stepId provided
    const targetStepId = stepId || this.findStartNode(workflowType);
    const targetNode = def.nodes[targetStepId];

    if (!targetNode) {
      throw new Error(`Step '${targetStepId}' not found in workflow '${workflowType}'`);
    }

    const edges = this.getOutgoingEdges(workflowType, targetStepId);
    const response = buildResponse(workflowType, targetStepId, targetNode, edges, def, description, 0);

    writeThrough(taskFilePath, response);

    return response;
  }

  /**
   * Start: Begin work - advance from start node to first real step
   * - Sets task to in_progress
   * - Returns first actionable step instructions
   */
  start({ taskFilePath }) {
    if (!taskFilePath) {
      throw new Error("taskFilePath is required");
    }

    const task = readTaskFile(taskFilePath);
    if (!task) {
      throw new Error(`Task file not found: ${taskFilePath}`);
    }

    const { workflowType, currentStep, userDescription } = task.metadata || {};
    if (!workflowType || !currentStep) {
      throw new Error("Task has no workflow metadata. Use Init to initialize first.");
    }

    const def = this.getWorkflow(workflowType);
    const currentNode = def.nodes[currentStep];

    if (!currentNode) {
      throw new Error(`Step '${currentStep}' not found in workflow '${workflowType}'`);
    }

    // If not at start node, just return current (idempotent)
    if (currentNode.type !== "start") {
      const edges = this.getOutgoingEdges(workflowType, currentStep);
      return buildResponse(workflowType, currentStep, currentNode, edges, def, userDescription, task.metadata?.retryCount || 0);
    }

    // Advance from start node to first real step
    const transition = this.evaluateTransition(workflowType, currentStep, "passed", 0);

    if (!transition.nextStep) {
      throw new Error("No outgoing edge from start node");
    }

    const nextNode = def.nodes[transition.nextStep];
    if (!nextNode) {
      throw new Error(`Next step '${transition.nextStep}' not found in workflow`);
    }

    const edges = this.getOutgoingEdges(workflowType, transition.nextStep);
    const response = buildResponse(workflowType, transition.nextStep, nextNode, edges, def, userDescription, 0);

    writeThrough(taskFilePath, response);

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
      throw new Error("Task has no workflow metadata. Use Init to initialize.");
    }

    const def = this.getWorkflow(workflowType);
    const node = def.nodes[currentStep];

    if (!node) {
      throw new Error(`Step '${currentStep}' not found in workflow '${workflowType}'`);
    }

    const edges = this.getOutgoingEdges(workflowType, currentStep);
    return buildResponse(workflowType, currentStep, node, edges, def, userDescription, retryCount);
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
      throw new Error("Task has no workflow metadata. Use Init to initialize.");
    }

    const def = this.getWorkflow(workflowType);

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
    const response = buildResponse(workflowType, transition.nextStep, nextNode, edges, def, userDescription, newRetryCount);

    if (taskFilePath) {
      writeThrough(taskFilePath, response);
    }

    return response;
  }
}
