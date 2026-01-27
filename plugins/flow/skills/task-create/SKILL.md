---
description: Route user task/work requests to flow workflows. Use for feature requests (feat:), bug fixes (bug:), multi-step tasks (task:), context optimization (ctx:), or any work prefixed with flow:. Default entry point for trackable work.
---

# /flow:task-create

Create a new flow task from issues, requirements, or descriptions.

<usage>
```
/flow:task-create <description> [<workflow>] [--run]
```

| Command                                             | Description                                      |
| --------------------------------------------------- | ------------------------------------------------ |
| /flow:task-create                                   | Interactive multi-panel workflow selection       |
| /flow:task-create "description"                     | Infer workflow from description                  |
| /flow:task-create "description" feature-development | Create task with feature-development workflow    |
| /flow:task-create "description" --run               | Create task and immediately execute              |
| /flow:task-create "description" agile-task --run    | Create task with agile-task workflow and execute |
| /flow:task-create #AB-123                           | From issue tracker                               |
| /flow:task-create #AB-123 --run                     | From issue, then auto-execute                    |

</usage>

<instructions>

## 1. Gather Task Information

**From description:**

- Parse the user's text for title and requirements
- Check for issue tracker tools (Linear, Jira, GitHub) to extract issue info

## 2. Select Workflow

If not specified, call `Navigator.SelectWorkflow` and present the dialog to user.

## 3. Start Workflow with Navigate

Call `Navigator.Navigate` to get the first work step.

## 4. Create Native Task

Call `TaskCreate` with workflow context suffix in subject:

**Subject format:** `{title} [{workflow}.{stage}.{step}]`

<example name="task-metadata">
```json
{
  "subject": "Task title [feature-development.planning.analyze]",
  "description": "What needs to be done",
  "activeForm": "Working on Task title",
  "metadata": {
    "navigator": {
      "workflowType": "feature-development",
      "currentStep": "analyze",
      "retryCount": 0
    }
  }
}
```
</example>

Note: `subjectSuffix` from Navigate response contains `[workflow.stage.step]` - use it directly for the subject.

The suffix `[workflow.stage.step]` makes flow tasks identifiable and shows current progress.

## 5. Show Created Task

<output-format name="created-task">
Created Task: #1

- **Subject:** Task title [feature-development.planning.analyze]
- **Current step:** analyze (planning)
- **Subagent:** @flow:Developer

**Next Action:** Delegate to @flow:Developer or run `/flow:run 1` for autonomous execution.
</output-format>

If subagent is null, indicate the step should be handled directly.

## 6. Auto-Execute (if --run flag)

If the user included the `--run` flag, immediately invoke `/flow:run` after showing the task creation result.

<example name="auto-execute-flow">
1. User: `/flow:task-create "add login feature" feature-development --run`
2. Create task #1 as normal (steps 1-5)
3. Show "Task Created: #1" message
4. Automatically invoke `/flow:run 1`
5. Task executes through workflow steps autonomously
</example>

</instructions>

<reference name="identifying-flow-tasks">
Flow tasks have a `[workflow.stage.step]` suffix in the subject:

```
Fix the login bug [agile-task.development.implement]   ← flow task
Fix the login bug                                       ← regular task
```

The suffix updates as the task progresses through the workflow.
</reference>
