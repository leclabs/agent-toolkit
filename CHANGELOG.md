# @leclabs/agent-toolkit

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
  - New skills: `/flow:validate`, `/flow:inspect`, `/flow:dry-run`, `/flow:now`.
  - projectRoot plumbing — Navigate resolves `context_files` to absolute paths.
  - Schema additions: `context_files`, `config`, `instructions`, `stage`, `agent`, `maxRetries` on nodes.

  **Refactors:**
  - Remove prefix recognition from prime skill.
  - Make `/flow:task` prompt for workflow selection instead of defaulting to agile-task.

## 1.1.0

### Minor Changes

- Add changeset for version management with automatic sync across marketplace, plugin, and MCP server
