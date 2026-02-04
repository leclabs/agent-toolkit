/**
 * catalog.js - Pure catalog reader module
 *
 * Transforms workflow and agent data into catalog listings and selection options.
 * Actual file I/O handled by MCP handler.
 */

/**
 * Schema version for API responses
 */
const SCHEMA_VERSION = 3;

/**
 * Build a workflow summary from workflow content
 * @param {string} fileId - File name without .json extension
 * @param {Object} content - Workflow content from JSON
 * @returns {Object} Workflow summary
 */
export function buildWorkflowSummary(fileId, content) {
  return {
    id: content.id || fileId,
    name: content.name || content.id || fileId,
    description: content.description || "",
    stepCount: Object.keys(content.nodes || {}).length,
  };
}

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content - Markdown file content
 * @returns {Object} Parsed frontmatter fields
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fields = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}

/**
 * Build an agent summary from file ID and parsed frontmatter
 * @param {string} fileId - File name without .md extension
 * @param {Object} frontmatter - Parsed frontmatter fields
 * @returns {Object} Agent summary
 */
export function buildAgentSummary(fileId, frontmatter) {
  return {
    id: fileId,
    name: frontmatter.name || fileId,
    description: frontmatter.description || "",
    model: frontmatter.model || undefined,
  };
}

/**
 * Build selection options for AskUserQuestion from workflow list
 * @param {Array} workflows - Array of workflow summaries
 * @returns {Array} Selection options with "All" first
 */
export function buildCatalogSelectionOptions(workflows) {
  return [
    {
      label: "All workflows (Recommended)",
      description: `Copy all ${workflows.length} workflows to your project`,
    },
    ...workflows.map((wf) => ({
      label: wf.name,
      description: `${wf.description} (${wf.stepCount} steps)`,
    })),
  ];
}

/**
 * Build selection options for agents
 * @param {Array} agents - Array of agent summaries
 * @returns {Array} Selection options with "All" first
 */
export function buildAgentSelectionOptions(agents) {
  return [
    {
      label: "All agents (Recommended)",
      description: `Copy all ${agents.length} agent templates to your project`,
    },
    ...agents.map((agent) => ({
      label: agent.name,
      description: agent.description,
    })),
  ];
}

/**
 * Build the complete catalog response
 * @param {Array} workflows - Array of workflow summaries
 * @param {Array} agents - Array of agent summaries
 * @returns {Object} Catalog response object
 */
export function buildCatalogResponse(workflows, agents = []) {
  return {
    schemaVersion: SCHEMA_VERSION,
    workflows,
    workflowSelectionOptions: buildCatalogSelectionOptions(workflows),
    agents,
    agentSelectionOptions: buildAgentSelectionOptions(agents),
  };
}

/**
 * Build empty catalog response
 * @returns {Object} Empty catalog response
 */
export function buildEmptyCatalogResponse() {
  return {
    schemaVersion: SCHEMA_VERSION,
    workflows: [],
    workflowSelectionOptions: [],
    agents: [],
    agentSelectionOptions: [],
  };
}
