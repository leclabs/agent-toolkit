## Workflow: Context Optimization

Workflow for optimizing agent context, instructions, and integration points. Use when improving how agents communicate and preserve state.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    map_connections["Map Connections<br/><small>Context Engineer</small>"]
    identify_pathologies["Identify Pathologies<br/><small>Context Engineer</small>"]
    design_improvements["Design Improvements<br/><small>Context Engineer</small>"]
    review_design{"Review Design"}
    implement["Implement<br/><small>Developer</small>"]
    verify["Verify<br/><small>Tester</small>"]
    end_success[["Complete"]]
    hitl_failed{{"Needs Help"}}

    start --> map_connections
    map_connections --> identify_pathologies
    identify_pathologies --> design_improvements
    design_improvements --> review_design
    review_design -->|failed| design_improvements
    review_design -->|failed| hitl_failed
    review_design -->|passed| implement
    implement --> verify
    verify -->|failed| implement
    verify -->|failed| hitl_failed
    verify -->|passed| end_success

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_failed hitlStep
    class review_design gateStep
```

### Step Instructions

| Stage          | Step                 | Name                 | Agent                  | Instructions                                                                            |
| -------------- | -------------------- | -------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| analysis       | map_connections      | Map Connections      | @flow:Context Engineer | Identify all connection points between components (MCP, skills, agents, subagents)      |
| analysis       | identify_pathologies | Identify Pathologies | @flow:Context Engineer | Find context pathologies: specification bloat, attention dilution, redundant framing    |
| design         | design_improvements  | Design Improvements  | @flow:Context Engineer | Apply compression techniques: lead with conclusions, causal chains, precise terminology |
| design         | review_design        | Review Design        | @flow:Reviewer         | Verify improvements don't sacrifice meaning for brevity                                 |
| implementation | implement            | Implement            | @flow:Developer        | Apply the optimizations to actual files and configurations                              |
| verification   | verify               | Verify               | @flow:Tester           | Test that agents still function correctly with optimized context                        |
