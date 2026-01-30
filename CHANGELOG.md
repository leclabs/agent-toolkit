# @leclabs/agent-toolkit

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
