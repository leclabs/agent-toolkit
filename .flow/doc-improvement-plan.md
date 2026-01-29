# Documentation Improvement Plan

## Ground Truth (Single Source of Reference)

Before fixing docs, establish what actually exists.

### Catalog Workflows: 10

| ID                        | Name                      | Steps | Has Diagram? |
| ------------------------- | ------------------------- | ----- | ------------ |
| agile-task                | Agile Task                | 9     | Yes          |
| bug-fix                   | Bug Fix                   | 11    | Yes          |
| build-review-murder-board | Build-Review Murder Board | 7     | **NO**       |
| build-review-quick        | Build-Review Quick        | 7     | **NO**       |
| context-optimization      | Context Optimization      | 9     | Yes          |
| feature-development       | Feature Development       | 15    | Yes          |
| quick-task                | Quick Task                | 8     | Yes          |
| refactor                  | Refactor                  | 16    | **NO**       |
| test-coverage             | Test Coverage             | 10    | Yes          |
| ui-reconstruction         | UI Reconstruction         | 17    | Yes          |

### Commands: 9 files in `plugins/flow/commands/`

| Command       | File     | Workflow Invoked       | Description                        |
| ------------- | -------- | ---------------------- | ---------------------------------- |
| `/flow:bug`   | bug.md   | bug-fix                | Create a bug fix task              |
| `/flow:ctx`   | ctx.md   | context-optimization   | Create a context optimization task |
| `/flow:feat`  | feat.md  | feature-development    | Create a feature development task  |
| `/flow:go`    | go.md    | _(none - runs queue)_  | Execute all pending flow tasks     |
| `/flow:quick` | quick.md | quick-task             | Create a quick task                |
| `/flow:spec`  | spec.md  | test-coverage          | Create a test coverage task        |
| `/flow:task`  | task.md  | agile-task             | Create an agile task               |
| `/flow:ui`    | ui.md    | ui-reconstruction      | Create a UI reconstruction task    |
| `/flow:recon` | recon.md | _(none - exploration)_ | Deep project exploration           |

### Skills: 11 files in `plugins/flow/skills/`

| Skill                | Description                                         |
| -------------------- | --------------------------------------------------- |
| `/flow:prime`        | Load orchestrator context at session start          |
| `/flow:task-create`  | Create a new task with workflow tracking            |
| `/flow:task-list`    | List all tasks with status                          |
| `/flow:task-get`     | Get task details with workflow diagram              |
| `/flow:task-advance` | Advance task to next step (passed/failed)           |
| `/flow:run`          | Execute tasks autonomously with subagent delegation |
| `/flow:init`         | Copy workflows from catalog to project              |
| `/flow:list`         | List available workflows                            |
| `/flow:load`         | Reload workflows from `.flow/workflows/`            |
| `/flow:diagram`      | Generate mermaid diagram for a workflow             |
| `/flow:analyze`      | Interactive workflow discovery from project         |

### MCP Tools: 6 (current API)

| Tool           | Description                                        |
| -------------- | -------------------------------------------------- |
| Navigate       | Start workflow, get current state, or advance      |
| ListWorkflows  | List available workflows (filterable by source)    |
| SelectWorkflow | Get workflow selection dialog for user interaction |
| Diagram        | Generate mermaid flowchart for a workflow          |
| CopyWorkflows  | Copy workflows from catalog to project             |
| ListCatalog    | List workflows available in catalog                |

### Subagents: 5

Planner, Developer, Tester, Reviewer, Investigator (plus Context Engineer in context-optimization)

---

## Pathology Inventory

### P1: Missing Diagrams for 3 Workflows

**Problem**: `refactor`, `build-review-murder-board`, and `build-review-quick` exist in catalog JSON files but the `Diagram` tool returned "not found." The `ListCatalog` tool lists all 10, but `ListWorkflows(source=all)` returns only 7.

**Root Cause**: NOT a validation issue -- all 3 pass `validateWorkflow()` when tested directly. The MCP server loads workflows into memory at startup via `loadWorkflows()`. The `ListCatalog` tool reads files directly from disk each time (bypassing the in-memory store), while `ListWorkflows` and `Diagram` use the in-memory store. The 3 workflows were likely added to the catalog _after_ the running MCP server process started, so they exist on disk but not in memory.

