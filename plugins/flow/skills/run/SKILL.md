---
description: Execute flow tasks autonomously with subagent delegation. Primary command after task creation. Handles planning, implementation, testing, and review stages.
---

# /flow:run

Execute flow tasks autonomously, delegating to subagents based on Navigate response.

## Usage

```
/flow:run              # Execute highest priority pending task
/flow:run [taskId]     # Execute specific task
/flow:run --autonomy   # Auto-continue through stage boundaries
/flow:run [taskId] --autonomy
```

## Task Directory

Use `$CLAUDE_CODE_TASK_LIST_ID` if set, otherwise fall back to session ID:

```
~/.claude/tasks/${CLAUDE_CODE_TASK_LIST_ID:-${CLAUDE_SESSION_ID}}/
```

```javascript
const taskDir = process.env.CLAUDE_CODE_TASK_LIST_ID || "${CLAUDE_SESSION_ID}";
```

## What To Do

### 1. Get Task to Execute

**If taskId provided:**

- Construct task file path: `~/.claude/tasks/${taskDir}/{taskId}.json`
- Read task file to get metadata

**If no taskId:**

- List all task files in `~/.claude/tasks/${taskDir}/`
- Filter for flow tasks (those with `metadata.workflowType`)
- Get highest priority pending task

### 2. Autonomy Mode

When `--autonomy` is passed, set `autonomy: true` on all Navigate calls. This makes the navigator auto-continue through stage boundary end nodes (end nodes with outgoing `on: "passed"` edges to non-terminal nodes) instead of stopping at each one.

- **Normal mode**: Stops at every end node — user reviews each stage before continuing
- **Autonomy mode**: Flows through stage boundaries, stops only at truly terminal end nodes (no outgoing edges) or HITL nodes

When `autonomyContinued` is `true` in the Navigate response, log the stage transition:

```
⟩ Stage boundary auto-continued: end_planning → implement
```

### 3. Task File Integrity

**NEVER use the Write tool to create or modify task files under `~/.claude/tasks/`.** Only use `TaskCreate` and `TaskUpdate`. If the in-memory task list clears during a long subagent call, recreate the task with `TaskCreate` — do not manually write JSON to the task directory. Navigator's write-through handles file-level updates; the orchestrator must only use the task API.

### 4. The Execution Loop

Initialize an `iterationCount` at `0`. Track a `stepTrace` array of `{ step, result, action }` entries.

WHILE task not at terminal, blocked, or interrupted step:

1. **GUARD**: Check iteration count (see Loop Guards below)
2. **NAVIGATE**: Call Navigate with taskFilePath to get current step state
3. **HITL CHECK**: If terminal is `"hitl"`, handle interactively (see HITL Handling below)
4. **DELEGATE**: If subagent set, use Task tool
5. **EXECUTE**: If no subagent, handle directly
6. **ADVANCE**: Call Navigate with taskFilePath and result
7. **UPDATE**: TaskUpdate with new metadata from Navigate response
8. **RECORD**: Append `{ step, result, action }` to `stepTrace`, increment `iterationCount`
9. **REPEAT**: Continue until terminal success or user exits

### Loop Guards

Two thresholds protect against runaway loops:

**Soft guard — 25 iterations (warning):**

When `iterationCount` reaches 25, **pause execution** and present the situation to the user via `AskUserQuestion`:

```
⚠ Loop warning: 25 iterations reached for task #{taskId}

Recent steps: ... → step_a → step_b → step_a → step_b (showing last 8 from stepTrace)
Current step: {currentStep} (retryCount: {retryCount})
```

Offer these options:

| Option         | Action                                                                |
| -------------- | --------------------------------------------------------------------- |
| Continue (+25) | Reset the iteration counter and resume. Warns again at 25 more.       |
| Abort          | Stop the loop. Report current state as incomplete (see Final Report). |
| Investigate    | Show the full `stepTrace`, then abort. Helps diagnose the cycle.      |

If the user selects **Continue**, reset `iterationCount` to `0` and resume the loop.
If the user selects **Investigate**, display the full step trace table, then abort.

**Hard guard — 50 iterations (absolute stop):**

If `iterationCount` reaches 50 (i.e., the user continued past a warning and it hit 50 again, or the soft guard was somehow bypassed), **stop unconditionally**:

```
⛔ Hard loop guard: 50 iterations reached. Aborting.

Task #{taskId} may have a workflow cycle. Review the step trace:
```

Display the last 10 entries from `stepTrace` and exit the loop. Do NOT delete the task — leave it in `in_progress` so the user can investigate with `/flow:task-get` and resume with `/flow:task-advance`.

### HITL Handling

When Navigate returns `terminal: "hitl"`, the workflow has escalated to human-in-the-loop. Instead of exiting the loop silently, **pause and engage the user** via `AskUserQuestion`:

```
⚠ HITL: Task #{taskId} needs human intervention

Step: {stepId} ({stepName})
Reason: {escalation context — e.g., "Max retries exceeded at code_review"}
Steps so far: parse_requirements → implement → code_review (failed x3) → hitl_review
```

Offer these options:

| Option                            | Description                                                               |
| --------------------------------- | ------------------------------------------------------------------------- |
| I've fixed it — continue (passed) | User has resolved the issue. Advance with `passed` and resume the loop.   |
| Still failing — continue (failed) | User wants to re-escalate or try a different path. Advance with `failed`. |
| Leave pending                     | Exit the loop. Task stays `pending` for later via `/flow:task-advance`.   |

**If the user selects "I've fixed it":**

1. Call `Navigator.Navigate` with `taskFilePath` and `result: "passed"`
2. Update task status to `in_progress`
3. Resume the execution loop from the new step

**If the user selects "Still failing":**

1. Call `Navigator.Navigate` with `taskFilePath` and `result: "failed"`
2. If this leads to another terminal, handle accordingly (may re-trigger HITL or reach success)
3. Otherwise resume the loop

**If the user selects "Leave pending":**

1. Set task status to `pending` via `TaskUpdate`
2. Exit the loop
3. Show the HITL final report with resume instructions

### 5. Getting Current Step

Call `Navigator.Navigate` with taskFilePath:

```json
{
  "taskFilePath": "~/.claude/tasks/${taskDir}/1.json"
}
```

Response includes `subagent`, `stepInstructions`, `terminal`, `metadata`, etc.

### 6. Delegation Protocol

**If subagent is set (e.g., `flow:Developer`):**

Use the Task tool to delegate the step to the subagent. The `subagent` value from Navigate is already in `subagent_type` format — use it directly.

Example:

```
Task(
  subagent_type: "{subagent}",
  prompt: """
    Execute the '{stepName}' step for task {taskId}.

    ## Task
    {task subject and description}

    ## Current Step
    {stepInstructions.name}: {stepInstructions.description}

    ## Guidance
    {stepInstructions.guidance}

    ## Response Format
    Return JSON: {"success": true|false, "results": "path or inline", "summary": "brief description"}
  """
)
```

**If subagent is null:**

- Handle the step directly

### 7. Processing Results

Parse subagent response:

- `success: true` -> result = "passed"
- `success: false` -> result = "failed"

**Call Navigator.Navigate** with taskFilePath and result:

```json
{
  "taskFilePath": "~/.claude/tasks/${taskDir}/1.json",
  "result": "passed"
}
```

Navigate returns:

