# @leclabs/agent-toolkit

## 1.3.0

### Breaking Changes

- **Collapse context to single `context_files` per step** — Remove workflow-level `required_skills`, `context_skills`, `context_files` and node-level `requiredSkills`/`contextSkills`. Replace with a single `context_files` array on task/gate nodes. Delete `mergeContext`, simplify `buildContextInstructions` and `buildNavigateResponse`. Remove `context` from `listWorkflows` response.

### Features

- **HITL recovery edges** — All catalog workflows now have recovery edges from HITL end nodes back into the workflow, enabling resume after human intervention.
- **Build-review workflow variants** — Add `build-review-murder-board` and `build-review-quick` workflow templates with full test suites.
- **Refactor workflow** — Add `refactor` workflow with analysis, plan review, dev, and code review stages.
- **Loop guards and interactive HITL** — `/flow:run` skill now has soft (25) and hard (50) iteration guards with user prompts, plus interactive HITL handling.
- **New skills** — Add `/flow:validate`, `/flow:inspect`, `/flow:dry-run`, `/flow:now` skills.
- **projectRoot plumbing** — Navigate accepts `projectRoot` for resolving `context_files` to absolute paths.
- **Workflow schema** — Add `context_files`, `config`, `instructions`, `stage`, `agent`, `maxRetries` to node schema.

### Refactors

- Remove prefix recognition from prime skill
- Make `/flow:task` prompt for workflow selection instead of defaulting to agile-task

## 1.1.0

### Minor Changes

- Add changeset for version management with automatic sync across marketplace, plugin, and MCP server
