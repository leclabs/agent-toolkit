---
description: "Replicate flow development environment to another marketplace, creating flow@<marketplace>"
---

# /replicate-flow

One-shot replication of the complete flow development environment to another marketplace. Copies both the flow plugin AND the navigator MCP source, enabling the target to develop, customize, and publish flow under their own namespace.

**This is NOT consumer setup** (that's `/flow:setup`). This is developer-to-developer environment cloning.

## What To Do

### Phase 1: Gather Target Information

```
AskUserQuestion(
  questions: [
    {
      question: "What is the absolute path to the target marketplace?",
      header: "Target Path",
      options: [
        { label: "Let me type it", description: "Enter the full path to the marketplace root" }
      ]
    },
    {
      question: "Any additional context about the target marketplace?",
      header: "Context",
      options: [
        { label: "No, detect from project", description: "Infer from package.json and git config" },
        { label: "Let me provide details", description: "Specify namespace, author, etc." }
      ]
    }
  ]
)
```

### Phase 2: Plan Integration

Determine:

- Marketplace name, npm namespace, author, repo URL
- Package manager (npm/pnpm/yarn)
- Where MCP source should go (packages/, libs/, src/, etc.)
- Any existing structure conflicts

### Phase 3: Confirm and Execute

Present the plan for approval, then execute:

**What gets copied:**

- Flow plugin (`plugins/flow/`) → target's `plugins/flow/`
- Navigator MCP source → target's package directory (determined by planner)
- Catalog workflows and agents → copied
- Catalog NOT symlinked - target owns their own

**What gets transformed:**

- `.mcp.json` - reference target's scoped MCP package via npx
- `marketplace.json` - target's name, owner, version
- `plugin.json` - author, version
- MCP `package.json` - scoped name, author, repo
- Root `package.json` - add reload scripts for their package manager
- `scripts/sync-versions.js` - paths adjusted for their structure

**Reload scripts to add:**

- `reload` - full reload (MCP + plugin)
- `reload:mcp` - npm/pnpm/yarn link or workspace config for local MCP dev
- `reload:plugin` - uninstall/reinstall plugin to refresh Claude Code

### Phase 4: Verify

Confirm the replication worked:

- Plugin structure exists with skills, hooks, commands
- MCP source exists with server files, catalog, tests
- Reload scripts added to package.json
- LFT tests pass

Report completion with next steps for the target project.

## Key Decisions

**No symlinks:** Target project will create their own workflows and agents. Copy the catalog as a starting point, but don't symlink.

**npx mode:** The `.mcp.json` should use `npx -y @{scope}/{mcp-package}` so they can publish and consume their own MCP. Local dev uses npm link (or equivalent for their package manager).

**Trust the planner:** Don't prescribe exact paths. Let the planner analyze the target project and determine the right structure.
