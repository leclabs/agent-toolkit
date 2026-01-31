/**
 * Flow Workflow Type Definitions
 *
 * Normalized schema following standard flowchart conventions:
 * - start: Entry point (exactly one)
 * - end: Exit point with result classification
 * - task: Work performed by agent
 * - gate: Review/approval checkpoint
 * - subflow: Connector to another workflow
 */

// =============================================================================
// Node Types (Discriminated Union)
// =============================================================================

export type Node = StartNode | EndNode | TaskNode | GateNode | SubflowNode | ForkNode | JoinNode;

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
  agent?: string;
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
  agent?: string;
  stage?: Stage;
  outputs?: string[];
  maxRetries?: number;
  config?: Record<string, unknown>;
  context_files?: string[];
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

/**
 * Fork node - declares parallel branches within the same workflow.
 * Each branch names an entry step. Links to a join node that collects results.
 */
export interface ForkNode {
  type: "fork";
  name: string;
  description?: string;
  branches: Record<string, { entryStep: string; description?: string }>;
  join: string; // join node ID
}

/**
 * Join node - collects results from parallel branches.
 * Strategy determines how branch results are evaluated.
 */
export interface JoinNode {
  type: "join";
  name: string;
  description?: string;
  fork: string; // fork node ID
  strategy?: "all-pass" | "any-pass"; // default: "all-pass"
}

export type Stage = "planning" | "development" | "verification" | "delivery";

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
// Engine Types
// =============================================================================

export interface EvaluationResult {
  nextStep: string | null;
  action: EdgeAction;
  retriesUsed?: number;
  retriesRemaining?: number;
  maxRetries?: number;
  edge?: Edge;
  reason?: string;
}

export type EdgeAction =
  | "unconditional" // Edge with no 'on' condition
  | "conditional" // Edge matched 'on' condition
  | "retry" // Failed but within retry limit, looping back
  | "escalate" // Failed and exceeded retry limit
  | "no_outgoing_edges" // Terminal node (no edges)
  | "no_matching_edge"; // No edge matched the output

// =============================================================================
// Navigate Options
// =============================================================================

export interface NavigateOptions {
  taskFilePath?: string;
  workflowType?: string;
  result?: "passed" | "failed";
  description?: string;
  projectRoot?: string;
  autonomy?: boolean;
}

export interface NavigateResponse {
  currentStep: string;
  stage: Stage | null;
  subagent: string | null;
  stepInstructions: { name: string; description: string | null; guidance: string } | null;
  terminal: "start" | "success" | "hitl" | "failure" | null;
  action: string;
  retriesIncremented: boolean;
  autonomyContinued: boolean;
  maxRetries: number;
  orchestratorInstructions: string | null;
  fork?: { branches: Record<string, { entryStep: string; description?: string }>; joinStep: string };
  join?: { forkStep: string; strategy: string };
  metadata: {
    workflowType: string;
    currentStep: string;
    retryCount: number;
    autonomy?: boolean;
  };
  sourceRoot: string | null;
}

// =============================================================================
// Context Resolution
// =============================================================================

/**
 * Resolve a context_files entry to an absolute path.
 * - "./path" → relative to sourceRoot (the workflow's source directory)
 * - "path"   → relative to projectRoot
 */
export function resolveContextFile(file: string, projectRoot: string, sourceRoot?: string | null): string;

export function resolveProseRefs(text: string | null, sourceRoot: string | null): string | null;

export function buildContextInstructions(options: {
  contextFiles?: string[];
  projectRoot?: string | null;
  sourceRoot?: string | null;
}): string | null;

// =============================================================================
// Store Types
// =============================================================================

export type WorkflowSource = "catalog" | "project" | "external";
