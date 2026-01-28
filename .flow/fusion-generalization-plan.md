# Fusion Generalization Plan

Generalize the navigator engine to support the full range of workflow patterns already present in the catalog, including domain-specific stages, open-ended node metadata, and namespaced agent IDs.

## Problem Statement

The catalog already contains 10 workflows that use features the JSON schema blocks. The engine works fine at runtime (it ignores schema), but strict schema validation would reject 7 of 10 catalog workflows. The schema and engine need to catch up with the patterns the workflows already use.

## Gap Analysis

### Gap 1: Stage enum is too restrictive

**Schema declares:** `["planning", "development", "verification", "delivery"]`

**Catalog actually uses 11 distinct values:**

| Stage Value              | Used By                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `planning`               | feature-development, refactor, quick-task, agile-task                                                                |
| `development`            | feature-development, refactor, build-review-\*, bug-fix, quick-task, agile-task, test-coverage                       |
| `verification`           | feature-development, refactor, build-review-\*, bug-fix, quick-task, agile-task, test-coverage, context-optimization |
| `delivery`               | feature-development, refactor, build-review-\*, bug-fix, quick-task, agile-task, test-coverage                       |
| `analysis`               | refactor, test-coverage, context-optimization                                                                        |
| `investigation`          | bug-fix                                                                                                              |
| `design`                 | context-optimization                                                                                                 |
| `implementation`         | context-optimization                                                                                                 |
| `semantic-ir-extraction` | ui-reconstruction                                                                                                    |
| `ui-build-from-ir`       | ui-reconstruction                                                                                                    |
| `unbiased-review`        | ui-reconstruction                                                                                                    |

**Impact:** Schema validation (if enforced via JSON Schema tooling or IDE) rejects 7 of 10 workflows.

### Gap 2: Node `metadata` field not allowed

**Schema:** All node types use `additionalProperties: false`, blocking any field not explicitly listed.

**Fusion pattern need:** Workflows that fuse stages (like the build-review variants) or carry domain-specific annotations need a `metadata` object on nodes. This would allow workflow authors to attach arbitrary key-value data (e.g., `phase`, `fusionTarget`, `qualityBar`) without schema changes for each new field.

**Impact:** Cannot extend nodes without schema changes. Every new field requires a schema update.

### Gap 3: Edge `condition` field not allowed

**Schema edge definition:** Only allows `from`, `to`, `on`, `label` with `additionalProperties: false`.

**Fusion pattern need:** Conditional edges that express richer routing logic (e.g., `"condition": "retryCount < 3"` or `"condition": "confidence >= 80"`) would allow workflow authors to express edge semantics beyond the simple `on` string match.

**Impact:** Cannot express conditional routing beyond string-match on `on` field. All condition evaluation is hardcoded in the engine's retry logic.

### Gap 4: `toSubagentRef()` does not handle namespaced agent IDs

**Current behavior:** `toSubagentRef("developer")` returns `"@flow:developer"`. Already-prefixed IDs like `"@flow:developer"` pass through unchanged.

**Missing:** Namespaced agent IDs like `"myorg:developer"` or `"external:reviewer"` would be incorrectly prefixed to `"@flow:myorg:developer"` instead of `"@myorg:developer"`.

**Impact:** Cannot use multi-namespace agent registries. Low severity today (only `@flow:` namespace exists), but blocks future multi-provider agent setups.

---

## Implementation Plan

### Priority 1: Remove stage enum restriction (schema-only change)

**File:** `packages/agent-flow-navigator-mcp/schema/workflow.schema.json`

**Change:** Replace the `stage` enum with an unrestricted string in all three node types that use it (`taskNode`, `gateNode`).

```
BEFORE:
"stage": {
  "type": "string",
  "enum": ["planning", "development", "verification", "delivery"]
}

AFTER:
"stage": {
  "type": "string",
  "description": "Workflow phase this task belongs to (e.g. planning, development, verification, delivery, analysis, investigation, design)"
}
```

**Scope:** 3 occurrences in the schema file (taskNode, gateNode lines 83-87 and 117-120). No engine changes needed -- the engine already treats `stage` as an opaque string.

**Risk:** None. The engine does `stepDef.stage || null` and never validates stage values. This is purely a schema documentation change.

**Tests:** Existing tests pass unchanged. No new tests needed.

### Priority 2: Allow `metadata` on all node types (schema change)

**File:** `packages/agent-flow-navigator-mcp/schema/workflow.schema.json`

**Change:** Add an optional `metadata` property to each node type definition (`startNode`, `endNode`, `taskNode`, `gateNode`, `subflowNode`).

```json
"metadata": {
  "type": "object",
  "additionalProperties": true,
  "description": "Arbitrary key-value data for workflow tooling and extensions"
}
```

Add this property to each of the 5 node type definitions. Keep `additionalProperties: false` on the node types themselves -- we are adding a known property, not opening the floodgates.

