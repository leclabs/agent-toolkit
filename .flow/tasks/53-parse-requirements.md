# Task #53: Parse Requirements - Navigator Context Metadata Surfacing

## Source

Feature request: `~/Desktop/feature-request-navigator-context-loading.md`

## Requirements

### R1: Workflow-level context metadata in SelectWorkflow response

The `SelectWorkflow` tool response must include a `context` object containing three arrays:
- `required_skills`: Skills the agent should have available (invocable) for this workflow
- `context_skills`: Skills whose SKILL.md content should be loaded as read-only reference
- `context_files`: Documentation files to load into the agent's working context

These values are read verbatim from the workflow definition's top-level fields (or metadata block). If a workflow does not declare a field, the corresponding array must be empty (`[]`), never `null` or absent.

### R2: Step-level context metadata in Navigate response

The `Navigate` tool response must include a `stepContext` object containing two arrays:
- `requiredSkills`: Skills the agent should invoke or have available for this specific step
- `contextSkills`: Skills whose SKILL.md content should be loaded as reference for this step

These values are read from the current step's node definition. If a step does not declare either field, the array must be empty (`[]`), never `null` or absent.

### R3: Navigator remains a data provider (pass-through only)

The navigator does NOT:
- Resolve namespace references (e.g., `fusion-studio:`) to file paths
- Load file contents
- Invoke skills
- Validate that declared skills/files exist

It passes declarations through verbatim from `workflow.json`.

### R4: Backward compatibility

New fields (`context` on SelectWorkflow, `stepContext` on Navigate) are purely additive. No existing fields are removed, renamed, or have their types changed.

### R5: No behavioral change to DAG traversal

The context metadata fields are read-only pass-through. They do not influence node selection, edge following, retry counting, or terminal detection.

## Acceptance Criteria

| AC | Summary | Verification |
|----|---------|-------------|
| AC-1 | SelectWorkflow returns workflow-level `context` with `required_skills`, `context_skills`, `context_files` | Call SelectWorkflow for a workflow with all three fields. Response includes all three arrays matching workflow.json. |
| AC-2 | SelectWorkflow returns empty arrays for absent fields | A workflow without `context_skills` returns `context.context_skills: []`. |
| AC-3 | Navigate returns step-level `stepContext` with `requiredSkills` and `contextSkills` | Navigate to a step that declares `requiredSkills`. Response includes `stepContext.requiredSkills` matching node. |
| AC-4 | Navigate returns step-level `contextSkills` when declared | Navigate to a step with `contextSkills`. Response includes matching `stepContext.contextSkills`. |
| AC-5 | Navigate returns empty arrays for steps without context metadata | Navigate to a step with neither field. Response includes both as `[]`. |
| AC-6 | Backward compatibility -- existing callers unaffected | Existing callers that destructure known fields continue to work. New fields are additive only. |
| AC-7 | No behavioral change to DAG traversal logic | Same Navigate sequence before/after change produces identical `currentStep`, `action`, and `terminal` values. |

## Non-Goals

- File resolution (navigator does not resolve `fusion-studio:` to paths)
- Content loading (navigator does not read files)
- Skill invocation (navigator does not invoke skills)
- Schema migration (workflow.json fields stay as-is)
- Validation of declarations (invalid references passed through as-is)

## Codebase Analysis

### Current State

The navigator MCP server (`packages/agent-flow-navigator-mcp/`) is a stateless workflow DAG engine. Key files:

| File | Purpose |
|------|---------|
| `index.js` | MCP server entry, tool definitions, request handlers |
| `engine.js` | `WorkflowEngine` class, `buildNavigateResponse()`, DAG traversal |
| `store.js` | `WorkflowStore` class, in-memory workflow storage |
| `dialog.js` | `buildWorkflowSelectionDialog()` for SelectWorkflow |
| `catalog.js` | Catalog listing helpers |
| `types.d.ts` | TypeScript type definitions |
| `schema/workflow.schema.json` | JSON Schema for workflow validation |

### Where context metadata is NOT returned today

**1. SelectWorkflow (`dialog.js` + `index.js:257-259`)**

The `SelectWorkflow` handler calls `store.listWorkflows()` which returns `{id, name, description, stepCount, source}` -- no context metadata. The `buildWorkflowSelectionDialog()` function receives these summaries and builds a dialog. Neither the store's `listWorkflows()` nor the dialog builder has access to context metadata.

**2. Navigate (`engine.js:197-248`)**

The `buildNavigateResponse()` function constructs the Navigate response from `stepDef` (the node object). It reads `stepDef.stage`, `stepDef.agent`, `stepDef.name`, `stepDef.description`, `stepDef.instructions`, `stepDef.maxRetries` -- but NOT `stepDef.requiredSkills` or `stepDef.contextSkills`. The returned object has no `stepContext` field.

### Where workflow-level context would be stored

The workflow JSON schema (`schema/workflow.schema.json`) currently has `additionalProperties: false` at the top level with only `id`, `name`, `description`, `nodes`, `edges`. To support workflow-level `required_skills`, `context_skills`, and `context_files`, the schema needs new top-level properties (or a top-level `metadata` object containing them).

