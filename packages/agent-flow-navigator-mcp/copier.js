/**
 * copier.js - Pure workflow copier module
 *
 * Generates README content and provides helpers for workflow copying.
 * Actual file I/O handled by MCP handler.
 */

/**
 * Generate root README.md content for .flow/
 * @returns {string} README content
 */
export function generateFlowReadme() {
  return `# Flow Plugin

DAG-based workflow orchestration for Claude Code.

## Overview

Flow provides structured workflows that guide tasks through defined stages (planning → development → verification → delivery). Each step can be delegated to specialized subagents.

## Quick Start

Workflows work immediately from the built-in catalog - no setup required:

\`\`\`bash
# Create a task with workflow tracking
/flow:task-create "Add user authentication" [workflow] feature-development

# Or use prefix shortcuts
feat: Add user authentication    # → feature-development workflow
bug: Fix login error             # → bug-fix workflow
task: Update config file         # → quick-task workflow

# Run the task autonomously
/flow:run
\`\`\`

## Commands

| Command | Description |
|---------|-------------|
| \`/flow:list\` | List available workflows |
| \`/flow:task-create\` | Create a new task with workflow tracking |
| \`/flow:task-list\` | List all flow tasks with current status |
| \`/flow:task-get\` | Get detailed task info including workflow diagram |
| \`/flow:task-advance\` | Advance task: \`<taskId> <passed|failed> <navigator> [summary]\` |
| \`/flow:run\` | Execute flow tasks autonomously |
| \`/flow:init\` | Copy workflows to .flow/workflows/ for customization |
| \`/flow:load\` | Reload workflows after editing .flow/workflows/ |

## Available Workflows

- **quick-task** - Minimal: understand → execute → verify (best for simple tasks)
- **agile-task** - Simple: analyze → implement → test → review
- **feature-development** - Full lifecycle: requirements → planning → implementation → testing → PR
- **bug-fix** - Bug workflow: reproduce → investigate → fix → verify → PR
- **context-optimization** - Optimize agent context and instructions

## Customization (Optional)

Flow's workflows work directly from the catalog in the flow->navigator mcp. If you want to create custom workflows you can run \`/flow:init\` to select a workflow from the catalog to customize for your project, your agents, and your tools.

\`\`\`bash
# Copy catalog workflows to .flow/workflows/ for editing
/flow:init

# Edit .flow/workflows/{workflow}/workflow.json
# Then reload
/flow:load
\`\`\`

**Customization options:**
- Modify step definitions in workflow.json
- Add custom \`instructions\` to steps for project-specific guidance
- Create new workflows by adding new directories

## How It Works

1. **Navigate API** - Stateless MCP server computes next step based on workflow DAG
2. **Task Metadata** - Workflow state stored in Claude Code task metadata
3. **Subagent Delegation** - Steps delegated to specialized agents (planner, developer, tester, reviewer)
4. **Retry Logic** - Failed steps retry with configurable limits, escalate to HITL if exceeded
`;
}

/**
 * Generate README.md content for .flow/workflows/
 * @returns {string} README content
 */
export function generateWorkflowsReadme() {
  return `# Flow Workflows

This directory contains workflow definitions for the flow plugin.

## Directory Structure

\`\`\`
.flow/workflows/
├── README.md              # This file
└── {workflow}/
    └── workflow.json      # DAG definition (steps + edges)
\`\`\`

## How Step Instructions Work

Step instructions are generated automatically from:
1. **workflow.json** - \`name\` and \`description\` fields for each step
2. **Baseline patterns** - Default guidance based on step type (analyze, implement, test, etc.)

The \`Navigate\` API returns \`stepInstructions\` with all this combined.

## Customizing Step Instructions

To add custom instructions for a step, add an \`instructions\` field to the node definition in \`workflow.json\`:

\`\`\`json
{
  "nodes": {
    "implement": {
      "type": "task",
      "name": "Implement Feature",
      "description": "Build the feature according to the plan",
      "instructions": "Run /my-skill before starting. Load context from .claude/context/impl-guide.md",
      "agent": "Developer"
    }
  }
}
\`\`\`

### Custom Instruction Ideas

- **Run a skill**: \`"Run /lint-fix after making changes"\`
- **Load context**: \`"Read .claude/context/api-patterns.md first"\`
- **Project conventions**: \`"Follow the error handling pattern in src/utils/errors.ts"\`
- **Specific tools**: \`"Use the Grep tool to find existing implementations"\`

## Editing Workflows

### workflow.json

Defines the workflow DAG:
- \`nodes\`: Map of node definitions (type, name, description, agent, maxRetries)
- \`edges\`: Array of transitions between nodes (from, to, on, label)

Do NOT edit edge logic unless you understand DAG flow control.

## Adding Custom Workflows

1. Create a new directory: \`.flow/workflows/my-workflow/\`
2. Add \`workflow.json\` with steps and edges
3. Run \`/flow:load\` to reload workflows
`;
}

/**
 * Validate a workflow for copying
 * @param {Object} content - Workflow content from JSON
 * @returns {boolean} True if valid for copying
 */
export function isValidWorkflowForCopy(content) {
  return !!(content && content.nodes && content.edges);
}

/**
 * Compute which workflow IDs to copy
 * @param {string[]} requestedIds - Specifically requested workflow IDs (may be empty)
 * @param {string[]} availableIds - All available workflow IDs in catalog
 * @returns {string[]} IDs to copy
 */
export function computeWorkflowsToCopy(requestedIds, availableIds) {
  if (requestedIds && requestedIds.length > 0) {
    return requestedIds;
  }
  return availableIds;
}
