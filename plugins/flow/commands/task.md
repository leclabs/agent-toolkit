---
description: Create a task with workflow selection
argument-hint: [task description]
---

If `--help` is in the arguments, display the following usage guide and stop:

```
/flow:task <description>

Create a task and prompt for a workflow type.

Arguments:
  description    What needs to be done

Examples:
  /flow:task add login page          Create a task, then choose a workflow
  /flow:task fix auth bug            Create a bug-fix task
```

---

Create a task and prompt the user to choose a workflow type. Use `$ARGUMENTS` as the description argument.

!`cat "${CLAUDE_PLUGIN_ROOT}/instructions/task-create.md"`