**Action**: Restart the MCP server (or reload workflows) so all 10 catalog workflows load into memory. Then generate diagrams for all 10. No code changes needed -- this is an operational issue.

### P2: Documentation Says 7 Workflows, Reality is 10

**Files affected**:

- `README.md` line 77-87: "Available Workflows" table lists 7
- `plugins/flow/README.md` lines 57-103: "Workflows" section lists 6 (missing ui-reconstruction)
- Both completely omit: refactor, build-review-murder-board, build-review-quick

**Action**: Update all workflow tables to reflect 10 catalog workflows.

### P3: Prefix Table Inconsistency (4 Sources, None Correct)

Four places define prefix-to-workflow mappings. None match ground truth.

| Source                                   | Prefixes Listed                                      | Missing                                     |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| `README.md` (lines 34-41)                | feat, bug, fix, test, ctx (5)                        | task, spec, ui, go, recon                   |
| `plugins/flow/README.md` (lines 30-38)   | fix, feat, bug, test, ctx (5)                        | task, spec, ui, go, recon                   |
| Actual commands/ dir                     | bug, ctx, feat, go, quick, spec, task, ui, recon (9) | --                                          |
| `README.md` calls them "Prefix commands" | Uses `fix:` for quick-task                           | Actual command is `/flow:quick`, not `fix:` |

**Key discrepancy**: README says `fix:` maps to quick-task. But the actual command is `/flow:quick`. There is no `fix.md` command file. Either the prefix `fix:` is a deprecated alias or the README is wrong.

**Action**: Reconcile. The single source of truth is the `commands/` directory. Either:

- (a) Add a `fix.md` command if `fix:` prefix should still work, OR
- (b) Remove `fix:` from READMEs and document actual command names

All 9 commands should be documented in both READMEs.

### P4: Skills Table Incomplete in README.md

`README.md` lists 8 skills (lines 91-101). Missing: `/flow:list`, `/flow:load`, `/flow:analyze`.

`plugins/flow/README.md` lists 10 skills (lines 42-53). Missing: `/flow:analyze`.

Neither lists the 9 prefix commands as separate entries.

**Action**: Each README should list all 11 skills. The prefix commands are separate from skills and should be in their own table.

### P5: MCP README Contains Stale API Examples

`packages/agent-flow-navigator-mcp/README.md` lines 179-244 show "Advanced Usage" with tool names that no longer exist:

- `load_workflow` -- does not exist (Navigator v2 is stateless)
- `load_task_tree` -- does not exist
- `advance_task` -- does not exist (replaced by `Navigate` with result param)
- `get_next_tasks` -- does not exist

The architecture diagram (lines 94-129) references `load_workflow`, `load_task_tree`, `get_next_tasks`, `advance_task`.

**Action**: Delete the "Advanced Usage" section entirely. Update architecture diagram to show actual v2 tools: Navigate, ListWorkflows, Diagram, CopyWorkflows, ListCatalog, SelectWorkflow.

### P6: MCP README Tool Table Correct But Incomplete Documentation

The "MCP Tools Reference" table (lines 63-70) correctly lists 6 tools. However, only Navigate and Diagram have parameter tables. Missing parameter tables for: ListWorkflows, SelectWorkflow, CopyWorkflows, ListCatalog.

**Action**: Add parameter tables for all 6 tools, matching the actual `inputSchema` from `index.js`.

### P7: Flow README Workflow Descriptions Don't Match Catalog

The `plugins/flow/README.md` workflow descriptions use abbreviated step lists that don't match the actual workflow JSON. For example:

- `feature-development` says "Steps: parse_requirements -> explore_codebase -> create_plan -> plan_review -> implement -> write_tests -> run_tests -> code_review -> lint_format -> commit -> create_pr" (11 steps listed)
- Actual workflow has 15 steps (includes start + 3 end nodes + 11 task/gate nodes)
- The step count from ListCatalog says 15

This confusion arises from counting nodes vs. counting executable steps vs. counting including start/end.

**Action**: Use consistent counting. Define "steps" as the catalog's `stepCount` (total nodes). Show mermaid diagrams instead of text step lists -- they are auto-generated and always accurate.

