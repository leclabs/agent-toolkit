/**
 * store.js - Pure workflow store module
 *
 * Manages workflow definitions in memory. Pure data structure with no I/O.
 * File loading handled by MCP server initialization.
 */

/**
 * Validate workflow schema
 * @param {string} id - Workflow identifier
 * @param {Object} content - Workflow definition
 * @returns {boolean} True if valid
 */
export function validateWorkflow(id, content) {
  if (!content.nodes || typeof content.nodes !== "object") {
    console.error(`Invalid workflow ${id}: missing 'nodes' object`);
    return false;
  }
  if (!content.edges || !Array.isArray(content.edges)) {
    console.error(`Invalid workflow ${id}: missing 'edges' array`);
    return false;
  }
  return true;
}

/**
 * In-memory workflow store (stateless - no task storage)
 */
export class WorkflowStore {
  constructor() {
    this.workflows = new Map();
  }

  /**
   * Load a workflow definition into the store
   * @param {string} id - Workflow identifier
   * @param {Object} workflow - Workflow definition
   * @returns {string} The workflow id
   */
  loadDefinition(id, workflow) {
    this.workflows.set(id, workflow);
    return id;
  }

  /**
   * Get a workflow definition by id
   * @param {string} id - Workflow identifier
   * @returns {Object|undefined} Workflow definition or undefined
   */
  getDefinition(id) {
    return this.workflows.get(id);
  }

  /**
   * List all loaded workflows with metadata
   * @returns {Array} Array of workflow summaries
   */
  listWorkflows() {
    return Array.from(this.workflows.entries()).map(([id, wf]) => ({
      id,
      name: wf.name || id,
      description: wf.description || "",
      stepCount: Object.keys(wf.nodes || {}).length,
    }));
  }

  /**
   * Check if a workflow exists
   * @param {string} id - Workflow identifier
   * @returns {boolean} True if workflow exists
   */
  has(id) {
    return this.workflows.has(id);
  }

  /**
   * Clear all workflows from the store
   */
  clear() {
    this.workflows.clear();
  }

  /**
   * Get the number of loaded workflows
   * @returns {number} Workflow count
   */
  get size() {
    return this.workflows.size;
  }
}
