#!/usr/bin/env node
/**
 * Navigate API Integration Verification Test
 * Tests the stateless Navigator MCP server API:
 * 1. Navigate tool for start, get current, and advance
 * 2. stepInstructions with name, description, guidance
 * 3. Retry action for failed results within retry limit
 * 4. retriesIncremented flag in response
 */

import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, rmSync, mkdirSync } from "fs";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NAVIGATOR_PATH = join(__dirname, "..", "index.js");
const PROJECT_ROOT = join(__dirname, "test-navigate-project");

// Clean up test project
if (existsSync(PROJECT_ROOT)) {
  rmSync(PROJECT_ROOT, { recursive: true });
}
mkdirSync(PROJECT_ROOT, { recursive: true });

console.log("=".repeat(60));
console.log("Navigate API Integration Verification Test");
console.log("=".repeat(60));
console.log(`Navigator: ${NAVIGATOR_PATH}`);
console.log(`Project: ${PROJECT_ROOT}`);
console.log();

// MCP JSON-RPC helpers
let messageId = 0;
function createRequest(method, params = {}) {
  return {
    jsonrpc: "2.0",
    id: ++messageId,
    method,
    params,
  };
}

// Spawn Navigator as MCP server
const navigator = spawn("node", [NAVIGATOR_PATH, PROJECT_ROOT], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
navigator.stderr.on("data", (data) => {
  stderr += data.toString();
});

// Create readline for JSON-RPC responses
const rl = createInterface({ input: navigator.stdout });
const pendingRequests = new Map();

rl.on("line", (line) => {
  try {
    const response = JSON.parse(line);
    if (response.id && pendingRequests.has(response.id)) {
      pendingRequests.get(response.id)(response);
      pendingRequests.delete(response.id);
    }
  } catch {
    // Ignore non-JSON lines
  }
});

// Send request and wait for response
function sendRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = createRequest(method, params);
    pendingRequests.set(request.id, resolve);
    navigator.stdin.write(JSON.stringify(request) + "\n");

    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingRequests.has(request.id)) {
        pendingRequests.delete(request.id);
        reject(new Error(`Timeout waiting for response to ${method}`));
      }
    }, 5000);
  });
}

// Helper to parse tool response
function parseToolResponse(response) {
  const text = response.result?.content?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text);
}

// Results tracking
const results = {
  tests: "pass",
  integrationChecks: [],
  issues: [],
};

function check(name, passed, details = "") {
  results.integrationChecks.push({ name, passed, details });
  if (!passed) {
    results.tests = "fail";
    results.issues.push(`${name}: ${details}`);
  }
  console.log(`  ${passed ? "[PASS]" : "[FAIL]"} ${name}${details ? `: ${details}` : ""}`);
}

// Wait for server to start
await new Promise((r) => setTimeout(r, 500));
console.log("Server started:");
console.log(
  stderr
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `  ${l}`)
    .join("\n")
);
console.log();

