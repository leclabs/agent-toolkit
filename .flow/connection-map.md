# Agent Toolkit Connection Map

Complete component hierarchy and connection points for documentation optimization.

## 1. Component Hierarchy

```
agent-toolkit (marketplace)
├── plugins/
│   └── flow/ (plugin)
│       ├── .claude-plugin/plugin.json    — plugin manifest
│       ├── .mcp.json                     — configures navigator MCP
│       ├── rules/                        — shared agent rules
│       │   ├── model-first.md
│       │   ├── code-quality.md
│       │   ├── subagent-response-protocol.md
│       │   └── ephemeral-artifacts.md
│       ├── agents/                       — subagent definitions
│       │   ├── planner.md
│       │   ├── developer.md
│       │   ├── tester.md
│       │   ├── reviewer.md
│       │   ├── investigator.md
│       │   ├── context-engineer.md
│       │   └── architect.md
│       ├── skills/                       — orchestrator skill files
│       │   ├── prime/SKILL.md
│       │   ├── run/SKILL.md
│       │   ├── task-create/SKILL.md
│       │   ├── task-list/SKILL.md
│       │   ├── task-get/SKILL.md
│       │   ├── task-advance/SKILL.md
│       │   ├── init/SKILL.md
│       │   ├── load/SKILL.md
│       │   ├── list/SKILL.md
│       │   ├── diagram/SKILL.md
│       │   └── analyze/SKILL.md
│       └── commands/                     — prefix shortcut commands
│           ├── feat.md       → feature-development
│           ├── bug.md        → bug-fix
│           ├── quick.md      → quick-task
│           ├── task.md       → agile-task
│           ├── spec.md       → test-coverage
│           ├── ctx.md        → context-optimization
│           ├── ui.md         → ui-reconstruction
│           ├── go.md         → batch execute all pending
│           └── recon.md      → project exploration
│
├── packages/
│   └── agent-flow-navigator-mcp/ (npm: @leclabs/agent-flow-navigator-mcp)
│       ├── index.js          — MCP server entry (6 tools)
│       ├── engine.js         — workflow navigation engine
│       ├── store.js          — workflow definition store
│       ├── diagram.js        — mermaid diagram generator
│       ├── dialog.js         — workflow selection dialog builder
│       ├── copier.js         — catalog-to-project copier
│       ├── catalog.js        — catalog summary builder
│       └── catalog/workflows/ — 10 workflow JSON definitions
│
└── .flow/ (generated per-project)
    ├── README.md
    ├── diagrams/             — rendered mermaid diagrams
    └── workflows/            — customized workflow copies (optional)
```

## 2. MCP Server Tools (Navigator)

6 tools exposed by the Navigator MCP server:

| Tool             | Purpose                                     | Called By                                        | Returns                                |
| ---------------- | ------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `Navigate`       | Start workflow, get state, or advance step  | Skills: run, task-create, task-advance, task-get | Step state, metadata, instructions     |
| `ListWorkflows`  | List available workflows with source filter | Skills: list, load                               | Workflow summaries                     |
| `SelectWorkflow` | Build selection dialog for user             | Skills: diagram, init (indirect)                 | Dialog array for AskUserQuestion       |
| `Diagram`        | Generate mermaid flowchart                  | Skills: diagram, task-get                        | Saves to .flow/diagrams/, returns path |
| `CopyWorkflows`  | Copy catalog workflows to project           | Skills: init                                     | Copied IDs, path                       |
| `ListCatalog`    | List catalog workflows                      | Skills: init                                     | Workflow summaries with options        |

### Navigate Tool Data Flow

```
Start:    Navigate(workflowType, description) → initial state + metadata
Current:  Navigate(taskFilePath)              → current step state
Advance:  Navigate(taskFilePath, result)      → next step state + metadata
```

## 3. Skills (User-Facing Commands)

11 skills in `plugins/flow/skills/`:

| Skill                | MCP Tools Used                   | Subagents Involved | Purpose                         |
| -------------------- | -------------------------------- | ------------------ | ------------------------------- |
| `/flow:prime`        | None (loads context)             | None               | Initialize orchestrator context |
| `/flow:run`          | Navigate                         | All (per step)     | Autonomous task execution loop  |
| `/flow:task-create`  | Navigate                         | None               | Create task with workflow state |
| `/flow:task-list`    | Navigate (per task for subagent) | None               | List all flow tasks             |
| `/flow:task-get`     | Navigate, Diagram                | None               | Show task detail with diagram   |
| `/flow:task-advance` | Navigate                         | None               | Manually advance one step       |
| `/flow:init`         | ListCatalog, CopyWorkflows       | None               | Copy workflows to project       |
| `/flow:load`         | ListWorkflows                    | None               | Reload project workflows        |
| `/flow:list`         | ListWorkflows                    | None               | Show loaded workflows           |
| `/flow:diagram`      | SelectWorkflow, Diagram          | None               | Generate workflow diagram       |
| `/flow:analyze`      | ListWorkflows (indirect)         | Explore            | Discover project workflows      |

## 4. Commands (Prefix Shortcuts)

9 command files that delegate to `/flow:task-create`:

| Command       | Maps To                                               | Workflow             |
| ------------- | ----------------------------------------------------- | -------------------- |
| `/flow:feat`  | `/flow:task-create "$ARGUMENTS" feature-development`  | feature-development  |
| `/flow:bug`   | `/flow:task-create "$ARGUMENTS" bug-fix`              | bug-fix              |
| `/flow:quick` | `/flow:task-create "$ARGUMENTS" quick-task`           | quick-task           |
| `/flow:task`  | `/flow:task-create "$ARGUMENTS"`                      | _AskUserQuestion_    |
| `/flow:spec`  | `/flow:task-create "$ARGUMENTS" test-coverage`        | test-coverage        |
| `/flow:ctx`   | `/flow:task-create "$ARGUMENTS" context-optimization` | context-optimization |
| `/flow:ui`    | `/flow:task-create "$ARGUMENTS" ui-reconstruction`    | ui-reconstruction    |
| `/flow:go`    | Batch execute all pending tasks                       | (any)                |
| `/flow:recon` | Project exploration (standalone)                      | (none)               |

## 5. Agents (Subagent Definitions)

7 agents defined in `plugins/flow/agents/`:

| Agent            | File                | Workflows Using It                                                                 |
| ---------------- | ------------------- | ---------------------------------------------------------------------------------- |
| Planner          | planner.md          | feature-dev, agile-task, test-coverage, ui-reconstruction                          |
| Developer        | developer.md        | feature-dev, bug-fix, agile-task, quick-task, test-coverage, ui-recon, context-opt |
| Tester           | tester.md           | feature-dev, bug-fix, agile-task, test-coverage, context-opt                       |
| Reviewer         | reviewer.md         | feature-dev, agile-task, test-coverage, ui-recon, context-opt                      |
| Investigator     | investigator.md     | bug-fix                                                                            |
| Context Engineer | context-engineer.md | context-optimization                                                               |
| Architect        | architect.md        | (not referenced in any current catalog workflow)                                   |

### Agent-to-Step Mapping (across all workflows)

```
@flow:Planner          → parse_requirements, explore_codebase, create_plan, analyze,
                          identify_gaps, ir_component_tree, ir_feature_boundary,
                          ir_interactivity, ir_business_object, ir_annotate, ir_ascii
@flow:Developer        → implement, write_fix, commit, create_pr, lint_format, execute,
                          understand, uiRebuild_build
@flow:Tester           → write_tests, run_tests, add_regression_test, verify_fix,
                          verify, analyze_coverage
@flow:Reviewer         → plan_review, code_review, review, ir_review, uiRebuild_review,
                          final_review, review_design
@flow:Investigator     → reproduce, investigate
@flow:Context Engineer → map_connections, identify_pathologies, design_improvements
@flow:Architect        → (no current workflow assignments)
```

## 6. Workflows in Catalog

10 workflow JSON definitions in `packages/agent-flow-navigator-mcp/catalog/workflows/`:

