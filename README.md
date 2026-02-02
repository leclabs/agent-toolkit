# Agent Toolkit

A Claude Code plugin marketplace for AI agent tools. The flagship plugin is **Flow** -- a stateless state-machine for Agents.

## Installation

```bash
# Add the toolkit to Claude Code
claude plugin marketplace add leclabs/agent-toolkit

claude plugin install flow@agent-toolkit
```

```mermaid
flowchart TD
    start(("Start"))
    work["Do Work<br/><small>Developer</small>"]
    check{"Check"}
    end_success[["Done"]]
    hitl_blocked{{"Blocked"}}

    start --> work
    work --> check
    check -->|passed| end_success
    check -->|failed| work
    check -->|failed| hitl_blocked
    hitl_blocked -->|passed| work

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_blocked hitlStep
    class check gateStep
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

14 workflow templates ship in the catalog:

| Workflow                  | Steps | Description                                                        |
| ------------------------- | ----- | ------------------------------------------------------------------ |
| feature-development       | 15    | Full lifecycle: plan, implement, test, review, PR                  |
| bug-fix                   | 11    | Reproduce, investigate, fix, regression test                       |
| bug-hunt                  | 16    | Parallel investigation: reproduce, code archaeology, git forensics |
| agile-task                | 9     | General task: analyze, implement, test, review                     |
| quick-task                | 8     | Minimal: understand, execute, verify                               |
| test-coverage             | 10    | Analyze gaps, write tests, review                                  |
| context-gather            | 10    | Parallel context gathering: repo, system, weather                  |
| context-optimization      | 10    | Map connections, identify pathologies, improve                     |
| ui-reconstruction         | 17    | Extract semantic IR, rebuild UI, blind review                      |
| refactor                  | 16    | Functional core / imperative shell restructuring                   |
| build-review-murder-board | 7     | Build-review loop, level 5 scrutiny, blind-shot review             |
| build-review-quick        | 7     | Build-review loop, basic sanity check                              |
| execute                   | 3     | Single-step workflow: just do the thing                            |
| hitl-test                 | 5     | Minimal HITL recovery test: work, gate, escalate                   |

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
│  @flow:Planner   │         │                  │
│  @flow:Developer │         └──────────────────┘
│  @flow:Tester    │
│  @flow:Reviewer  │
└──────────────────┘
```

## Links

- [Flow Plugin](plugins/flow/README.md) -- commands, skills, workflows, and customization
- [Navigator MCP Server](packages/agent-flow-navigator-mcp/README.md) -- workflow state machine
- [Workflow Diagrams](.flow/diagrams/) -- mermaid diagrams for all workflows

## License

ISC
