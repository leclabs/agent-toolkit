#!/usr/bin/env node

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const MARKETPLACE_SOURCE = 'leclabs/agent-toolkit';
const PLUGIN_NAME = 'flow@agent-toolkit';

const args = process.argv.slice(2);
const flags = {
  yes: args.includes('--yes') || args.includes('-y'),
  help: args.includes('--help') || args.includes('-h'),
};

function printHelp() {
  console.log(`
Usage: setup-agent-toolkit [options]

Set up the agent-toolkit marketplace and flow plugin for Claude Code.

Options:
  -y, --yes   Accept all defaults, skip prompts
  -h, --help  Show this help message

Steps performed:
  1. Check Claude Code CLI is installed
  2. Add agent-toolkit marketplace
  3. Install flow plugin (user scope)
  4. Configure project task list ID
`);
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return null; }
}

function runWithOutput(cmd) {
  const result = spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });
  return { success: result.status === 0, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

async function prompt(question, defaultValue) {
  if (flags.yes) return defaultValue;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (${defaultValue}): `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function confirm(question, defaultYes = true) {
  if (flags.yes) return true;
  const answer = await prompt(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'}`, defaultYes ? 'y' : 'n');
  return answer.toLowerCase().startsWith('y');
}

function checkClaudeCode() {
  console.log('\nChecking Claude Code CLI...');
  const version = run('claude --version');
  if (!version) {
    console.error('  Error: Claude Code CLI not found.');
    console.error('  Install from: https://claude.ai/code');
    process.exit(1);
  }
  console.log(`  Found: ${version}`);
}

function addMarketplace() {
  console.log('\nAdding agent-toolkit marketplace...');
  const list = run('claude plugin marketplace list') || '';
  if (list.includes('agent-toolkit')) {
    console.log('  Already added.');
    return true;
  }
  const result = runWithOutput(`claude plugin marketplace add ${MARKETPLACE_SOURCE}`);
  if (result.success) {
    console.log('  Added successfully.');
    return true;
  }
  console.error(`  Failed: ${result.stderr || result.stdout}`);
  console.error(`  Try manually: claude plugin marketplace add ${MARKETPLACE_SOURCE}`);
  return false;
}

function installPlugin() {
  console.log('\nInstalling flow plugin...');
  const list = run('claude plugin list') || '';
  if (list.includes(PLUGIN_NAME)) {
    console.log('  Already installed.');
    return true;
  }
  const result = runWithOutput(`claude plugin install ${PLUGIN_NAME} --scope user`);
  if (result.success) {
    console.log('  Installed successfully.');
    return true;
  }
  console.error(`  Failed: ${result.stderr || result.stdout}`);
  console.error(`  Try manually: claude plugin install ${PLUGIN_NAME} --scope user`);
  return false;
}

async function configureTaskListId() {
  console.log('\nConfiguring project settings...');
  const cwd = process.cwd();
  const defaultId = path.basename(cwd);
  const taskListId = await prompt('  Task list ID', defaultId);

  const claudeDir = path.join(cwd, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');

  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
  }

  settings.env = settings.env || {};
  settings.env.CLAUDE_CODE_TASK_LIST_ID = taskListId;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  Created: ${settingsPath}`);
  console.log(`  CLAUDE_CODE_TASK_LIST_ID: ${taskListId}`);
  return true;
}

function showSuccess() {
  console.log(`
Setup complete!

Next steps:
  1. Start Claude Code:  claude
  2. Prime the plugin:   /flow:prime
  3. Create a task:      feat: "Add user authentication"

Quick prefixes: fix: | feat: | bug:
`);
}

async function main() {
  if (flags.help) { printHelp(); process.exit(0); }

  console.log('Agent Toolkit Setup');
  console.log('===================');

  checkClaudeCode();

  if (!await confirm('\nProceed with setup?')) {
    console.log('Setup cancelled.');
    process.exit(0);
  }

  const marketplaceOk = addMarketplace();
  const pluginOk = marketplaceOk && installPlugin();
  const configOk = await configureTaskListId();

  if (marketplaceOk && pluginOk && configOk) {
    showSuccess();
  } else {
    console.log('\nSetup completed with errors. Review the messages above.');
    process.exit(1);
  }
}

main().catch((err) => { console.error('Unexpected error:', err.message); process.exit(1); });