try {
  // Initialize MCP connection
  console.log("1. Initializing MCP connection...");
  const initResponse = await sendRequest("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  });
  console.log(`   Connected to: ${initResponse.result?.serverInfo?.name} v${initResponse.result?.serverInfo?.version}`);

  // Send initialized notification
  navigator.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }) + "\n"
  );

  // ===========================================
  // Test 1: Navigate to start workflow (no currentStep)
  // ===========================================
  console.log("\n2. Testing Navigate - start workflow...");
  const startResponse = await sendRequest("tools/call", {
    name: "Navigate",
    arguments: {
      workflowType: "agile-task",
    },
  });
  const startResult = parseToolResponse(startResponse);

  check("Navigate returns action: start", startResult?.action === "start", `got "${startResult?.action}"`);
  check("Navigate returns currentStep", !!startResult?.currentStep, `got "${startResult?.currentStep}"`);
  check("Navigate returns stage", startResult?.stage !== undefined, `got "${startResult?.stage}"`);
  check("Navigate returns subagent", startResult?.subagent !== undefined, `got "${startResult?.subagent}"`);
  // stepInstructions should have name, description (optional), and guidance
  check(
    "Navigate returns stepInstructions",
    startResult?.stepInstructions !== null,
    startResult?.stepInstructions ? "present" : "missing"
  );
  check(
    "Navigate stepInstructions has name",
    !!startResult?.stepInstructions?.name,
    `got "${startResult?.stepInstructions?.name}"`
  );
  check(
    "Navigate stepInstructions has guidance",
    !!startResult?.stepInstructions?.guidance,
    startResult?.stepInstructions?.guidance ? "present" : "missing"
  );

  // ===========================================
  // Test 2: Navigate with currentStep (get current state)
  // ===========================================
  console.log("\n3. Testing Navigate - get current state...");
  const getCurrentResponse = await sendRequest("tools/call", {
    name: "Navigate",
    arguments: {
      workflowType: "agile-task",
      currentStep: startResult?.currentStep,
    },
  });
  const getCurrentResult = parseToolResponse(getCurrentResponse);

  check(
    "Navigate returns action: current",
    getCurrentResult?.action === "current",
    `got "${getCurrentResult?.action}"`
  );
  check(
    "Navigate returns same step",
    getCurrentResult?.currentStep === startResult?.currentStep,
    `got "${getCurrentResult?.currentStep}"`
  );

  // ===========================================
  // Test 3: Navigate with result (advance)
  // ===========================================
  console.log("\n4. Testing Navigate - advance with passed result...");
  const advanceResponse = await sendRequest("tools/call", {
    name: "Navigate",
    arguments: {
      workflowType: "agile-task",
      currentStep: startResult?.currentStep,
      result: "passed",
    },
  });
  const advanceResult = parseToolResponse(advanceResponse);

  check("Navigate returns action: advance", advanceResult?.action === "advance", `got "${advanceResult?.action}"`);
  check(
    "Navigate returns new step",
    advanceResult?.currentStep !== startResult?.currentStep,
    `got "${advanceResult?.currentStep}"`
  );
  check(
    "Navigate returns retriesIncremented: false on advance",
    advanceResult?.retriesIncremented === false,
    `got ${advanceResult?.retriesIncremented}`
  );

  // ===========================================
  // Test 4: Navigate through workflow to review, then fail
  // ===========================================
  console.log("\n5. Testing Navigate - retry scenario...");

  // Navigate: analyze -> implement -> test -> review
  let currentStep = advanceResult?.currentStep;
  const stepsVisited = [startResult?.currentStep, currentStep];

  while (currentStep !== "review") {
    console.log(`   Advancing from ${currentStep}...`);
    const stepResp = await sendRequest("tools/call", {
      name: "Navigate",
      arguments: {
        workflowType: "agile-task",
        currentStep,
        result: "passed",
      },
    });
    const stepResult = parseToolResponse(stepResp);
    currentStep = stepResult?.currentStep;
    stepsVisited.push(currentStep);

    if (stepsVisited.length > 10) {
      throw new Error("Too many steps - possible infinite loop");
    }
  }
  console.log(`   Now at step: ${currentStep}`);
  console.log(`   Steps visited: ${stepsVisited.join(" -> ")}`);

  // Now at "review" step - fail it (retryCount = 0, first failure)
  const retryResponse = await sendRequest("tools/call", {
    name: "Navigate",
    arguments: {
      workflowType: "agile-task",
      currentStep: "review",
      result: "failed",
      retryCount: 0,
    },
  });
  const retryResult = parseToolResponse(retryResponse);

  check(
    "Navigate returns action: retry for failed within limit",
    retryResult?.action === "retry",
    `got "${retryResult?.action}"`
  );
  check(
    "Navigate returns retriesIncremented: true on retry",
    retryResult?.retriesIncremented === true,
    `got ${retryResult?.retriesIncremented}`
  );

  // ===========================================
  // Test 5: ListWorkflows returns schemaVersion
  // ===========================================
  console.log("\n6. Testing ListWorkflows tool...");
  const listResponse = await sendRequest("tools/call", {
    name: "ListWorkflows",
    arguments: {},
  });
  const listResult = parseToolResponse(listResponse);

  check("ListWorkflows returns schemaVersion: 2", listResult?.schemaVersion === 2, `got ${listResult?.schemaVersion}`);
  check(
    "ListWorkflows returns workflows array",
    Array.isArray(listResult?.workflows),
    `${listResult?.workflows?.length} workflows`
  );

  // ===========================================
  // Test 6: ListCatalog returns schemaVersion
  // ===========================================
  console.log("\n7. Testing ListCatalog tool...");
  const listCatalogResponse = await sendRequest("tools/call", {
    name: "ListCatalog",
    arguments: {},
  });
  const listCatalogResult = parseToolResponse(listCatalogResponse);

  check(
    "ListCatalog returns schemaVersion: 2",
    listCatalogResult?.schemaVersion === 2,
    `got ${listCatalogResult?.schemaVersion}`
  );

  // ===========================================
  // Test 7: CopyWorkflows creates directory structure
  // ===========================================
  console.log("\n8. Testing CopyWorkflows tool...");
  const copyResponse = await sendRequest("tools/call", {
    name: "CopyWorkflows",
    arguments: {
      workflowIds: ["feature-development"],
    },
  });
  const copyResult = parseToolResponse(copyResponse);

  check("CopyWorkflows returns schemaVersion: 2", copyResult?.schemaVersion === 2, `got ${copyResult?.schemaVersion}`);
  check(
    "CopyWorkflows returns copied array",
    Array.isArray(copyResult?.copied),
    copyResult?.copied ? `copied: ${copyResult.copied.join(", ")}` : "missing"
  );

  // Check that directory structure was created
  const flowRoot = join(PROJECT_ROOT, ".flow");
  const workflowsRoot = join(flowRoot, "workflows");
  const workflowDir = join(workflowsRoot, "feature-development");
  check(
    "CopyWorkflows creates workflow directory",
    existsSync(workflowDir),
    existsSync(workflowDir) ? "directory exists" : "directory missing"
  );
  check(
    "CopyWorkflows creates workflow.json",
    existsSync(join(workflowDir, "workflow.json")),
    existsSync(join(workflowDir, "workflow.json")) ? "file exists" : "file missing"
  );
  check(
    "CopyWorkflows creates .flow/README.md",
    existsSync(join(flowRoot, "README.md")),
    existsSync(join(flowRoot, "README.md")) ? "file exists" : "file missing"
  );
  check(
    "CopyWorkflows creates .flow/workflows/README.md",
    existsSync(join(workflowsRoot, "README.md")),
    existsSync(join(workflowsRoot, "README.md")) ? "file exists" : "file missing"
  );

  // ===========================================
  // Test 8: Diagram tool
  // ===========================================
  console.log("\n9. Testing Diagram tool...");
  const diagramResponse = await sendRequest("tools/call", {
    name: "Diagram",
    arguments: {
      workflowType: "agile-task",
    },
  });
  const diagramText = diagramResponse.result?.content?.[0]?.text;

  check(
    "Diagram returns mermaid content",
    diagramText?.includes("```mermaid"),
    diagramText ? "contains mermaid block" : "missing mermaid"
  );
  check(
    "Diagram includes flowchart",
    diagramText?.includes("flowchart TD"),
    diagramText ? "contains flowchart" : "missing flowchart"
  );

  // ===========================================
  // Summary
  // ===========================================
  console.log("\n" + "=".repeat(60));
  const passedCount = results.integrationChecks.filter((c) => c.passed).length;
  const totalCount = results.integrationChecks.length;
  console.log(`Results: ${passedCount}/${totalCount} checks passed`);

  if (results.issues.length > 0) {
    console.log("\nIssues found:");
    results.issues.forEach((issue) => console.log(`  - ${issue}`));
  }

  console.log("=".repeat(60));
} catch (err) {
  console.error("\nTest failed with error:", err.message);
  results.tests = "fail";
  results.issues.push(`Error: ${err.message}`);
} finally {
  // Clean shutdown
  navigator.kill();
  await new Promise((r) => setTimeout(r, 100));
  if (existsSync(PROJECT_ROOT)) {
    rmSync(PROJECT_ROOT, { recursive: true });
  }
}

// Output final JSON result
console.log("\n--- Final Result (JSON) ---");
console.log(
  JSON.stringify(
    {
      success: results.tests === "pass",
      results: {
        tests: results.tests,
        integrationChecks: results.integrationChecks,
        issues: results.issues,
      },
      summary:
        results.tests === "pass"
          ? "All Navigate API integration checks passed"
          : `${results.issues.length} issue(s) found`,
    },
    null,
    2
  )
);
