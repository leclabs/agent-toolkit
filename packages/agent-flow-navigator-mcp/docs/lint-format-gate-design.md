# Lint-Format Gate Design

Design specification for adding a `lint_format` gate node to commit workflows.

## Node Definition

```json
{
  "lint_format": {
    "type": "gate",
    "name": "Lint & Format",
    "description": "Run lint and format checks. Auto-fix issues where possible.",
    "agent": "Developer",
    "stage": "delivery",
    "maxRetries": 3
  }
}
```

### Rationale

- **type: gate** - Quality gate that can pass/fail; controls flow progression
- **agent: Developer** - Same agent that commits; keeps context for auto-fixes
- **stage: delivery** - Runs immediately before commit in the delivery phase
- **maxRetries: 3** - Allows multiple auto-fix attempts before escalation

## Edge Pattern

Every `lint_format` gate has 3 outgoing edges:

| Edge | Condition    | Target              | Purpose                        |
| ---- | ------------ | ------------------- | ------------------------------ |
| 1    | `on: passed` | `commit`            | Lint passes, proceed to commit |
| 2    | `on: failed` | Implementation node | Retry: fix issues and rerun    |
| 3    | `on: failed` | HITL node           | Escalation: retries exhausted  |

## Workflow Integration

### 1. feature-development

**Insertion point:** Between `code_review` and `commit`

```
code_review --[passed]--> lint_format --[passed]--> commit
                              |
                              +--[failed]--> implement (retry)
                              +--[failed]--> hitl_impl_failed (escalation)
```

| Edge | From        | To               | Condition | Label                       |
| ---- | ----------- | ---------------- | --------- | --------------------------- |
| 1    | lint_format | commit           | passed    | Lint passes, commit changes |
| 2    | lint_format | implement        | failed    | Fix lint/format issues      |
| 3    | lint_format | hitl_impl_failed | failed    | Lint issues persist         |

**Changes required:**

- Add `lint_format` node
- Change `code_review --[passed]--> commit` to `code_review --[passed]--> lint_format`
- Add 3 edges from `lint_format`

---

### 2. bug-fix

**Insertion point:** Between `verify_fix` and `commit`

```
verify_fix --[passed]--> lint_format --[passed]--> commit
                              |
                              +--[failed]--> write_fix (retry)
                              +--[failed]--> hitl_fix_failed (escalation)
```

| Edge | From        | To              | Condition | Label                       |
| ---- | ----------- | --------------- | --------- | --------------------------- |
| 1    | lint_format | commit          | passed    | Lint passes, commit changes |
| 2    | lint_format | write_fix       | failed    | Fix lint/format issues      |
| 3    | lint_format | hitl_fix_failed | failed    | Lint issues persist         |

**Changes required:**

- Add `lint_format` node
- Change `verify_fix --[passed]--> commit` to `verify_fix --[passed]--> lint_format`
- Add 3 edges from `lint_format`

---

### 3. quick-task

**Insertion point:** Between `verify` and `end_success` (add commit step)

The quick-task workflow currently goes directly from `verify` to `end_success`. Adding lint-format requires also adding a commit step.

```
verify --[passed]--> lint_format --[passed]--> commit --> end_success
                          |
                          +--[failed]--> execute (retry)
                          +--[failed]--> hitl_blocked (escalation)
```

| Edge | From        | To           | Condition | Label                       |
| ---- | ----------- | ------------ | --------- | --------------------------- |
| 1    | lint_format | commit       | passed    | Lint passes, commit changes |
| 2    | lint_format | execute      | failed    | Fix lint/format issues      |
| 3    | lint_format | hitl_blocked | failed    | Lint issues persist         |

**Changes required:**

- Add `lint_format` node
- Add `commit` node (does not exist in quick-task)
- Change `verify --[passed]--> end_success` to `verify --[passed]--> lint_format`
- Add 3 edges from `lint_format`
- Add edge `commit --> end_success`

