## Workflow: Test Coverage

Analyze test coverage gaps and write tests to improve coverage.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    analyze_coverage["Analyze Coverage<br/><small>Tester</small>"]
    identify_gaps["Identify Gaps<br/><small>Planner</small>"]
    write_tests["Write Tests<br/><small>Tester</small>"]
    run_tests["Run Tests<br/><small>Tester</small>"]
    review{"Review"}
    lint_format{"Lint and Format"}
    commit["Commit Tests<br/><small>Developer</small>"]
    end_success[["Complete"]]
    hitl_failed{{"Needs Help"}}

    start --> analyze_coverage
    analyze_coverage --> identify_gaps
    identify_gaps --> write_tests
    write_tests --> run_tests
    run_tests -->|failed| write_tests
    run_tests -->|failed| hitl_failed
    run_tests -->|passed| review
    review -->|failed| write_tests
    review -->|failed| hitl_failed
    review -->|passed| lint_format
    lint_format -->|passed| commit
    lint_format -->|failed| write_tests
    lint_format -->|failed| hitl_failed
    commit --> end_success
    hitl_failed -->|passed| write_tests

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef forkJoinStep fill:#FFEAA7,stroke:#FDCB6E
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_failed hitlStep
    class review,lint_format gateStep
```

### Step Instructions

| Stage | Step | Name | Agent | Instructions |
|-------|------|------|-------|--------------|
| analysis | analyze_coverage | Analyze Coverage | flow:Tester | Run coverage tools and identify untested code paths |
| analysis | identify_gaps | Identify Gaps | flow:Planner | Prioritize coverage gaps by risk and importance |
| development | write_tests | Write Tests | flow:Tester | Write tests for identified gaps |
| verification | run_tests | Run Tests | flow:Tester | Execute test suite and verify new tests pass |
| verification | review | Review | flow:Reviewer | Review test quality and coverage improvement |
| delivery | lint_format | Lint & Format | flow:Developer | Run lint and format checks. Auto-fix issues where possible. |
| delivery | commit | Commit Tests | flow:Developer | Commit new tests with coverage metrics |
