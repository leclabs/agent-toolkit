# @leclabs/agent-flow-navigator-mcp

[![npm](https://img.shields.io/npm/v/@leclabs/agent-flow-navigator-mcp)](https://npmjs.com/package/@leclabs/agent-flow-navigator-mcp)

A workflow state machine MCP server that navigates agents through graph-based workflows.

Navigator tracks task state and evaluates graph edges -- it tells the orchestrator _where to go next_, but doesn't drive. Think of it like a GPS: you tell it where you are and what happened, it tells you where to go.

## Installation

Run directly with npx:

```bash
npx -y @leclabs/agent-flow-navigator-mcp
```

Or install globally:

```bash
npm install -g @leclabs/agent-flow-navigator-mcp
```

## Claude Code Configuration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "navigator": {
      "command": "npx",
      "args": ["-y", "@leclabs/agent-flow-navigator-mcp"]
    }
  }
}
```

## Quick Start

Navigator works with the [flow plugin](https://github.com/leclabs/agent-toolkit/tree/main/plugins/flow) to provide structured workflow execution:

1. **Initialize workflows** -- Copy workflow templates to your project with `CopyWorkflows`
2. **Start a task** -- Use `Start` with a workflow type and description
3. **Follow the flow** -- Use `Current` to read the current step and what to do
4. **Advance on completion** -- Use `Next` with `passed` or `failed` to move forward

```
User: "Add dark mode support"
  ↓
Start(taskFilePath, workflowType: "feature-development", description: "Add dark mode support")
  ↓
Navigator returns: currentStep: "parse_requirements", node: { agent: "Planner", ... }
  ↓
Agent executes step, then calls Next(taskFilePath, result: "passed")
  ↓
Navigator returns: currentStep: "explore_codebase", node: { agent: "Explore", ... }
  ↓
... continues through workflow ...
```

## MCP Tools Reference

### Navigation Tools

| Tool      | Description                                    |
| --------- | ---------------------------------------------- |
| `Start`   | Initialize workflow on task at any step        |
| `Current` | Read current workflow position (read-only)     |
| `Next`    | Advance workflow based on step outcome         |

### Management Tools

| Tool             | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `Diagram`        | Generate a mermaid flowchart for a workflow               |
| `ListWorkflows`  | List all available workflows                              |
| `SelectWorkflow` | Get workflow selection dialog for user interaction        |
| `CopyWorkflows`  | Copy workflows from catalog to project                    |
| `CopyAgents`     | Copy agent templates from catalog to project              |
| `ListCatalog`    | List workflows and agents available in the catalog        |
| `LoadWorkflows`  | Load workflows at runtime from project or external plugin |

### Start

Initialize a workflow on a task. Returns current step info and outgoing edges.

| Parameter      | Type   | Description                                     |
| -------------- | ------ | ----------------------------------------------- |
| `taskFilePath` | string | Path to task file (writes workflow state)       |
| `workflowType` | string | Workflow ID (required, e.g., "feature-development") |
| `description`  | string | User's task description                         |
| `stepId`       | string | Start at specific step (for mid-flow recovery)  |

### Current

Read current workflow position. Returns step info and outgoing edges without modifying state.

| Parameter      | Type   | Description                |
| -------------- | ------ | -------------------------- |
| `taskFilePath` | string | Path to task file (required) |

### Next

Advance workflow based on step outcome. Returns new step info and outgoing edges.

| Parameter      | Type                 | Description                    |
| -------------- | -------------------- | ------------------------------ |
| `taskFilePath` | string               | Path to task file (required)   |
| `result`       | "passed" \| "failed" | Outcome of current step (required) |

### Diagram

Generates a mermaid diagram for visualizing workflow structure.

| Parameter      | Type   | Description                         |
| -------------- | ------ | ----------------------------------- |
| `workflowType` | string | Workflow ID to visualize (required) |
| `currentStep`  | string | Optional step to highlight          |

### ListWorkflows

Lists available workflows, filterable by source.

| Parameter | Type   | Description                                                                 |
| --------- | ------ | --------------------------------------------------------------------------- |
| `source`  | string | Filter: `"project"`, `"catalog"`, or `"all"`. Defaults to project if exists |

### SelectWorkflow

Returns a workflow selection dialog for user interaction. No parameters.

### CopyWorkflows

Copies workflows from catalog to the project's `.flow/workflows/` directory.

| Parameter     | Type     | Description                            |
| ------------- | -------- | -------------------------------------- |
| `workflowIds` | string[] | Workflow IDs to copy. Empty = copy all |

### ListCatalog

Lists workflows available in the built-in catalog. No parameters.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  ORCHESTRATOR                     │
│  (Executes tasks, delegates to subagents)        │
└──────────────────────┬──────────────────────────┘
                       │
       Start ──────────┼─────── Diagram
       Current ────────┤        CopyWorkflows
       Next ───────────┤        ListCatalog
       ListWorkflows ──┤        LoadWorkflows
                       │
┌──────────────────────┴──────────────────────────┐
│                   NAVIGATOR                      │
│          (Workflow State Machine MCP)             │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────┐      │
│  │  Workflow Store  │  │  Edge Evaluator  │      │
│  │  (Graph Defs)    │  │  (Next Step?)    │      │
│  └──────────────────┘  └──────────────────┘      │
│                                                  │
│  Write-through: state transitions persist        │
│  atomically to the task file on disk             │
└─────────────────────────────────────────────────┘
```

