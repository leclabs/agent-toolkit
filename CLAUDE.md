# Agent Toolkit Project Memory

## Flow Orchestration

**IMPORTANT:** Invoke the `/flow:prime` skill at session start.

## Greenfield Project - No Backward Compatibility

This is a **greenfield project**. Do NOT:

- Add backward compatibility shims
- Support legacy formats alongside new ones
- Preserve old APIs when refactoring
- Add fallback code paths for deprecated patterns

When making breaking changes, just make them. Delete old code, don't wrap it.

## Architecture: Source vs Generated

This project follows a clear separation between **source templates** and **generated client configurations**:

```
SOURCE (Catalog/Plugin)              →  GENERATED (Project/.flow/)
─────────────────────────────────      ─────────────────────────────
plugins/flow/                          .flow/
  ├── workflows/*.json
```

### Key Principles

1. **Catalog JSON = portable templates** (source of truth)
   - Flow's catalog of workflows, `plugins/flow/catalog/`

2. **Dogfooding context**
   - We're using the flow plugin to develop the flow plugin
   - `plugins/flow/` and `packages/agent-flow-navigator-mcp/` = source we're building

## Releases

Use **changesets** for versioning. Never manually edit package.json versions or CHANGELOG.md.

### Full release process

**Claude does steps 1–5:**

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

## Naming Hierarchy

```
agent-toolkit (marketplace)
└── flow (plugin)
    └── navigator (mcp)
```

| Component              | Name                                | Purpose                          |
| ---------------------- | ----------------------------------- | -------------------------------- |
| Marketplace            | `agent-toolkit`                     | Collection of agent tools        |
| Plugin                 | `flow`                              | Workflow orchestration           |
| MCP Server flow config | `navigator`                         | Navigates through workflows      |
| MCP Server npm Package | `@leclabs/agent-flow-navigator-mcp` | Publishable MCP package          |
| Skills                 | `/flow:*`                           | User-facing commands             |