| Workflow                  | Stages                                                                 | Steps | Has Diagram |
| ------------------------- | ---------------------------------------------------------------------- | ----- | ----------- |
| feature-development       | planning → development → verification → delivery                       | 11    | YES         |
| bug-fix                   | investigation → development → verification → delivery                  | 7     | YES         |
| agile-task                | planning → development → verification → delivery                       | 6     | YES         |
| quick-task                | planning → development → verification → delivery                       | 5     | YES         |
| test-coverage             | analysis → development → verification → delivery                       | 7     | YES         |
| context-optimization      | analysis → design → implementation → verification                      | 6     | YES         |
| ui-reconstruction         | semantic-ir-extraction → ui-build-from-ir → unbiased-review → delivery | 13    | YES         |
| refactor                  | (unknown steps)                                                        | ?     | NO          |
| build-review-murder-board | (unknown steps)                                                        | ?     | NO          |
| build-review-quick        | (unknown steps)                                                        | ?     | NO          |

## 7. Diagram Coverage

### Diagrams that exist in `.flow/diagrams/`:

- feature-development.md
- bug-fix.md
- agile-task.md
- quick-task.md
- test-coverage.md
- context-optimization.md
- ui-reconstruction.md

### Workflows WITHOUT diagrams:

- **refactor** - no diagram in .flow/diagrams/
- **build-review-murder-board** - no diagram in .flow/diagrams/
- **build-review-quick** - no diagram in .flow/diagrams/

## 8. Documentation Cross-Reference

### README files and what they document:

| File                                          | Documents                | References To                                     | Missing References                                                                         |
| --------------------------------------------- | ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `README.md` (root)                            | Marketplace overview     | Skills (8/11), workflows (7/10), subagents (3/7)  | analyze skill, recon/go commands, architect agent, refactor/build-review workflows         |
| `plugins/flow/README.md`                      | Flow plugin details      | Skills (10/11), workflows (5/10), subagents (4/7) | analyze skill, architect/context-engineer agents, refactor/build-review/ui-recon workflows |
| `packages/agent-flow-navigator-mcp/README.md` | Navigator MCP API        | Tools (6/6), schema complete                      | No workflow-specific details                                                               |
| `.flow/README.md`                             | Generated project readme | Commands, workflows (5), basic usage              | Newer workflows, diagram references                                                        |

### Key documentation gaps:

1. **Root README** lists 7 workflows but catalog has 10 (missing: refactor, build-review-murder-board, build-review-quick)
2. **Root README** lists 8 skills but there are 11 (missing: /flow:analyze, /flow:list, /flow:load)
3. **Flow README** lists 5 workflows but catalog has 10 (missing: refactor, build-review-\*, ui-reconstruction, test-coverage)
4. **No README** documents the `commands/` shortcut system comprehensively
5. **Architect agent** exists but is not assigned to any workflow step
6. **.flow/README.md** is a generated template, not reflecting current project state
7. **3 catalog workflows** (refactor, build-review-murder-board, build-review-quick) have no rendered diagrams

## 9. Connection Flow Summary

```
User Input
    │
    ├─ Prefix ("feat: ...") ──→ /flow:prime recognizes ──→ /flow:task-create
    ├─ Command ("/flow:feat") ──→ commands/feat.md ──→ /flow:task-create
    └─ Direct ("/flow:task-create") ──→ skill
            │
            ▼
    /flow:task-create
    ├─ Calls Navigator.Navigate(workflowType, description)
    ├─ Creates Claude Code Task with metadata
    └─ Optionally invokes /flow:run (--run flag)
            │
            ▼
    /flow:run (execution loop)
    ├─ Calls Navigator.Navigate(taskFilePath) → get current step
    ├─ Reads step.subagent → delegates to @flow:{Agent}
    ├─ Agent executes step → returns success/failure
    ├─ Calls Navigator.Navigate(taskFilePath, result) → advance
    ├─ Updates Task metadata
    └─ Loops until terminal (success/hitl)
            │
            ▼
    Terminal States
    ├─ end_success → Task completed
    └─ hitl_* → Human-in-the-loop escalation
```

## 10. Shared Context Dependencies

Rules loaded by `/flow:prime` SKILL.md via dynamic includes:

```
${CLAUDE_PLUGIN_ROOT}/rules/model-first.md
${CLAUDE_PLUGIN_ROOT}/rules/code-quality.md
${CLAUDE_PLUGIN_ROOT}/rules/subagent-response-protocol.md
${CLAUDE_PLUGIN_ROOT}/rules/ephemeral-artifacts.md
```

These rules are injected into the orchestrator's context at session start and affect all subsequent workflow execution behavior.
