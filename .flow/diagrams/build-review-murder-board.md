## Workflow: Build-Review Murder Board

High-scrutiny iterative build-review loop. A fresh reviewer agent tears apart each build attempt with maximum rigor. Ideal for critical changes requiring independent verification.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    build["Build<br/><small>🔧 Developer</small>"]
    review{"Murder Board Review<br/><small>👀 Reviewer ↻3</small>"}
    lint_format{"Lint and Format<br/><small>🔧 Developer ↻3</small>"}
    commit["Commit Changes<br/><small>🔧 Developer</small>"]
    end_success[["Approved"]]
    hitl_blocked{{"✋ Review Blocked"}}

    start --> build
    build --> review
    review -->|Revise build based on review feedback| build
    review -->|Review failures exhausted retries| hitl_blocked
    review -->|Review passed, run lint checks| lint_format
    lint_format -->|Lint passes, commit changes| commit
    lint_format -->|Fix lint/format issues| build
    lint_format -->|Lint issues persist| hitl_blocked
    commit --> end_success
    hitl_blocked -->|Human resolved issue, resume| build

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
| development | build | Build | 🔧 Developer | Implement or revise the changes based on requirements or review feedback |
| verification | review | Murder Board Review | 👀 Reviewer | Independent high-scrutiny review. Reviewer must be a fresh agent with no prior context of this build. Approval requires confidence score >= 80. |
| delivery | lint_format | Lint & Format | 🔧 Developer | Run lint and format checks. Auto-fix issues where possible. |
| delivery | commit | Commit Changes | 🔧 Developer | Commit all changes with a descriptive message summarizing the work done |
