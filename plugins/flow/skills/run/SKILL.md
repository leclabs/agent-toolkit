---
description: Execute flow tasks autonomously with subagent delegation. Primary command after task creation. Handles planning, implementation, testing, and review stages.
---

# /flow:run

Execute flow tasks autonomously, delegating to subagents based on Navigate response.

## Usage

```
/flow:run              # Execute highest priority pending task
/flow:run [taskId]     # Execute specific task
/flow:run --autonomy   # Auto-continue through stage boundaries
/flow:run [taskId] --autonomy
```

## Task Directory

Use `$CLAUDE_CODE_TASK_LIST_ID` if set, otherwise fall back to session ID:

```
~/.claude/tasks/${CLAUDE_CODE_TASK_LIST_ID:-${CLAUDE_SESSION_ID}}/
```

```javascript
const taskDir = process.env.CLAUDE_CODE_TASK_LIST_ID || "${CLAUDE_SESSION_ID}";
```

## What To Do

### 1. Get Task to Execute

**If taskId provided:**

- Construct task file path: `~/.claude/tasks/${taskDir}/{taskId}.json`
- Read task file to get metadata

**If no taskId:**

- List all task files in `~/.claude/tasks/${taskDir}/`
- Filter for flow tasks (those with `metadata.workflowType`)
- Get highest priority pending task

### 2. Autonomy Mode

When `--autonomy` is passed, set `autonomy: true` on all Navigate calls.

### 3. Execute

Use the resolved `taskId`, `taskDir`, `taskFilePath`, and `autonomy` values from steps 1-2.

!`cat "${CLAUDE_PLUGIN_ROOT}/instructions/execution-loop.md"`
