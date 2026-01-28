# Documentation Pathology Report

## Summary

4 docs analyzed. 27 specific pathologies identified across 5 categories. The dominant problem is **redundant framing** -- the same workflow/skill tables appear in 4 places with slight variations, each falling out of sync differently.

---

## 1. Root README (`/README.md`)

### Redundant Framing (5 instances)

| #   | Finding                                                                                                                                                                                                                                                                        | Lines   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| R1  | **Workflow table duplicated** -- same table exists in `plugins/flow/README.md`, `.flow/README.md`, and `packages/.../README.md`. All 4 copies list different subsets of the 10 catalog workflows. Root lists 7, Flow plugin lists 6, .flow/README lists 5, MCP README lists 0. | L79-88  |
| R2  | **Skills table duplicated** -- Root lists 8 skills, Flow plugin lists 10, .flow/README lists 8. Different formatting and descriptions.                                                                                                                                         | L89-101 |
| R3  | **Architecture diagram duplicated** -- ASCII art box diagram appears in root (L62-75), Flow plugin (L129-143), and MCP README (L94-128). Three different versions, none matching current reality.                                                                              | L62-75  |
| R4  | **Prefix table duplicated** -- Root has it (L34-41), Flow plugin has it (L30-38), .flow/README has it (L16-21). Root shows 5 prefixes; actual command files define 9 commands (`feat`, `bug`, `quick`, `task`, `spec`, `ctx`, `ui`, `go`, `recon`).                            | L34-41  |
| R5  | **"How It Works" section** repeats what the Flow plugin README already explains in more detail.                                                                                                                                                                                | L52-75  |

### Stale Content (3 instances)

| #   | Finding                                                                                                                                                                     | Lines  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1  | **Missing 3 workflows** -- `refactor`, `build-review-murder-board`, `build-review-quick` exist in catalog but appear nowhere in docs.                                       | L79-88 |
| S2  | **Missing 4 commands** -- `task:`, `spec:`, `ui:`, `go:` prefixes exist as command files but aren't documented. `recon:` also undocumented.                                 | L34-41 |
| S3  | **`fix:` prefix mismatch** -- Root says `fix:` maps to `quick-task`. But `plugins/flow/commands/` has no `fix.md`; it has `quick.md` instead. The actual prefix is unclear. | L38    |

### Attention Dilution (1 instance)

| #   | Finding                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Feature Highlights section** (L103-109) restates what the Architecture section already shows. Six bullet points that reword existing content without adding information. |

---

## 2. Flow Plugin README (`/plugins/flow/README.md`)

### Redundant Framing (2 instances)

| #   | Finding                                                                                                                                                           | Lines    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R6  | **Workflow descriptions duplicated** -- Lists 6 workflows with step chains. Same info is in root README (different format) and .flow/README (yet another format). | L57-103  |
| R7  | **"How It Works" section** -- 4 bullets restating what the Architecture section already covers.                                                                   | L145-148 |

### Stale Content (4 instances)

| #   | Finding                                                                                                                                                                                                                                              | Lines    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S4  | **Missing 4 workflows** -- Does not list `ui-reconstruction`, `refactor`, `build-review-murder-board`, `build-review-quick`.                                                                                                                         | L57-103  |
| S5  | **"Further Reading" links stale** -- Points to `../../packages/agent-flow-navigator-mcp/catalog/workflows/` but catalog is at `packages/agent-flow-navigator-mcp/catalog/workflows/` (no individual workflow JSON files at the linked path pattern). | L177-178 |
| S6  | **Subagents table incomplete** -- Lists Planner, Developer, Tester, Reviewer, Investigator. Missing "Context Engineer" agent used by context-optimization workflow. Also missing "Architect" from build-review workflows.                            | L152-160 |
| S7  | **HITL example stale** -- References `(direct)` format and `/flow:task-advance 1 passed` syntax that may not reflect current command interface.                                                                                                      | L163-173 |

### Specification Bloat (1 instance)

| #   | Finding                                                                                                                                                                                                                                                                            | Lines   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| B1  | **Per-workflow step listings** -- Each workflow has Stages + Steps listed as text. This is exactly what the mermaid diagrams in `.flow/diagrams/` show visually. The text duplicates what diagrams convey better. 47 lines of step chains that could be replaced by diagram links. | L57-103 |

---

## 3. MCP Navigator README (`/packages/agent-flow-navigator-mcp/README.md`)

### Specification Bloat (3 instances)

