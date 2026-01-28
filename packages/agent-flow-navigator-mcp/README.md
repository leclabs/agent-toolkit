# @leclabs/agent-flow-navigator-mcp

[![npm](https://img.shields.io/npm/v/@leclabs/agent-flow-navigator-mcp)](https://npmjs.com/package/@leclabs/agent-flow-navigator-mcp)

A workflow state machine MCP server that navigates agents through DAG-based workflows.

Navigator tracks task state and evaluates graph edges - it tells the orchestrator _where to go next_, but doesn't drive. Think of it like a GPS: you tell it where you are and what happened, it tells you where to go.

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

1. **Initialize workflows** - Copy workflow templates to your project with `CopyWorkflows`
2. **Start a task** - Use `Navigate` with a workflow type and description
3. **Follow the flow** - Navigator tells you the current step and what to do
4. **Advance on completion** - Report `passed` or `failed` to move to the next step

```
User: "Add dark mode support"
  ↓
Navigate(workflowType: "feature-development", description: "Add dark mode support")
  ↓
Navigator returns: Step 1 of 8 - "Create implementation plan"
  ↓
Agent executes step, then calls Navigate(result: "passed")
  ↓
Navigator returns: Step 2 of 8 - "Implement changes"
  ↓
... continues through workflow ...
```

## MCP Tools Reference

| Tool | Description |
| ---- | ----------- |
| `Navigate` | Start a workflow, get current state, or advance to next step |
| `Diagram` | Generate a mermaid flowchart for a workflow |
| `ListWorkflows` | List all available workflows |
| `SelectWorkflow` | Get workflow selection dialog for user interaction |
| `CopyWorkflows` | Copy workflows from catalog to project |
| `ListCatalog` | List workflows available in the catalog |

### Navigate

The primary tool for workflow navigation.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `workflowType` | string | Workflow ID (for start only, e.g., "feature-development") |
| `description` | string | User's task description (for start) |
| `taskFilePath` | string | Path to task file (for advance/current) |
| `result` | "passed" \| "failed" | Step result (for advance) |

### Diagram

Generates a mermaid diagram for visualizing workflow structure.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| `workflowType` | string | Workflow ID to visualize (required) |
| `currentStep` | string | Optional step to highlight |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR                                 │
│  (Source of Truth: GitHub Issues, External DB, etc.)                │
│  (Executes tasks, makes decisions, drives the workflow)             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │ load_workflow │ load_task_tree│
          │               │               │
          ▼               ▼               │
┌─────────────────────────────────────────┴───────────────────────────┐
│                         NAVIGATOR                                    │
│               (Workflow State Machine MCP Server)                    │
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │ Workflow Store   │    │ Task Tree        │                       │
│  │ (Graph Defs)     │    │ (State Tracker)  │                       │
│  └──────────────────┘    └──────────────────┘                       │
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │ Edge Evaluator   │    │ Sync Tracker     │                       │
│  │ (Next Step?)     │    │ (Pending Syncs)  │                       │
│  └──────────────────┘    └──────────────────┘                       │
│                                                                      │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │ get_next_tasks│ advance_task  │
          │ "What's next?"│ "I got X"     │
          ▼               ▼               │
┌─────────────────────────────────────────┴───────────────────────────┐
│                         ORCHESTRATOR                                 │
│  (Receives directions, executes, persists, confirms syncs)          │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept                 | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Workflow Definition** | A DAG blueprint describing how to execute a type of work (nodes + conditional edges) |
| **Task Tree**           | A runtime priority queue of actual work items across multiple workflow types         |
| **Sync Tracking**       | Mutations are tracked; orchestrator is reminded to persist to primary store          |
| **Conditional Edges**   | Edges with `on` condition (passed/failed) - retry logic is on nodes via `maxRetries` |
| **HITL Escalation**     | When retries are exhausted, tasks route to end nodes with `escalation: "hitl"`       |

## Workflow Definition Schema

### Node Types

| Type      | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `start`   | Workflow entry point (exactly one per workflow)              |
| `end`     | Exit point with `result` (success/failure/blocked/cancelled) |
| `task`    | Executable work unit                                         |
| `gate`    | Quality gate / review checkpoint                             |
| `subflow` | Connector to another workflow                                |

### End Node Properties

| Property     | Description                                             |
| ------------ | ------------------------------------------------------- |
| `result`     | `"success"`, `"failure"`, `"blocked"`, or `"cancelled"` |
| `escalation` | Optional: `"hitl"`, `"alert"`, or `"ticket"`            |

### Task/Gate Node Properties

| Property     | Description                                                |
| ------------ | ---------------------------------------------------------- |
| `name`       | Human-readable name (required)                             |
| `outputs`    | Possible outcomes (default: `["passed", "failed"]`)        |
| `maxRetries` | Retry count on failure before following "failed" edge      |
| `agent`      | Agent type to perform this task                            |
| `stage`      | Workflow phase: planning/development/verification/delivery |

### Edge Properties

| Property | Description                                                    |
| -------- | -------------------------------------------------------------- |
| `from`   | Source node ID                                                 |
| `to`     | Target node ID                                                 |
| `on`     | Output value that triggers this edge (for conditional routing) |
| `label`  | Human-readable edge description                                |

## Advanced Usage

### Loading Workflow Definitions

```json
{
  "tool": "load_workflow",
  "arguments": {
    "id": "ui-reconstruction",
    "definition": {
      "nodes": {
        "start": { "type": "start" },
        "analyze": { "type": "task", "name": "Analyze Components" },
        "review": { "type": "gate", "name": "Review Analysis", "maxRetries": 3 },
        "end": { "type": "end", "result": "success" },
        "hitl": { "type": "end", "result": "blocked", "escalation": "hitl" }
      },
      "edges": [
        { "from": "start", "to": "analyze" },
        { "from": "analyze", "to": "review" },
        { "from": "review", "to": "analyze", "on": "failed", "label": "Retry on failure" },
        { "from": "review", "to": "hitl", "on": "max_retries_exceeded", "label": "Escalate after 3 failures" },
        { "from": "review", "to": "end", "on": "passed" }
      ]
    }
  }
}
```

### Task Tree Management

Load a priority queue of tasks:

```json
{
  "tool": "load_task_tree",
  "arguments": {
    "tasks": [
      {
        "id": "task-001",
        "issueId": "ISSUE-042",
        "workflowType": "ui-reconstruction",
        "currentStep": "start",
        "priority": 100,
        "status": "PENDING",
        "context": { "targetUrl": "https://example.com" }
      }
    ]
  }
}
```

### Advancing Tasks

After executing a task step:

```json
{
  "tool": "advance_task",
  "arguments": {
    "taskId": "task-001",
    "result": "passed",
    "output": "Analysis complete, found 5 components"
  }
}
```

## Testing

```bash
npm test
```

## Links

- [GitHub Repository](https://github.com/leclabs/agent-toolkit)
- [Flow Plugin](https://github.com/leclabs/agent-toolkit/tree/main/plugins/flow)
- [Full Documentation](https://github.com/leclabs/agent-toolkit/tree/main/packages/agent-flow-navigator-mcp)

## License

MIT
