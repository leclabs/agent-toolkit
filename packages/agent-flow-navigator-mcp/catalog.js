/**
 * catalog.js - Pure catalog reader module
 *
 * Transforms workflow data into catalog listings and selection options.
 * Actual file I/O handled by MCP handler.
 */

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
 * Build the complete catalog response
 * @param {Array} workflows - Array of workflow summaries
 * @returns {Object} Catalog response object
 */
export function buildCatalogResponse(workflows) {
  return {
    schemaVersion: 2,
    workflows,
    selectionOptions: buildCatalogSelectionOptions(workflows),
  };
}

/**
 * Build empty catalog response
 * @returns {Object} Empty catalog response
 */
export function buildEmptyCatalogResponse() {
  return {
    schemaVersion: 2,
    workflows: [],
    selectionOptions: [],
  };
}
