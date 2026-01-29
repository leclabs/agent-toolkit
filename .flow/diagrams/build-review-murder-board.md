## Workflow: Build-Review Murder Board

High-scrutiny iterative build-review loop. A fresh reviewer agent tears apart each build attempt with maximum rigor. Ideal for critical changes requiring independent verification.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    build["Build<br/><small>Developer</small>"]
    review{"Murder Board Review"}
    lint_format{"Lint & Format"}
    commit["Commit Changes<br/><small>Developer</small>"]
    end_success[["Approved"]]
    hitl_blocked{{"Review Blocked"}}

    start --> build
    build --> review
    review -->|failed| build
    review -->|failed| hitl_blocked
    review -->|passed| lint_format
    lint_format -->|passed| commit
    lint_format -->|failed| build
    lint_format -->|failed| hitl_blocked
    commit --> end_success

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_blocked hitlStep
    class review,lint_format gateStep
```

### Step Instructions

| Stage        | Step        | Name                | Agent           | Instructions                                                                                                                                    |
| ------------ | ----------- | ------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| development  | build       | Build               | @flow:Developer | Implement or revise the changes based on requirements or review feedback                                                                        |
| verification | review      | Murder Board Review | @flow:Reviewer  | Independent high-scrutiny review. Reviewer must be a fresh agent with no prior context of this build. Approval requires confidence score >= 80. |
| delivery     | lint_format | Lint & Format       | @flow:Developer | Run lint and format checks. Auto-fix issues where possible.                                                                                     |
| delivery     | commit      | Commit Changes      | @flow:Developer | Commit all changes with a descriptive message summarizing the work done                                                                         |
