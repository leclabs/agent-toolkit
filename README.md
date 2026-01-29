# Agent Toolkit

A Claude Code plugin marketplace for AI agent tools. The flagship plugin is **Flow** -- DAG-based workflow orchestration that guides agents through structured, multi-step tasks.

## Installation

```bash
# Add the toolkit to Claude Code
claude plugin:add github:leclabs/agent-toolkit
```

## Quick Start

```bash
# Load the orchestrator at session start
/flow:prime

# Create a task using any command
/flow:feat "add user authentication"
/flow:bug "fix login redirect loop"
/flow:task "refactor the settings module"

# Execute all pending tasks
/flow:go
```

## Commands

Commands are the primary human interface. Type a command to create a task with the right workflow:

| Command       | Workflow             | Description                        |
| ------------- | -------------------- | ---------------------------------- |
| `/flow:feat`  | feature-development  | New feature with planning + review |
| `/flow:bug`   | bug-fix              | Bug investigation and fix          |
| `/flow:task`  | agile-task           | General development task           |
| `/flow:fix`   | quick-task           | Quick fix, minimal ceremony        |
| `/flow:spec`  | test-coverage        | Analyze and improve test coverage  |
| `/flow:ctx`   | context-optimization | Optimize agent context and prompts |
| `/flow:ui`    | ui-reconstruction    | Reconstruct UI from reference      |
| `/flow:go`    | _(runs task queue)_  | Execute all pending tasks          |
| `/flow:recon` | _(exploration)_      | Deep project reconnaissance        |

## Workflows

10 workflow templates ship in the catalog:

| Workflow                  | Steps | Description                                            |
| ------------------------- | ----- | ------------------------------------------------------ |
| feature-development       | 15    | Full lifecycle: plan, implement, test, review, PR      |
| bug-fix                   | 11    | Reproduce, investigate, fix, regression test           |
| agile-task                | 9     | General task: analyze, implement, test, review         |
| quick-task                | 8     | Minimal: understand, execute, verify                   |
| test-coverage             | 10    | Analyze gaps, write tests, review                      |
| context-optimization      | 9     | Map connections, identify pathologies, improve         |
| ui-reconstruction         | 17    | Extract semantic IR, rebuild UI, blind review          |
| refactor                  | 16    | Functional core / imperative shell restructuring       |
| build-review-murder-board | 7     | Build-review loop, level 5 scrutiny, blind-shot review |
| build-review-quick        | 7     | Build-review loop, basic sanity check                  |

Customize workflows for your project with `/flow:init`.

## Architecture

```
/flow:feat "add dark mode"     ← human types a command
         │
         ▼
┌──────────────────┐         ┌──────────────────┐
│   Orchestrator   │ ◄─MCP─► │    Navigator     │
│   (flow:prime)   │         │  (state machine) │
└──────────────────┘         └──────────────────┘
         │                            │
         ▼                            ▼
┌──────────────────┐         ┌──────────────────┐
│    Subagents     │         │    Workflows     │
│  @flow:Planner   │         │    (DAGs)        │
│  @flow:Developer │         └──────────────────┘
│  @flow:Tester    │
│  @flow:Reviewer  │
└──────────────────┘
```

## Links

- [Flow Plugin](plugins/flow/README.md) -- commands, skills, workflows, and customization
- [Navigator MCP Server](packages/agent-flow-navigator-mcp/README.md) -- workflow state machine

## License

ISC