The feature request specifies these as top-level `metadata` block fields. However, based on the schema, it would be cleaner to add them as either:
- A top-level `context` object with `required_skills`, `context_skills`, `context_files`
- Or direct top-level arrays: `required_skills`, `context_skills`, `context_files`

**Decision needed:** The spec says "workflow.json with `required_skills`, `context_skills`, and `context_files` in its `metadata` block." This suggests they live in a `metadata` object on the workflow definition. But the current top-level schema has no `metadata` property. We need to either add a top-level `metadata` property or add the fields directly.

Looking at the node-level pattern, nodes already have a `metadata` field (`"metadata": { "type": "object", "additionalProperties": true }`). Adding a similar `metadata` field at the workflow level is consistent.

### Where step-level context would be stored

Nodes already have a `metadata` field in the schema. The `requiredSkills` and `contextSkills` could live either:
- Directly on the node object (requires adding them to the schema's node definitions)
- Inside the node's `metadata` object (already allowed since `additionalProperties: true`)

The feature request treats them as direct node-level properties (`node.requiredSkills`), not nested in metadata. This is consistent with how the engine already reads `stepDef.instructions` (which is also not in the schema).

### Files That Need Changes

| File | Change |
|------|--------|
| `engine.js` | `buildNavigateResponse()`: Add `stepContext` field to response with `requiredSkills` and `contextSkills` from `stepDef` |
| `index.js` | `SelectWorkflow` handler: Extract workflow-level context from the full definition and include in response |
| `dialog.js` | `buildWorkflowSelectionDialog()`: Accept workflow definitions (not just summaries) OR have the caller inject context |
| `store.js` | `listWorkflows()`: Optionally include context metadata, OR add a method to get full definitions |
| `types.d.ts` | Add `requiredSkills?`, `contextSkills?` to TaskNode and GateNode interfaces. Add context fields to Workflow interface. |
| `schema/workflow.schema.json` | Add `metadata` (or `context`) at workflow level. Add `requiredSkills`, `contextSkills` to task/gate node definitions. |
| `engine.test.js` | Add tests for AC-3, AC-4, AC-5 (stepContext in Navigate response) |
| New test or existing test | Add tests for AC-1, AC-2 (context in SelectWorkflow response) |

### Design Approach

**For SelectWorkflow (workflow-level context):**

The `SelectWorkflow` handler in `index.js` currently calls `store.listWorkflows()` then `buildWorkflowSelectionDialog(workflows)`. The store's `listWorkflows()` returns summaries without context metadata. Two approaches:

1. **Option A:** Enrich `listWorkflows()` to include context metadata from the full definition.
2. **Option B:** In the `SelectWorkflow` handler, after getting the dialog, separately extract context from `store.getDefinition()` for each workflow and attach it.

Option A is cleaner since context metadata is a property of the workflow, not the dialog.

**For Navigate (step-level context):**

`buildNavigateResponse()` already has `stepDef`. Simply read `stepDef.requiredSkills || []` and `stepDef.contextSkills || []` and add them as a `stepContext` field on the response.

**For workflow-level context in Navigate:**

The spec does NOT ask for workflow-level context in Navigate responses -- only step-level context. The workflow-level context is only in SelectWorkflow. This is intentional: the calling agent loads workflow context once at start, then gets step context on each navigation.

## Complexity Assessment

**Small-Medium.** The changes are straightforward data pass-through with no logic changes. The main work is:
1. Adding ~5 lines to `buildNavigateResponse()` for `stepContext`
2. Adding context extraction to SelectWorkflow handler (~10 lines)
3. Schema updates (adding properties)
4. Type definition updates
5. Tests (majority of the work)

## Risks and Considerations

1. **Schema strictness:** The JSON schema has `additionalProperties: false` at workflow and node levels. If workflow JSON files already contain `required_skills`, `context_skills`, or `context_files` fields, they would fail schema validation IF the schema is enforced. However, `validateWorkflow()` in `store.js` only checks for `nodes` and `edges` -- it does not enforce the full JSON schema. So this is not a runtime blocker, but the schema should still be updated for correctness.

2. **Node-level fields:** Similarly, `additionalProperties: false` on taskNode/gateNode means `requiredSkills` and `contextSkills` are not in the schema. Same situation -- the runtime code reads raw parsed JSON, not schema-validated objects. Still, the schema should be updated.

3. **SelectWorkflow response structure:** The feature request shows `context` as a sibling of the existing dialog structure. Currently SelectWorkflow returns `{ schemaVersion, workflows, dialog }`. Adding `context` per-workflow requires deciding whether it goes on each workflow summary in the `workflows` array or as a separate top-level field. Since SelectWorkflow lists all workflows (not a single selection), the context should go on each workflow entry in the `workflows` array.

4. **No existing workflows use these fields yet.** The catalog workflows in this repo (`feature-development.json`, `bug-fix.json`, etc.) do not have `required_skills`, `context_skills`, `context_files`, `requiredSkills`, or `contextSkills`. The feature is for project workflows (like the `fusion-*` workflows referenced in the spec). Tests will need to create synthetic workflows with these fields.
