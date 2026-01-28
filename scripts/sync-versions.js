#!/usr/bin/env node

/**
 * Syncs version from root package.json to:
 * - .claude-plugin/marketplace.json (metadata.version and plugins[].version)
 * - plugins/flow/.claude-plugin/plugin.json
 * - packages/agent-flow-navigator-mcp/package.json
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

const rootPkg = readJson(join(root, "package.json"));
const version = rootPkg.version;

console.log(`Syncing version ${version} across packages...`);

// Update marketplace.json
const marketplacePath = join(root, ".claude-plugin/marketplace.json");
const marketplace = readJson(marketplacePath);
marketplace.metadata.version = version;
marketplace.plugins.forEach((plugin) => {
  plugin.version = version;
});
writeJson(marketplacePath, marketplace);
console.log(`  ✓ .claude-plugin/marketplace.json`);

// Update flow plugin.json
const pluginPath = join(root, "plugins/flow/.claude-plugin/plugin.json");
const plugin = readJson(pluginPath);
plugin.version = version;
writeJson(pluginPath, plugin);
console.log(`  ✓ plugins/flow/.claude-plugin/plugin.json`);

// Update MCP server package.json
const mcpPkgPath = join(root, "packages/agent-flow-navigator-mcp/package.json");
const mcpPkg = readJson(mcpPkgPath);
mcpPkg.version = version;
writeJson(mcpPkgPath, mcpPkg);
console.log(`  ✓ packages/agent-flow-navigator-mcp/package.json`);

console.log(`\nAll versions synced to ${version}`);
