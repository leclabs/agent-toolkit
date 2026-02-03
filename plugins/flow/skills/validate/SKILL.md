---
description: Static structural validation of workflow definitions. Checks schema, topology, gate/retry logic, instruction coverage, and agent assignments.
---

# /flow:validate

Validate workflow definitions statically without executing them. Reads the workflow JSON directly and performs structural, topological, and semantic checks.

## Usage

```
/flow:validate [workflowId]    # Validate one workflow
/flow:validate --all           # Validate all loaded workflows
```

**Arguments:**

- `workflowId` (optional): Specific workflow to validate
- `--all` (optional): Validate every workflow returned by `Navigator.ListWorkflows`

If neither argument is provided, show a selection dialog using `Navigator.SelectWorkflow`.

## What To Do

### 1. Locate Workflow JSON

**Single workflow:**

Call `Navigator.ListWorkflows` to get the workflow list. Find the matching workflow and read its JSON file directly:

- Project workflows: `.flow/workflows/<workflowId>.json`
- Catalog workflows: locate via the MCP server's catalog directory

Read the raw JSON file using the Read tool.

**`--all` mode:**

Call `Navigator.ListWorkflows` with `source: "all"` to get every workflow, then validate each one.

### 2. Run Validation Checks

For each workflow, perform these checks. Track results as `{severity, category, check, details}` where severity is `error`, `warn`, or `info`.

#### Schema Checks

| Check                                     | Severity | Details                                                                                |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| Has `id` field                            | error    | Workflow must have an id                                                               |
| Has `name` field                          | error    | Workflow must have a name                                                              |
| Has `nodes` object                        | error    | Workflow must have a nodes object                                                      |
| Has `edges` array                         | error    | Workflow must have an edges array                                                      |
| All nodes have `type`                     | error    | Every node must have a type field                                                      |
| Node types are valid                      | error    | Valid types: `start`, `end`, `task`, `gate`, `fork`, `join`. Flag any others           |
| All edges have `from` and `to`            | error    | Every edge must reference source and target                                            |
| Edge `from`/`to` reference existing nodes | error    | No dangling references                                                                 |
| Edge `on` values are valid                | warn     | Expected: `"passed"`, `"failed"`, or absent. Flag others                               |
| End nodes have `result` field             | warn     | End nodes should have a `result` field (`"success"` or `"blocked"`)                    |
| End node `result` values are valid        | warn     | Expected: `"success"` or `"blocked"`. Flag others                                      |
| HITL end nodes have `escalation` field    | warn     | End nodes with `result: "blocked"` should have `escalation: "hitl"` to enable recovery |

#### Topology Checks

| Check                                   | Severity | Details                                                                                              |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Exactly 1 start node                    | error    | Must have exactly one node with `type: "start"`                                                      |
| At least 1 end node                     | error    | Must have at least one node with `type: "end"`                                                       |
| At least 1 success end                  | warn     | Should have at least one end with `result: "success"`                                                |
| No orphan nodes                         | warn     | All nodes should be referenced by at least one edge (as `from` or `to`), except start                |
| All nodes reachable from start          | error    | BFS/DFS from start node, following edges. All non-start nodes must be reachable                      |
| All non-terminal nodes can reach an end | warn     | BFS/DFS backward from end nodes. All task/gate nodes should have a path to some end                  |
| No dead-end non-terminals               | error    | Non-end nodes with no outgoing edges                                                                 |
| HITL end without recovery edge          | warn     | End node has `escalation: "hitl"` but no `on: "passed"` outgoing edge (no recovery path)             |
| Non-HITL end with outgoing edges        | warn     | End node without `escalation: "hitl"` has outgoing edges                                             |
| HITL recovery targets end node          | warn     | HITL end's `on: "passed"` recovery edge points to another end node instead of back into the workflow |

**BFS reachability algorithm (forward):**

```
queue = [startNodeId]
visited = new Set()
while queue not empty:
  node = queue.shift()
  visited.add(node)
  for each edge where from === node:
    if edge.to not in visited:
      queue.push(edge.to)
unreachable = allNodeIds - visited
```

**BFS reachability algorithm (backward to verify end-reachability):**

```
queue = [all end node IDs]
canReachEnd = new Set()
while queue not empty:
  node = queue.shift()
  canReachEnd.add(node)
  for each edge where to === node:
    if edge.from not in canReachEnd:
      queue.push(edge.from)
stuckNodes = nonTerminalNodeIds - canReachEnd
```

