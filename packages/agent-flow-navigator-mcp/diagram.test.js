import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

/**
 * Test helpers for MCP tool integration testing
 */
const TEST_PROJECT_ROOT = join(process.cwd(), ".test-project");
const FLOW_PATH = join(TEST_PROJECT_ROOT, ".flow");
const WORKFLOWS_PATH = join(FLOW_PATH, "workflows");
const DIAGRAMS_PATH = join(FLOW_PATH, "diagrams");

// Simple workflow for testing
const SIMPLE_WORKFLOW = {
  id: "test-workflow",
  name: "Test Workflow",
  description: "A simple workflow for testing diagram generation",
  nodes: {
    start: { type: "start", name: "Start", description: "Begin" },
    task_a: {
      type: "task",
      name: "Task A",
      description: "First task",
      agent: "Developer",
      stage: "dev",
    },
    end_success: { type: "end", result: "success", name: "Done", description: "Complete" },
  },
  edges: [
    { from: "start", to: "task_a" },
    { from: "task_a", to: "end_success" },
  ],
};

/**
 * Create a minimal MCP client for testing
 * Spawns the MCP server and communicates via JSON-RPC over stdio
 */
class TestMCPClient {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.process = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.buffer = "";
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.process = spawn("node", ["index.js", this.projectRoot], {
        cwd: join(process.cwd()),
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stdout.on("data", (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.stderr.on("data", (data) => {
        // MCP servers log to stderr, ignore for tests
      });

      this.process.on("error", reject);

      // Send initialize request
      setTimeout(async () => {
        try {
          await this.sendRequest("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          });
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 100);
    });
  }

  processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const { resolve, reject } = this.pendingRequests.get(msg.id);
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
  }

  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pendingRequests.set(id, { resolve, reject });

      const request = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });

      this.process.stdin.write(request + "\n");

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 5000);
    });
  }

  async callTool(name, args = {}) {
    const result = await this.sendRequest("tools/call", { name, arguments: args });
    return result;
  }

  async disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

/**
 * Setup test project directory with workflow
 */
function setupTestProject() {
  // Clean up any existing test project
  if (existsSync(TEST_PROJECT_ROOT)) {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
  }

  // Create workflow directory structure
  mkdirSync(join(WORKFLOWS_PATH, "test-workflow"), { recursive: true });
  writeFileSync(
    join(WORKFLOWS_PATH, "test-workflow", "workflow.json"),
    JSON.stringify(SIMPLE_WORKFLOW, null, 2)
  );
}

/**
 * Cleanup test project directory
 */
function cleanupTestProject() {
  if (existsSync(TEST_PROJECT_ROOT)) {
    rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
  }
}

describe("Diagram Tool", () => {
  let client;

  beforeEach(async () => {
    setupTestProject();
    client = new TestMCPClient(TEST_PROJECT_ROOT);
    await client.connect();
  });

  afterEach(async () => {
    await client.disconnect();
    cleanupTestProject();
  });

  describe("file saving", () => {
    it("should return JSON with only savedTo field", async () => {
      const result = await client.callTool("Diagram", { workflowType: "test-workflow" });

      const text = result.content[0].text;

      // Should be JSON
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(text);
      }, "Result should be valid JSON");

      assert.ok(parsed.savedTo, "Should have savedTo field");
      assert.ok(!parsed.diagram, "Should NOT have diagram field");
    });

    it("should return correct savedTo path", async () => {
      const result = await client.callTool("Diagram", { workflowType: "test-workflow" });

      const parsed = JSON.parse(result.content[0].text);
      const expectedPath = join(DIAGRAMS_PATH, "test-workflow.md");

      assert.strictEqual(parsed.savedTo, expectedPath, "savedTo should be correct path");
    });

    it("should create diagrams directory", async () => {
      assert.ok(!existsSync(DIAGRAMS_PATH), "Diagrams directory should not exist initially");

      await client.callTool("Diagram", { workflowType: "test-workflow" });

      assert.ok(existsSync(DIAGRAMS_PATH), "Diagrams directory should be created");
    });

    it("should create file at savedTo path", async () => {
      const result = await client.callTool("Diagram", { workflowType: "test-workflow" });

      const parsed = JSON.parse(result.content[0].text);

      assert.ok(existsSync(parsed.savedTo), "File should exist at savedTo path");
    });

    it("should write valid mermaid diagram to file", async () => {
      const result = await client.callTool("Diagram", { workflowType: "test-workflow" });

      const parsed = JSON.parse(result.content[0].text);
      const fileContent = readFileSync(parsed.savedTo, "utf-8");

      assert.ok(fileContent.includes("## Workflow:"), "File should contain markdown header");
      assert.ok(fileContent.includes("```mermaid"), "File should contain mermaid code block");
      assert.ok(fileContent.includes("flowchart TD"), "File should contain flowchart");
    });

    it("should overwrite existing file on subsequent calls", async () => {
      // First call
      await client.callTool("Diagram", { workflowType: "test-workflow" });

      // Modify the workflow
      const modifiedWorkflow = {
        ...SIMPLE_WORKFLOW,
        name: "Modified Test Workflow",
      };
      writeFileSync(
        join(WORKFLOWS_PATH, "test-workflow", "workflow.json"),
        JSON.stringify(modifiedWorkflow, null, 2)
      );

      // Reconnect to reload workflows
      await client.disconnect();
      client = new TestMCPClient(TEST_PROJECT_ROOT);
      await client.connect();

      // Second call
      const result = await client.callTool("Diagram", { workflowType: "test-workflow" });

      const parsed = JSON.parse(result.content[0].text);
      const fileContent = readFileSync(parsed.savedTo, "utf-8");

      assert.ok(fileContent.includes("Modified Test Workflow"), "File should have updated content");
    });
  });

  describe("currentStep highlighting", () => {
    it("should include currentStep class in saved diagram", async () => {
      const result = await client.callTool("Diagram", {
        workflowType: "test-workflow",
        currentStep: "task_a",
      });

      const parsed = JSON.parse(result.content[0].text);
      const fileContent = readFileSync(parsed.savedTo, "utf-8");

      assert.ok(fileContent.includes("class task_a currentStep"), "Should highlight current step");
    });
  });

  describe("error handling", () => {
    it("should return error for non-existent workflow", async () => {
      const result = await client.callTool("Diagram", { workflowType: "nonexistent" });

      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.error, "Should have error field");
      assert.ok(parsed.error.includes("not found"), "Error should mention not found");
    });
  });
});
