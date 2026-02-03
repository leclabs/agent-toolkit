/**
 * Workflow Engine
 *
 * Evaluates graph transitions based on node outputs and retry state.
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

import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";

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
 * Fork/join are control-flow nodes, not terminal.
 */
export function isTerminalNode(node) {
  if (!node) return false;
  return node.type === "start" || node.type === "end";
}

/**
 * Check if a node is a fork or join control-flow node
 */
export function isForkJoinNode(node) {
  if (!node) return false;
  return node.type === "fork" || node.type === "join";
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
 * Return agent ID exactly as specified in the workflow definition.
 * The workflow author is responsible for providing the correct subagent_type value
 * (e.g., "Developer" for catalog agents, "myorg:Auditor" for namespaced agents).
 */
export function toSubagentRef(agentId) {
  if (!agentId) return null;
  return agentId;
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
export function buildTaskSubject(
  taskId,
  userDescription,
  workflowType,
  stepId,
  subagent,
  terminal,
  maxRetries,
  retryCount
) {
  const emoji = WORKFLOW_EMOJIS[workflowType] || "";
  const line1 = `#${taskId} ${userDescription}${emoji ? ` ${emoji}` : ""}`;

  let line2;
  if (terminal === "success") {
    line2 = `→ ${workflowType} · completed ✓`;
  } else if (terminal === "hitl" || terminal === "failure") {
    line2 = `→ ${workflowType} · ${stepId} · HITL`;
  } else {
    const agent = subagent ? `(${subagent})` : "(direct)";
    const retries = maxRetries > 0 ? ` · retries: ${retryCount}/${maxRetries}` : "";
    line2 = `→ ${workflowType} · ${stepId} ${agent}${retries}`;
  }

  return `${line1}\n${line2}`;
}

/**
 * Build activeForm for task spinner display
 */
export function buildTaskActiveForm(stepName, subagent, terminal) {
  if (terminal === "success") return "Completed";
  if (terminal === "hitl" || terminal === "failure") return "HITL - Needs human help";
  const agent = subagent ? ` (${subagent})` : "";
  return `${stepName}${agent}`;
}

/**
 * Generate baseline instructions based on step type
 */
export function getBaselineInstructions(stepId, stepName) {
  const id = stepId.toLowerCase();
  const name = (stepName || "").toLowerCase();

  // Review steps (checked early — "plan_review" is a review, not a plan)
  if (id.includes("review")) {
    return "Check for correctness, code quality, and adherence to project standards. Verify the implementation meets requirements.";
  }

  // Analysis/Requirements steps
  if (
    id.includes("analyze") ||
    id.includes("analysis") ||
    id.includes("parse") ||
    id.includes("requirements") ||
    name.includes("analyze")
  ) {
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

  // Lint/format steps
  if (id.includes("lint") || id.includes("format")) {
    return "Run linting and formatting checks. Auto-fix issues where possible. Flag any issues that require manual attention.";
  }

  // Testing steps
  if (id.includes("test") || id.includes("verify") || id.includes("validate")) {
    return "Verify the implementation works correctly. Test happy paths, edge cases, and error conditions. Document any issues found.";
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
 * Resolve a context_files entry to an absolute path.
 *
 * Convention (follows Claude Code plugin path rules):
 * - "./path" → relative to the workflow's source root (plugin root, project root, etc.)
 * - "path"   → relative to projectRoot
 *
 * @param {string} file - Context file entry
 * @param {string} projectRoot - Project root directory
 * @param {string|null} sourceRoot - Root directory of the workflow's source
 * @returns {string} Absolute file path
 */
export function resolveContextFile(file, projectRoot, sourceRoot) {
  if (file.startsWith("./") && sourceRoot) {
    return join(sourceRoot, file);
  }
  return join(projectRoot, file);
}

/**
 * Resolve ./ prefixed paths in prose text against sourceRoot.
 * Leaves text unchanged when sourceRoot is null or text has no ./ references.
 * @param {string|null} text - Prose text that may contain ./ paths
 * @param {string|null} sourceRoot - Root directory for ./ resolution
 * @returns {string|null} Text with ./ paths resolved to absolute paths
 */
export function resolveProseRefs(text, sourceRoot) {
  if (!text || !sourceRoot) return text;
  return text.replace(/\.\/[\w\-./]+/g, (match) => join(sourceRoot, match));
}

/**
 * Build context loading instructions from step-level context_files.
 * Returns a markdown section or null if no context declared.
 */
export function buildContextInstructions({ contextFiles, projectRoot, sourceRoot }) {
  if (!contextFiles?.length || !projectRoot) return null;
  const lines = contextFiles.map((file) => `- Read file: ${resolveContextFile(file, projectRoot, sourceRoot)}`);
  return `## Context\n\nBefore beginning, load the following:\n${lines.join("\n")}`;
}

/**
 * Build orchestrator instructions for task creation/update
 * Returns null for terminal nodes (no further work)
 */
function buildOrchestratorInstructions(
  workflowType,
  stepId,
  stage,
  subagent,
  stepInstructions,
  description,
  contextBlock
) {
  if (!stepInstructions) return null; // Terminal nodes have no instructions

  const delegationPrefix = subagent ? `Invoke ${subagent} to complete the following task: ` : "";

  let result = `${delegationPrefix}${stepInstructions.guidance}

${description || "{task description}"}`;
  if (contextBlock) result += `\n\n${contextBlock}`;
  return result;
}

/**
 * Build enriched branch info for a single fork branch.
 * Produces the same data buildNavigateResponse() would for the entry step,
 * so the orchestrator can create child tasks without extra Navigate calls.
 */
function buildBranchInfo(workflowType, branchDef, nodes, edges, description, projectRoot, sourceRoot, joinNodeId) {
  const entryStepId = branchDef.entryStep;
  const entryStepDef = nodes[entryStepId];
  if (!entryStepDef) return { ...branchDef, error: `Entry step '${entryStepId}' not found` };

  const subagent = entryStepDef.agent ? toSubagentRef(entryStepDef.agent) : null;
  const stage = entryStepDef.stage || null;
  const stepInstructions = {
    name: entryStepDef.name || entryStepId,
    description: resolveProseRefs(entryStepDef.description, sourceRoot) || null,
    guidance:
      resolveProseRefs(entryStepDef.instructions, sourceRoot) ||
      getBaselineInstructions(entryStepId, entryStepDef.name),
  };
  const contextBlock = buildContextInstructions({
    contextFiles: entryStepDef.context_files,
    projectRoot,
    sourceRoot,
  });
  const orchestratorInstructions = buildOrchestratorInstructions(
    workflowType,
    entryStepId,
    stage,
    subagent,
    stepInstructions,
    description,
    contextBlock
  );

  // Single-step branch = all outgoing edges lead to this fork's join node
  const outgoing = edges.filter((e) => e.from === entryStepId);
  const multiStep = outgoing.some((e) => e.to !== joinNodeId);

  return {
    entryStep: entryStepId,
    description: branchDef.description,
    subagent,
    stage,
    stepInstructions,
    orchestratorInstructions,
    maxRetries: entryStepDef.maxRetries || 0,
    multiStep,
    metadata: { workflowType, currentStep: entryStepId, retryCount: 0 },
  };
}

/**
 * Build response for fork/join control-flow nodes.
 * These nodes are declarative — the engine returns metadata for the orchestrator to act on.
 * Fork responses include enriched per-branch info so the orchestrator can create
 * child tasks without additional Navigate calls.
 */
function buildForkJoinResponse(
  workflowType,
  stepId,
  stepDef,
  { retryCount = 0, sourceRoot = null, nodes = null, edges = null, description = null, projectRoot = null } = {}
) {
  const base = {
    currentStep: stepId,
    stage: null,
    subagent: null,
    stepInstructions: null,
    terminal: null,
    action: null,
    retriesIncremented: false,
    autonomyContinued: false,
    maxRetries: 0,
    orchestratorInstructions: null,
    metadata: {
      workflowType,
      currentStep: stepId,
      retryCount,
    },
    sourceRoot,
  };

  if (stepDef.type === "fork") {
    base.action = "fork";

    // Enrich branches with per-branch step info when nodes/edges available
    let enrichedBranches;
    if (nodes && edges) {
      enrichedBranches = {};
      for (const [branchName, branchDef] of Object.entries(stepDef.branches)) {
        enrichedBranches[branchName] = buildBranchInfo(
          workflowType,
          branchDef,
          nodes,
          edges,
          description,
          projectRoot,
          sourceRoot,
          stepDef.join
        );
      }
    } else {
      enrichedBranches = stepDef.branches;
    }

    // Look up join strategy from the join node
    const joinStrategy = nodes?.[stepDef.join]?.strategy || "all-pass";

    base.fork = {
      branches: enrichedBranches,
      joinStep: stepDef.join,
      joinStrategy,
    };
  } else if (stepDef.type === "join") {
    base.action = "join";
    base.join = {
      forkStep: stepDef.fork,
      strategy: stepDef.strategy || "all-pass",
    };
  }

  return base;
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
  description = null,
  resetRetryCount = false,
  projectRoot = null,
  sourceRoot = null
) {
  const stage = stepDef.stage || null;
  const subagent = stepDef.agent ? toSubagentRef(stepDef.agent) : null;

  // Build step instructions from workflow definition + baseline
  // Resolve ./ paths in prose fields against sourceRoot (same convention as context_files)
  const isTerminal = isTerminalNode(stepDef);
  const stepInstructions = isTerminal
    ? null
    : {
        name: stepDef.name || stepId,
        description: resolveProseRefs(stepDef.description, sourceRoot) || null,
        guidance: resolveProseRefs(stepDef.instructions, sourceRoot) || getBaselineInstructions(stepId, stepDef.name),
      };

  // Build context block from step-level context_files
  const contextBlock = isTerminal
    ? null
    : buildContextInstructions({ contextFiles: stepDef.context_files, projectRoot, sourceRoot });

  // Build orchestrator instructions for all non-terminal actions
  const orchestratorInstructions = isTerminal
    ? null
    : buildOrchestratorInstructions(workflowType, stepId, stage, subagent, stepInstructions, description, contextBlock);

  // Build metadata for task storage
  // Increment on retry, reset on start or explicit forward progress (conditional advance),
  // preserve on unconditional advances within retry loops and escalations
  const metadata = {
    workflowType,
    currentStep: stepId,
    retryCount: retriesIncremented ? retryCount + 1 : action === "start" || resetRetryCount ? 0 : retryCount,
  };

  return {
    currentStep: stepId,
    stage,
    subagent,
    stepInstructions,
    terminal: getTerminalType(stepDef),
    action,
    retriesIncremented,
    autonomyContinued: false,
    maxRetries: stepDef.maxRetries || 0,
    orchestratorInstructions,
    metadata,
    sourceRoot,
  };
}

/**
 * Write-through: persist Navigate response state to a task file.
 * Handles id correction, metadata merge, and optional subject/activeForm/description updates.
 *
 * @param {string} taskFilePath - Path to the task JSON file
 * @param {Object} response - Navigate response object
 * @param {Object} [opts]
 * @param {boolean} [opts.metadataOnly=false] - Only merge metadata (skip subject/activeForm/description)
 */
function writeThrough(taskFilePath, response, { metadataOnly = false } = {}) {
  const task = readTaskFile(taskFilePath);
  if (!task) return;

  const filenameId = basename(taskFilePath, ".json");
  if (task.id !== filenameId) {
    console.error(
      `[Navigator] WARNING: task.id "${task.id}" does not match filename "${filenameId}.json" — auto-correcting`
    );
  }

  task.metadata = { ...task.metadata, ...response.metadata };
  task.id = filenameId;

  if (!metadataOnly) {
    const userDesc = task.metadata?.userDescription || "";
    task.subject = buildTaskSubject(
      filenameId,
      userDesc,
      response.metadata.workflowType,
      response.currentStep,
      response.subagent,
      response.terminal,
      response.maxRetries,
      response.metadata.retryCount
    );
    task.activeForm = buildTaskActiveForm(
      response.stepInstructions?.name || response.currentStep,
      response.subagent,
      response.terminal
    );
    if (response.orchestratorInstructions) {
      task.description = response.orchestratorInstructions;
    }
  }

  writeFileSync(taskFilePath, JSON.stringify(task, null, 2));
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
   * @param {string} [options.stepId] - Start at a specific step (mid-flow recovery). Only used when starting a workflow (no currentStep).
   * @returns {Object} Navigation response with currentStep, stepInstructions, terminal, action, metadata, etc.
   */
  navigate({ taskFilePath, workflowType, result, description, projectRoot, autonomy, stepId } = {}) {
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
        autonomy: metaAutonomy,
      } = task.metadata;
      workflowType = metaWorkflow;
      currentStep = metaStep;
      retryCount = metaRetry;
      description = description || userDescription;
      // Explicit parameter takes precedence over stored value
      if (autonomy === undefined || autonomy === null) {
        autonomy = metaAutonomy;
      }
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

    // Resolve source root for context_files with ./ prefix
    const sourceRoot = this.store.getSourceRoot?.(workflowType) || null;

    const { nodes } = wfDef;

    // Case 1: No currentStep - start at first work step (or stepId if provided)
    if (!currentStep) {
      let targetStepId;
      let targetStepDef;

      if (stepId) {
        // Mid-flow start: validate and use the provided stepId
        targetStepDef = nodes[stepId];
        if (!targetStepDef) {
          throw new Error(`Step '${stepId}' not found in workflow '${workflowType}'`);
        }
        if (isTerminalNode(targetStepDef)) {
          throw new Error(
            `Cannot start at ${targetStepDef.type} node '${stepId}'. Provide a task, gate, or fork/join step.`
          );
        }
        targetStepId = stepId;
      } else {
        // Default: find first step after start node
        const startEntry = Object.entries(nodes).find(([, node]) => node.type === "start");
        if (!startEntry) {
          throw new Error(`Workflow '${workflowType}' has no start node`);
        }
        const startNodeId = startEntry[0];

        const firstEdge = wfDef.edges.find((e) => e.from === startNodeId);
        if (!firstEdge) {
          throw new Error(`No edge from start step in workflow '${workflowType}'`);
        }

        targetStepDef = nodes[firstEdge.to];
        if (!targetStepDef) {
          throw new Error(`First step '${firstEdge.to}' not found in workflow`);
        }
        targetStepId = firstEdge.to;
      }

      // Fork/join at start position — return control-flow response
      if (isForkJoinNode(targetStepDef)) {
        return buildForkJoinResponse(workflowType, targetStepId, targetStepDef, {
          sourceRoot,
          nodes,
          edges: wfDef.edges,
          description,
          projectRoot,
        });
      }

      return buildNavigateResponse(
        workflowType,
        targetStepId,
        targetStepDef,
        "start",
        false,
        0,
        description,
        false,
        projectRoot,
        sourceRoot
      );
    }

    // Case 2: currentStep but no result - return current state
    if (!result) {
      const stepDef = nodes[currentStep];
      if (!stepDef) {
        throw new Error(`Step '${currentStep}' not found in workflow '${workflowType}'`);
      }

      // Fork/join — return control-flow response
      if (isForkJoinNode(stepDef)) {
        return buildForkJoinResponse(workflowType, currentStep, stepDef, {
          retryCount,
          sourceRoot,
          nodes,
          edges: wfDef.edges,
          description,
          projectRoot,
        });
      }

      return buildNavigateResponse(
        workflowType,
        currentStep,
        stepDef,
        "current",
        false,
        retryCount,
        description,
        false,
        projectRoot,
        sourceRoot
      );
    }

    // Case 3: currentStep and result - advance to next step

    // Fork node with result → orchestrator completed all branches, advance through join
    const forkCheckDef = nodes[currentStep];
    if (forkCheckDef && forkCheckDef.type === "fork" && forkCheckDef.join) {
      const joinStepId = forkCheckDef.join;
      const joinStepDef = nodes[joinStepId];
      if (!joinStepDef) {
        throw new Error(`Join step '${joinStepId}' not found in workflow '${workflowType}'`);
      }

      // Evaluate edges from the join node (e.g., on:"passed" → synthesize, on:"failed" → hitl)
      const joinEvaluation = this.evaluateEdge(workflowType, joinStepId, result, 0);

      if (!joinEvaluation.nextStep) {
        return {
          error: `No matching edge from join '${joinStepId}' with result '${result}'`,
          currentStep: joinStepId,
          evaluation: joinEvaluation,
        };
      }

      const postJoinStepDef = nodes[joinEvaluation.nextStep];
      if (!postJoinStepDef) {
        throw new Error(`Post-join step '${joinEvaluation.nextStep}' not found in workflow`);
      }

      // If post-join step is another fork/join, return control-flow response
      if (isForkJoinNode(postJoinStepDef)) {
        const forkJoinResponse = buildForkJoinResponse(workflowType, joinEvaluation.nextStep, postJoinStepDef, {
          sourceRoot,
          nodes,
          edges: wfDef.edges,
          description,
          projectRoot,
        });

        if (autonomy) forkJoinResponse.metadata.autonomy = true;
        if (taskFilePath) writeThrough(taskFilePath, forkJoinResponse, { metadataOnly: true });

        return forkJoinResponse;
      }

      // Normal post-join step — build standard response
      let postJoinResponse = buildNavigateResponse(
        workflowType,
        joinEvaluation.nextStep,
        postJoinStepDef,
        "advance",
        false,
        0,
        description,
        true,
        projectRoot,
        sourceRoot
      );

      if (autonomy) postJoinResponse.metadata.autonomy = true;
      if (taskFilePath) writeThrough(taskFilePath, postJoinResponse);

      return postJoinResponse;
    }

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

    // Fork/join on advance — return control-flow response
    if (isForkJoinNode(nextStepDef)) {
      const forkJoinResponse = buildForkJoinResponse(workflowType, evaluation.nextStep, nextStepDef, {
        sourceRoot,
        nodes,
        edges: wfDef.edges,
        description,
        projectRoot,
      });

      if (autonomy) forkJoinResponse.metadata.autonomy = true;
      if (taskFilePath) writeThrough(taskFilePath, forkJoinResponse, { metadataOnly: true });

      return forkJoinResponse;
    }

    // Determine action and whether retries incremented
    const currentStepDef = nodes[currentStep];
    const isHitlResume = getTerminalType(currentStepDef) === "hitl";
    const isRetry = evaluation.action === "retry";
    let action;
    if (isHitlResume) {
      action = "advance"; // Human fixed it → fresh advance, retryCount resets
    } else if (isRetry) {
      action = "retry";
    } else if (getTerminalType(nextStepDef) === "hitl") {
      action = "escalate";
    } else {
      action = "advance";
    }

    // Only reset retryCount on genuine forward progress (conditional edge like on:"passed")
    // Unconditional advances within retry loops (e.g., work → gate) preserve the count
    const resetRetryCount = action === "advance" && evaluation.action === "conditional";

    let response = buildNavigateResponse(
      workflowType,
      evaluation.nextStep,
      nextStepDef,
      action,
      isRetry,
      retryCount,
      description,
      resetRetryCount,
      projectRoot,
      sourceRoot
    );

    // Autonomy mode: auto-continue through stage boundary end nodes
    // Stage boundary = end node with on:"passed" outgoing edge to a non-terminal node
    // Never auto-continue HITL nodes (they exist because the agent needs human help)
    if (autonomy && response.terminal === "success") {
      const graph = this.buildEdgeGraph(workflowType);
      const outgoing = graph.edges.get(response.currentStep) || [];
      const passedEdge = outgoing.find((e) => e.on === "passed");
      if (passedEdge) {
        const continuedDef = nodes[passedEdge.to];
        if (continuedDef && !isTerminalNode(continuedDef)) {
          response = buildNavigateResponse(
            workflowType,
            passedEdge.to,
            continuedDef,
            "advance",
            false,
            0, // fresh retryCount for the new stage
            description,
            true, // resetRetryCount
            projectRoot,
            sourceRoot
          );
          response.autonomyContinued = true;
        }
      }
    }

    // Persist autonomy in metadata
    if (autonomy) {
      response.metadata.autonomy = true;
    }

    // Write-through: persist state transition and presentation to task file
    if (taskFilePath) writeThrough(taskFilePath, response);

    return response;
  }
}