#### Gate/Retry Checks

For each node with `type: "gate"` or `maxRetries > 0`:

| Check                                                | Severity | Details                                                                         |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| Has `"passed"` edge                                  | error    | Gate nodes must have at least one edge with `on: "passed"`                      |
| Has `"failed"` edge for retry                        | warn     | Gates with `maxRetries` should have a failed edge to non-end node (retry path)  |
| Has `"failed"` edge for escalation                   | warn     | Gates with `maxRetries` should have a failed edge to end node (escalation path) |
| `maxRetries` is a positive integer                   | warn     | Should be >= 1 if present                                                       |
| Gate without `maxRetries` but with dual failed edges | info     | Has retry infrastructure but no retry limit set                                 |
| Non-gate with `maxRetries`                           | info     | Task node with `maxRetries` acts as implicit gate                               |

#### Fork/Join Checks

For each node with `type: "fork"` or `type: "join"`:

| Check                                            | Severity | Details                                                                                                |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| Fork node has `branches` object                  | error    | Fork nodes must have a `branches` object defining parallel tracks                                      |
| Fork node has `join` reference                   | error    | Fork nodes must reference their corresponding join node via `join` field                               |
| Fork `join` references an existing join node     | error    | The `join` field must point to an existing node with `type: "join"`                                    |
| Each branch has `entryStep`                      | error    | Every branch in `branches` must have an `entryStep` field                                              |
| Each branch `entryStep` references existing node | error    | The `entryStep` must reference an existing node in the workflow                                        |
| Join node has `fork` back-reference              | warn     | Join nodes should reference their corresponding fork node via `fork` field                             |
| Join node has `strategy` field                   | info     | Join nodes should declare a `strategy` (e.g., `"all-pass"`). Engine defaults to `"all-pass"` if absent |

#### Instruction Coverage

For each non-terminal node, classify its instruction source:

| Classification      | Meaning                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `custom`            | Node has an explicit `instructions` field                                                                       |
| `keyword:<pattern>` | Node ID or name matches a baseline keyword pattern (review, analyze, plan, implement, test, lint, commit, etc.) |
| `default`           | Falls through to the baseline default instruction                                                               |

Report which nodes get which classification.

#### Agent Coverage

For each non-terminal node:

| Check                | Severity | Details                                          |
| -------------------- | -------- | ------------------------------------------------ |
| Node without `agent` | info     | Step will run as direct (no subagent delegation) |

List all unique agents referenced across the workflow.

#### Consumer Hygiene

For each non-end node:

| Check                      | Severity | Detection                                                                                                                                                            | Details                                                                                                                       |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Skill not in context_files | error    | `description` or `instructions` contains a skill-style reference (`/@ns:name` or `/ns:name`) but no `context_files` entry contains that skill name as a path segment | "Skill '{name}' referenced in description/instructions but not in context_files. Subagent won't have the skill file to read." |
| Double `@@` agent prefix   | warn     | Node `agent` field starts with `@@`                                                                                                                                  | "Agent '{agent}' has double `@@` prefix — likely a typo."                                                                     |
| Built-in agent type        | warn     | Node `agent` field matches a built-in Claude Code agent type                                                                                                         | "Agent '{agent}' is a built-in Claude Code agent that doesn't follow the subagent response protocol. Use a catalog agent."    |

**Detection details:**

**skill-not-in-context:** Scan both `description` and `instructions` fields for patterns matching `/@?[\w-]+:[\w-]+` (with or without leading `/`). Extract the skill name (the part after `:`). Check if any `context_files` entry contains that skill name as a directory segment (e.g., `./skills/catalog-app-add/SKILL.md` matches `catalog-app-add`). Skip end nodes — skill refs in end nodes are user-facing HITL guidance, not subagent instructions.

**double-at-agent:** Check if `agent` field starts with `@@`. Simple string match. Applies to all node types that have an agent field.

**built-in-agent-type:** Check if `agent` field matches one of the built-in Claude Code agent types: `Explore`, `Plan`, `Bash`, `general-purpose`, `claude-code-guide`, `statusline-setup`. These agents don't follow the subagent response protocol (they can't write to `.cruft/` or return the expected JSON format). Use catalog agents (`Developer`, `Reviewer`, `Planner`, `Tester`, `Investigator`, `Architect`, `Context Engineer`) instead.

