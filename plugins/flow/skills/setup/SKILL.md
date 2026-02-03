---
description: Set up flow workflows and agents for a project. Interactive, intent-driven, or bulk setup from catalog.
---

# /flow:setup

Set up flow workflow orchestration for this project. Combines catalog browsing, intent matching, and custom workflow authoring into a single interactive experience.

## Entry Modes

| Invocation                  | Behavior                                         |
| --------------------------- | ------------------------------------------------ |
| `/flow:setup`               | Interactive: ask what they need                  |
| `/flow:setup "description"` | Intent-driven: match description against catalog |
| `/flow:setup --all`         | Bulk copy all workflows + agents                 |

## What To Do

### Phase 1 — Understand Intent

**No args** → use `AskUserQuestion`:

```
AskUserQuestion(
  question: "How would you like to set up flow?",
  header: "Setup mode",
  options: [
    {"label": "Describe what I need", "description": "Match your description against the catalog"},
    {"label": "Browse the catalog", "description": "See all workflows and pick what you want"},
    {"label": "Set up everything", "description": "Copy all workflows and agents"},
    {"label": "Custom workflow", "description": "Create a new workflow from scratch"}
  ]
)
```

- "Describe what I need" → ask for description, then go to Phase 2 (intent matching)
- "Browse the catalog" → go to Phase 2 (catalog browsing)
- "Set up everything" → bulk copy all workflows + agents, skip to Phase 4
- "Custom workflow" → go to Phase 3

**Description provided** (e.g., `/flow:setup "add user auth"`) → skip to Phase 2 (intent matching).

**`--all` flag** → bulk copy all workflows + agents, skip to Phase 4.

### Phase 2 — Match or Browse

#### Intent Matching (description provided)

1. Call `Navigator.ListCatalog` to get all workflows with descriptions
2. Analyze the user's description against the catalog semantically
3. Present the top 2-3 matches via `AskUserQuestion`:

```
AskUserQuestion(
  question: "These workflows match your description. Which ones do you want?",
  header: "Workflows",
  multiSelect: true,
  options: [
    {"label": "feature-development", "description": "Full lifecycle: plan, implement, test, review, PR"},
    {"label": "agile-task", "description": "General task: analyze, implement, test, review"},
    {"label": "None — create custom", "description": "Build a new workflow from scratch"}
  ]
)
```

- If user selects catalog workflows → call `Navigator.CopyWorkflows` with selected IDs
- If user selects "None — create custom" → go to Phase 3
- After copying, offer customization:

```
AskUserQuestion(
  question: "How do you want to use the copied workflow(s)?",
  header: "Customize",
  options: [
    {"label": "Use as-is", "description": "Ready to go, skip to agent setup"},
    {"label": "Review and tweak", "description": "Open the workflow JSON for editing"},
    {"label": "Show diagram first", "description": "Visualize before deciding"}
  ]
)
```

- "Use as-is" → proceed to Phase 4
- "Review and tweak" → read the workflow JSON, present it, let user request changes, write back
- "Show diagram first" → call `Navigator.Diagram` for each, then ask again

#### Catalog Browsing (no description)

1. Call `Navigator.ListCatalog` to get `workflowSelectionOptions`
2. Present via `AskUserQuestion` with `multiSelect: true`:

```
AskUserQuestion(
  question: "Select workflows to copy to your project:",
  header: "Workflows",
  multiSelect: true,
  options: <workflowSelectionOptions from ListCatalog>
)
```

3. Call `Navigator.CopyWorkflows` with selected workflow IDs
4. Proceed to Phase 4

### Phase 3 — Custom Authoring

Interactive workflow design:

#### 3a. Name and ID

Infer from description if available, otherwise ask:

```
AskUserQuestion(
  question: "What should this workflow be called?",
  header: "Name",
  options: [
    {"label": "<inferred-name>", "description": "ID: <inferred-id>"},
    {"label": "Let me type it", "description": "Enter a custom name"}
  ]
)
```

#### 3b. Starting Point

```
AskUserQuestion(
  question: "Start from a catalog template or blank canvas?",
  header: "Template",
  options: [
    {"label": "<closest-match>", "description": "Closest catalog workflow — customize from there"},
    {"label": "Blank canvas", "description": "Define all steps from scratch"}
  ]
)
```

