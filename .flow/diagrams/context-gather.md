## Workflow: Context Gather

Toy workflow demonstrating fork/join. Fans out into three parallel information-gathering branches (system info, weather, repository), then synthesizes everything into a single summary.

### Diagram

```mermaid
flowchart TD
    start(("Start"))
    fork_gather(["Fork Gather"])
    system_info["System Information<br/><small>🔍 Investigator</small>"]
    weather_info["Weather Report<br/><small>📋 Planner</small>"]
    repo_info["Repository Information<br/><small>🔍 Investigator</small>"]
    repo_analyze["Analyze Repository<br/><small>👀 Reviewer</small>"]
    join_gather(["Join Gather"])
    summarize["Summarize Context<br/><small>🏛️ Architect</small>"]
    end_success[["Context Gathered"]]
    hitl_failed{{"✋ Gather Failed"}}

    start --> fork_gather
    fork_gather -->|Gather system information| system_info
    fork_gather -->|Get today's weather| weather_info
    fork_gather -->|Get repository information| repo_info
    system_info --> join_gather
    weather_info --> join_gather
    repo_info -->|passed| repo_analyze
    repo_info -->|failed| join_gather
    repo_analyze --> join_gather
    join_gather -->|All branches complete| summarize
    join_gather -->|One or more branches failed| hitl_failed
    summarize --> end_success
    hitl_failed -->|Human resolved issue, retry| fork_gather

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef forkJoinStep fill:#FFEAA7,stroke:#FDCB6E
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_failed hitlStep
    class fork_gather,join_gather forkJoinStep
```

### Step Instructions

| Stage | Step | Name | Agent | Instructions |
|-------|------|------|-------|--------------|
| investigation | system_info | System Information | 🔍 Investigator | Gather system information: OS, architecture, CPU, memory, disk, shell, environment. Run uname, hostname, and similar commands. |
| investigation | weather_info | Weather Report | 📋 Planner | Get today's weather at the user's location. Use a web search or weather API to find current conditions, temperature, and forecast. |
| investigation | repo_info | Repository Information | 🔍 Investigator | Gather information about the current git repository: remote URL, branch, recent commits, language breakdown, directory structure overview, and package metadata. |
| investigation | repo_analyze | Analyze Repository | 👀 Reviewer | Analyze the repository structure and health: test coverage status, dependency freshness, code organization patterns, and any notable architectural decisions. |
| planning | summarize | Summarize Context | 🏛️ Architect | Combine findings from all three branches into a single context summary. Present system info, weather, and repo info in a clear, readable format. |
