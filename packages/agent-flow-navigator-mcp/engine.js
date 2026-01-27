/**
 * Workflow Engine
 *
 * Evaluates DAG transitions based on node outputs and retry state.
 *
 * Schema:
 * - nodes: { [id]: { type, name, maxRetries?, ... } }
 * - edges: [{ from, to, on?, label? }]
 *
 * Retry logic convention:
 * - maxRetries on the node defines how many retries are allowed
 * - Edge to non-end node = retry (taken if retries remaining)
 * - Edge to end node = escalation (taken if retries exhausted)
 */

export class WorkflowEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Build adjacency list from edges array
   */
  buildEdgeGraph(workflowId) {
    const def = this.store.getDefinition(workflowId);
    if (!def) throw new Error(`Workflow ${workflowId} not found`);

    if (!def.nodes) {
      throw new Error(`Workflow ${workflowId} must have nodes`);
    }

    const graph = {
      nodes: def.nodes,
      edges: new Map(), // from -> [{ to, on, label }]
      reverseEdges: new Map(), // to -> [from] for dependency checking
    };

    if (!def.edges || !Array.isArray(def.edges)) {
      throw new Error(`Workflow ${workflowId} must have edges array`);
    }

    for (const edge of def.edges) {
      const { from, to, on = null, label = null } = edge;

      if (!graph.edges.has(from)) {
        graph.edges.set(from, []);
      }
      graph.edges.get(from).push({ to, on, label });

      if (!graph.reverseEdges.has(to)) {
        graph.reverseEdges.set(to, []);
      }
      graph.reverseEdges.get(to).push(from);
    }

    return graph;
  }

  /**
   * Check if a node is an end node
   */
  isEndNode(node) {
    return node?.type === "end";
  }

  /**
   * Evaluate which edge to take based on result and retry count
   */
  evaluateEdge(workflowId, currentStep, result, retryCount = 0) {
    const graph = this.buildEdgeGraph(workflowId);
    const outgoingEdges = graph.edges.get(currentStep) || [];
    const currentNode = graph.nodes[currentStep];

    if (outgoingEdges.length === 0) {
      return {
        nextStep: null,
        action: "no_outgoing_edges",
        currentStep,
      };
    }

    const maxRetries = currentNode?.maxRetries || 0;
    const unconditionalEdges = outgoingEdges.filter((e) => !e.on);
    const matchingEdges = outgoingEdges.filter((e) => e.on === result);

    // No result provided - use unconditional edge
    if (!result && unconditionalEdges.length > 0) {
      const edge = unconditionalEdges[0];
      return {
        nextStep: edge.to,
        action: "unconditional",
        edge,
      };
    }

    // No matching edges at all
    if (matchingEdges.length === 0 && unconditionalEdges.length === 0) {
      return {
        nextStep: null,
        action: "no_matching_edge",
        currentStep,
        result,
        retryCount,
        availableEdges: outgoingEdges.map((e) => ({ to: e.to, on: e.on })),
      };
    }

    // Separate retry edges (to non-end) from escalation edges (to end)
    const retryEdges = matchingEdges.filter(
      (e) => !this.isEndNode(graph.nodes[e.to])
    );
    const escalateEdges = matchingEdges.filter((e) =>
      this.isEndNode(graph.nodes[e.to])
    );

    // Handle failed with both retry and escalation paths
    if (result === "failed" && retryEdges.length > 0 && escalateEdges.length > 0) {
      if (retryCount < maxRetries) {
        const edge = retryEdges[0];
        return {
          nextStep: edge.to,
          action: "retry",
          retriesUsed: retryCount + 1,
          retriesRemaining: maxRetries - retryCount - 1,
          maxRetries,
          edge,
        };
      } else {
        const edge = escalateEdges[0];
        return {
          nextStep: edge.to,
          action: "escalate",
          reason: "max_retries_exceeded",
          retriesUsed: retryCount,
          maxRetries,
          edge,
        };
      }
    }

    // Single matching conditional edge
    if (matchingEdges.length > 0) {
      const edge = matchingEdges[0];
      return {
        nextStep: edge.to,
        action: "conditional",
        condition: result,
        edge,
      };
    }

    // Fall back to unconditional
    if (unconditionalEdges.length > 0) {
      const edge = unconditionalEdges[0];
      return {
        nextStep: edge.to,
        action: "unconditional",
        edge,
      };
    }

    return {
      nextStep: null,
      action: "no_matching_edge",
      currentStep,
      result,
      retryCount,
    };
  }
}
