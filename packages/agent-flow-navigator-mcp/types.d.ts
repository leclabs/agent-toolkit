/**
 * Flow Workflow Type Definitions
 *
 * Normalized schema following standard flowchart conventions:
 * - start: Entry point (exactly one)
 * - end: Exit point with result classification
 * - task: Work performed by agent
 * - gate: Review/approval checkpoint
 * - fork: Fan out to parallel branches
 * - join: Collect parallel branches
 * - subflow: Connector to another workflow
 */

// =============================================================================
// Node Types (Discriminated Union)
// =============================================================================

export type Node = StartNode | EndNode | TaskNode | GateNode | ForkNode | JoinNode | SubflowNode;

export interface StartNode {
  type: "start";
  name?: string;
  description?: string;
}

/**
 * End node with result classification.
 * - result: How the workflow concluded (success, failure, blocked, cancelled)
 * - escalation: What action follows (hitl, alert, ticket) - optional
 */
export interface EndNode {
  type: "end";
  result: EndResult;
  escalation?: Escalation;
  name?: string;
  description?: string;
}

export type EndResult = "success" | "failure" | "blocked" | "cancelled";
export type Escalation = "hitl" | "alert" | "ticket";

/**
 * Task node - work performed by an agent.
 * - outputs: Possible outcomes (default: ["passed", "failed"])
 * - maxRetries: Retry count on failure before following "failed" edge
 */
export interface TaskNode {
  type: "task";
  name: string;
  description?: string;
  instructions?: string;
  agent?: string;
  emoji?: string;
  stage?: Stage;
  outputs?: string[];
  maxRetries?: number;
  config?: Record<string, unknown>;
  context_files?: string[];
}

/**
 * Gate node - review or approval checkpoint.
 * Functionally similar to task but semantically different.
 */
export interface GateNode {
  type: "gate";
  name: string;
  description?: string;
  instructions?: string;
  agent?: string;
  emoji?: string;
  stage?: Stage;
  outputs?: string[];
  maxRetries?: number;
  config?: Record<string, unknown>;
  context_files?: string[];
}

/**
 * Fork node - fan out to parallel branches.
 * Branches are determined by outgoing edges.
 */
export interface ForkNode {
  type: "fork";
  name?: string;
  description?: string;
  join: string; // ID of paired join node
  maxConcurrency?: number;
}

/**
 * Join node - collect parallel branches.
 * Strategy determines how to evaluate branch outcomes.
 */
export interface JoinNode {
  type: "join";
  name?: string;
  description?: string;
  fork: string; // ID of paired fork node
  strategy?: "all-pass" | "any-pass";
}

/**
 * Subflow node - connector to another workflow.
 */
export interface SubflowNode {
  type: "subflow";
  workflow: string;
  name?: string;
  description?: string;
  inputs?: Record<string, string>;
}

export type Stage = "planning" | "development" | "verification" | "delivery" | "investigation";

// =============================================================================
// Edge Definition
// =============================================================================

/**
 * Directed edge connecting two nodes.
 * - from/to: Node IDs
 * - on: Output value that triggers this edge (for conditional routing)
 * - label: Display text
 */
export interface Edge {
  from: string;
  to: string;
  on?: string;
  label?: string;
}

// =============================================================================
// Workflow Definition
// =============================================================================

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: Record<string, Node>;
  edges: Edge[];
}

// =============================================================================
// Navigation API Types (v3 - prose instructions)
// =============================================================================

/**
 * Start: Initialize workflow on task at any step
 */
export interface StartOptions {
  /** Path to task file (writes workflow state) */
  taskFilePath?: string;
  /** Workflow ID (required) */
  workflowType: string;
  /** User's task description */
  description?: string;
  /** Start at specific step (for mid-flow recovery or child tasks) */
  stepId?: string;
}

/**
 * Current: Read current workflow position (read-only)
 */
export interface CurrentOptions {
  /** Path to task file (required) */
  taskFilePath: string;
}

/**
 * Next: Advance workflow based on step outcome
 */
export interface NextOptions {
  /** Path to task file (required) */
  taskFilePath: string;
  /** Outcome of current step (required) */
  result: "passed" | "failed";
}

/**
 * Unified response shape for all navigation operations.
 * Returns current position and prose instructions.
 * Graph topology is private - orchestrator receives actionable context.
 */
export interface NavigationResponse {
  /** Current step ID */
  currentStep: string;
  /** Prose instructions for the orchestrator - context-specific based on node type */
  instructions: string;
  /** Terminal type if at start/end/join node */
  terminal: "start" | "success" | "hitl" | "failure" | "join" | null;
  /** Metadata for task storage */
  metadata: {
    workflowType: string;
    currentStep: string;
    retryCount: number;
    userDescription: string | null;
    stepName: string;
  };
}

/**
 * Error response when transition fails
 */
export interface NavigationError {
  error: string;
  currentStep: string;
  result?: string;
  metadata: {
    workflowType: string;
    currentStep: string;
    retryCount: number;
    userDescription: string | null;
  };
}

// =============================================================================
// Engine Types
// =============================================================================

export interface TransitionResult {
  nextStep: string | null;
  action?: "unconditional" | "conditional" | "retry" | "escalate";
  newRetryCount?: number;
  resetRetries?: boolean;
  error?: string;
  result?: string;
}

// =============================================================================
// Store Types
// =============================================================================

export type WorkflowSource = "catalog" | "project" | "external";
