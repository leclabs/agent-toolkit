#!/usr/bin/env node
/**
 * Navigator MCP Server (Stateless) v2
 *
 * Provides stateless workflow navigation for the flow plugin.
 * All task state is stored in Claude Code native /tasks via metadata.navigator.
 *
 * Tools:
 * - Navigate: Unified navigation - start, get current, or advance
 * - ListWorkflows: List available workflows
 * - Diagram: Generate mermaid diagram for workflow
 * - CopyWorkflows: Copy workflows from catalog to project
 * - ListCatalog: List workflows available in catalog
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WorkflowEngine } from "./engine.js";
import { generateDiagram } from "./diagram.js";
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, "catalog");

// Project root: from CLI arg (ignore flags starting with -), or current working directory
const cliArg = process.argv[2];
const PROJECT_ROOT = cliArg && !cliArg.startsWith("-") ? resolve(cliArg) : process.cwd();
const FLOW_PATH = join(PROJECT_ROOT, ".flow");
const WORKFLOWS_PATH = join(FLOW_PATH, "workflows");
const DIAGRAMS_PATH = join(FLOW_PATH, "diagrams");

// In-memory workflow store (stateless - no task storage)
class WorkflowStore {
  constructor() {
    this.workflows = new Map();
  }

  loadDefinition(id, workflow) {
    this.workflows.set(id, workflow);
    return id;
  }

  getDefinition(id) {
    return this.workflows.get(id);
  }

  listWorkflows() {
    return Array.from(this.workflows.entries()).map(([id, wf]) => ({
      id,
      name: wf.name || id,
      description: wf.description || "",
      stepCount: Object.keys(wf.nodes || {}).length,
    }));
  }
}

const store = new WorkflowStore();
const engine = new WorkflowEngine(store);

/**
 * Validate workflow schema
 */
function validateWorkflow(id, content) {
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
 * Load workflows from project directory structure: {id}/workflow.json
 */
function loadProjectWorkflows(dirPath) {
  if (!existsSync(dirPath)) return [];

  const loaded = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const id = entry.name;
    const workflowFile = join(dirPath, id, "workflow.json");

    if (!existsSync(workflowFile)) continue;

    try {
      const content = JSON.parse(readFileSync(workflowFile, "utf-8"));
      if (validateWorkflow(id, content)) {
        store.loadDefinition(id, content);
        loaded.push(id);
      }
    } catch (e) {
      console.error(`Error loading workflow ${id}: ${e.message}`);
    }
  }

  return loaded;
}

/**
 * Load workflows from catalog: flat {id}.json files
 */
function loadCatalogWorkflows(dirPath) {
  if (!existsSync(dirPath)) return [];

  const loaded = [];
  const files = readdirSync(dirPath).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const id = file.replace(".json", "");

    try {
      const content = JSON.parse(readFileSync(join(dirPath, file), "utf-8"));
      if (validateWorkflow(id, content)) {
        store.loadDefinition(id, content);
        loaded.push(id);
      }
    } catch (e) {
      console.error(`Error loading catalog workflow ${id}: ${e.message}`);
    }
  }

  return loaded;
}

/**
 * Load workflows: project .flow/workflows/ first (directory structure),
 * then catalog as fallback (flat files)
 */
function loadWorkflows() {
  if (existsSync(WORKFLOWS_PATH)) {
    const projectLoaded = loadProjectWorkflows(WORKFLOWS_PATH);
    if (projectLoaded.length > 0) {
      return { source: "project", loaded: projectLoaded };
    }
  }

  const catalogPath = join(CATALOG_PATH, "workflows");
  const catalogLoaded = loadCatalogWorkflows(catalogPath);
  return { source: "catalog", loaded: catalogLoaded };
}

// Initialize server
const server = new Server({ name: "navigator", version: "2.0.0" }, { capabilities: { tools: {} } });

/**
 * Minimal JSON response
 */
