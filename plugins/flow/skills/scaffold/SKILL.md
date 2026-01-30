---
description: Scaffold a new workflow JSON file in .flow/workflows/. Creates the directory structure and a starter workflow definition from a description.
user-invocable: false
---

# /flow:scaffold

Create a new custom workflow in the project's `.flow/workflows/` directory.

## When Claude Should Invoke This

- User asks to create a custom workflow
- User wants to define a new process as a workflow
- `/flow:init` or `/flow:load` context indicates the user wants a new workflow that doesn't exist in the catalog

## What To Do

### 1. Gather Requirements

Determine from context:

- **Workflow ID**: kebab-case identifier (e.g., `deploy-staging`, `code-review`)
- **Name**: Human-readable name
- **Description**: One-sentence summary of the workflow's purpose
- **Steps**: The sequence of tasks/gates the workflow should contain

If the context doesn't provide enough detail, ask the user what steps the workflow should include.

### 2. Build the Workflow JSON

Create a valid workflow definition following this schema:

```json
{
  "id": "<workflow-id>",
  "name": "<Workflow Name>",
  "description": "<One-sentence description>",
  "nodes": {
    "start": {
      "type": "start",
      "name": "Start",
      "description": "Begin <workflow name>."
    },
    "<step_id>": {
      "type": "task",
      "name": "<Step Name>",
      "description": "<What this step does and what it produces.>"
    },
    "end_success": {
      "type": "end",
      "result": "success",
      "name": "<Workflow Name> Complete",
      "description": "<Summary of outputs produced.>"
    }
  },
  "edges": [
    { "from": "start", "to": "<first_step>" },
    { "from": "<step>", "to": "<next_step>", "on": "passed" },
    { "from": "<last_step>", "to": "end_success", "on": "passed" }
  ]
}
```

**Node types:**

- `start` — exactly one, entry point
- `task` — work performed by an agent
- `gate` — review/validation checkpoint
- `end` — terminal node with `result: "success"` or `result: "blocked"`

**Optional node fields:**

- `agent`: agent ID for delegation (e.g., `@flow:Developer`)
- `stage`: workflow stage (e.g., `"planning"`, `"development"`, `"verification"`)
- `maxRetries`: retry limit before escalation
- `context_files`: array of files to load before executing

**Edge conventions:**

- Unconditional: `{ "from": "a", "to": "b" }` — always taken
- Conditional: `{ "from": "a", "to": "b", "on": "passed" }` — taken on pass/fail
- Retry: failed edge pointing back to the same or earlier node
- Escalation: failed edge pointing to an `end` node with `result: "blocked"`

### 3. Write to Disk

Create the directory and file:

```
.flow/workflows/<workflow-id>/workflow.json
```

Use `mkdir -p` for the directory if needed.

### 4. Load into Navigator

Call `Navigator.LoadWorkflows` with:

```json
{
  "workflowIds": ["<workflow-id>"]
}
```

### 5. Validate

Call `Navigator.Navigate` with:

```json
{
  "workflowType": "<workflow-id>"
}
```

Verify it starts correctly. Report the result to the user:

```
Created workflow: <workflow-id> (<step count> steps)
Location: .flow/workflows/<workflow-id>/workflow.json
```
