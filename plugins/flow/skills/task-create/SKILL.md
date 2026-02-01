---
description: Create a flow task from a description. Infers or accepts a workflow type, creates a tracked task, and optionally auto-executes.
---

# /flow:task-create

Create a new flow task from issues, requirements, or descriptions.

<usage>

**Args:**

- `description` - task description
- `workflowType` - workflow type
- `--run` - autorun after creation

**Signiture:** `/flow:task-create <description> [<workflowType>] [<stepId>] [--run]`

| Command | Description |
| --------------------------------------------------------------------------- | ------------------------------------------------------- |
| /flow:task-create | Interactive multi-panel workflowType selection |
| /flow:task-create "Make a cup of coffee" | Infer workflowType → create task |
| /flow:task-create "Make a cup of coffee" --run | Infer workflowType → create task → execute |
| /flow:task-create "Make a coffee machine" feature-development | Create task with feature-development workflowType |
| /flow:task-create "Replace coffee filter" agile-task --run | Create task with agile-task workflowType → execute |
| /flow:task-create "Fix auth" bug-fix write_fix | Create task starting at write_fix step (mid-flow) |
| /flow:task-create "Fix auth" bug-fix write_fix --run | Mid-flow start → execute |

</usage>

<instructions>

## 1. Call Navigate to Start Workflow

Call `Navigator.Navigate` with `workflowType`, `description`, and optionally `stepId`:

```json
{
  "workflowType": "feature-development",
  "description": "Add user authentication"
}
```

For mid-flow recovery (starting at a specific step):

```json
{
  "workflowType": "bug-fix",
  "description": "Fix auth token refresh",
  "stepId": "write_fix"
}
```

Response includes:

- `orchestratorInstructions`: Task description content
- `metadata`: `{ workflowType, currentStep, retryCount }`

## 2. Create Task with Metadata

Call `TaskCreate` with subject formatted to show workflow position. The subject is two lines separated by a **real newline** (not a literal `\n`):

```
TaskCreate(
  subject: "#1 Add user authentication ✨
→ feature-development · parse_requirements (@flow:Planner)",
  activeForm: "Parse Requirements (@flow:Planner)",
  description: "{response.orchestratorInstructions}",
  metadata: {
    userDescription: "Add user authentication",
    workflowType: "{response.metadata.workflowType}",
    currentStep: "{response.metadata.currentStep}",
    retryCount: 0
  }
)
```

**Key points:**

- Subject includes workflow emoji suffix (see mapping below)
- Subject includes current step and subagent for at-a-glance workflow position
- `activeForm` shows step name + subagent (displayed in spinner during execution)
- All workflow state is stored in metadata
- Include `userDescription` in metadata for context preservation

### Subject Format

Two-line format — title with task number on line 1, workflow position on line 2:

```
#<taskId> <title> <emoji>
→ <workflowType> · <currentStep> (<subagent>)
```

**Gate node** (`maxRetries` > 0) appends retry budget:

```
#<taskId> <title> <emoji>
→ <workflowType> · <currentStep> (<subagent>) · retries: <retryCount>/<maxRetries>
```

**No subagent** uses `(direct)`:

```
#<taskId> <title> <emoji>
→ <workflowType> · <currentStep> (direct)
```

Examples:

```
#1 Add user auth ✨
→ feature-development · parse_requirements (@flow:Planner)

#3 Add user auth ✨
→ feature-development · code_review (@flow:Reviewer) · retries: 0/2

#7 Fix login bug 🐛
→ bug-fix · verify (direct)
```

### Workflow Emoji Mapping

Append emoji after task subject based on workflowType:

| workflowType           | Emoji  |
| ---------------------- | ------ |
| `feature-development`  | ✨     |
| `bug-fix`              | 🐛     |
| `agile-task`           | 📋     |
| `context-optimization` | 🔧     |
| `quick-task`           | ⚡     |
| `ui-reconstruction`    | 🎨     |
| `test-coverage`        | 🧪     |
| (unknown/missing)      | (none) |

## Mid-Flow Recovery

When a `stepId` argument is provided, the task starts at that specific workflow step instead of the beginning. This enables recovery scenarios:

- **Session break**: A previous session completed some steps manually. Resume from the next step.
- **Partial re-run**: Skip early steps (e.g., analysis) when context is already established.
- **Fork/join entry**: Start at a fork node to kick off parallel branches directly.

The `stepId` must be a valid task, gate, fork, or join node — not a start or end node.

## 3. Auto-Execute (if --run flag)

If `--run` flag is provided, invoke `/flow:run {taskId}` after creation.

</instructions>
