/**
 * copier.js - Pure copier module for workflows and agents
 *
 * Generates README content and provides helpers for copying catalog templates.
 * Actual file I/O handled by MCP handler.
 */

/**
 * Generate root README.md content for .flow/
 * @returns {string} README content
 */
export function generateFlowReadme() {
  return `# Flow Plugin

Graph-based workflow orchestration for AI agents.

## Quick Start

\`\`\`bash
# Create a task with workflow selection
/flow:task "add user authentication"

# Execute all pending tasks
/flow:go
\`\`\`

## Commands

| Command | Description |
| --- | --- |
| \`/flow:task\` | Create a task with workflow selection |
| \`/flow:go\` | Execute all pending tasks |
| \`/flow:recon\` | Deep dive exploration |
| \`/flow:help\` | Show help |

Use \`/flow:task-create "description" <workflow-id>\` for direct workflow assignment.

## Available Workflows

Workflows are defined in \`.flow/workflows/\`. Edit \`workflow.json\` to customize, then run \`/flow:load\` to reload.

See [Flow Plugin docs](https://github.com/leclabs/agent-toolkit/tree/main/plugins/flow) for the full workflow catalog.
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
\u251c\u2500\u2500 README.md              # This file
\u2514\u2500\u2500 {workflow}/
    \u2514\u2500\u2500 workflow.json      # Workflow definition (steps + edges)
\`\`\`

## How Step Instructions Work

Step instructions are generated automatically from:
1. **workflow.json** - \`name\` and \`description\` fields for each step
2. **Baseline patterns** - Default guidance based on step type (analyze, implement, test, etc.)

The navigation APIs (Start/Current/Next) return \`node\` with the step's name, description, and instructions.

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

Defines the workflow graph:
- \`nodes\`: Map of node definitions (type, name, description, agent, maxRetries)
- \`edges\`: Array of transitions between nodes (from, to, on, label)

Do NOT edit edge logic unless you understand workflow flow control.

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
 * @returns {string[]} IDs to copy
 */
export function computeWorkflowsToCopy(requestedIds) {
  if (!requestedIds || requestedIds.length === 0) {
    throw new Error("workflowIds is required. Use ListCatalog to see available workflows, then pass specific IDs.");
  }
  return requestedIds;
}

/**
 * Validate an agent markdown file has frontmatter
 * @param {string} content - Markdown file content
 * @returns {boolean} True if valid for copying
 */
export function isValidAgentForCopy(content) {
  return typeof content === "string" && content.startsWith("---\n");
}

/**
 * Compute which agent IDs to copy
 * @param {string[]} requestedIds - Specifically requested agent IDs
 * @returns {string[]} IDs to copy
 */
export function computeAgentsToCopy(requestedIds) {
  if (!requestedIds || requestedIds.length === 0) {
    throw new Error("agentIds is required. Use ListCatalog to see available agents, then pass specific IDs.");
  }
  return requestedIds;
}