| #   | Finding                                                                                                                                                                                                                                                           | Lines    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| B2  | **Architecture diagram over-specified** -- 35-line ASCII diagram includes internal component names (`Sync Tracker`, `Edge Evaluator`) that users don't interact with. The GPS metaphor on line 8 is more useful than the entire diagram.                          | L94-128  |
| B3  | **Advanced Usage examples reference dead API** -- `load_workflow`, `load_task_tree`, `advance_task` tool names don't match the MCP tools table (which lists `Navigate`, `Diagram`, `ListWorkflows`, etc.). The advanced section describes an internal/legacy API. | L179-244 |
| B4  | **Schema tables exhaustive** -- Node types, end node properties, task/gate properties, edge properties = 4 tables spanning 46 lines. This is reference material that belongs in a schema doc, not the README.                                                     | L141-177 |

### Stale Content (2 instances)

| #   | Finding                                                                                                                                                                                                                  | Lines    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| S8  | **Tool names mismatch** -- Advanced Usage section uses `load_workflow`, `load_task_tree`, `advance_task`. Actual MCP tools are `Navigate`, `Diagram`, `ListWorkflows`, `SelectWorkflow`, `CopyWorkflows`, `ListCatalog`. | L179-244 |
| S9  | **License mismatch** -- States "MIT" but root README says "ISC".                                                                                                                                                         | L260     |

### Attention Dilution (1 instance)

| #   | Finding                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A2  | **Key Concepts table** buries the most important concept (Navigate's 3-mode API: start/current/advance) in a generic table. The 3-mode pattern is the core mental model users need and deserves primary placement. |

### Missing Connections (1 instance)

| #   | Finding                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **No diagram links** -- The MCP server generates diagrams via the `Diagram` tool but the README doesn't show any example output or link to the existing `.flow/diagrams/` files. |

---

## 4. Project Flow README (`/.flow/README.md`)

### Stale Content (2 instances)

| #   | Finding                                                                                                                                                                                                                                  | Lines  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S10 | **Workflow list incomplete** -- Lists only 5 workflows (quick-task, agile-task, feature-development, bug-fix, context-optimization). Missing: ui-reconstruction, test-coverage, refactor, build-review-murder-board, build-review-quick. | L39-46 |
| S11 | **Uses `task:` prefix** (L20) but commands/ has `task.md` mapping to agile-task. Yet the root README doesn't document `task:` at all. Inconsistent.                                                                                      | L20    |

### Redundant Framing (1 instance)

| #   | Finding                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R8  | **Entire file is a condensed version of plugins/flow/README.md.** Same structure (Quick Start, Commands, Workflows, Customization) but shorter and more stale. Either this file should be the authoritative project-level doc or it should be deleted in favor of a link. |

---

## 5. Diagram Files (`/.flow/diagrams/`)

### Missing Connections (3 instances)

| #   | Finding                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2  | **3 workflows lack diagrams** -- `refactor`, `build-review-murder-board`, `build-review-quick` have catalog JSON but no diagram files.                                                  |
| M3  | **Diagrams not linked from any README** -- 7 diagram files exist but none of the 4 READMEs reference them.                                                                              |
| M4  | **No agent-to-workflow mapping** -- Diagrams show agent names in step labels (`<small>Planner</small>`) but no doc provides a reverse lookup (given an agent, which workflows use it?). |

---

## Cross-Cutting Pathologies

### The Core Problem: 4 Sources of Truth

```
README.md            (7 workflows, 8 skills, 5 prefixes)
plugins/flow/README.md   (6 workflows, 10 skills, 5 prefixes)
.flow/README.md          (5 workflows, 8 commands, 3 prefixes + `task:`)
commands/*.md            (9 commands -- actual ground truth)
catalog/workflows/*.json (10 workflows -- actual ground truth)
```

Every doc maintains its own copy of the workflow list, skill list, and prefix table. None match ground truth. This is the textbook definition of **redundant framing** causing **stale content cascade**.

### Severity Ranking

| Priority | Pathology                  | Count | Impact                                     |
| -------- | -------------------------- | ----- | ------------------------------------------ |
| **P0**   | Stale content (wrong info) | 11    | Users get incorrect workflow/tool names    |
| **P1**   | Redundant framing (drift)  | 8     | Every edit requires 4 updates, none happen |
| **P2**   | Specification bloat        | 4     | Key concepts buried in detail              |
| **P3**   | Attention dilution         | 2     | Important info deprioritized               |
| **P4**   | Missing connections        | 4     | Diagrams exist but unreachable             |

### Recommended Fix Strategy

1. **Single source of truth per concept** -- Workflow list lives in ONE place. Others link to it.
2. **Replace text step-chains with diagram links** -- `plugins/flow/README.md` lines 57-103 become links to `.flow/diagrams/`.
3. **Delete `.flow/README.md`** or make it auto-generated -- it's a stale copy of `plugins/flow/README.md`.
4. **MCP README: kill dead API section** -- lines 179-244 reference tools that don't exist.
5. **Lead with Navigate's 3-mode API** -- the GPS metaphor is perfect, promote it.
6. **Document all 9 commands and 10 workflows** -- derive from `commands/*.md` and `catalog/workflows/*.json`.
