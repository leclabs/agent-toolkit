## Workflow: Execute

Single-step workflow. Just do the thing.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    execute["Execute<br/><small>Developer</small>"]
    end_success[["Done"]]

    start --> execute
    execute --> end_success

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef forkJoinStep fill:#FFEAA7,stroke:#FDCB6E
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
```

### Step Instructions

| Stage | Step | Name | Agent | Instructions |
|-------|------|------|-------|--------------|
| development | execute | Execute | flow:Developer | Do the work described in the task. |
