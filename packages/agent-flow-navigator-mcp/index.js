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
import { WorkflowStore, validateWorkflow } from "./store.js";
import { buildWorkflowSelectionDialog } from "./dialog.js";
import {
  generateFlowReadme,
  generateWorkflowsReadme,
  isValidWorkflowForCopy,
  computeWorkflowsToCopy,
} from "./copier.js";
import { buildWorkflowSummary, buildCatalogResponse, buildEmptyCatalogResponse } from "./catalog.js";
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

const store = new WorkflowStore();
const engine = new WorkflowEngine(store);

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
        store.loadDefinition(id, content, "project");
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
        store.loadDefinition(id, content, "catalog");
        loaded.push(id);
      }
    } catch (e) {
      console.error(`Error loading catalog workflow ${id}: ${e.message}`);
    }
  }

  return loaded;
}

/**
 * Load workflows: catalog first, then project overwrites (project takes precedence)
 */
function loadWorkflows() {
  const catalogPath = join(CATALOG_PATH, "workflows");
  const catalogLoaded = loadCatalogWorkflows(catalogPath);

  const projectLoaded = existsSync(WORKFLOWS_PATH) ? loadProjectWorkflows(WORKFLOWS_PATH) : [];

  // Determine which IDs came from where (project overwrites catalog)
  const fromCatalog = catalogLoaded.filter((id) => !projectLoaded.includes(id));
  const fromProject = projectLoaded;

  return {
    catalog: fromCatalog,
    project: fromProject,
    loaded: [...new Set([...catalogLoaded, ...projectLoaded])],
  };
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
            taskFilePath: {
              type: "string",
              description: "Path to task file (for advance/current). Reads workflow state from task metadata.",
            },
            workflowType: { type: "string", description: "Workflow ID (for start only, e.g., 'feature-development')" },
            result: {
              type: "string",
              enum: ["passed", "failed"],
              description: "Step result (for advance). Omit to just get current state.",
            },
            description: { type: "string", description: "User's task description (for start)" },
          },
        },
      },
      {
        name: "ListWorkflows",
        description: "List available workflows. Filters by source when project workflows exist.",
        inputSchema: {
          type: "object",
          properties: {
            source: {
              type: "string",
              enum: ["all", "project", "catalog"],
              description: "Filter by source. Default: 'project' if project workflows exist, else 'all'.",
            },
          },
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
            filePath: {
              type: "string",
              description: "Optional: absolute path to save the diagram. Defaults to .flow/diagrams/{workflowType}.md",
            },
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
        const result = engine.navigate({
          taskFilePath: args.taskFilePath,
          workflowType: args.workflowType,
          result: args.result,
          description: args.description,
          projectRoot: PROJECT_ROOT,
        });
        return jsonResponse(result);
      }

      case "ListWorkflows": {
        // Default to project-only if project workflows exist
        const hasProject = store.hasProjectWorkflows();
        const filter = args.source || (hasProject ? "project" : "all");
        const workflows = store.listWorkflows(filter);
        return jsonResponse({
          schemaVersion: 2,
          workflows,
          filter,
          hasProjectWorkflows: hasProject,
          hint:
            hasProject && filter === "project"
              ? "Showing project workflows. Use source='all' to include catalog."
              : undefined,
        });
      }

      case "SelectWorkflow": {
        const workflows = store.listWorkflows();
        return jsonResponse(buildWorkflowSelectionDialog(workflows));
      }

      case "Diagram": {
        const wfDef = store.getDefinition(args.workflowType);
        if (!wfDef) {
          throw new Error(`Workflow '${args.workflowType}' not found`);
        }

        const source = store.getSource(args.workflowType);
        const markdown = generateDiagram(wfDef, args.currentStep);

        // Save diagram to file (use provided path or default)
        const filePath = args.filePath || join(DIAGRAMS_PATH, `${args.workflowType}.md`);
        const fileDir = dirname(filePath);
        if (!existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true });
        }
        writeFileSync(filePath, markdown);

        return jsonResponse({ savedTo: filePath, source });
      }

      case "CopyWorkflows": {
        const catalogPath = join(CATALOG_PATH, "workflows");
        if (!existsSync(catalogPath)) {
          throw new Error("Catalog workflows directory not found");
        }

        if (!existsSync(WORKFLOWS_PATH)) {
          mkdirSync(WORKFLOWS_PATH, { recursive: true });
        }

        // Write README files
        writeFileSync(join(FLOW_PATH, "README.md"), generateFlowReadme());
        writeFileSync(join(WORKFLOWS_PATH, "README.md"), generateWorkflowsReadme());

        const catalogFiles = readdirSync(catalogPath).filter((f) => f.endsWith(".json"));
        const availableIds = catalogFiles.map((f) => f.replace(".json", ""));
        const workflowIds = computeWorkflowsToCopy(args.workflowIds, availableIds);

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
            if (!isValidWorkflowForCopy(content)) {
              errors.push({ id, error: "invalid schema" });
              continue;
            }

            // Create workflow directory and write workflow.json
            const workflowDir = join(WORKFLOWS_PATH, id);
            mkdirSync(workflowDir, { recursive: true });
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
          return jsonResponse(buildEmptyCatalogResponse());
        }

        const workflows = [];
        const files = readdirSync(catalogPath).filter((f) => f.endsWith(".json"));

        for (const file of files) {
          try {
            const content = JSON.parse(readFileSync(join(catalogPath, file), "utf-8"));
            workflows.push(buildWorkflowSummary(file.replace(".json", ""), content));
          } catch {
            // Skip invalid files
          }
        }

        return jsonResponse(buildCatalogResponse(workflows));
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
console.error(`  Workflows: ${workflowInfo.loaded.length} total`);
if (workflowInfo.catalog.length > 0) {
  console.error(`    Catalog: ${workflowInfo.catalog.join(", ")}`);
}
if (workflowInfo.project.length > 0) {
  console.error(`    Project: ${workflowInfo.project.join(", ")}`);
}
