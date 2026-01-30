## Workflow: Bug Fix

Workflow for fixing bugs: reproduce, investigate, fix, verify, and create PR.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    reproduce["Reproduce Bug<br/><small>Investigator</small>"]
    investigate["Investigate<br/><small>Investigator</small>"]
    write_fix["Write Fix<br/><small>Developer</small>"]
    add_regression_test["Add Regression Test<br/><small>Tester</small>"]
    verify_fix["Verify Fix<br/><small>Tester</small>"]
    lint_format{"Lint and Format"}
    commit["Commit Changes<br/><small>Developer</small>"]
    end_success[["Fixed"]]
    hitl_cannot_reproduce{{"Cannot Reproduce"}}
    hitl_fix_failed{{"Fix Failed"}}

    start --> reproduce
    reproduce -->|passed| investigate
    reproduce -->|failed| hitl_cannot_reproduce
    investigate --> write_fix
    write_fix --> add_regression_test
    add_regression_test --> verify_fixloadProjectWorkflows
    verify_fix -->|failed| write_fix
    verify_fix -->|failed| hitl_fix_failed
    verify_fix -->|passed| lint_format
    lint_format -->|passed| commit
    lint_format -->|failed| write_fix
    lint_format -->|failed| hitl_fix_failed
    commit --> end_success

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_cannot_reproduce,hitl_fix_failed hitlStep
    class lint_format gateStep
    class end_success currentStep
```

### Step Instructions

| Stage         | Step                | Name                | Agent              | Instructions                                                  |
| ------------- | ------------------- | ------------------- | ------------------ | ------------------------------------------------------------- |
| investigation | reproduce           | Reproduce Bug       | @flow:Investigator | Understand the bug and create a reliable reproduction case    |
| investigation | investigate         | Investigate         | @flow:Investigator | Find root cause by tracing code paths and debugging           |
| development   | write_fix           | Write Fix           | @flow:Developer    | Implement the fix with minimal changes                        |
| development   | add_regression_test | Add Regression Test | @flow:Tester       | Write a test that would have caught this bug                  |
| verification  | verify_fix          | Verify Fix          | @flow:Tester       | Run all tests and verify the bug is fixed                     |
| delivery      | lint_format         | Lint & Format       | @flow:Developer    | Run lint and format checks. Auto-fix issues where possible.   |
| delivery      | commit              | Commit Changes      | @flow:Developer    | Commit the fix and regression test with a descriptive message |
