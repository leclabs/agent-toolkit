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
 * Primary workflow IDs (shown first in dialog)
 */
const PRIMARY_WORKFLOW_IDS = ["feature-development", "bug-fix", "context-optimization", "test-coverage"];

/**
 * Secondary workflow IDs (shown as alternatives)
 */
const SECONDARY_WORKFLOW_IDS = ["agile-task", "quick-task", "ui-reconstruction"];

/**
 * Build workflow selection dialog structure
 *
 * @param {Array} workflows - Array of workflow summaries from store.listWorkflows()
 * @returns {Object} Dialog structure with workflows and dialog panels
 */
export function buildWorkflowSelectionDialog(workflows) {
  const byId = Object.fromEntries(workflows.map((w) => [w.id, w]));

  const opt = (id) => (byId[id] ? buildOption(byId[id]) : null);

  // Build options from known IDs
  const primaryOptions = PRIMARY_WORKFLOW_IDS.map(opt).filter(Boolean);
  const secondaryOptions = SECONDARY_WORKFLOW_IDS.map(opt).filter(Boolean);

  // Add any workflows not in known lists to "Other"
  const knownIds = new Set([...PRIMARY_WORKFLOW_IDS, ...SECONDARY_WORKFLOW_IDS]);
  const otherWorkflows = workflows.filter((w) => !knownIds.has(w.id));
  const otherOptions = otherWorkflows.map((w) => buildOption(w));

  return {
    schemaVersion: 2,
    workflows,
    dialog: [
      {
        question: "Which workflow?",
        header: "Primary",
        multiSelect: false,
        options: primaryOptions,
      },
      {
        question: "Or a simpler/specialized workflow?",
        header: "Other",
        multiSelect: false,
        options: [...secondaryOptions, ...otherOptions],
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
