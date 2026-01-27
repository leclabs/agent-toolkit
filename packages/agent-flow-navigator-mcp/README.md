# Navigator

A workflow state machine that navigates agents through DAG-based workflows.

Navigator is an MCP server that tracks task state and evaluates graph edges - it tells the orchestrator _where to go next_, but doesn't drive. Think of it like a GPS navigator: you tell it where you are and what happened, it tells you where to go.

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

## Installation

```bash
cd packages/navigator
npm install
```

## Running the Server

```bash
# As MCP server (stdio transport)
step index.js

# Run tests
npm test

# Run integration test
step test-data/integration-test.mjs
```

## MCP Tools Reference

### Workflow Definition Tools

| Tool                 | Description                               |
| -------------------- | ----------------------------------------- |
| `list_workflows`     | List all loaded workflow definitions      |
| `load_workflow`      | Load a workflow definition from JSON      |
| `get_execution_plan` | Get topologically sorted execution levels |

### Task Tree Tools

| Tool                       | Description                                  |
| -------------------------- | -------------------------------------------- |
| `load_task_tree`           | Load task array from orchestrator            |
| `get_next_tasks_from_tree` | Get N highest priority PENDING tasks         |
| `advance_task`             | Evaluate edges and advance task to next step |
| `get_task`                 | Get a specific task by ID                    |
| `get_task_progress`        | Get workflow progress for a task             |
| `get_tasks_by_status`      | Get all tasks grouped by status              |

### Sync Tracking Tools

| Tool                    | Description                               |
| ----------------------- | ----------------------------------------- |
| `get_pending_syncs`     | List mutations awaiting sync confirmation |
| `confirm_sync`          | Confirm mutations have been persisted     |
| `confirm_sync_for_task` | Confirm all syncs for a specific task     |

## How It Works

### 1. Load Workflow Definitions

The orchestrator loads workflow definitions (DAGs) into the MCP server:

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

### 2. Load Task Tree

The orchestrator loads a priority queue of tasks:

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
      },
      {
        "id": "task-002",
        "issueId": "ISSUE-037",
        "workflowType": "research",
        "currentStep": "start",
        "priority": 80,
        "status": "PENDING"
      }
    ]
  }
}
```

### 3. Get Next Task

Query for the highest priority PENDING task:

```json
{
  "tool": "get_next_tasks_from_tree",
  "arguments": { "limit": 1 }
}
```

Response:

```json
{
  "data": {
    "count": 1,
    "tasks": [
      {
        "id": "task-001",
        "issueId": "ISSUE-042",
        "workflowType": "ui-reconstruction",
        "currentStep": "start",
        "priority": 100,
        "status": "PENDING"
      }
    ]
  }
}
```

### 4. Advance Task

After executing a task step, advance to the next step:

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

Response:

```json
{
  "data": {
    "success": true,
    "previousStep": "analyze",
    "nextStep": "review",
    "action": "conditional",
    "task": { "id": "task-001", "currentStep": "review", "status": "PENDING" }
  },
  "_sync_reminder": {
    "message": "Mutations pending sync to primary store. Please persist and confirm.",
    "pending": [{ "id": "sync-123", "taskId": "task-001" }]
  }
}
```

### 5. Handle Failures and Retries

When a review fails, the engine evaluates conditional edges:

```json
{
  "tool": "advance_task",
  "arguments": { "taskId": "task-001", "result": "failed" }
}
```

If within retry limit:

```json
{
  "data": {
    "success": true,
    "previousStep": "review",
    "nextStep": "analyze",
    "action": "retry",
    "retriesUsed": 1,
    "retriesRemaining": 2
  }
}
```

If max retries exceeded:

```json
{
  "data": {
    "success": true,
    "previousStep": "review",
    "nextStep": "hitl",
    "action": "escalate",
    "reason": "max_retries_exceeded",
    "task": { "status": "HITL" }
  }
}
```

### 6. Confirm Syncs

After persisting to primary store, confirm the sync:

```json
{
  "tool": "confirm_sync",
  "arguments": { "syncIds": ["sync-123", "sync-124"] }
}
```

## Workflow Definition Schema

### Node Types

| Type      | Description                                                           |
| --------- | --------------------------------------------------------------------- |
| `start`   | Workflow entry point (exactly one per workflow)                       |
| `end`     | Exit point with `result` (success/failure/blocked/cancelled)          |
| `task`    | Executable work unit                                                  |
| `gate`    | Quality gate / review checkpoint                                      |
| `subflow` | Connector to another workflow                                         |

### End Node Properties

| Property     | Description                                              |
| ------------ | -------------------------------------------------------- |
| `result`     | `"success"`, `"failure"`, `"blocked"`, or `"cancelled"`  |
| `escalation` | Optional: `"hitl"`, `"alert"`, or `"ticket"`             |

### Task/Gate Node Properties

| Property     | Description                                              |
| ------------ | -------------------------------------------------------- |
| `name`       | Human-readable name (required)                           |
| `outputs`    | Possible outcomes (default: `["passed", "failed"]`)      |
| `maxRetries` | Retry count on failure before following "failed" edge    |
| `agent`      | Agent type to perform this task                          |
| `stage`      | Workflow phase: planning/development/verification/delivery |

### Edge Properties

| Property | Description                                                 |
| -------- | ----------------------------------------------------------- |
| `from`   | Source node ID                                              |
| `to`     | Target node ID                                              |
| `on`     | Output value that triggers this edge (for conditional routing) |
| `label`  | Human-readable edge description                             |

## Task Schema

```typescript
interface Task {
  id: string; // Unique task identifier
  issueId: string; // Issue/ticket this task belongs to
  workflowType: string; // Workflow definition ID to use
  currentStep: string; // Current position in workflow
  priority: number; // Higher = more important
  status: string; // PENDING, IN_PROGRESS, COMPLETED, FAILED, HITL, PAUSED
  retryCount: number; // Global retry count
  context: object; // Task-specific data
  stepRetries: Map; // Per-step retry tracking
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
}
```

## Testing

```bash
# Run unit tests (55 tests)
npm test

# Run integration test
step test-data/integration-test.mjs
```

The integration test demonstrates:

1. Loading a workflow definition
2. Loading a task tree with multiple tasks
3. Advancing a task through the complete workflow
4. Sync tracking and confirmation
5. Retry logic with HITL escalation

## File Structure

```
packages/navigator/
├── index.js              # MCP server with tool handlers
├── engine.js             # State machine (edge evaluation, task advancement)
├── store.js              # Data store (workflows, tasks, syncs)
├── engine.test.js        # Unit tests
├── package.json
├── README.md
└── test-data/
    ├── sample-task-tree.json    # Sample task tree
    └── integration-test.mjs     # End-to-end test
```

## Design Decisions

1. **In-Memory Only**: The MCP server is not a source of truth. The orchestrator owns persistence.

2. **Sync Reminders**: Every mutation is tracked. Responses include pending sync reminders to nag the orchestrator.

3. **Per-Step Retry Tracking**: Retries are tracked per-step, not globally. This allows different retry limits at different stages.

4. **Conditional Edge Evaluation**: Edges are sorted by specificity. Conditional edges are evaluated before unconditional fallbacks.

5. **End Node Status**: Tasks automatically get status `COMPLETED` at success end nodes and `HITL` at end nodes with `escalation: "hitl"`.
