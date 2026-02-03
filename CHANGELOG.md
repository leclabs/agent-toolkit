# @leclabs/agent-toolkit

## 2.1.0

### Minor Changes

- Add /replicate-flow skill for developer environment cloning

  Adds a project-level skill to replicate the complete flow development environment (plugin + navigator MCP source) to another marketplace, enabling other teams to develop, customize, and publish flow under their own namespace.

## 2.0.0

### Major Changes

- Add consumer hygiene, fork/join, and HITL-aware checks to /flow:validate
  - Add `fork` and `join` to valid node types (was incorrectly flagging catalog workflows as errors)
  - Add Fork/Join structural checks: branches, join reference, entryStep existence, strategy
  - Replace blanket "end nodes have no outgoing edges" warning with HITL-aware checks that distinguish recovery edges from genuinely unexpected outgoing edges
  - Add end node field validation: `result` field presence/values, `escalation: "hitl"` on blocked ends
  - Add Consumer Hygiene check category: skill-not-in-context (error) and double-@@ agent prefix (warn)
  - skill-not-in-context scans both `description` and `instructions` fields
  - Add Consumer Hygiene section to report template

## 1.9.1

### Patch Changes

- Add integration-layers rule and improve delegation protocol in session-start hook

## 1.9.0

### Minor Changes

- Auto-load orchestrator context via SessionStart hook

  Added a SessionStart plugin hook that automatically injects orchestrator context (identity, rules, and workflow instructions) on startup, clear, and compact events. The `/flow:prime` skill now delegates to the same shared script, eliminating duplication.

## 1.8.0

### Minor Changes

- f2918be: Enrich fork responses with per-branch step info and make agent IDs pass-through
  - Fork responses now include enriched per-branch data (subagent, stepInstructions, orchestratorInstructions, multiStep flag, metadata) so the orchestrator can create child tasks without extra Navigate calls
  - Fork-with-result advancement: passing a result on a fork node automatically advances through the join to the post-join step
  - Agent IDs are now passed through exactly as specified in workflow definitions — the navigator no longer rewrites agent names, enabling project-specific and external plugin agents (e.g. `ipsum:Copywriter`) to work without modification
  - Catalog workflows now use explicit `flow:AgentName` references
  - Added emoji field to workflow schema for visual agent indicators in diagrams
  - New workflows: context-gather, execute
  - Extracted writeThrough helper to consolidate task-file persistence logic

## 1.7.0

### Minor Changes

- feat: mid-flow task recovery via stepId parameter; fix implicit workflow copying and sourceRoot tracking

## 1.6.0

### Minor Changes

- Add bug-hunt workflow with fork/join parallel investigation

## 1.5.2

### Patch Changes

- Auto-correct task ID from filename in write-through and add task file integrity guard to /flow:run

  Navigator now derives the canonical task ID from the filename (e.g., `1.json` → `"1"`) and auto-corrects mismatches, preventing the filename-to-ID corruption that caused Claude Code to lose track of tasks. The /flow:run skill now explicitly prohibits using the Write tool on task files.

## 1.5.1

### Patch Changes

- Enable autonomy mode by default in /flow:go

## 1.5.0

### Minor Changes

- Add autonomy mode for Navigator and fix task ID preservation in write-through

  **Autonomy mode**: When `autonomy: true` is passed to Navigate (or stored in task metadata), the engine auto-continues through stage boundary end nodes instead of stopping. Stage boundaries are end nodes with outgoing `on: "passed"` edges to non-terminal nodes. HITL nodes and truly terminal end nodes (no outgoing edges) always stop regardless of mode. The response includes `autonomyContinued: boolean` to indicate when auto-continuation occurred.

  **Task ID fix**: The write-through now explicitly preserves the original `task.id` before writing, preventing the filename-to-ID mismatch that caused Claude Code's task system to lose track of tasks.

## 1.4.1

### Patch Changes

- Prevent auto-loading project workflows on startup. Require explicit workflowIds for project workflow loading. Support both flat and directory formats in external workflow loader. Fix stale sourceRoot on reload. Resolve lint and formatting issues.

## 1.4.0

### Minor Changes

- 5d0b4cd: Add external plugin workflow loading with sourceRoot resolution

  External plugins can now load workflows at runtime via the LoadWorkflows MCP tool, passing their root path for ./ context_files resolution. The engine resolves ./ prefixed paths in context_files, description, and instructions against the plugin's sourceRoot, while plain paths continue resolving against the project root.

## 1.3.0

### Minor Changes

- Collapse context to single context_files per step, HITL recovery, build-review workflows

  **Breaking Changes:**
  - Remove workflow-level `required_skills`, `context_skills`, `context_files` and node-level `requiredSkills`/`contextSkills`. Replace with single `context_files` array on task/gate nodes.
  - Delete `mergeContext`, simplify `buildContextInstructions` and `buildNavigateResponse`.
  - Remove `context` from `listWorkflows` response.

  **Features:**
  - HITL recovery edges on all catalog workflows — enables resume after human intervention.
  - Build-review workflow variants — `build-review-murder-board` and `build-review-quick` with full test suites.
  - Refactor workflow with analysis, plan review, dev, and code review stages.
  - Loop guards and interactive HITL in `/flow:run` — soft (25) and hard (50) iteration guards.
  - New skills: `/flow:validate`, `/flow:inspect`, `/flow:dry-run`.
  - projectRoot plumbing — Navigate resolves `context_files` to absolute paths.
  - Schema additions: `context_files`, `config`, `instructions`, `stage`, `agent`, `maxRetries` on nodes.

  **Refactors:**
  - Remove prefix recognition from prime skill.
  - Make `/flow:task` prompt for workflow selection instead of defaulting to agile-task.

## 1.1.0

### Minor Changes

- Add changeset for version management with automatic sync across marketplace, plugin, and MCP server