**Scope:** 5 additions to `workflow.schema.json` (one per node type).

**Engine impact:** None. The engine never reads `metadata` from node definitions. It only writes `metadata` to the navigate response (containing `workflowType`, `currentStep`, `retryCount`). These are separate concepts: node-level metadata (static, authored) vs. runtime metadata (dynamic, engine-managed).

**Risk:** Low. Node `metadata` is purely pass-through for tooling.

**Tests:** Add 1 test verifying that a workflow with node metadata loads and navigates correctly.

### Priority 3: Allow `condition` on edges (schema change)

**File:** `packages/agent-flow-navigator-mcp/schema/workflow.schema.json`

**Change:** Add an optional `condition` property to the edge definition.

```json
"condition": {
  "type": "string",
  "description": "Expression evaluated to determine if this edge should be taken (future use, currently informational)"
}
```

**Scope:** 1 addition to the `edge` definition in `workflow.schema.json`.

**Engine impact:** None for now. The edge `condition` field is informational/future-use. The engine's `evaluateEdge()` reads `{ from, to, on, label }` via destructuring (line 219) and would simply ignore `condition`. Future work could add a condition evaluator.

**Risk:** None. This is additive and ignored by the engine. It serves as documentation for workflow authors and prepares the schema for future conditional routing.

**Tests:** Add 1 test verifying that edges with `condition` fields don't break navigation.

### Priority 4: Handle namespaced agent IDs in `toSubagentRef()` (engine change)

**File:** `packages/agent-flow-navigator-mcp/engine.js`

**Change:** Update `toSubagentRef()` to handle colon-namespaced IDs.

```
BEFORE:
export function toSubagentRef(agentId) {
  if (!agentId) return null;
  if (agentId.startsWith("@")) return agentId;
  return `@flow:${agentId}`;
}

AFTER:
export function toSubagentRef(agentId) {
  if (!agentId) return null;
  if (agentId.startsWith("@")) return agentId;
  // Namespaced: "org:developer" -> "@org:developer"
  if (agentId.includes(":")) return `@${agentId}`;
  // Simple: "developer" -> "@flow:developer"
  return `@flow:${agentId}`;
}
```

**Scope:** 1 function change in `engine.js`.

**Risk:** Low. The only agent names used today are simple strings like `"Developer"`, `"Planner"`, `"Tester"`, `"Reviewer"`, `"Investigator"`, `"Context Engineer"`. None contain colons, so existing behavior is unchanged. The new code path only activates for future namespaced agent IDs.

**Tests:** Add tests to `engine.test.js`:

- `toSubagentRef("myorg:developer")` returns `"@myorg:developer"`
- `toSubagentRef("Developer")` still returns `"@flow:Developer"` (regression)
- `toSubagentRef("@custom:agent")` still returns `"@custom:agent"` (pass-through)

---

## Files to Modify

| #   | File                                                            | Change Type                                                                     | Priority |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| 1   | `packages/agent-flow-navigator-mcp/schema/workflow.schema.json` | Remove stage enum (P1), add metadata to nodes (P2), add condition to edges (P3) | P1-P3    |
| 2   | `packages/agent-flow-navigator-mcp/engine.js`                   | Update `toSubagentRef()` for namespaced IDs                                     | P4       |
| 3   | `packages/agent-flow-navigator-mcp/engine.test.js`              | Add tests for namespaced agent refs, node metadata, edge conditions             | P2-P4    |

## New Files

None.

## Testing Approach

1. **Existing test suite** -- All 100+ existing tests must pass unchanged (regression).
2. **Schema validation** -- Validate all 10 catalog workflow JSONs against the updated schema. This can be done via `ajv` or manual inspection. All 10 should pass after the schema changes.
3. **New unit tests** -- 3-5 new tests in `engine.test.js` covering namespaced refs and workflows with metadata/condition fields.
4. **Integration** -- Run the full test suite: `node --test packages/agent-flow-navigator-mcp/*.test.js`

## What This Does NOT Cover

- **Condition evaluation in the engine** -- The `condition` field on edges is schema-only (informational). Building an expression evaluator for conditions is a separate, future task.
- **Node metadata consumption** -- No engine code reads node metadata. If tooling needs to use it (e.g., diagram.js displaying metadata), that is a separate task.
- **Workflow-level metadata** -- The top-level workflow object also has `additionalProperties: false`. If workflow-level metadata is needed, that is a separate schema change.
- **Schema enforcement at runtime** -- The engine and store do not perform JSON Schema validation. The `validateWorkflow()` function in `store.js` only checks for `nodes` and `edges` presence. Adding runtime schema validation is out of scope.

## Complexity

**Small.** Total changes: ~20 lines of schema additions, ~3 lines of engine logic, ~30 lines of new tests. No architectural changes. No breaking changes.
