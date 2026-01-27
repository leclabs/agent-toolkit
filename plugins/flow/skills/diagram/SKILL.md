---
description: Generate mermaid diagram for a workflow.
---

# /flow:diagram

Generate a visual mermaid flowchart diagram for a workflow.

## Usage

```
/flow:diagram [workflowId] [currentStep]
```

**Arguments:**

- `workflowId` (optional): The workflow ID to visualize (e.g., `feature-development`, `bug-fix`). If not provided, shows a selection dialog.
- `currentStep` (optional): Highlight a specific step in the diagram

## What To Do

### 1. Parse Arguments

Extract the workflow ID and optional current step from the command args.

### 2. If No Workflow ID Provided

Call `Navigator.SelectWorkflow` which returns a `dialog` array for user selection. Pass it directly to `AskUserQuestion`:

```javascript
const result = await Navigator.SelectWorkflow();
// dialog is an array of question objects for multi-pane selection
const answers = await AskUserQuestion({ questions: result.dialog });
// Find workflow where name matches any answered question
const workflow = result.workflows.find((w) => Object.values(answers).includes(w.name));
const workflowId = workflow.id;
```

### 3. Call Navigator Diagram Tool

Use `Navigator.Diagram`:

```json
{
  "workflowType": "<workflowId>",
  "currentStep": "<currentStep>" // optional
}
```

### 4. Display Results

The tool returns:

- A mermaid flowchart diagram with color-coded steps:
  - Green: Start step
  - Blue: Success/terminal step
  - Pink: HITL (human-in-the-loop) step
  - Gold: Current step (if specified)
- A table of all steps with stage, name, agent, and instructions

Display the output directly to the user.

## Examples

Show the feature development workflow:

```
/flow:diagram feature-development
```

Show bug-fix workflow highlighting the investigate step:

```
/flow:diagram bug-fix investigate
```

## If Workflow Not Found

```
Workflow '<workflowId>' not found.

Run /flow:list to see available workflows.
```