If starting from template: copy it first via `Navigator.CopyWorkflows`, then modify.

#### 3c. Steps

Present proposed steps as a table for approval (not one-by-one):

```markdown
## Proposed Steps

| #   | Step ID   | Name                 | Type | Agent     |
| --- | --------- | -------------------- | ---- | --------- |
| 1   | analyze   | Analyze Requirements | task | Planner   |
| 2   | implement | Implement            | task | Developer |
| 3   | test      | Write Tests          | task | Tester    |
| 4   | review    | Code Review          | gate | Reviewer  |
| 5   | commit    | Commit               | task | Developer |
```

```
AskUserQuestion(
  question: "Does this step plan look right?",
  header: "Steps",
  options: [
    {"label": "Looks good", "description": "Proceed with these steps"},
    {"label": "Need changes", "description": "Add, remove, or modify steps"},
    {"label": "Start over", "description": "Rethink the workflow"}
  ]
)
```

#### 3d. Gate/Retry Configuration

For any gate steps, configure retry behavior:

```markdown
## Gate Configuration

| Gate   | Max Retries | Retry Target | Escalation |
| ------ | ----------- | ------------ | ---------- |
| review | 2           | implement    | HITL       |
```

Confirm or adjust.

#### 3e. Build and Save

1. Build the workflow JSON following the schema (see scaffold schema below)
2. Write to `.flow/workflows/{id}/workflow.json`
3. Call `Navigator.LoadWorkflows` with `{ "workflowIds": ["{id}"] }`
4. Call `Navigator.Diagram` to generate and display the diagram

**Workflow JSON schema:**

```json
{
  "id": "<workflow-id>",
  "name": "<Workflow Name>",
  "description": "<One-sentence description>",
  "nodes": {
    "start": { "type": "start", "name": "Start" },
    "<step_id>": {
      "type": "task|gate",
      "name": "<Step Name>",
      "description": "<What this step does>",
      "agent": "<Agent name>",
      "stage": "<planning|development|verification|delivery>",
      "maxRetries": 2
    },
    "end_success": { "type": "end", "result": "success", "name": "Done" }
  },
  "edges": [
    { "from": "start", "to": "<first_step>" },
    { "from": "<step>", "to": "<next_step>", "on": "passed" },
    { "from": "<gate>", "to": "<retry_target>", "on": "failed" },
    { "from": "<last_step>", "to": "end_success", "on": "passed" }
  ]
}
```

### Phase 4 — Agent Setup + Confirmation

#### Agent Setup

Determine which agents the selected/created workflow(s) reference (look at `agent` fields in nodes).

```
AskUserQuestion(
  question: "Set up agent templates? These provide specialized instructions for each role.",
  header: "Agents",
  options: [
    {"label": "Copy referenced agents", "description": "<list of agents referenced by workflows>"},
    {"label": "Copy all 7 agents", "description": "Planner, Developer, Tester, Reviewer, Investigator, Context Engineer, Architect"},
    {"label": "Skip", "description": "Use default agent behavior"}
  ]
)
```

If copying agents: call `Navigator.CopyAgents` with selected agent IDs.

#### Confirmation

Display what was set up:

```markdown
## Setup Complete

**Workflows copied to `.flow/workflows/`:**

- feature-development — Full lifecycle: plan, implement, test, review, PR
- bug-fix — Bug investigation and fix

**Agents copied to `.claude/agents/`:**

- developer — Writes code following best practices
- tester — Writes and runs tests
- reviewer — Reviews code and plans

**Next steps:**

1. Create a task: `/flow:task "description"`
2. Run workflow: `/flow:go`
3. View diagram: `/flow:diagram <id>`
```

## Bulk Mode (`--all`)

When `--all` is specified:

1. Call `Navigator.ListCatalog` to get all workflow and agent IDs
2. Call `Navigator.CopyWorkflows` with all workflow IDs
3. Call `Navigator.CopyAgents` with all agent IDs
4. Show Phase 4 confirmation summary

## Important Notes

- Workflows in `.flow/workflows/` can be customized per project
- Agent templates in `.claude/agents/` can be customized per project
- Use `/flow:load` to reload workflows after editing
- Use `/flow:list` to see currently loaded workflows
