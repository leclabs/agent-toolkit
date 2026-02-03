Display the following help reference verbatim:

```
Flow — workflow orchestration for Claude Code

Setup
  /flow:setup               Set up workflows and agents for a project
  /flow:load                Load workflows into Navigator
  /flow:start               Load flow context (runs automatically at session start)

Discover
  /flow:list                List loaded workflows
  /flow:analyze             Scan project for workflow opportunities
  /flow:recon <paths>       Deep-dive into project structure and patterns
  /flow:diagram <id>        Visualize a workflow as a mermaid diagram

Work
  /flow:task <description>  Create a task and choose a workflow
  /flow:run <taskId>        Execute a task through its workflow
  /flow:go [taskId]         Run all pending tasks autonomously

Track
  /flow:task-list           List tasks and their progress
  /flow:task-get <taskId>   Get task details and next action
  /flow:task-advance <id>   Advance a task to the next step

Author
  /flow:validate            Validate workflow structure
  /flow:inspect <step>      Deep-inspect a single workflow step
  /flow:dry-run <id>        Walk a workflow without executing

Run /flow:<command> --help for detailed usage.
```
