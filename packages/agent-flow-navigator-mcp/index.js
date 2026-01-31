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
 * - LoadWorkflows: Load workflows from a directory at runtime (external plugins or project reload)
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
 * Load external workflows from a directory: flat {id}.json files
 * Used by the LoadWorkflows tool at runtime.
 * @param {string} dirPath - Directory containing {id}.json workflow files
 * @param {string} sourceRoot - Root path for resolving ./ context_files
 * @returns {string[]} Array of loaded workflow IDs
 */
function loadExternalWorkflows(dirPath, sourceRoot) {
  if (!existsSync(dirPath)) return [];

  const loaded = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Flat format: {id}.json
    if (entry.isFile() && entry.name.endsWith(".json")) {
      const id = entry.name.replace(".json", "");
      try {
        const content = JSON.parse(readFileSync(join(dirPath, entry.name), "utf-8"));
        if (validateWorkflow(id, content)) {
          store.loadDefinition(id, content, "external", sourceRoot);
          loaded.push(id);
        }
      } catch (e) {
        console.error(`Error loading external workflow ${id}: ${e.message}`);
      }
      continue;
    }

    // Directory format: {id}/workflow.json
    if (entry.isDirectory()) {
      const wfFile = join(dirPath, entry.name, "workflow.json");
      if (!existsSync(wfFile)) continue;
      const id = entry.name;
      try {
        const content = JSON.parse(readFileSync(wfFile, "utf-8"));
        if (validateWorkflow(id, content)) {
          store.loadDefinition(id, content, "external", sourceRoot);
          loaded.push(id);
        }
      } catch (e) {
        console.error(`Error loading external workflow ${id}: ${e.message}`);
      }
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

  return {
    catalog: catalogLoaded,
    loaded: catalogLoaded,
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
            autonomy: {
              type: "boolean",
              description:
                "When true, auto-continue through stage boundary end nodes (non-HITL end nodes with outgoing edges).",
            },
            stepId: {
              type: "string",
              description:
                "Start at a specific step instead of the beginning (mid-flow recovery). Only used when starting a workflow (no taskFilePath). Ignored during advance.",
            },
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
              description: "Workflow IDs to copy. Required. Use ListCatalog to see available workflows.",
            },
          },
        },
      },
      {
        name: "LoadWorkflows",
        description:
          "Load workflows at runtime. External plugins pass path + sourceRoot. For project workflows, pass workflowIds to load specific workflows from .flow/workflows/.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Directory containing {id}.json workflow files. For external plugins only.",
            },
            sourceRoot: {
              type: "string",
              description:
                "Root path for resolving ./ context_files entries. Defaults to path. For external plugins only.",
            },
            workflowIds: {
              type: "array",
              items: { type: "string" },
              description:
                "Specific workflow IDs to load from .flow/workflows/. Required when loading project workflows (no path). Omit to list available workflows without loading.",
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
          autonomy: args.autonomy,
          stepId: args.stepId,
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
            store.loadDefinition(id, content, "project", PROJECT_ROOT);
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

      case "LoadWorkflows": {
        if (args.path) {
          // External plugin: load all from provided path
          const dirPath = resolve(args.path);
          const root = args.sourceRoot ? resolve(args.sourceRoot) : dirPath;
          const loaded = loadExternalWorkflows(dirPath, root);
          return jsonResponse({
            schemaVersion: 2,
            loaded,
            source: "external",
            sourceRoot: root,
            path: dirPath,
          });
        }

        // Project: require explicit workflowIds or list available
        if (!existsSync(WORKFLOWS_PATH)) {
          return jsonResponse({
            schemaVersion: 2,
            available: [],
            loaded: [],
            source: "project",
            path: WORKFLOWS_PATH,
            hint: "No .flow/workflows/ directory found. Use /flow:init to set up workflows.",
          });
        }

        const available = readdirSync(WORKFLOWS_PATH, { withFileTypes: true })
          .filter((e) => e.isDirectory() && existsSync(join(WORKFLOWS_PATH, e.name, "workflow.json")))
          .map((e) => e.name);

        if (!args.workflowIds || args.workflowIds.length === 0) {
          // List only — don't load
          return jsonResponse({
            schemaVersion: 2,
            available,
            loaded: [],
            source: "project",
            path: WORKFLOWS_PATH,
            hint: "Pass workflowIds to load specific workflows.",
          });
        }

        // Load only the requested workflows
        const loaded = [];
        const errors = [];
        for (const id of args.workflowIds) {
          if (!available.includes(id)) {
            errors.push({ id, error: "not found in .flow/workflows/" });
            continue;
          }
          const wfFile = join(WORKFLOWS_PATH, id, "workflow.json");
          try {
            const content = JSON.parse(readFileSync(wfFile, "utf-8"));
            if (validateWorkflow(id, content)) {
              store.loadDefinition(id, content, "project", PROJECT_ROOT);
              loaded.push(id);
            } else {
              errors.push({ id, error: "invalid schema" });
            }
          } catch (e) {
            errors.push({ id, error: e.message });
          }
        }

        return jsonResponse({
          schemaVersion: 2,
          available,
          loaded,
          errors: errors.length > 0 ? errors : undefined,
          source: "project",
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

// Load catalog workflows and start server
const workflowInfo = loadWorkflows();

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`Navigator MCP Server v2 running (stateless)`);
console.error(`  Project: ${PROJECT_ROOT}`);
console.error(`  Catalog: ${workflowInfo.catalog.length} workflows`);
console.error(`  Project/external workflows: load via LoadWorkflows tool`);
