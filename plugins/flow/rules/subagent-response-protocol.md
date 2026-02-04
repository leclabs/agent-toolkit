### Subagent Response Protocol

**Native Subagents** (e.g. Explore, Plan, etc.) should respond as usual.

**Non-Native Subagents** should respond as follows:
Write results to .cruft/{context}/{filename}. With a max of 200 characters in the summary.
Return: {"success": true|false, "results": ".cruft/...", "summary": "${summary}"}
