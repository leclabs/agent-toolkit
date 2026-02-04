# Flow Test Script

Quick walkthrough to verify the flow system works.

## Prerequisites

- Claude Code with `flow` plugin installed
- Navigator MCP server running

## Basic Flow

### 1. List workflows

```
/flow:list
```

Expected: table of available workflows.

### 2. Visualize a workflow

```
/flow:diagram feature-development
```

Expected: mermaid flowchart.

### 3. Create and run a task

```
/flow:task add a hello world function to utils.js
/flow:go
```

Expected: task executes through workflow steps.

## Setup (Optional)

Copy workflows to project for customization:

```
/flow:setup
```

## Quick Reference

| Command                    | Description                 |
| -------------------------- | --------------------------- |
| `/flow:list`               | List available workflows    |
| `/flow:diagram <workflow>` | Visualize workflow          |
| `/flow:task <desc>`        | Create task with workflow   |
| `/flow:go`                 | Execute pending tasks       |
| `/flow:setup`              | Copy workflows to project   |
| `/flow:recon`              | Deep project reconnaissance |
