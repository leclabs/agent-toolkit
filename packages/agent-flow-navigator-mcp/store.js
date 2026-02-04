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

  // Validate fork/join nodes
  const nodes = content.nodes;
  const forkNodes = Object.entries(nodes).filter(([, n]) => n.type === "fork");
  const joinNodes = Object.entries(nodes).filter(([, n]) => n.type === "join");

  for (const [forkId, forkDef] of forkNodes) {
    // Fork's join field must reference an existing join node
    if (!forkDef.join || !nodes[forkDef.join]) {
      console.error(`Invalid workflow ${id}: fork '${forkId}' references missing join node '${forkDef.join}'`);
      return false;
    }
    if (nodes[forkDef.join].type !== "join") {
      console.error(`Invalid workflow ${id}: fork '${forkId}' join field '${forkDef.join}' is not a join node`);
      return false;
    }

    // Branches are derived from edges - validate fork has outgoing edges
    const branchEdges = content.edges.filter((e) => e.from === forkId);
    if (branchEdges.length === 0) {
      console.error(`Invalid workflow ${id}: fork '${forkId}' has no outgoing edges (branches)`);
      return false;
    }

    // All branch targets must reference existing nodes
    for (const edge of branchEdges) {
      if (!nodes[edge.to]) {
        console.error(`Invalid workflow ${id}: fork '${forkId}' edge targets missing node '${edge.to}'`);
        return false;
      }
    }

    // Branch edges cannot target their own join directly (degenerate branch)
    for (const edge of branchEdges) {
      if (edge.to === forkDef.join) {
        console.error(
          `Invalid workflow ${id}: fork '${forkId}' edge cannot target its own join '${forkDef.join}' directly`
        );
        return false;
      }
    }

    // No nested forks in v1: branch edges must not target fork nodes
    for (const edge of branchEdges) {
      if (nodes[edge.to]?.type === "fork") {
        console.error(
          `Invalid workflow ${id}: fork '${forkId}' edge targets another fork '${edge.to}' (nested forks not supported in v1)`
        );
        return false;
      }
    }

    // Validate maxConcurrency if present
    if (forkDef.maxConcurrency !== undefined) {
      if (
        typeof forkDef.maxConcurrency !== "number" ||
        forkDef.maxConcurrency < 1 ||
        !Number.isInteger(forkDef.maxConcurrency)
      ) {
        console.error(`Invalid workflow ${id}: fork '${forkId}' maxConcurrency must be a positive integer`);
        return false;
      }
    }
  }

  for (const [joinId, joinDef] of joinNodes) {
    // Join's fork field must reference an existing fork node
    if (!joinDef.fork || !nodes[joinDef.fork]) {
      console.error(`Invalid workflow ${id}: join '${joinId}' references missing fork node '${joinDef.fork}'`);
      return false;
    }
    if (nodes[joinDef.fork].type !== "fork") {
      console.error(`Invalid workflow ${id}: join '${joinId}' fork field '${joinDef.fork}' is not a fork node`);
      return false;
    }
  }

  // Fork-join pairs must be matched 1:1
  const forkToJoin = new Map(forkNodes.map(([id, def]) => [id, def.join]));
  const joinToFork = new Map(joinNodes.map(([id, def]) => [id, def.fork]));

  for (const [forkId, joinId] of forkToJoin) {
    if (joinToFork.get(joinId) !== forkId) {
      console.error(
        `Invalid workflow ${id}: fork '${forkId}' → join '${joinId}' pair mismatch (join points to '${joinToFork.get(joinId)}')`
      );
      return false;
    }
  }

  return true;
}

/**
 * In-memory workflow store (stateless - no task storage)
 */
export class WorkflowStore {
  constructor() {
    this.workflows = new Map();
    this.sources = new Map(); // Track source: "catalog" | "project" | "external"
    this.sourceRoots = new Map(); // Track source root path per workflow (for ./ resolution)
  }

  /**
   * Load a workflow definition into the store
   * @param {string} id - Workflow identifier
   * @param {Object} workflow - Workflow definition
   * @param {string} source - Source: "catalog" | "project" | "external"
   * @param {string|null} sourceRoot - Root path for resolving ./ context_files
   * @returns {string} The workflow id
   */
  loadDefinition(id, workflow, source = "catalog", sourceRoot = null) {
    this.workflows.set(id, workflow);
    this.sources.set(id, source);
    if (sourceRoot) {
      this.sourceRoots.set(id, sourceRoot);
    } else {
      this.sourceRoots.delete(id);
    }
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
   * @param {string} filter - Filter by source: "all" | "project" | "catalog" | "external"
   * @returns {Array} Array of workflow summaries
   */
  listWorkflows(filter = "all") {
    const results = [];
    for (const [id, wf] of this.workflows.entries()) {
      const source = this.sources.get(id) || "catalog";
      if (filter !== "all" && source !== filter) continue;
      results.push({
        id,
        name: wf.name || id,
        description: wf.description || "",
        stepCount: Object.keys(wf.nodes || {}).length,
        source,
      });
    }
    return results;
  }

  /**
   * Check if any project workflows exist
   * @returns {boolean}
   */
  hasProjectWorkflows() {
    for (const source of this.sources.values()) {
      if (source === "project") return true;
    }
    return false;
  }

  /**
   * Check if any external workflows exist
   * @returns {boolean}
   */
  hasExternalWorkflows() {
    for (const source of this.sources.values()) {
      if (source === "external") return true;
    }
    return false;
  }

  /**
   * Get the source of a workflow
   * @param {string} id - Workflow identifier
   * @returns {string|undefined} Source or undefined
   */
  getSource(id) {
    return this.sources.get(id);
  }

  /**
   * Get the source root path for a workflow (for ./ context_files resolution)
   * @param {string} id - Workflow identifier
   * @returns {string|undefined} Source root path or undefined
   */
  getSourceRoot(id) {
    return this.sourceRoots.get(id);
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
    this.sources.clear();
    this.sourceRoots.clear();
  }

  /**
   * Get the number of loaded workflows
   * @returns {number} Workflow count
   */
  get size() {
    return this.workflows.size;
  }
}
