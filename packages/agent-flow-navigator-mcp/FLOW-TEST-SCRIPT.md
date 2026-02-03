# Flow Test Script

A step-by-step walkthrough to learn and test the flow workflow system.

## Prerequisites

- Claude Code with the `flow` plugin installed
- MCP server running (`agent-flow-navigator-mcp`)

---

## Part 1: Browse What's Available

### 1a. List catalog workflows (templates, not yet installed)

```
/flow:list --catalog
```

Expected: table of 14 built-in workflows with step counts.

### 1b. List project workflows (installed in `.flow/workflows/`)

```
/flow:list
```

Expected: project workflows if any exist, otherwise falls back to showing all.

### 1c. List external workflows (loaded by other plugins at runtime)

```
/flow:list --external
```

Expected: external workflows if any were loaded, otherwise empty.

### 1d. List everything

```
/flow:list --all
```

Expected: all workflows grouped by source (project, catalog, external).

### 1e. Visualize a workflow

```
/flow:diagram feature-development
```

Expected: mermaid flowchart showing the full feature-development pipeline.

---

## Part 2: Set Up Workflows for a Project

### 2a. Interactive setup

```
/flow:setup
```

Walk through the prompts:

1. Choose "Browse the catalog"
2. Select `quick-task` and `feature-development`
3. Choose "Use as-is"
4. Copy referenced agents

Expected: workflows copied to `.flow/workflows/`, agents to `.claude/agents/`.

### 2b. Verify they're installed

```
/flow:list
```

Expected: `quick-task` and `feature-development` show as `project` source.

---

## Part 3: Create and Run a Task

### 3a. Create a task

```
/flow:task add a hello world function to utils.js
```

Walk through the prompts:

1. Select a workflow (e.g., `quick-task` for something simple)

Expected: task created with workflow metadata, shows current step and assigned agent.

### 3b. Check task status

```
/flow:task-list
```

Expected: shows the pending task with workflow position.

### 3c. Get task details

```
/flow:task-get 1
```

Expected: full task info with workflow diagram highlighting current step.

### 3d. Run the task

```
/flow:go
```

Expected: orchestrator picks up the task and walks through each workflow step:

- Each step delegated to the appropriate agent (Planner, Developer, Tester, etc.)
- Gates retry on failure (up to maxRetries)
- Stops at completion or HITL escalation

---

## Part 4: Manual Intervention (HITL)

If a task hits HITL (max retries exceeded at a gate):

### 4a. Check what happened

```
/flow:task-get 1
```

Expected: shows the task is at an HITL node with the reason.

### 4b. Fix the issue manually, then resume

```
/flow:task-advance 1 passed
```

Expected: workflow advances past the gate and continues.

---

## Part 5: Session Recovery

After restarting Claude Code:

### 5a. See where you left off

```
/flow:task-list
```

Expected: all pending tasks with their workflow positions.

### 5b. Resume a task

```
/flow:run 1
```

Expected: picks up from the last saved step.

---

## Part 6: Inspect a Step

### 6a. Deep-dive into a specific step

```
/flow:inspect feature-development plan_review
```

Expected: node definition, edges, retry analysis, instruction source, contextual diagram.

---

## Part 7: Validate and Analyze

### 7a. Validate a workflow definition

```
/flow:validate feature-development
```

Expected: schema checks, topology validation, gate/retry logic, instruction coverage.

### 7b. Analyze project for workflow opportunities

```
/flow:analyze
```

Expected: scans CI/CD, docs, and patterns to suggest custom workflows.

---

## Quick Reference

| Command                          | What it does                |
| -------------------------------- | --------------------------- |
| `/flow:list`                     | Show loaded workflows       |
| `/flow:list --all`               | Show all sources            |
| `/flow:setup`                    | Install workflows + agents  |
| `/flow:task <desc>`              | Create a task with workflow |
| `/flow:go`                       | Run all pending tasks       |
| `/flow:task-list`                | See all tasks               |
| `/flow:task-get <id>`            | Task details + diagram      |
| `/flow:task-advance <id> passed` | Resume after HITL           |
| `/flow:diagram <id>`             | Visualize a workflow        |
| `/flow:inspect <wf> <step>`      | Deep-dive into a step       |
| `/flow:validate <id>`            | Check workflow definition   |
| `/flow:recon [paths]`            | Explore codebase deeply     |
