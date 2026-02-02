# Flow Plugin

Graph-based workflow orchestration for AI agents.

## Quick Start

```bash
# Load the orchestrator at session start
/flow:prime

# Create a task using a command
/flow:feat "add user authentication"

# Execute all pending tasks
/flow:go
```

## Commands

| Command      | Workflow             | Description                        |
| ------------ | -------------------- | ---------------------------------- |
| `/flow:feat` | feature-development  | New feature with planning + review |
| `/flow:bug`  | bug-fix              | Bug investigation and fix          |
| `/flow:task` | agile-task           | General development task           |
| `/flow:fix`  | quick-task           | Quick fix, minimal ceremony        |
| `/flow:spec` | test-coverage        | Analyze and improve test coverage  |
| `/flow:ctx`  | context-optimization | Optimize agent context and prompts |
| `/flow:ui`   | ui-reconstruction    | Reconstruct UI from reference      |
| `/flow:go`   | _(runs queue)_       | Execute all pending tasks          |

Use `/flow:task-create "description" <workflow-id>` for workflows without command shortcuts.

## Available Workflows

Workflows are defined in `.flow/workflows/`. Edit `workflow.json` to customize, then run `/flow:load` to reload.

See [Flow Plugin docs](https://github.com/leclabs/agent-toolkit/tree/main/plugins/flow) for the full workflow catalog.
