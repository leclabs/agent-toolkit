---
description: Deep inspection of a single workflow step. Shows node definition, edges, retry analysis, instruction source, and contextual diagram.
---

# /flow:inspect

Deep-inspect a single step within a workflow. Shows the node definition, incoming/outgoing edges, retry/escalation behavior, instruction source, and a contextual diagram with the step highlighted.

## Usage

```
/flow:inspect <workflowId> <stepId>
```

**Arguments:**

- `workflowId` (required): The workflow containing the step
- `stepId` (required): The step to inspect

## What To Do

### 1. Parse Arguments

Extract `workflowId` and `stepId`. Both are required.

If missing:

```
Usage: /flow:inspect <workflowId> <stepId>

Run /flow:list to see available workflows.
Run /flow:diagram <workflowId> to see all steps.
```

### 2. Load Workflow JSON

Call `Navigator.ListWorkflows` to find the workflow, then read its JSON file directly:

- Project workflows: `.flow/workflows/<workflowId>.json`
- Catalog workflows: locate via the MCP server's catalog path

Read the raw JSON with the Read tool.

If workflow not found:

```
Workflow '<workflowId>' not found.

Run /flow:list to see available workflows.
```

### 3. Locate the Step

Find the node with key `stepId` in the workflow's `nodes` object.

If not found, list available steps:

```
Step '<stepId>' not found in workflow '<workflowId>'.

Available steps:
  start, parse_requirements, explore_codebase, create_plan, plan_review,
  implement, write_tests, run_tests, code_review, lint_format, commit,
  create_pr, end_success, hitl_plan_failed, hitl_impl_failed
```

### 4. Display Node Definition

Show the full JSON of the node:

```markdown
## Node Definition

```json
{
  "type": "gate",
  "name": "Review Plan",
  "description": "Verify plan is complete and feasible",
  "agent": "Reviewer",
  "stage": "planning",
  "maxRetries": 2,
  "config": {
    "scrutinyLevel": 2
  }
}
```
```

### 5. Display Identity Table

```markdown
## Identity

| Field | Value |
|-------|-------|
| Step ID | `plan_review` |
| Type | `gate` |
| Name | Review Plan |
| Stage | `planning` |
| Agent | `Reviewer` → `@flow:Reviewer` |
| Subagent Ref | `@flow:Reviewer` |
| maxRetries | 2 |
```

For nodes without `agent`, show `(direct)`. For nodes without `maxRetries`, show `0` or `-`.

### 6. Display Incoming Edges

Find all edges where `to === stepId`:

```markdown
## Incoming Edges

| From | Condition | Label |
|------|-----------|-------|
| `create_plan` | (unconditional) | - |
```

For start nodes, this table will be empty — note: "Start node: no incoming edges (expected)."

### 7. Display Outgoing Edges

Find all edges where `from === stepId`. Classify each edge:

- **advance**: `on: "passed"` or unconditional to a non-end node
- **retry**: `on: "failed"` to a non-end node (used when retries remain)
- **escalation**: `on: "failed"` to an end node (used when retries exhausted)

```markdown
## Outgoing Edges

| To | Condition | Label | Classification |
|----|-----------|-------|----------------|
| `create_plan` | `failed` | Revise plan based on feedback | retry |
| `hitl_plan_failed` | `failed` | Planning exhausted retries | escalation |
| `implement` | `passed` | Plan approved, begin implementation | advance |
```

For end nodes, this table will be empty — note: "End node: no outgoing edges (expected)."

### 8. Retry/Escalation Analysis

For nodes with `maxRetries > 0`, show what happens at each failure count:

```markdown
## Retry/Escalation Analysis

**Budget:** 2 retries before escalation

| Failure # | retryCount | Action | Target | Retries Remaining |
|-----------|------------|--------|--------|-------------------|
| 1 | 0 → 1 | retry | `create_plan` | 1 |
| 2 | 1 → 2 | retry | `create_plan` | 0 |
| 3 | 2 (exhausted) | escalate | `hitl_plan_failed` | - |

**On pass:** → `implement` (Plan approved, begin implementation)
```

For nodes without `maxRetries` or with `maxRetries: 0`, skip this section.

### 9. Instructions Analysis

Determine what guidance the step receives:

1. **Custom**: If the node has an explicit `instructions` field, show it
2. **Keyword match**: Check if the step ID or name matches a baseline keyword pattern. The patterns (in priority order):
   - `review` → review guidance
   - `analyze`, `analysis`, `parse`, `requirements` → analysis guidance
   - `plan`, `design` → planning guidance
   - `investigate`, `reproduce` → investigation guidance
   - `implement`, `build`, `develop`, `fix` → implementation guidance
   - `refactor` → refactoring guidance
   - `lint`, `format` → lint/format guidance
   - `test`, `verify`, `validate` → testing guidance
   - `document`, `readme` → documentation guidance
   - `commit` → commit guidance
   - `pr`, `pull_request`, `pull-request` → PR guidance
   - `context`, `optimize`, `compress` → context guidance
   - `extract`, `ir_` → extraction guidance
3. **Default**: Falls through to baseline default

```markdown
## Instructions

**Source:** keyword match (`review`)
**Matched on:** Step ID contains "review"

> Check for correctness, code quality, and adherence to project standards. Verify the implementation meets requirements.
```

Or for custom instructions:

```markdown
## Instructions

**Source:** custom (explicit `instructions` field)

> [The custom instruction text from the node]
```

### 10. Contextual Diagram

Call `Navigator.Diagram` with the step highlighted:

```json
{
  "workflowType": "<workflowId>",
  "currentStep": "<stepId>"
}
```

Display the resulting mermaid diagram with the inspected step highlighted in gold.

### 11. Subflow Reference (if applicable)

If the node references a subflow or another workflow (e.g., via a `workflow` or `subflow` field), show:

```markdown
## Subflow Reference

This step references workflow: `<referencedWorkflowId>`
Use `/flow:inspect <referencedWorkflowId> <entryStep>` to inspect the subflow.
Use `/flow:diagram <referencedWorkflowId>` to visualize it.
```

If no subflow reference, skip this section.

## Edge Cases

**Start node:** Will have no incoming edges and limited fields — this is expected. Note it.

**End node:** Will have no outgoing edges, no agent, no retry analysis — this is expected. Note it.

**Step not found:** List all available steps in the workflow to help the user find the right ID.
