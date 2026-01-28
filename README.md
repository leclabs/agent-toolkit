# Agent Toolkit

[![npm version](https://img.shields.io/npm/v/@leclabs/agent-toolkit)](https://www.npmjs.com/package/@leclabs/agent-toolkit)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![GitHub stars](https://img.shields.io/github/stars/leclabs/agent-toolkit)](https://github.com/leclabs/agent-toolkit/stargazers)

The essential Claude Code plugin marketplace for reliable Agent-led workflow orchestration.

## What's Included

| Component | Description |
|-----------|-------------|
| **[Flow Plugin](plugins/flow/)** | DAG-based workflow orchestration for Claude Code |
| **[Navigator MCP](packages/agent-flow-navigator-mcp/)** | Workflow state machine that navigates agents through DAG-based workflows |

## Installation

Add the marketplace to Claude Code:

```bash
claude plugin marketplace add https://github.com/leclabs/agent-toolkit
```

Install the Flow plugin:

```bash
claude plugin install flow@agent-toolkit
```

## Quick Start

Use prefix commands to create and execute workflow-tracked tasks:

| Prefix | Workflow | Description |
|--------|----------|-------------|
| `feat:` | feature-development | Full lifecycle: requirements, planning, implementation, testing |
| `bug:` | bug-fix | Bug workflow: reproduce, investigate, fix, verify |
| `fix:` | quick-task | Minimal: understand, execute, verify |
| `test:` | test-coverage | Analyze coverage gaps and write tests |
| `ctx:` | context-optimization | Optimize agent context and instructions |

**Examples:**

```
feat: Add user authentication with OAuth2 support
bug: Login button not responding on mobile devices
fix: Update copyright year in footer
test: Increase coverage for payment module
```

## How It Works

The Flow plugin provides DAG-based workflow orchestration. When you use a prefix command, it:

1. **Creates a task** with the appropriate workflow type
2. **Navigates** through workflow steps using the Navigator MCP
3. **Delegates** to specialized subagents (@flow:Planner, @flow:Developer, @flow:Tester)
4. **Tracks progress** with retry logic and HITL escalation

### Architecture

```
Orchestrator (Claude Code)
    │
    ├── /flow:task-create   Create tasks with workflow metadata
    ├── /flow:run           Execute tasks through workflow steps
    ├── /flow:task-list     View all tasks and their status
    └── /flow:task-advance  Manually advance tasks
            │
            ▼
    Navigator MCP Server
    ├── Workflow Store      (Graph definitions)
    ├── Edge Evaluator      (Conditional routing)
    └── Retry Tracking      (Per-step retries with HITL escalation)
```

## Available Workflows

| Workflow | Steps | Use Case |
|----------|-------|----------|
| **feature-development** | requirements → planning → implementation → testing → review | New features with full lifecycle |
| **bug-fix** | reproduce → investigate → fix → verify | Bug fixes with root cause analysis |
| **agile-task** | understand → implement → verify | Standard development tasks |
| **quick-task** | understand → execute → verify | Fast, minimal overhead tasks |
| **test-coverage** | analyze → write-tests → verify | Improving test coverage |
| **context-optimization** | audit → optimize → validate | Improving agent context |
| **ui-reconstruction** | analyze → reconstruct → verify | UI/component rebuilding |

## Skills Reference

| Skill | Description |
|-------|-------------|
| `/flow:prime` | Load orchestrator context (invoke at session start) |
| `/flow:task-create` | Create a new workflow task |
| `/flow:run` | Execute tasks autonomously with subagent delegation |
| `/flow:task-list` | List all tasks with status |
| `/flow:task-get` | Get task details with workflow diagram |
| `/flow:task-advance` | Manually advance a task to next step |
| `/flow:init` | Copy workflows to project `.flow/workflows/` |
| `/flow:diagram` | Generate mermaid diagram for a workflow |

## Feature Highlights

- **DAG-Based Workflows**: Define complex workflows as directed acyclic graphs with conditional edges
- **Subagent Delegation**: Specialized agents handle specific workflow steps (@flow:Planner, @flow:Developer, @flow:Tester)
- **Retry Logic**: Per-step retry tracking with configurable limits
- **HITL Escalation**: Automatic human-in-the-loop escalation when retries are exhausted
- **Progress Tracking**: Visual progress through workflow stages
- **Workflow Catalog**: Pre-built workflows for common development patterns

## Documentation

- [Flow Plugin Documentation](plugins/flow/) - Detailed plugin usage and customization
- [Navigator MCP Reference](packages/agent-flow-navigator-mcp/) - MCP server API and workflow schema
- [Workflow Schema](packages/agent-flow-navigator-mcp/README.md#workflow-definition-schema) - Node types, edge properties, task schema

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with conventional commits (`git commit -m 'feat: add amazing feature'`)
6. Push to your fork (`git push origin feat/amazing-feature`)
7. Open a Pull Request

## License

ISC License - see [LICENSE](LICENSE) for details.
