---
description: List flow tasks and their workflow progress. Use to find pending work, recover context after session breaks, or check task status.
---

# /flow:task-list

Display all tasks that have flow workflow tracking.

## Task Directory

Use `$CLAUDE_CODE_TASK_LIST_ID` if set, otherwise fall back to session ID:

```
~/.claude/tasks/${CLAUDE_CODE_TASK_LIST_ID:-${CLAUDE_SESSION_ID}}/
```

## Instructions

### 1. List All Task Files

Read all task files from the task directory:

```javascript
const taskDir = process.env.CLAUDE_CODE_TASK_LIST_ID || "${CLAUDE_SESSION_ID}";
const taskFiles = glob(`~/.claude/tasks/${taskDir}/*.json`);
```

### 2. Identify Flow Tasks by Metadata

Read each task file and check for workflow metadata:

```javascript
for (const file of taskFiles) {
  const task = JSON.parse(readFile(file));

  // Flow task has workflowType in metadata
  if (task.metadata?.workflowType) {
    const { workflowType, currentStep, retryCount } = task.metadata;
    // This is a flow task
  }
}
```

To get `subagent`, call `Navigator.Navigate` with `taskFilePath`.

### 3. Display with Standard Flow Format

For each flow task, use this format:

```
#<id> <subject> <emoji> (<subagent>)
 → <workflowType> · <stage>
 → <currentStep> · <status> [· <blockers>]

Where `<emoji>` is determined by workflowType (see Workflow Emoji Mapping below).
```

**Example output:**

```
#2 Add lint gate to workflows ✨ (Planner)
 → feature-development · planning
 → parse_requirements · pending

#3 Add format gate to workflows ✨ (Planner)
 → feature-development · planning
 → parse_requirements · pending · blocked by #2

#4 Add test gate to workflows ✨ (Planner)
 → feature-development · planning
 → parse_requirements · pending · blocked by #3
```

### 4. Status Indicators

Use these status labels:

| Status        | Display       |
| ------------- | ------------- |
| pending       | `pending`     |
| in_progress   | `in progress` |
| completed     | `completed`   |
| HITL terminal | `⚠ HITL`      |
| Has retries   | `retry {n}/3` |

### 5. Non-Flow Tasks

Tasks without workflow metadata are regular tasks:

```
#<id> <subject>
 → <status>
```

### Reference: Identifying Flow Tasks

Flow tasks have `workflowType` in metadata:

```javascript
// Flow task
{
  "subject": "Add lint gate ✨",
  "metadata": {
    "workflowType": "feature-development",
    "currentStep": "parse_requirements"
  }
}

// Regular task (no emoji - no workflowType)
{
  "subject": "Add lint gate",
  "metadata": {}
}
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

**Note:** Non-flow tasks (no `workflowType` in metadata) have no emoji suffix.
