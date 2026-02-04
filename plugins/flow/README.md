# Flow Plugin

Orchestration ruleset for [Navigator](../../packages/agent-flow-navigator-mcp/README.md), delivered via prompt injection.

Flow tells Claude _how_ to orchestrate via Navigator's FSM. The orchestration logic lives in the rules, not in code.

## What Flow Provides

| Component | What it is                                        |
| --------- | ------------------------------------------------- |
| Ruleset   | Guidelines for delegation, task handling, HITL    |
| Hook      | Injects rules into system prompt at session start |
| Commands  | `/flow:*` skills for task and workflow management |

## Quick Start

```bash
/flow:task "add user authentication"   # Create task, select workflow
/flow:go                                # Execute all pending tasks
```

Or just ask Claude naturally -- session context enables workflow requests.

## Commands

| Command         | Description                         |
| --------------- | ----------------------------------- |
| `/flow:task`    | Create task with workflow selection |
| `/flow:go`      | Execute all pending tasks           |
| `/flow:list`    | List available workflows            |
| `/flow:setup`   | Copy workflows/agents to project    |
| `/flow:diagram` | Visualize a workflow                |
| `/flow:recon`   | Deep project reconnaissance         |

## Architecture

```
User Request
    ↓
Flow Plugin (session protocol, rules, hooks)
    ↓
Navigator MCP (state machine, graph evaluation)
    ↓
Subagents (Planner, Developer, Tester, Reviewer...)
```

Flow injects orchestration context at session start. Claude calls Navigator MCP directly -- no intermediate layer.

## Subagents

| Agent            | Role                                           |
| ---------------- | ---------------------------------------------- |
| Planner          | Parse requirements, explore code, create plans |
| Developer        | Write code, fix issues, implement features     |
| Tester           | Write tests, run tests, verify behavior        |
| Reviewer         | Review plans and code for quality              |
| Investigator     | Reproduce bugs, trace issues, find root causes |
| Context Engineer | Optimize context, analyze documentation        |
| Architect        | Design system architecture, review builds      |

## Customization

```bash
/flow:setup   # Copy workflows/agents to project for editing
```

Project workflows in `.flow/workflows/` take precedence over catalog defaults.

## See Also

- [Navigator MCP](../../packages/agent-flow-navigator-mcp/README.md) -- The underlying workflow engine
- [Workflow Catalog](../../packages/agent-flow-navigator-mcp/catalog/workflows/) -- Built-in workflow definitions