---

### 4. agile-task

**Insertion point:** Between `review` and `commit`

```
review --[passed]--> lint_format --[passed]--> commit
                          |
                          +--[failed]--> implement (retry)
                          +--[failed]--> hitl_failed (escalation)
```

| Edge | From        | To          | Condition | Label                       |
| ---- | ----------- | ----------- | --------- | --------------------------- |
| 1    | lint_format | commit      | passed    | Lint passes, commit changes |
| 2    | lint_format | implement   | failed    | Fix lint/format issues      |
| 3    | lint_format | hitl_failed | failed    | Lint issues persist         |

**Changes required:**

- Add `lint_format` node
- Change `review --[passed]--> commit` to `review --[passed]--> lint_format`
- Add 3 edges from `lint_format`

---

### 5. test-coverage

**Insertion point:** Between `review` and `commit`

```
review --[passed]--> lint_format --[passed]--> commit
                          |
                          +--[failed]--> write_tests (retry)
                          +--[failed]--> hitl_failed (escalation)
```

| Edge | From        | To          | Condition | Label                       |
| ---- | ----------- | ----------- | --------- | --------------------------- |
| 1    | lint_format | commit      | passed    | Lint passes, commit changes |
| 2    | lint_format | write_tests | failed    | Fix lint/format issues      |
| 3    | lint_format | hitl_failed | failed    | Lint issues persist         |

**Changes required:**

- Add `lint_format` node
- Change `review --[passed]--> commit` to `review --[passed]--> lint_format`
- Add 3 edges from `lint_format`

---

### 6. ui-reconstruction

**Insertion point:** Between `final_review` and `end_success` (add commit step)

The ui-reconstruction workflow currently goes directly from `final_review` to `end_success`. Adding lint-format requires also adding a commit step.

```
final_review --[passed]--> lint_format --[passed]--> commit --> end_success
                                |
                                +--[failed]--> uiRebuild_build (retry)
                                +--[failed]--> hitl_final_failed (escalation)
```

| Edge | From        | To                | Condition | Label                       |
| ---- | ----------- | ----------------- | --------- | --------------------------- |
| 1    | lint_format | commit            | passed    | Lint passes, commit changes |
| 2    | lint_format | uiRebuild_build   | failed    | Fix lint/format issues      |
| 3    | lint_format | hitl_final_failed | failed    | Lint issues persist         |

**Changes required:**

- Add `lint_format` node
- Add `commit` node (does not exist in ui-reconstruction)
- Change `final_review --[passed]--> end_success` to `final_review --[passed]--> lint_format`
- Add 3 edges from `lint_format`
- Add edge `commit --> end_success`

---

## Excluded Workflow

### context-optimization

**No commit step needed.** This workflow focuses on context/instruction improvements and ends at the `verify` step without a delivery phase that commits code. The workflow could optionally be extended later, but it is excluded from this design.

---

## Summary Table

| Workflow            | Predecessor  | Implementation Node | HITL Node         | Needs Commit Node |
| ------------------- | ------------ | ------------------- | ----------------- | ----------------- |
| feature-development | code_review  | implement           | hitl_impl_failed  | No                |
| bug-fix             | verify_fix   | write_fix           | hitl_fix_failed   | No                |
| quick-task          | verify       | execute             | hitl_blocked      | Yes               |
| agile-task          | review       | implement           | hitl_failed       | No                |
| test-coverage       | review       | write_tests         | hitl_failed       | No                |
| ui-reconstruction   | final_review | uiRebuild_build     | hitl_final_failed | Yes               |

## Implementation Order

1. **feature-development** - Most complete workflow, good baseline
2. **bug-fix** - Similar pattern, tests edge naming
3. **agile-task** - Simple case with existing commit
4. **test-coverage** - Simple case with existing commit
5. **quick-task** - Requires adding commit node
6. **ui-reconstruction** - Requires adding commit node, complex workflow
