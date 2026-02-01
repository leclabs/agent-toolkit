## Workflow: Build-Review Quick

Low-scrutiny iterative build-review loop. A lightweight review pass ensures basic correctness before delivery. Suited for low-risk or well-understood changes.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    build["Build<br/><small>Developer</small>"]
    review{"Quick Review"}
    lint_format{"Lint and Format"}
    commit["Commit Changes<br/><small>Developer</small>"]
    end_success[["Complete"]]
    hitl_blocked{{"Blocked"}}

    start --> build
    build --> review
    review -->|failed| build
    review -->|failed| hitl_blocked
    review -->|passed| lint_format
    lint_format -->|passed| commit
    lint_format -->|failed| build
    lint_format -->|failed| hitl_blocked
    commit --> end_success
    hitl_blocked -->|passed| build

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef forkJoinStep fill:#FFEAA7,stroke:#FDCB6E
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_blocked hitlStep
    class review,lint_format gateStep
```

### Step Instructions

| Stage | Step | Name | Agent | Instructions |
|-------|------|------|-------|--------------|
| development | build | Build | Developer | Implement or revise the changes based on requirements or review feedback |
| verification | review | Quick Review | Reviewer | Lightweight review checking basic correctness and completeness |
| delivery | lint_format | Lint & Format | Developer | Run lint and format checks. Auto-fix issues where possible. |
| delivery | commit | Commit Changes | Developer | Commit all changes with a descriptive message summarizing the work done |