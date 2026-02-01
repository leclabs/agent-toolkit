## Workflow: HITL Test

Minimal workflow for testing HITL recovery: work, gate, escalate, human resumes.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    work["Do Work<br/><small>Developer</small>"]
    check{"Check"}
    end_success[["Done"]]
    hitl_blocked{{"Blocked"}}

    start --> work
    work --> check
    check -->|passed| end_success
    check -->|failed| work
    check -->|failed| hitl_blocked
    hitl_blocked -->|passed| work

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef forkJoinStep fill:#FFEAA7,stroke:#FDCB6E
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_blocked hitlStep
    class check gateStep
```

### Step Instructions

| Stage | Step | Name | Agent | Instructions |
|-------|------|------|-------|--------------|
| development | work | Do Work | Developer | Do the thing |
| verification | check | Check | Reviewer | Pass or fail |