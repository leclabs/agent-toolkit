/**
 * dialog.js - Pure dialog builder module
 *
 * Builds dialog structures for workflow selection.
 * No I/O operations - just data transformation.
 */

/**
 * Build an option object from a workflow
 * @param {Object} workflow - Workflow summary object
 * @returns {Object} Option for dialog
 */
function buildOption(workflow) {
  return {
    label: workflow.name,
    description: `${workflow.description} (${workflow.stepCount} steps)`,
  };
}

/**
 * Build workflow selection dialog structure
 *
 * @param {Array} workflows - Array of workflow summaries from store.listWorkflows()
 * @returns {Object} Dialog structure with workflows and dialog panels
 */
export function buildWorkflowSelectionDialog(workflows) {
  const byId = Object.fromEntries(workflows.map((w) => [w.id, w]));

  const opt = (id) => (byId[id] ? buildOption(byId[id]) : null);

  return {
    schemaVersion: 2,
    workflows,
    dialog: [
      {
        question: "Which workflow?",
        header: "Primary",
        multiSelect: false,
        options: [opt("feature-development"), opt("bug-fix"), opt("context-optimization"), opt("test-coverage")].filter(
          Boolean
        ),
      },
      {
        question: "Or a simpler/specialized workflow?",
        header: "Other",
        multiSelect: false,
        options: [opt("agile-task"), opt("quick-task"), opt("ui-reconstruction")].filter(Boolean),
      },
      {
        question: "Include documentation?",
        header: "Docs",
        multiSelect: false,
        options: [
          { label: "Yes", description: "Generate documentation for the workflow" },
          { label: "No", description: "Skip documentation" },
        ],
      },
    ],
  };
}

// Export helper for testing
export { buildOption };
