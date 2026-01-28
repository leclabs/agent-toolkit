---
description: List flow tasks and their workflow progress. Use to find pending work, recover context after session breaks, or check task status.
---

# /flow:task-list

Display all tasks that have flow workflow tracking.

## Instructions

### 1. List All Task Files

Read all task files from `.claude/todos/` directory:

```javascript
const taskFiles = glob(".claude/todos/*.json");
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
#<id> <subject> (<subagent>)
 → <workflowType> · <stage>
 → <currentStep> · <status> [· <blockers>]
```

**Example output:**

```
#2 Add lint gate to workflows (@flow:Planner)
 → feature-development · planning
 → parse_requirements · pending

#3 Add format gate to workflows (@flow:Planner)
 → feature-development · planning
 → parse_requirements · pending · blocked by #2

#4 Add test gate to workflows (@flow:Planner)
 → feature-development · planning
 → parse_requirements · pending · blocked by #3
```

### 4. Status Indicators

Use these status labels:

| Status | Display |
|--------|---------|
| pending | `pending` |
| in_progress | `in progress` |
| completed | `completed` |
| HITL terminal | `⚠ HITL` |
| Has retries | `retry {n}/3` |

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
  "subject": "Add lint gate",
  "metadata": {
    "workflowType": "feature-development",
    "currentStep": "parse_requirements"
  }
}

// Regular task
{
  "subject": "Add lint gate",
  "metadata": {}
}
```