function jsonResponse(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "Navigate",
        description: "Unified workflow navigation. Start a workflow, get current state, or advance to next step.",
        inputSchema: {
          type: "object",
          properties: {
            workflowType: { type: "string", description: "Workflow ID (e.g., 'feature-development')" },
            currentStep: { type: "string", description: "Current step ID. Omit to start at first work step." },
            result: {
              type: "string",
              enum: ["passed", "failed"],
              description: "Result of current step. Omit to just get current state.",
            },
            retryCount: { type: "number", description: "Retry count for current step (default 0)" },
          },
          required: ["workflowType"],
        },
      },
      {
        name: "ListWorkflows",
        description: "List all available workflows. Returns data only, no dialog.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "SelectWorkflow",
        description:
          "Get workflow selection dialog for user interaction. Returns workflows with multi-pane dialog for AskUserQuestion.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "Diagram",
        description: "Generate a mermaid flowchart diagram for a workflow.",
        inputSchema: {
          type: "object",
          properties: {
            workflowType: { type: "string", description: "Workflow ID to visualize" },
            currentStep: { type: "string", description: "Optional: highlight this step" },
          },
          required: ["workflowType"],
        },
      },
      {
        name: "CopyWorkflows",
        description:
          "Copy workflows from catalog to project. Creates workflow directory with workflow.json, README.md, and step instruction files.",
        inputSchema: {
          type: "object",
          properties: {
            workflowIds: {
              type: "array",
              items: { type: "string" },
              description: "Workflow IDs to copy. Empty = all.",
            },
          },
        },
      },
      {
        name: "ListCatalog",
        description: "List workflows available in the catalog.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "Navigate": {
        const result = engine.navigate(
          args.workflowType,
          args.currentStep,
          args.result,
          args.retryCount || 0
        );
        return jsonResponse(result);
      }

      case "ListWorkflows": {
        return jsonResponse({
          schemaVersion: 2,
          workflows: store.listWorkflows(),
        });
      }

      case "SelectWorkflow": {
        const workflows = store.listWorkflows();
        const byId = Object.fromEntries(workflows.map((w) => [w.id, w]));
        const opt = (id) =>
          byId[id]
            ? { label: byId[id].name, description: `${byId[id].description} (${byId[id].stepCount} steps)` }
            : null;

        return jsonResponse({
          schemaVersion: 2,
          workflows,
          dialog: [
            {
              question: "Which workflow?",
              header: "Primary",
              multiSelect: false,
              options: [
                opt("feature-development"),
                opt("bug-fix"),
                opt("context-optimization"),
                opt("test-coverage"),
              ].filter(Boolean),
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
        });
      }

      case "Diagram": {
        const wfDef = store.getDefinition(args.workflowType);
        if (!wfDef) {
          throw new Error(`Workflow '${args.workflowType}' not found`);
        }

        const markdown = generateDiagram(wfDef, args.currentStep);

        // Save diagram to file
        if (!existsSync(DIAGRAMS_PATH)) {
          mkdirSync(DIAGRAMS_PATH, { recursive: true });
        }
        const filePath = join(DIAGRAMS_PATH, `${args.workflowType}.md`);
        writeFileSync(filePath, markdown);

        return jsonResponse({ savedTo: filePath });
      }

      case "CopyWorkflows": {
        const catalogPath = join(CATALOG_PATH, "workflows");
        if (!existsSync(catalogPath)) {
          throw new Error("Catalog workflows directory not found");
        }

        if (!existsSync(WORKFLOWS_PATH)) {
          mkdirSync(WORKFLOWS_PATH, { recursive: true });
        }

        // Write .flow/README.md (root flow documentation)
        writeFileSync(join(FLOW_PATH, "README.md"), generateFlowReadme());

        // Write .flow/workflows/README.md (workflow-specific documentation)
        writeFileSync(join(WORKFLOWS_PATH, "README.md"), generateWorkflowsReadme());

        const catalogFiles = readdirSync(catalogPath).filter((f) => f.endsWith(".json"));
        const workflowIds =
          args.workflowIds?.length > 0 ? args.workflowIds : catalogFiles.map((f) => f.replace(".json", ""));

        const copied = [];
        const errors = [];

        for (const id of workflowIds) {
          const srcFile = join(catalogPath, `${id}.json`);

          if (!existsSync(srcFile)) {
            errors.push({ id, error: "not found in catalog" });
            continue;
          }

          try {
            const content = JSON.parse(readFileSync(srcFile, "utf-8"));
            if (!content.nodes || !content.edges) {
              errors.push({ id, error: "invalid schema" });
              continue;
            }

            // Create workflow directory
            const workflowDir = join(WORKFLOWS_PATH, id);
            mkdirSync(workflowDir, { recursive: true });

            // Write workflow.json
            writeFileSync(join(workflowDir, "workflow.json"), JSON.stringify(content, null, 2));

            // Load into memory
            store.loadDefinition(id, content);
            copied.push(id);
          } catch (e) {
            errors.push({ id, error: e.message });
          }
        }

        return jsonResponse({
          schemaVersion: 2,
          copied,
          errors: errors.length > 0 ? errors : undefined,
          path: WORKFLOWS_PATH,
        });
      }

      case "ListCatalog": {
        const catalogPath = join(CATALOG_PATH, "workflows");
        if (!existsSync(catalogPath)) {
          return jsonResponse({ schemaVersion: 2, workflows: [], selectionOptions: [] });
        }

        const workflows = [];
        const files = readdirSync(catalogPath).filter((f) => f.endsWith(".json"));

        for (const file of files) {
          try {
            const content = JSON.parse(readFileSync(join(catalogPath, file), "utf-8"));
            workflows.push({
              id: content.id || file.replace(".json", ""),
              name: content.name || content.id,
              description: content.description || "",
              stepCount: Object.keys(content.nodes || {}).length,
            });
          } catch {
            // Skip invalid files
          }
        }

        // Build AskUserQuestion-ready options with "All" first
        const selectionOptions = [
          {
            label: "All workflows (Recommended)",
            description: `Copy all ${workflows.length} workflows to your project`,
          },
          ...workflows.map((wf) => ({
            label: wf.name,
            description: `${wf.description} (${wf.stepCount} steps)`,
          })),
        ];

        return jsonResponse({ schemaVersion: 2, workflows, selectionOptions });
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return jsonResponse({
      schemaVersion: 2,
      error: error.message,
      tool: name,
      args,
    });
  }
});

/**
 * Generate root README.md for .flow/workflows/
 */
function generateWorkflowsReadme() {
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
 * Generate root README.md for .flow/
 */
function generateFlowReadme() {
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
 * Ensure .flow/README.md exists (created on MCP server connect)
 */
function ensureFlowReadme() {
  const readmePath = join(FLOW_PATH, "README.md");
  if (!existsSync(readmePath)) {
    mkdirSync(FLOW_PATH, { recursive: true });
    writeFileSync(readmePath, generateFlowReadme());
    console.error(`  Created: ${readmePath}`);
  }
}

// Load workflows and start server
const workflowInfo = loadWorkflows();
ensureFlowReadme();

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`Navigator MCP Server v2 running (stateless)`);
console.error(`  Project: ${PROJECT_ROOT}`);
console.error(`  Workflows: ${workflowInfo.loaded.length} from ${workflowInfo.source}`);
if (workflowInfo.loaded.length > 0) {
  console.error(`  Loaded: ${workflowInfo.loaded.join(", ")}`);
}
