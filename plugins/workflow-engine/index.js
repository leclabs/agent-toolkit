import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WorkflowStore } from "./store.js";
import { WorkflowEngine } from "./engine.js";

const store = new WorkflowStore();
const engine = new WorkflowEngine(store);

// Initialize server
const server = new Server(
  {
    name: "workflow-engine",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_workflows",
        description: "List all loaded workflow definitions",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "load_workflow",
        description: "Load a workflow definition from JSON",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            definition: { type: "object" },
          },
          required: ["id", "definition"],
        },
      },
      {
        name: "start_workflow",
        description: "Start a new run of a workflow",
        inputSchema: {
          type: "object",
          properties: { workflowId: { type: "string" } },
          required: ["workflowId"],
        },
      },
      {
        name: "get_run_status",
        description: "Get full status of a workflow run",
        inputSchema: {
          type: "object",
          properties: { runId: { type: "string" } },
          required: ["runId"],
        },
      },
      {
        name: "get_next_tasks",
        description: "Get list of tasks that are READY and HIGH PRIORITY",
        inputSchema: {
          type: "object",
          properties: { runId: { type: "string" } },
          required: ["runId"],
        },
      },
      {
        // Pure state mutation tool
        name: "mutate_task",
        description: "Update the status of a specific task (e.g., mark COMPLETE, FAILED, PAUSED)",
        inputSchema: {
          type: "object",
          properties: {
            runId: { type: "string" },
            taskId: { type: "string" },
            status: {
              type: "string",
              enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "PAUSED", "SKIPPED", "CANCELED"],
            },
            output: { type: "string" },
            error: { type: "string" },
          },
          required: ["runId", "taskId", "status"],
        },
      },
      {
        name: "get_execution_plan",
        description: "Get topologically sorted execution levels",
        inputSchema: {
          type: "object",
          properties: { workflowId: { type: "string" } },
          required: ["workflowId"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "list_workflows":
      return { content: [{ type: "text", text: JSON.stringify(Array.from(store.workflows.keys())) }] };

    case "load_workflow":
      store.loadDefinition(args.id, args.definition);
      return { content: [{ type: "text", text: `Loaded workflow ${args.id}` }] };

    case "get_execution_plan":
      const plan = engine.getTopologicalLevels(args.workflowId);
      return { content: [{ type: "text", text: JSON.stringify(plan) }] };

    case "start_workflow":
      const runId = store.createRun(args.workflowId);
      return { content: [{ type: "text", text: runId }] };

    case "get_run_status":
      const run = store.getRun(args.runId);
      if (!run) throw new Error("Run not found");
      return { content: [{ type: "text", text: JSON.stringify(run) }] };

    case "get_next_tasks":
      const nextTasks = engine.getNextTasks(args.runId);
      return { content: [{ type: "text", text: JSON.stringify(nextTasks) }] };

    case "mutate_task":
      const result = store.updateTaskStatus(args.runId, args.taskId, args.status, args.output, args.error);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Workflow Engine MCP Server running on stdio");
