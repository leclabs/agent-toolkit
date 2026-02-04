## Workflow: Odd/Even Test

Test workflow demonstrating fork with single branch, retry logic. Compute determines if task ID is odd/even, check fails odd tasks (with retries) and passes even tasks.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    fork_tasks(["Fork Tasks"])
    compute["Compute Parity<br/><small>Bash</small>"]
    check{"Check Parity<br/><small>↻3</small>"}
    join_tasks(["Join Tasks"])
    end_success[["Complete"]]
    hitl_failed{{"✋ Max Retries Exceeded"}}

    start --> fork_tasks
    fork_tasks -->|Process task| compute
    compute -->|passed| check
    check -->|passed| join_tasks
    check -->|Retry| compute
    check -->|Max retries exceeded| hitl_failed
    join_tasks -->|passed| end_success
    join_tasks -->|failed| hitl_failed
    hitl_failed -->|Human resolved| join_tasks

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef forkJoinStep fill:#FFEAA7,stroke:#FDCB6E
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_failed hitlStep
    class check gateStep
    class fork_tasks,join_tasks forkJoinStep
```

### Step Instructions

| Stage | Step | Name | Agent | Instructions |
|-------|------|------|-------|--------------|
| investigation | compute | Compute Parity | Bash | Determine if the task ID is odd or even. Store the result. |
| verification | check | Check Parity | - | Verify parity. FAIL if task ID is odd, PASS if task ID is even. |
