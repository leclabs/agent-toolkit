### Subagent Response Protocol

**Claude Code's built-in agents** (Bash, Explore, Plan, Developer, Investigator, Architect, Planner, Reviewer, Tester, Context Engineer) respond normally using their default behavior.

**Catalog agents** (workflow-specific subagents from `.claude/agents/`) follow this protocol:
- Write results to `.cruft/{context}/{filename}`
- Return: `{"success": true|false, "results": ".cruft/...", "summary": "<200 chars>"}`