### 3. Generate Gate/Retry Analysis

For each gate node, produce a retry trace:

```markdown
### <stepId> (maxRetries: <N>)

| Failure # | Action   | Target             | Remaining |
| --------- | -------- | ------------------ | --------- |
| 1         | retry    | <retryTarget>      | <N-1>     |
| 2         | retry    | <retryTarget>      | <N-2>     |
| ...       |          |                    |           |
| N+1       | escalate | <escalationTarget> | 0         |
```

### 4. Write Report

Write markdown report to `.cruft/validate/<workflowId>/report.md`:

```markdown
# Validation Report: <workflowId>

**Name:** <workflow name>
**Nodes:** <count> | **Edges:** <count>
**Date:** <timestamp>

## Results

| Severity | Category | Check           | Details                               |
| -------- | -------- | --------------- | ------------------------------------- |
| error    | schema   | Missing `nodes` | Workflow has no nodes object          |
| warn     | topology | Orphan node     | Node `foo` not referenced by any edge |
| info     | agents   | No agent        | Node `commit` has no agent assigned   |

## Summary

| Severity | Count |
| -------- | ----- |
| error    | 0     |
| warn     | 2     |
| info     | 3     |

**Status:** PASS (0 errors) / FAIL (<N> errors)

## Gate/Retry Analysis

### plan_review (maxRetries: 2)

| Failure # | Action   | Target           | Remaining |
| --------- | -------- | ---------------- | --------- |
| 1         | retry    | create_plan      | 1         |
| 2         | retry    | create_plan      | 0         |
| 3         | escalate | hitl_plan_failed | -         |

Passed edge: → implement

### run_tests (maxRetries: 3)

...

## Instruction Coverage

| Step               | Classification    | Pattern/Source                     |
| ------------------ | ----------------- | ---------------------------------- |
| parse_requirements | keyword:analyze   | ID matches "parse", "requirements" |
| create_plan        | keyword:plan      | ID matches "plan"                  |
| implement          | keyword:implement | ID matches "implement"             |
| commit             | keyword:commit    | ID matches "commit"                |
| plan_review        | keyword:review    | ID matches "review"                |

## Agents

| Agent     | Steps                                             |
| --------- | ------------------------------------------------- |
| Planner   | parse_requirements, explore_codebase, create_plan |
| Developer | implement, lint_format, commit, create_pr         |
| Reviewer  | plan_review, code_review                          |
| Tester    | write_tests, run_tests                            |
| (direct)  | <any steps without agent>                         |

## Consumer Hygiene

| Step             | Check           | Severity | Details                                               |
| ---------------- | --------------- | -------- | ----------------------------------------------------- |
| validate_catalog | double-at-agent | warn     | Agent '@@fusion-studio:reviewer' has double @@ prefix |
```

If no consumer hygiene issues found, the section should instead show:

```markdown
## Consumer Hygiene

No issues found.
```

### 5. Display Results

Show a compact summary in the terminal:

```
Validated: <workflowId>
Nodes: <count> | Edges: <count>
Errors: <count> | Warnings: <count> | Info: <count>
Status: PASS / FAIL

Report: .cruft/validate/<workflowId>/report.md
```

### 6. `--all` Mode

When validating all workflows, run each workflow through the same process, then show a combined summary:

```markdown
## Combined Validation Summary

| Workflow            | Nodes | Edges | Errors | Warnings | Info | Status |
| ------------------- | ----- | ----- | ------ | -------- | ---- | ------ |
| feature-development | 14    | 18    | 0      | 2        | 3    | PASS   |
| bug-fix             | 8     | 12    | 0      | 1        | 2    | PASS   |
| quick-task          | 5     | 8     | 0      | 0        | 1    | PASS   |

Overall: <total errors> errors across <count> workflows
```

Individual reports are written to `.cruft/validate/<workflowId>/report.md` for each.

## Edge Cases

**Workflow not found:**

```
Workflow '<workflowId>' not found.

Run /flow:list to see available workflows.
```

**Cannot read JSON file:**

```
Could not read workflow file for '<workflowId>'.
Verify the workflow is loaded: /flow:list
```

**No workflows loaded (`--all` mode):**

```
No workflows loaded. Run /flow:setup to set up workflows.
```