### Key Concepts

| Concept                 | Description                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Workflow Definition** | A graph blueprint describing how to execute a type of work (nodes + conditional edges) |
| **Start/Current/Next**  | Three explicit tools: initialize, read position, advance based on outcome              |
| **Write-Through**       | State transitions are persisted to the task file atomically on Start and Next          |
| **Conditional Edges**   | Edges with `on` condition (passed/failed) -- retry logic is on nodes via `maxRetries`  |
| **HITL Escalation**     | When retries are exhausted, tasks route to end nodes with `escalation: "hitl"`         |

## Workflow Definition Schema

### Node Types

| Type      | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `start`   | Workflow entry point (exactly one per workflow)              |
| `end`     | Exit point with `result` (success/failure/blocked/cancelled) |
| `task`    | Executable work unit                                         |
| `gate`    | Quality gate / review checkpoint                             |
| `fork`    | Fan out into parallel branches (paired with a `join`)        |
| `join`    | Collect parallel branches back together                      |
| `subflow` | Connector to another workflow                                |

### End Node Properties

| Property     | Description                                             |
| ------------ | ------------------------------------------------------- |
| `result`     | `"success"`, `"failure"`, `"blocked"`, or `"cancelled"` |
| `escalation` | Optional: `"hitl"`, `"alert"`, or `"ticket"`            |

### Task/Gate Node Properties

| Property     | Description                                                          |
| ------------ | -------------------------------------------------------------------- |
| `name`       | Human-readable name (required)                                       |
| `outputs`    | Possible outcomes (default: `["passed", "failed"]`)                  |
| `maxRetries` | Retry count on failure before following "failed" edge                |
| `agent`      | Agent type to perform this task                                      |
| `stage`      | Workflow phase (e.g., planning, development, verification, delivery) |
| `metadata`   | Arbitrary key-value data for workflow tooling and extensions         |

### Edge Properties

| Property    | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `from`      | Source node ID                                                 |
| `to`        | Target node ID                                                 |
| `on`        | Output value that triggers this edge (for conditional routing) |
| `label`     | Human-readable edge description                                |
| `condition` | Expression for future conditional routing (informational)      |

### Fork/Join (Parallel Branches)

Fork/join lets a workflow fan out into parallel investigation tracks that converge at a join point. Each fork must be paired 1:1 with a join, and nested forks are not supported.

#### Fork Node

```json
{
  "type": "fork",
  "name": "Fork Investigation",
  "join": "join_investigate",
  "branches": {
    "reproduce": {
      "entryStep": "reproduce",
      "description": "Try to trigger the bug"
    },
    "code_archaeology": {
      "entryStep": "code_archaeology",
      "description": "Trace code paths related to symptoms"
    }
  }
}
```

| Property   | Description                                                    |
| ---------- | -------------------------------------------------------------- |
| `join`     | ID of the paired join node (required)                          |
| `branches` | Map of branch name to `{ entryStep, description? }` (required) |

Each branch's `entryStep` must reference an existing task/gate node in the workflow. The orchestrator creates a child task per branch and runs them from their entry step.

#### Join Node

```json
{
  "type": "join",
  "name": "Join Investigation",
  "fork": "fork_investigate",
  "strategy": "all-pass"
}
```

| Property   | Description                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- |
| `fork`     | ID of the paired fork node (required)                                                        |
| `strategy` | `"all-pass"` (all branches must pass) or `"any-pass"` (one is enough). Default: `"all-pass"` |

#### Edges

Wire the fork and join like any other nodes. Branches run from their `entryStep` until they reach the join node via normal edges:

```json
{ "from": "triage", "to": "fork_investigate" },
{ "from": "fork_investigate", "to": "reproduce" },
{ "from": "fork_investigate", "to": "code_archaeology" },
{ "from": "reproduce", "to": "join_investigate" },
{ "from": "code_archaeology", "to": "join_investigate" },
{ "from": "join_investigate", "to": "synthesize", "on": "passed" },
{ "from": "join_investigate", "to": "hitl_inconclusive", "on": "failed" }
```

The join node supports conditional edges (`on: "passed"` / `on: "failed"`) so the workflow can route to different paths depending on whether the branches succeeded.

#### Validation Rules

- Fork and join must reference each other (1:1 pairing)
- All branch `entryStep` values must reference existing nodes
- Branch entry steps cannot be fork nodes (no nesting)

See `catalog/workflows/bug-hunt.json` for a complete working example.

## Testing

```bash
npm test
```

## Links

- [GitHub Repository](https://github.com/leclabs/agent-toolkit)
- [Flow Plugin](https://github.com/leclabs/agent-toolkit/tree/main/plugins/flow)

## License

ISC
