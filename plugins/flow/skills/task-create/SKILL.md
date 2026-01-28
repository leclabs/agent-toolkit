---
description: Route user task/work requests to flow workflows. Use for feature requests (feat:), bug fixes (bug:), multi-step tasks (task:), context optimization (ctx:), or any work prefixed with flow:. Default entry point for trackable work.
---

# /flow:task-create

Create a new flow task from issues, requirements, or descriptions.

<usage>

**Args:**

- `description` - task description
- `workflowType` - workflow type
- `--run` - autorun after creation

**Signiture:** `/flow:task-create <description> [<workflowType>] [--run]`

| Command                                                       | Description                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| /flow:task-create                                             | Interactive multi-panel workflowType selection              |
| /flow:task-create "Make a cup of coffee"                      | Infer workflowType → create task                            |
| /flow:task-create "Make a cup of coffee" --run                | Infer workflowType → create task → execute                  |
| /flow:task-create "Make a coffee machine" feature-development | Create task with feature-development workflowType           |
| /flow:task-create "Replace coffee filter" agile-task --run    | Create task with feature-development workflowType → execute |

</usage>

<instructions>

## 1. Call Navigate to Start Workflow

Call `Navigator.Navigate` with `workflowType` and `description`:

```json
{
  "workflowType": "feature-development",
  "description": "Add user authentication"
}
```

Response includes:

- `orchestratorInstructions`: Task description content
- `metadata`: `{ workflowType, currentStep, retryCount }`

## 2. Create Task with Metadata

Call `TaskCreate` with:

```json
{
  "subject": "Add user authentication",
  "description": "{response.orchestratorInstructions}",
  "metadata": {
    "userDescription": "Add user authentication",
    "workflowType": "{response.metadata.workflowType}",
    "currentStep": "{response.metadata.currentStep}",
    "retryCount": 0
  }
}
```

**Key points:**

- Subject is just the task title (no suffix)
- All workflow state is stored in metadata
- Include `userDescription` in metadata for context preservation

## 3. Auto-Execute (if --run flag)

If `--run` flag is provided, invoke `/flow:run {taskId}` after creation.

</instructions>
