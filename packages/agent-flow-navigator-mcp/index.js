#!/usr/bin/env node
/**
 * Navigator MCP Server v3
 *
 * Provides stateless workflow navigation for the flow plugin.
 * All task state is stored in Claude Code native /tasks via metadata.
 *
 * Navigation Tools (explicit, single-purpose):
 * - Start: Initialize workflow on task at any step
 * - Current: Read current position (read-only)
 * - Next: Advance based on outcome
 *
 * Management Tools:
 * - ListWorkflows: List available workflows
 * - Diagram: Generate mermaid diagram for workflow
 * - CopyWorkflows: Copy workflows from catalog to project
 * - CopyAgents: Copy agent templates from catalog to project
 * - LoadWorkflows: Load workflows at runtime
 * - ListCatalog: List catalog contents
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
  isValidAgentForCopy,
  computeAgentsToCopy,
} from "./copier.js";
import {
  buildWorkflowSummary,
  buildAgentSummary,
  parseFrontmatter,
  buildCatalogResponse,
  buildEmptyCatalogResponse,
} from "./catalog.js";
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, statSync } from "fs";
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
 * Load external workflows from a directory
 */
function loadExternalWorkflows(dirPath, sourceRoot) {
  if (!existsSync(dirPath)) return [];

  const loaded = [];
  const names = readdirSync(dirPath);

  for (const name of names) {
    const fullPath = join(dirPath, name);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    // Flat format: {id}.json
    if (stat.isFile() && name.endsWith(".json")) {
      const id = name.replace(".json", "");
      try {
        const content = JSON.parse(readFileSync(fullPath, "utf-8"));
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
    if (stat.isDirectory()) {
      const wfFile = join(fullPath, "workflow.json");
      if (!existsSync(wfFile)) continue;
      const id = name;
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

// Initialize server
const server = new Server({ name: "navigator", version: "3.0.0" }, { capabilities: { tools: {} } });

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
      // Navigation tools - explicit, single-purpose
      {
        name: "Start",
        description: "Initialize workflow on task. Returns current step info and outgoing edges.",
        inputSchema: {
          type: "object",
          properties: {
            taskFilePath: {
              type: "string",
              description: "Path to task file (writes workflow state)",
            },
            workflowType: {
              type: "string",
              description: "Workflow ID (e.g., 'feature-development')",
            },
            description: {
              type: "string",
              description: "User's task description",
            },
            stepId: {
              type: "string",
              description: "Start at specific step (for mid-flow recovery or child tasks)",
            },
          },
          required: ["workflowType"],
        },
      },
      {
        name: "Current",
        description: "Read current workflow position (read-only). Returns step info and outgoing edges.",
        inputSchema: {
          type: "object",
          properties: {
            taskFilePath: {
              type: "string",
              description: "Path to task file",
            },
          },
          required: ["taskFilePath"],
        },
      },
      {
        name: "Next",
        description: "Advance workflow based on step outcome. Returns new step info and outgoing edges.",
        inputSchema: {
          type: "object",
          properties: {
            taskFilePath: {
              type: "string",
              description: "Path to task file",
            },
            result: {
              type: "string",
              enum: ["passed", "failed"],
              description: "Outcome of current step",
            },
          },
          required: ["taskFilePath", "result"],
        },
      },
      // Management tools
      {
        name: "ListWorkflows",
        description: "List available workflows. Filters by source when project workflows exist.",
        inputSchema: {
          type: "object",
          properties: {
            source: {
              type: "string",
              enum: ["all", "project", "catalog", "external"],
              description: "Filter by source. Default: 'project' if project workflows exist, else 'all'.",
            },
          },
        },
      },
      {
        name: "SelectWorkflow",
        description: "Get workflow selection dialog for user interaction.",
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
              description: "Optional: path to save diagram. Defaults to .flow/diagrams/{workflowType}.md",
            },
          },
          required: ["workflowType"],
        },
      },
      {
        name: "CopyWorkflows",
        description: "Copy workflows from catalog to project.",
        inputSchema: {
          type: "object",
          properties: {
            workflowIds: {
              type: "array",
              items: { type: "string" },
              description: "Workflow IDs to copy. Use ListCatalog to see available.",
            },
          },
        },
      },
      {
        name: "CopyAgents",
        description: "Copy agent templates from catalog to project.",
        inputSchema: {
          type: "object",
          properties: {
            agentIds: {
              type: "array",
              items: { type: "string" },
              description: "Agent IDs to copy. Use ListCatalog to see available.",
            },
            targetDir: {
              type: "string",
              description: "Target directory. Defaults to .claude/agents/",
            },
          },
        },
      },
      {
        name: "LoadWorkflows",
        description: "Load workflows at runtime from project or external plugin.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Source root of external plugin. Workflows loaded from <path>/.flow/workflows/.",
            },
            sourceRoot: {
              type: "string",
              description: "Root for resolving ./ paths. When provided, path is treated as direct workflow directory.",
            },
            workflowIds: {
              type: "array",
              items: { type: "string" },
              description: "Workflow IDs to load from .flow/workflows/. Omit to list available.",
            },
          },
        },
      },
      {
        name: "ListCatalog",
        description: "List workflows and agents available in the catalog.",
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
      // Navigation tools
      case "Start": {
        const result = engine.start({
          taskFilePath: args.taskFilePath,
          workflowType: args.workflowType,
          description: args.description,
          stepId: args.stepId,
        });
        return jsonResponse(result);
      }

      case "Current": {
        const result = engine.current({
          taskFilePath: args.taskFilePath,
        });
        return jsonResponse(result);
      }

      case "Next": {
        const result = engine.next({
          taskFilePath: args.taskFilePath,
          result: args.result,
        });
        return jsonResponse(result);
      }

      // Management tools
      case "ListWorkflows": {
        const hasProject = store.hasProjectWorkflows();
        const filter = args.source || (hasProject ? "project" : "all");
        const workflows = store.listWorkflows(filter);
        return jsonResponse({
          schemaVersion: 3,
          workflows,
          filter,
          hasProjectWorkflows: hasProject,
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

            const workflowDir = join(WORKFLOWS_PATH, id);
            mkdirSync(workflowDir, { recursive: true });
            writeFileSync(join(workflowDir, "workflow.json"), JSON.stringify(content, null, 2));

            store.loadDefinition(id, content, "project", PROJECT_ROOT);
            copied.push(id);
          } catch (e) {
            errors.push({ id, error: e.message });
          }
        }

        return jsonResponse({
          schemaVersion: 3,
          copied,
          errors: errors.length > 0 ? errors : undefined,
          path: WORKFLOWS_PATH,
        });
      }

      case "CopyAgents": {
        const catalogAgentsPath = join(CATALOG_PATH, "agents");
        if (!existsSync(catalogAgentsPath)) {
          throw new Error("Catalog agents directory not found");
        }

        const targetDir = args.targetDir ? resolve(args.targetDir) : join(PROJECT_ROOT, ".claude", "agents");
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        const catalogAgentFiles = readdirSync(catalogAgentsPath).filter((f) => f.endsWith(".md"));
        const availableIds = catalogAgentFiles.map((f) => f.replace(".md", ""));
        const agentIds = computeAgentsToCopy(args.agentIds, availableIds);

        const copied = [];
        const errors = [];

        for (const id of agentIds) {
          const srcFile = join(catalogAgentsPath, `${id}.md`);

          if (!existsSync(srcFile)) {
            errors.push({ id, error: "not found in catalog" });
            continue;
          }

          try {
            const content = readFileSync(srcFile, "utf-8");
            if (!isValidAgentForCopy(content)) {
              errors.push({ id, error: "invalid agent template" });
              continue;
            }

            writeFileSync(join(targetDir, `${id}.md`), content);
            copied.push(id);
          } catch (e) {
            errors.push({ id, error: e.message });
          }
        }

        return jsonResponse({
          schemaVersion: 3,
          copied,
          errors: errors.length > 0 ? errors : undefined,
          path: targetDir,
        });
      }

      case "LoadWorkflows": {
        if (args.path) {
          const pathArg = resolve(args.path);
          const dirPath = args.sourceRoot ? pathArg : join(pathArg, ".flow", "workflows");
          const root = args.sourceRoot ? resolve(args.sourceRoot) : pathArg;
          const loaded = loadExternalWorkflows(dirPath, root);
          return jsonResponse({ loaded: loaded.length });
        }

        if (!existsSync(WORKFLOWS_PATH)) {
          return jsonResponse({ available: [], hint: "Run CopyWorkflows first" });
        }

        const availableMap = new Map();
        const names = readdirSync(WORKFLOWS_PATH);
        for (const name of names) {
          const fullPath = join(WORKFLOWS_PATH, name);
          let stat;
          try {
            stat = statSync(fullPath);
          } catch {
            continue;
          }
          if (stat.isFile() && name.endsWith(".json")) {
            availableMap.set(name.replace(".json", ""), fullPath);
            continue;
          }
          if (stat.isDirectory()) {
            const wfFile = join(fullPath, "workflow.json");
            if (existsSync(wfFile)) {
              availableMap.set(name, wfFile);
            }
          }
        }
        const available = [...availableMap.keys()];

        if (!args.workflowIds || args.workflowIds.length === 0) {
          return jsonResponse({ available, hint: "Pass workflowIds to load." });
        }

        const loaded = [];
        const errors = [];
        for (const id of args.workflowIds) {
          const wfFile = availableMap.get(id);
          if (!wfFile) {
            errors.push({ id, error: "not found in .flow/workflows/" });
            continue;
          }
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
          loaded: loaded.length,
          errors: errors.length > 0 ? errors : undefined,
        });
      }

      case "ListCatalog": {
        const catalogWorkflowsPath = join(CATALOG_PATH, "workflows");
        const catalogAgentsPath = join(CATALOG_PATH, "agents");

        const workflows = [];
        if (existsSync(catalogWorkflowsPath)) {
          const files = readdirSync(catalogWorkflowsPath).filter((f) => f.endsWith(".json"));
          for (const file of files) {
            try {
              const content = JSON.parse(readFileSync(join(catalogWorkflowsPath, file), "utf-8"));
              workflows.push(buildWorkflowSummary(file.replace(".json", ""), content));
            } catch {
              // Skip invalid files
            }
          }
        }

        const agents = [];
        if (existsSync(catalogAgentsPath)) {
          const agentFiles = readdirSync(catalogAgentsPath).filter((f) => f.endsWith(".md"));
          for (const file of agentFiles) {
            try {
              const content = readFileSync(join(catalogAgentsPath, file), "utf-8");
              const frontmatter = parseFrontmatter(content);
              agents.push(buildAgentSummary(file.replace(".md", ""), frontmatter));
            } catch {
              // Skip invalid files
            }
          }
        }

        if (workflows.length === 0 && agents.length === 0) {
          return jsonResponse(buildEmptyCatalogResponse());
        }

        return jsonResponse(buildCatalogResponse(workflows, agents));
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return jsonResponse({
      schemaVersion: 3,
      error: error.message,
      tool: name,
      args,
    });
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`Navigator MCP Server v3 running`);
console.error(`  Project: ${PROJECT_ROOT}`);
console.error(`  Tools: Start, Current, Next, ListWorkflows, Diagram, ...`);
