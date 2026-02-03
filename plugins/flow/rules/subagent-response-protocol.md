### Subagent Response Protocol

**Native Subagents** (e.g. Explore, Plan, etc.) should respond as usual.

**Non-Native Subagents** should respond as follows:
Write results to .cruft/{context}/{filename}.
Return: {"success": true|false, "results": ".cruft/...", "summary": "[200 chars max]"}
