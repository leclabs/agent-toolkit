/**
 * diagram.js - Pure diagram generation module
 *
 * Generates mermaid flowchart diagrams from workflow definitions.
 * No I/O operations - file saving handled by MCP handler.
 */

import { isTerminalNode, getTerminalType } from "./engine.js";

/**
 * Sanitize a label for mermaid flowcharts
 */
function sanitizeMermaidLabel(label, maxLen = 40) {
  if (!label) return "";
  let clean = label
    .replace(/"/g, "'")
    .replace(/[&]/g, "and")
    .replace(/[<>]/g, "")
    .replace(/[[\]{}()]/g, "")
    .replace(/[|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length > maxLen) {
    clean = clean.substring(0, maxLen - 3) + "...";
  }
  return clean;
}

/**
 * Sanitize edge labels for mermaid
 */
function sanitizeEdgeLabel(on) {
  if (!on) return "";
  return on.replace(/[|"]/g, "");
}

/**
 * Generate a mermaid flowchart diagram from a workflow definition
 *
 * @param {Object} workflowDef - The workflow definition object
 * @param {string} [currentStep] - Optional step ID to highlight
 * @returns {string} Markdown string with mermaid diagram and step instructions table
 */
export function generateDiagram(workflowDef, currentStep = null) {
  const { nodes, edges } = workflowDef;

  // Build mermaid diagram
  const lines = ["flowchart TD"];

  for (const [stepId, step] of Object.entries(nodes)) {
    const label = sanitizeMermaidLabel(step.name || step.description || stepId);
    const agentParts = [step.emoji, step.agent].filter(Boolean);
    const retryTag = step.maxRetries ? ` ↻${step.maxRetries}` : "";
    const agent = agentParts.length
      ? `<br/><small>${agentParts.join(" ")}${retryTag}</small>`
      : retryTag
        ? `<br/><small>${retryTag.trim()}</small>`
        : "";
    const termType = getTerminalType(step);
    if (termType === "start") {
      lines.push(`    ${stepId}(("${label}"))`);
    } else if (termType === "success") {
      lines.push(`    ${stepId}[["${label}"]]`);
    } else if (termType === "hitl") {
      lines.push(`    ${stepId}{{"✋ ${label}"}}`);
    } else if (termType === "failure") {
      lines.push(`    ${stepId}{{"${label}"}}`);
    } else if (step.type === "fork" || step.type === "join") {
      lines.push(`    ${stepId}(["${label}"])`);
    } else if (step.type === "gate") {
      lines.push(`    ${stepId}{"${label}${agent}"}`);
    } else {
      lines.push(`    ${stepId}["${label}${agent}"]`);
    }
  }

  lines.push("");

  for (const edge of edges) {
    const { from, to, on, label } = edge;
    const edgeLabel = sanitizeEdgeLabel(label || on);
    if (edgeLabel) {
      lines.push(`    ${from} -->|${edgeLabel}| ${to}`);
    } else {
      lines.push(`    ${from} --> ${to}`);
    }
  }

  lines.push("");
  lines.push("    classDef startStep fill:#90EE90,stroke:#228B22");
  lines.push("    classDef successStep fill:#87CEEB,stroke:#4169E1");
  lines.push("    classDef hitlStep fill:#FFB6C1,stroke:#DC143C");
  lines.push("    classDef gateStep fill:#E6E6FA,stroke:#9370DB");
  lines.push("    classDef forkJoinStep fill:#FFEAA7,stroke:#FDCB6E");
  lines.push("    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px");

  const startSteps = Object.entries(nodes)
    .filter(([, s]) => getTerminalType(s) === "start")
    .map(([id]) => id);
  const successSteps = Object.entries(nodes)
    .filter(([, s]) => getTerminalType(s) === "success")
    .map(([id]) => id);
  const hitlSteps = Object.entries(nodes)
    .filter(([, s]) => getTerminalType(s) === "hitl" || getTerminalType(s) === "failure")
    .map(([id]) => id);
  const gateSteps = Object.entries(nodes)
    .filter(([, s]) => s.type === "gate")
    .map(([id]) => id);

  const forkJoinSteps = Object.entries(nodes)
    .filter(([, s]) => s.type === "fork" || s.type === "join")
    .map(([id]) => id);

  if (startSteps.length) lines.push(`    class ${startSteps.join(",")} startStep`);
  if (successSteps.length) lines.push(`    class ${successSteps.join(",")} successStep`);
  if (hitlSteps.length) lines.push(`    class ${hitlSteps.join(",")} hitlStep`);
  if (gateSteps.length) lines.push(`    class ${gateSteps.join(",")} gateStep`);
  if (forkJoinSteps.length) lines.push(`    class ${forkJoinSteps.join(",")} forkJoinStep`);

  if (currentStep && nodes[currentStep]) {
    lines.push(`    class ${currentStep} currentStep`);
  }

  // Build instructions table
  const tableRows = [];
  tableRows.push("| Stage | Step | Name | Agent | Instructions |");
  tableRows.push("|-------|------|------|-------|--------------|");

  // Group steps by stage for organized display - filter out terminal/start/end and fork/join nodes
  const stepEntries = Object.entries(nodes).filter(
    ([, step]) => !isTerminalNode(step) && step.type !== "fork" && step.type !== "join"
  );

  for (const [stepId, step] of stepEntries) {
    const stage = step.stage || "-";
    const name = step.name || stepId;
    const agent = step.agent ? [step.emoji, step.agent].filter(Boolean).join(" ") : "-";
    const instructions = step.instructions || step.description || "-";
    // Escape pipes in table cells
    const safeInstructions = instructions.replace(/\|/g, "\\|");
    tableRows.push(`| ${stage} | ${stepId} | ${name} | ${agent} | ${safeInstructions} |`);
  }

  // Assemble output with markdown code block for mermaid
  return [
    `## Workflow: ${workflowDef.name || workflowDef.id}`,
    "",
    workflowDef.description || "",
    "",
    "### Diagram",
    "",
    "```mermaid",
    ...lines,
    "```",
    "",
    "### Step Instructions",
    "",
    ...tableRows,
    "",
  ].join("\n");
}

// Export helpers for testing
export { sanitizeMermaidLabel, sanitizeEdgeLabel };