### P8: Architecture Diagram in Flow README is Simplistic

The ASCII architecture diagram in `plugins/flow/README.md` (lines 129-143) is adequate but doesn't show tool names or data flow.

**Action**: Replace with a mermaid diagram that shows the actual tools and data flow.

### P9: `recon` Command is Undocumented

`recon.md` exists in commands but is not mentioned anywhere in READMEs and doesn't map to any workflow. It's a standalone exploration command with a typo ("dive deap" should be "dive deep").

**Action**: Fix the typo. Add to command tables or remove if deprecated.

### P10: Catalog Path Reference is Wrong

`plugins/flow/README.md` line 178: "Workflow Catalog" links to `../../packages/agent-flow-navigator-mcp/catalog/workflows/`. This is a relative path that works from the plugin README but the actual catalog structure uses flat JSON files (`{id}.json`), not `{id}/workflow.json` directories.

**Action**: Verify link works. Update description to clarify flat-file structure.

---

## Design Recommendations

### R1: Single Source of Truth Architecture

**Principle**: Each fact should exist exactly once. All other references should be generated or link to the source.

| Fact                 | Source of Truth                                                               | Consumers (link, don't duplicate) |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| Workflow definitions | `packages/agent-flow-navigator-mcp/catalog/workflows/*.json`                  | All READMEs                       |
| Command definitions  | `plugins/flow/commands/*.md`                                                  | All READMEs                       |
| Skill definitions    | `plugins/flow/skills/*/SKILL.md`                                              | All READMEs                       |
| MCP tool schemas     | `packages/agent-flow-navigator-mcp/index.js` (ListToolsRequestSchema handler) | MCP README                        |
| Workflow diagrams    | Generated by `Diagram` tool into `.flow/diagrams/`                            | All READMEs (embed or link)       |

**Recommendation**: Create a script (`bin/generate-docs.js`) that reads these sources and generates the tables in each README. Until then, add comments in READMEs marking auto-generated sections:

```markdown
<!-- AUTO-GENERATED: workflow-table. Source: catalog/workflows/*.json -->

| Workflow | Steps | Description |
...

<!-- END AUTO-GENERATED -->
```

### R2: Diagram Enhancement Strategy

Current diagrams show:

- Node names with agent labels (`<br/><small>Agent</small>`)
- Color coding (start=green, success=blue, HITL=pink, gate=purple, current=gold)
- Step instruction table with Stage, Step, Name, Agent, Instructions

**Suggested additions** (modify `diagram.js`):

1. **Stage grouping via subgraphs**:

   ```mermaid
   flowchart TD
     subgraph planning["Planning"]
       parse_requirements
       explore_codebase
       create_plan
       plan_review
     end
     subgraph development["Development"]
       implement
       write_tests
     end
   ```

   This makes stage transitions visually obvious.

2. **Entry command annotation**: Add a note showing which command invokes this workflow:

   ```mermaid
   flowchart TD
     note["Invoke: /flow:feat or feat:"]
   ```

3. **MCP tool callouts at gate nodes**: Gate nodes use Navigate(result=passed|failed). This is implicit and doesn't need diagram clutter. Skip this.

4. **Retry count on gate edges**: Show maxRetries on the failed-back edge:
   ```
   code_review -->|"failed (3 retries)"| implement
   ```

### R3: README Structure Recommendations

#### `README.md` (root -- marketplace entry point)

Target: New users discovering the toolkit. Keep minimal.

```
# Agent Toolkit
[badges]
One-sentence description.

## Installation (3 lines)
## Quick Start (show 2-3 prefix commands)
## Workflows (single table, 10 rows, link to diagrams)
## Skills (single table, 11 rows)
## Commands (single table, 9 rows, show prefix -> workflow mapping)
## Architecture (one mermaid diagram)
## Links to detailed docs
```

Delete: "Feature Highlights" (redundant with architecture), "How It Works" step list (move to flow README).

#### `plugins/flow/README.md` (plugin detail)

Target: Users who want to understand flow deeply.

```
# Flow Plugin
One-paragraph overview.

## Quick Start
## Commands (9 rows, with examples)
## Skills (11 rows, with descriptions)
## Workflows (10 rows, each with embedded mermaid diagram)
## Subagents (5 rows)
## Customization (/flow:init, /flow:load, editing)
## Architecture (detailed mermaid)
## HITL Escalation (with example)
```

Delete: Duplicate "Prefix Recognition" table (merge into Commands). Move workflow step lists into diagram embeds.

#### `packages/agent-flow-navigator-mcp/README.md` (MCP server reference)

Target: Developers integrating the MCP server.

```
# @leclabs/agent-flow-navigator-mcp
[badge]
One-sentence GPS metaphor.

## Installation
## Configuration (.mcp.json)
## Quick Start (Navigate flow)
## MCP Tools Reference (6 tools, each with full parameter table)
## Workflow Schema (node types, edge properties)
## Architecture (v2 stateless diagram)
## Testing
```

Delete: "Advanced Usage" section (stale v1 API), "Task Tree Management" (not in v2), "Loading Workflow Definitions" (not a user action in v2). Update architecture diagram to v2 tools.

### R4: Specific File Changes

#### `README.md` changes:

1. **Lines 34-41**: Replace 5-row prefix table with 9-row command table matching `commands/` directory
2. **Lines 77-87**: Replace 7-row workflow table with 10-row table
3. **Lines 89-101**: Replace 8-row skills table with 11-row table
4. **Lines 53-75**: Simplify "How It Works" -- remove step list, keep architecture diagram

#### `plugins/flow/README.md` changes:

1. **Lines 30-38**: Replace 5-row prefix table with 9-row command table
2. **Lines 42-53**: Add `/flow:analyze` to skills table
3. **Lines 57-103**: Add entries for refactor, build-review-murder-board, build-review-quick, ui-reconstruction
4. Embed mermaid diagrams for each workflow (from `.flow/diagrams/`)

#### `packages/agent-flow-navigator-mcp/README.md` changes:

1. **Lines 63-70**: Keep tool table, add parameter tables for all 6 tools
2. **Lines 72-90**: Keep Navigate and Diagram param tables
3. **Lines 92-129**: Rewrite architecture diagram for v2 (replace `load_workflow`, `load_task_tree`, `get_next_tasks`, `advance_task` with actual tools)
4. **Lines 179-244**: Delete "Advanced Usage" section entirely (stale v1 API)
5. **Lines 133-139**: Update Key Concepts table (remove "Task Tree" and "Sync Tracking" -- v2 is stateless)

---

## Blocked Issue: 3 Workflows Not in Memory

The `refactor`, `build-review-murder-board`, and `build-review-quick` workflows exist in the catalog on disk and pass validation, but are not loaded into the running MCP server's in-memory store. The `ListCatalog` tool reads from disk, while `ListWorkflows` and `Diagram` read from memory.

**Resolution**: Restart the Navigator MCP server so `loadWorkflows()` picks up all 10 catalog files. No code fix needed. After restart, all 10 workflows will be available for diagram generation.

**This must be done before documentation can include diagrams for all 10 workflows.**

---

## Implementation Priority

| Priority | Action                                                                        | Files                                      | Effort                          |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| **P0**   | Restart Navigator MCP server to load all 10 catalog workflows                 | Operational                                | Trivial                         |
| **P0**   | Generate diagrams for refactor, build-review-murder-board, build-review-quick | via Diagram tool                           | Trivial (once server restarted) |
| **P1**   | Delete stale v1 API section from MCP README                                   | `packages/.../README.md`                   | Small                           |
| **P1**   | Update architecture diagram in MCP README to v2                               | `packages/.../README.md`                   | Small                           |
| **P1**   | Reconcile prefix/command tables across all 3 READMEs                          | All 3 READMEs                              | Medium                          |
| **P2**   | Add all 10 workflows to flow README with diagrams                             | `plugins/flow/README.md`                   | Medium                          |
| **P2**   | Complete MCP tool parameter documentation                                     | `packages/.../README.md`                   | Small                           |
| **P3**   | Add subgraph stage grouping to diagram generator                              | `diagram.js`                               | Medium                          |
| **P3**   | Fix `recon.md` typo, add to command tables                                    | `plugins/flow/commands/recon.md` + READMEs | Small                           |
| **P4**   | Create `bin/generate-docs.js` for auto-generation                             | New file                                   | Large                           |
