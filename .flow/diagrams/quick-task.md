## Workflow: Quick Task

Minimal workflow for small, straightforward tasks. Understand, execute, verify - no formal review gates.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    understand["Understand<br/><small>Developer</small>"]
    execute["Execute<br/><small>Developer</small>"]
    verify["Verify<br/><small>Developer</small>"]
    end_success[["Done"]]
    hitl_blocked{{"Blocked"}}

    start --> understand
    understand --> execute
    execute --> verify
    verify -->|passed| end_success
    verify -->|failed| execute
    verify -->|failed| hitl_blocked

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_blocked hitlStep
```

### Step Instructions

| Stage | Step | Name | Agent | Instructions |
|-------|------|------|-------|--------------|
| planning | understand | Understand | @flow:Developer | Clarify what needs to be done and identify the approach |
| development | execute | Execute | @flow:Developer | Make the changes or complete the work |
| verification | verify | Verify | @flow:Developer | Confirm the work is correct and complete |