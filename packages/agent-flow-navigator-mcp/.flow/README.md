# Flow Plugin

Graph-based workflow orchestration for Claude Code.

## Overview

Flow provides structured workflows that guide tasks through defined stages (planning → development → verification → delivery). Each step can be delegated to specialized subagents.

## Quick Start

Workflows work immediately from the built-in catalog - no setup required:

```bash
# Create a task with workflow tracking
/flow:task-create "Add user authentication" [workflow] feature-development

# Or use prefix shortcuts
feat: Add user authentication    # → feature-development workflow
bug: Fix login error             # → bug-fix workflow
task: Update config file         # → quick-task workflow

# Run the task autonomously
/flow:run
```

## Commands

| Command              | Description                                          |
| -------------------- | ---------------------------------------------------- | ------------------------------ |
| `/flow:list`         | List available workflows                             |
| `/flow:task-create`  | Create a new task with workflow tracking             |
| `/flow:task-list`    | List all flow tasks with current status              |
| `/flow:task-get`     | Get detailed task info including workflow diagram    |
| `/flow:task-advance` | Advance task: `<taskId> <passed                      | failed> <navigator> [summary]` |
| `/flow:run`          | Execute flow tasks autonomously                      |
| `/flow:init`         | Copy workflows to .flow/workflows/ for customization |
| `/flow:load`         | Reload workflows after editing .flow/workflows/      |

## Available Workflows

- **quick-task** - Minimal: understand → execute → verify (best for simple tasks)
- **agile-task** - Simple: analyze → implement → test → review
- **feature-development** - Full lifecycle: requirements → planning → implementation → testing → PR
- **bug-fix** - Bug workflow: reproduce → investigate → fix → verify → PR
- **context-optimization** - Optimize agent context and instructions

## Customization (Optional)

Flow's workflows work directly from the catalog in the flow->navigator mcp. If you want to create custom workflows you can run `/flow:init` to select a workflow from the catalog to customize for your project, your agents, and your tools.

```bash
# Copy catalog workflows to .flow/workflows/ for editing
/flow:init

# Edit .flow/workflows/{workflow}/workflow.json
# Then reload
/flow:load
```

**Customization options:**

- Modify step definitions in workflow.json
- Add custom `instructions` to steps for project-specific guidance
- Create new workflows by adding new directories

## How It Works

1. **Navigate API** - Stateless MCP server computes next step based on workflow graph
2. **Task Metadata** - Workflow state stored in Claude Code task metadata
3. **Subagent Delegation** - Steps delegated to specialized agents (planner, developer, tester, reviewer)
4. **Retry Logic** - Failed steps retry with configurable limits, escalate to HITL if exceeded
