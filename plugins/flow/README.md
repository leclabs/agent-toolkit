# Flow Plugin

DAG-based workflow orchestration for AI agents. Flow provides structured, repeatable workflows that guide agents through complex tasks with automatic retry handling and human-in-the-loop escalation.

## Overview

Flow turns unstructured agent requests into trackable, multi-step workflows. When you say `feat: add user auth`, Flow:

1. Selects the appropriate workflow (feature-development)
2. Creates a task with workflow state
3. Guides agents through planning, implementation, testing, and delivery
4. Handles failures with retries and escalation

## Quick Start

```bash
# At session start, load the orchestrator context
/flow:prime

# Create and run a task
feat: add user authentication --run

# Or step by step
/flow:task-create "add user authentication" feature-development
/flow:run 1
```

## Prefix Recognition

Flow recognizes these prefixes to auto-select workflows:

| Prefix  | Workflow             | Use Case                                 |
| ------- | -------------------- | ---------------------------------------- |
| `fix:`  | quick-task           | Small, straightforward changes           |
| `feat:` | feature-development  | New features with planning and review    |
| `bug:`  | bug-fix              | Bug reproduction, investigation, and fix |
| `test:` | test-coverage        | Analyze and improve test coverage        |
| `ctx:`  | context-optimization | Optimize agent prompts and context       |

## Available Skills

| Skill                | Description                                         |
| -------------------- | --------------------------------------------------- |
| `/flow:prime`        | Load orchestrator context at session start          |
| `/flow:task-create`  | Create a new task with workflow tracking            |
| `/flow:task-list`    | List all flow tasks and their progress              |
| `/flow:task-get`     | Get detailed task info with workflow diagram        |
| `/flow:task-advance` | Advance a task to the next step (passed/failed)     |
| `/flow:run`          | Execute tasks autonomously with subagent delegation |
| `/flow:init`         | Set up workflows for a project (copy from catalog)  |
| `/flow:list`         | List available workflows                            |
| `/flow:load`         | Reload workflows from `.flow/workflows/`            |
| `/flow:diagram`      | Generate mermaid diagram for a workflow             |

## Workflows

### feature-development

Full lifecycle for building features. Includes planning review gates and code review.

**Stages:** planning -> development -> verification -> delivery

**Steps:** parse_requirements -> explore_codebase -> create_plan -> plan_review -> implement -> write_tests -> run_tests -> code_review -> lint_format -> commit -> create_pr

### bug-fix

Structured bug fixing with reproduction and regression testing.

**Stages:** investigation -> development -> verification -> delivery

**Steps:** reproduce -> investigate -> write_fix -> add_regression_test -> verify_fix -> lint_format -> commit

### quick-task

Minimal workflow for small, straightforward tasks. No formal review gates.

**Stages:** planning -> development -> verification -> delivery

**Steps:** understand -> execute -> verify -> lint_format -> commit

### agile-task

Simple workflow for general development tasks with review.

**Stages:** planning -> development -> verification -> delivery

**Steps:** analyze -> implement -> test -> review -> lint_format -> commit

### test-coverage

Analyze coverage gaps and write tests to improve coverage.

**Stages:** analysis -> development -> verification -> delivery

**Steps:** analyze_coverage -> identify_gaps -> write_tests -> run_tests -> review -> lint_format -> commit

### context-optimization

Optimize agent context, instructions, and integration points.

**Stages:** analysis -> design -> implementation -> verification

**Steps:** map_connections -> identify_pathologies -> design_improvements -> review_design -> implement -> verify

## Customization

Copy workflows to your project for customization:

```bash
/flow:init
```

This creates `.flow/workflows/` with editable workflow definitions. Navigator loads project workflows first, falling back to catalog defaults.

```
.flow/
└── workflows/
    ├── feature-development/
    │   ├── workflow.json
    │   └── {step}.md
    └── bug-fix/
        └── ...
```

After editing, reload with `/flow:load`.

## Architecture

```
User Request
     │
     ▼
┌─────────────┐      ┌─────────────┐
│ Orchestrator│ ◄──► │  Navigator  │
│ (flow:prime)│      │  (MCP)      │
└─────────────┘      └─────────────┘
     │                     │
     ▼                     ▼
┌─────────────┐      ┌─────────────┐
│  Subagents  │      │  Workflows  │
│ @flow:*     │      │  (DAGs)     │
└─────────────┘      └─────────────┘
```

- **Orchestrator**: Coordinates workflow execution, delegates to subagents
- **Navigator**: MCP server that evaluates workflow graphs and tracks state
- **Subagents**: Specialized agents (@flow:Planner, @flow:Developer, @flow:Tester, @flow:Reviewer)
- **Workflows**: DAG definitions with nodes, edges, and retry logic

## Subagents

Flow delegates work to specialized subagents:

| Agent        | Role                                   |
| ------------ | -------------------------------------- |
| Planner      | Parse requirements, explore code, plan |
| Developer    | Write code, fix issues, commit         |
| Tester       | Write tests, run tests, verify         |
| Reviewer     | Review plans and code                  |
| Investigator | Reproduce bugs, find root causes       |

## Human-in-the-Loop (HITL)

When retries are exhausted at a gate step, Flow escalates to HITL:

```
hitl: #1 Add user auth (direct)
  -> feature-development / verification
  -> hitl_impl_failed / pending

Reason: Max retries exceeded at code_review
Action: Fix manually, then /flow:task-advance 1 passed
```

## Further Reading

- [Navigator MCP Server](../../packages/agent-flow-navigator-mcp/README.md) - Workflow state machine implementation
- [Workflow Catalog](../../packages/agent-flow-navigator-mcp/catalog/workflows/) - Built-in workflow definitions
