---
"@leclabs/agent-toolkit": minor
---

Add external plugin workflow loading with sourceRoot resolution

External plugins can now load workflows at runtime via the LoadWorkflows MCP tool, passing their root path for ./ context_files resolution. The engine resolves ./ prefixed paths in context_files, description, and instructions against the plugin's sourceRoot, while plain paths continue resolving against the project root.
