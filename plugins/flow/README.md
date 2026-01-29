# Flow Plugin

DAG-based workflow orchestration for AI agents. Flow provides structured, repeatable workflows that guide agents through complex tasks with automatic retry handling and human-in-the-loop escalation.

## Overview

Flow turns unstructured agent requests into trackable, multi-step workflows. When you say `/flow:feat add user auth`, Flow:

1. Selects the appropriate workflow (feature-development)
2. Creates a task with workflow state
3. Guides agents through planning, implementation, testing, and delivery
4. Handles failures with retries and escalation

## Quick Start

```bash
# At session start, load the orchestrator context
/flow:prime

# Create and run a task
/flow:feat "add a new user profile feature..."
/flow:go
```

## Commands

Commands are what you type. Each creates a task with the appropriate workflow:

| Command       | Workflow             | Description                              |
| ------------- | -------------------- | ---------------------------------------- |
| `/flow:feat`  | feature-development  | New features with planning and review    |
| `/flow:bug`   | bug-fix              | Bug reproduction, investigation, and fix |
| `/flow:task`  | agile-task           | General development tasks with review    |
| `/flow:fix`   | quick-task           | Small, straightforward changes           |
| `/flow:spec`  | test-coverage        | Analyze and improve test coverage        |
| `/flow:ctx`   | context-optimization | Optimize agent prompts and context       |
| `/flow:ui`    | ui-reconstruction    | Reconstruct UI from screenshot or spec   |
| `/flow:go`    | _(orchestration)_    | Execute all pending flow tasks           |
| `/flow:recon` | _(exploration)_      | Deep project reconnaissance              |

Three additional workflows exist in the catalog without command shortcuts: `refactor`, `build-review-murder-board`, and `build-review-quick`. Use `/flow:task-create "description" <workflow-id>` to invoke them directly.

## Skills

Skills are the internal orchestration interface used by the agent system:

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
| `/flow:analyze`      | Interactive workflow discovery from project         |

## Workflows

10 workflows ship in the catalog. Each defines a DAG with typed nodes, conditional edges, retry logic, and agent assignments.

### feature-development

Full lifecycle for building features. Includes planning review gates and code review.

**Stages:** planning &rarr; development &rarr; verification &rarr; delivery
**Steps:** parse_requirements &rarr; explore_codebase &rarr; create_plan &rarr; plan_review &rarr; implement &rarr; write_tests &rarr; run_tests &rarr; code_review &rarr; lint_format &rarr; commit &rarr; create_pr

### bug-fix

Structured bug fixing with reproduction and regression testing.

**Stages:** investigation &rarr; development &rarr; verification &rarr; delivery
**Steps:** reproduce &rarr; investigate &rarr; write_fix &rarr; add_regression_test &rarr; verify_fix &rarr; lint_format &rarr; commit

### agile-task

General development tasks with review.

**Stages:** planning &rarr; development &rarr; verification &rarr; delivery
**Steps:** analyze &rarr; implement &rarr; test &rarr; review &rarr; lint_format &rarr; commit

### quick-task

Minimal workflow for small, straightforward tasks. No formal review gates.

**Stages:** planning &rarr; development &rarr; verification &rarr; delivery
**Steps:** understand &rarr; execute &rarr; verify &rarr; lint_format &rarr; commit

### test-coverage

Analyze coverage gaps and write tests to improve coverage.

**Stages:** analysis &rarr; development &rarr; verification &rarr; delivery
**Steps:** analyze_coverage &rarr; identify_gaps &rarr; write_tests &rarr; run_tests &rarr; review &rarr; lint_format &rarr; commit

### context-optimization

Optimize agent context, instructions, and integration points.

**Stages:** analysis &rarr; design &rarr; implementation &rarr; verification
**Steps:** map_connections &rarr; identify_pathologies &rarr; design_improvements &rarr; review_design &rarr; implement &rarr; verify

### ui-reconstruction

Reconstruct UI from screenshots or specifications using semantic intermediate representation.

**Stages:** semantic-ir-extraction &rarr; ui-build-from-ir &rarr; unbiased-review &rarr; delivery
**Steps:** extract_structure &rarr; extract_styles &rarr; extract_content &rarr; build_layout &rarr; build_components &rarr; build_styles &rarr; integrate &rarr; ir_review &rarr; visual_review &rarr; lint_format &rarr; commit

### refactor

Intentional codebase restructuring following Functional Core / Imperative Shell principles.

**Stages:** analysis &rarr; planning &rarr; development &rarr; verification &rarr; delivery
**Steps:** analyze_structure &rarr; identify_debt &rarr; classify_components &rarr; design_refactor &rarr; plan_review &rarr; extract_core &rarr; isolate_shell &rarr; run_tests &rarr; code_review &rarr; lint_format &rarr; commit

### build-review-murder-board

Iterative build-review loop with level 5 scrutiny blind-shot review and 80% approval threshold.

**Stages:** development &rarr; verification &rarr; delivery
**Steps:** build &rarr; review &rarr; lint_format &rarr; commit

### build-review-quick

Iterative build-review loop with basic sanity check.

**Stages:** development &rarr; verification &rarr; delivery
**Steps:** build &rarr; review &rarr; lint_format &rarr; commit

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
│  @flow:*         │         │    (DAGs)        │
└──────────────────┘         └──────────────────┘
```

- **Orchestrator**: Coordinates workflow execution, delegates to subagents
- **Navigator**: MCP server that evaluates workflow graphs and tracks state
- **Subagents**: Specialized agents for each role
- **Workflows**: DAG definitions with nodes, edges, and retry logic

## Subagents

Flow delegates work to specialized subagents:

| Agent            | Role                                      |
| ---------------- | ----------------------------------------- |
| Planner          | Parse requirements, explore code, plan    |
| Developer        | Write code, fix issues, commit            |
| Tester           | Write tests, run tests, verify            |
| Reviewer         | Review plans and code                     |
| Investigator     | Reproduce bugs, find root causes          |
| Context Engineer | Optimize context, analyze documentation   |
| Architect        | Design system architecture, review builds |

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

- [Navigator MCP Server](../../packages/agent-flow-navigator-mcp/README.md) - Workflow state machine
- [Workflow Catalog](../../packages/agent-flow-navigator-mcp/catalog/workflows/) - Built-in workflow definitions
