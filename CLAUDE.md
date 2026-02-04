# Agent Toolkit Project Memory

## Greenfield Project - No Backward Compatibility

This is a **greenfield project**. Do NOT:

- Add backward compatibility shims
- Support legacy formats alongside new ones
- Preserve old APIs when refactoring
- Add fallback code paths for deprecated patterns

When making breaking changes, just make them. Delete old code, don't wrap it.

## Architecture: Source vs Symlinked Project

The catalog is the **source of truth**. Project-level `.flow/` and `.claude/agents/` are **symlinks** back to catalog source, not copies.

```
SOURCE (Catalog)                                    SYMLINKED (Project)
────────────────────────────────────────            ────────────────────────────────
packages/agent-flow-navigator-mcp/                  .flow/workflows/*.json  →  catalog/workflows/*
  catalog/workflows/*.json                          .claude/agents/*.md     →  catalog/agents/*
  catalog/agents/*.md
```

## Releases

Use **changesets** for versioning. Never manually edit package.json versions or CHANGELOG.md.

### Full release process

**Claude does steps 1–4:**

```bash
# 1. Create changeset (describes what changed and semver bump type)
npx changeset

# 2. Consume changesets → bump versions + update CHANGELOG + sync across packages
npm run version

# 3. Commit the version bump
git add -A && git commit -m "chore: bump version to X.Y.Z"

# 4. Push and create/update PR
git push
gh pr create  # or update existing PR
```

**User does steps 5–6:**

```bash
# 5. Merge PR to main

# 6. Publish to npm (gates on auth, then publishes both packages)
npm run release
```

### How it works

- `npx changeset` — creates a `.changeset/<name>.md` file with the bump type (`patch`, `minor`, `major`) and description. Only reference `@leclabs/agent-toolkit` (root package) — the MCP package is not a workspace.
- `npm run version` — runs `changeset version && node scripts/sync-versions.js`. Consumes changeset files, bumps `package.json`, writes `CHANGELOG.md`, then `sync-versions.js` propagates the version to:
  - `.claude-plugin/marketplace.json` (metadata.version + plugins[].version)
  - `plugins/flow/.claude-plugin/plugin.json`
  - `packages/agent-flow-navigator-mcp/package.json`
- `npm run release` — runs `npm whoami` to verify auth, then publishes both `@leclabs/agent-toolkit` and `@leclabs/agent-flow-navigator-mcp`. If auth fails, prints instructions to set the npm token.

## MCP Server Restart

After modifying files in `packages/agent-flow-navigator-mcp/` or `plugins/flow/`, **ask the user to restart the MCP server** before using any `/flow:*` skills (like `/flow:diagram`). The running server will have stale code until restarted.

## Component Hierarchy

```
agent-toolkit (marketplace)
└── flow (plugin)          ← Orchestration ruleset via prompt injection
    └── navigator (mcp)    ← FSM for workflow navigation
```

| Component   | Name                                              | Purpose                                            |
| ----------- | ------------------------------------------------- | -------------------------------------------------- |
| Marketplace | `agent-toolkit`                                   | Collection of agent tools                          |
| Plugin      | `flow`                                            | Orchestration ruleset (prompt injection)           |
| MCP Server  | `navigator` / `@leclabs/agent-flow-navigator-mcp` | FSM (currently uses Claude Code task file schema)  |
| Commands    | `/flow:*`                                         | User-facing Claude Code commands                   |

**Inversion of control**: Traditional workflow engines use agents as tools. Navigator flips this - the AI orchestrator uses the FSM for navigation.