| Field                      | Purpose                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentStep`              | The new step                                                                                                                                                                    |
| `stage`                    | Workflow stage (e.g., `"planning"`)                                                                                                                                             |
| `subagent`                 | Who executes next step                                                                                                                                                          |
| `stepInstructions`         | `{name, description, guidance}`                                                                                                                                                 |
| `terminal`                 | `"success"` or `"hitl"` if done                                                                                                                                                 |
| `orchestratorInstructions` | Updated task description                                                                                                                                                        |
| `metadata`                 | `{ workflowType, currentStep, retryCount }`                                                                                                                                     |
| `action`                   | `"advance"`, `"retry"`, `"escalate"`, `"fork"`, or `"join"`                                                                                                                     |
| `retriesIncremented`       | `true` if retry count increased                                                                                                                                                 |
| `autonomyContinued`        | `true` if auto-continued through stage boundary                                                                                                                                 |
| `fork`                     | `{ branches, joinStep, joinStrategy }` when action is `"fork"` — branches are enriched with `subagent`, `stepInstructions`, `orchestratorInstructions`, `multiStep`, `metadata` |
| `join`                     | `{ forkStep, strategy }` when action is `"join"`                                                                                                                                |

Then call TaskUpdate to sync status (Navigator's write-through has already updated subject, activeForm, description, and metadata in the task file):

```json
{
  "taskId": "1",
  "status": "in_progress"
}
```

### 8. Progress Reporting

After each step, show brief progress:

```
✓ parse_requirements (flow:Planner) → passed
✓ implement (flow:Developer) → passed
⟳ test (flow:Tester) → in progress...
```

### Fork/Join Handling

When Navigate returns `action: "fork"`, the workflow has branched into parallel work. The fork response includes **enriched per-branch data** — subagent, stepInstructions, orchestratorInstructions, metadata, and multiStep flag — so the orchestrator can create child tasks and launch agents without additional Navigate calls.

**Fork** (when `action === "fork"`):

**Step 1 — Read enriched fork data:**

Extract from Navigate response:

- `fork.branches` — map of branch name → enriched branch info
- `fork.joinStep` — the join node ID
- `fork.joinStrategy` — `"all-pass"` or `"any-pass"`

Each branch object includes:

- `entryStep` — first step ID for the branch
- `description` — branch description
- `subagent` — Task tool `subagent_type` value (e.g., `"flow:Developer"`)
- `stage` — workflow stage
- `stepInstructions` — `{ name, description, guidance }`
- `orchestratorInstructions` — ready-to-use task description
- `maxRetries` — entry step retry count
- `multiStep` — `true` if branch has steps beyond the entry step before the join
- `metadata` — `{ workflowType, currentStep, retryCount }` ready for task creation

**Step 2 — Create all child tasks in parallel:**

Use multiple `TaskCreate` calls in a **single message**. Each uses branch data directly (no Navigate calls needed):

```
TaskCreate(
  subject: "#{parentId}/{branchName} {userDescription}
→ {workflowType} · {entryStep} ({subagent})",
  activeForm: "{stepInstructions.name} ({subagent})",
  description: "{orchestratorInstructions}",
  metadata: {
    ...branchInfo.metadata,
    userDescription,
    parentTaskId: "{current taskId}",
    forkStep: "{fork step id}",
    branchName: "{branch name}"
  }
)
```

**Step 3 — Record forkState:**

Update parent task via `TaskUpdate` with `forkState`:

```json
{
  "forkStep": "fork_impl",
  "joinStep": "join_impl",
  "joinStrategy": "all-pass",
  "branches": {
    "frontend": { "status": "running", "childTaskId": "42" },
    "backend": { "status": "running", "childTaskId": "43" }
  }
}
```

**Step 4 — Start child tasks:**

Mark all child tasks as `in_progress` in a **single message** (parallel `TaskUpdate` calls):

```
TaskUpdate(taskId: "{childTaskId}", status: "in_progress")
```

**Step 5 — Execute all branches in parallel:**

Launch multiple `Task` tool calls in a **single message** (one per branch). The prompt varies by `multiStep`:

- **Single-step** (`multiStep: false`): Standard delegation prompt. The agent executes the step using the enriched `orchestratorInstructions` and returns a result. No Navigate calls needed within the branch.

  ```
  Task(
    subagent_type: "{branch.subagent}",
    prompt: """
      Execute the '{stepInstructions.name}' step for branch '{branchName}'.

      ## Task
      {userDescription}

      ## Current Step
      {stepInstructions.name}: {stepInstructions.description}

      ## Guidance
      {stepInstructions.guidance}

      ## Response Format
      Return JSON: {"success": true|false, "summary": "brief description"}
    """
  )
  ```

- **Multi-step** (`multiStep: true`): The agent runs a Navigate-advance loop within the branch. It starts at `entryStep`, delegates each step, advances via Navigate with the child's `taskFilePath`, and continues until `action === "join"` (branch reached the join node).

  ```
  Task(
    subagent_type: "{branch.subagent}",
    prompt: """
      Execute multi-step branch '{branchName}' starting at '{entryStep}'.

      Task file: {childTaskFilePath}

      Run the Navigate-advance loop:
      1. Execute the current step using orchestratorInstructions
      2. Call Navigate with taskFilePath and result ("passed"/"failed")
      3. If action === "join", exit — branch is complete
      4. Otherwise delegate the next step and repeat

      ## Task
      {userDescription}

      ## First Step
      {stepInstructions.name}: {stepInstructions.description}

      ## Guidance
      {stepInstructions.guidance}

      ## Response Format
      Return JSON: {"success": true|false, "summary": "brief description"}
    """
  )
  ```

**Step 6 — Collect & join:**

After all branch Task calls complete:

1. Parse each branch result (`"passed"` or `"failed"`)
2. Apply `fork.joinStrategy`:
   - `all-pass`: all branches passed → `"passed"`, otherwise `"failed"`
   - `any-pass`: at least one branch passed → `"passed"`, otherwise `"failed"`
3. Call `Navigate` on parent with `taskFilePath` and the computed result to advance through the join
4. Delete child tasks via `TaskUpdate({ status: "deleted" })`
5. Clear `forkState` from parent metadata via `TaskUpdate`
6. Resume the normal execution loop

**Progress reporting for fork/join:**

```
⑂ Fork: fork_investigate → 3 branches
  ├─ reproduce (#42): ✓ passed
  ├─ code_archaeology (#43): ✓ passed
  └─ git_forensics (#44): ✓ passed
⑃ Join: join_investigate (all-pass) → passed
✓ synthesize → passed
```

### 9. Loop Termination

Exit when:

- Task reaches terminal success
- HITL triggered and user selects "Leave pending"
- User interrupts
- Soft guard triggered (25 iterations) and user selects Abort or Investigate
- Hard guard triggered (50 iterations)

Note: HITL does **not** automatically exit the loop. The user is given the choice to fix and continue or leave pending.

### 10. Final Report

**Success:**

```
Completed: #1 Add user auth ✨ (flow:Developer)
 → feature-development · end
 → end_success · completed ✓

Steps: parse_requirements → implement → test → commit → end_success
```

**HITL (user selected "Leave pending"):**

```
⚠ HITL: #1 Add user auth ✨ (direct)
 → feature-development · verification
 → hitl_test · pending

Reason: Max retries exceeded at test step
Action: Fix manually, then `/flow:task-advance {taskId} passed` to resume
```

**Loop guard (aborted):**

```
⛔ Aborted: #1 Add user auth ✨
 → feature-development · development
 → implement · in_progress (iteration 25)

Reason: Loop guard triggered after 25 iterations
Last steps: ... → implement → lint_format → implement → lint_format
Action: Investigate with `/flow:task-get {taskId}`, resume with `/flow:task-advance {taskId} <passed|failed>`
```
