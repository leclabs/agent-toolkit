## Workflow: UI Reconstruction

Extract semantic IR from existing UI, rebuild from specification. Implements the 'Platonic Form' philosophy - capturing the essence (what) not the implementation (how).

### Diagram

```mermaid
flowchart TD
    start(("Workflow entry point"))
    ir_component_tree["ir_component_tree<br/><small>📋 Planner</small>"]
    ir_feature_boundary["ir_feature_boundary<br/><small>📋 Planner</small>"]
    ir_interactivity["ir_interactivity<br/><small>📋 Planner</small>"]
    ir_business_object["ir_business_object<br/><small>📋 Planner</small>"]
    ir_annotate["ir_annotate<br/><small>📋 Planner</small>"]
    ir_ascii["ir_ascii<br/><small>📋 Planner</small>"]
    ir_review{"Review<br/><small>👀 Reviewer</small>"}
    uiRebuild_build["uiRebuild_build<br/><small>🔧 Developer</small>"]
    uiRebuild_review{"Review<br/><small>👀 Reviewer</small>"}
    final_review{"Review<br/><small>👀 Reviewer</small>"}
    end_success[["Workflow completed successfully"]]
    hitl_ir_failed{{"✋ IR extraction failed after max retrie..."}}
    hitl_build_failed{{"✋ UI rebuild failed after max retries -..."}}
    hitl_final_failed{{"✋ Final review failed after max retries..."}}
    lint_format{"Lint and Format<br/><small>🔧 Developer</small>"}
    commit["Commit Changes<br/><small>🔧 Developer</small>"]

    start --> ir_component_tree
    ir_component_tree --> ir_feature_boundary
    ir_feature_boundary --> ir_interactivity
    ir_interactivity --> ir_business_object
    ir_business_object --> ir_annotate
    ir_annotate --> ir_ascii
    ir_ascii --> ir_review
    ir_review -->|Reviewer feedback is provided to the analyzer| ir_component_tree
    ir_review -->|IR extraction exhausted retries| hitl_ir_failed
    ir_review -->|Semantic IR is verified| uiRebuild_build
    uiRebuild_build --> uiRebuild_review
    uiRebuild_review -->|Reviewer feedback is provided to the builder| uiRebuild_build
    uiRebuild_review -->|UI rebuild exhausted retries| hitl_build_failed
    uiRebuild_review -->|Build review passed| final_review
    final_review -->|Reviewer feedback is provided to the builder| uiRebuild_build
    final_review -->|Final review exhausted retries| hitl_final_failed
    final_review -->|Platonic form verified| lint_format
    lint_format -->|Lint passes, commit changes| commit
    lint_format -->|Fix lint/format issues| uiRebuild_build
    lint_format -->|Lint issues persist| hitl_final_failed
    commit --> end_success
    hitl_ir_failed -->|Human resolved IR issue, resume| ir_component_tree
    hitl_build_failed -->|Human resolved build issue, resume| uiRebuild_build
    hitl_final_failed -->|Human resolved final review issue, resume| uiRebuild_build

    classDef startStep fill:#90EE90,stroke:#228B22
    classDef successStep fill:#87CEEB,stroke:#4169E1
    classDef hitlStep fill:#FFB6C1,stroke:#DC143C
    classDef gateStep fill:#E6E6FA,stroke:#9370DB
    classDef forkJoinStep fill:#FFEAA7,stroke:#FDCB6E
    classDef currentStep fill:#FFD700,stroke:#FF8C00,stroke-width:3px
    class start startStep
    class end_success successStep
    class hitl_ir_failed,hitl_build_failed,hitl_final_failed hitlStep
    class ir_review,uiRebuild_review,final_review,lint_format gateStep
```

### Step Instructions

| Stage                  | Step                | Name                | Agent             | Instructions                                                                                                                                       |
| ---------------------- | ------------------- | ------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| semantic-ir-extraction | ir_component_tree   | ir_component_tree   | 📋 flow:Planner   | Extract UI component hierarchy with element types, nesting, and framework imports. Output: Component tree with semantic roles.                     |
| semantic-ir-extraction | ir_feature_boundary | ir_feature_boundary | 📋 flow:Planner   | Determine logical groupings of components that form discrete features. Output: Feature map with parent-child relationships.                        |
| semantic-ir-extraction | ir_interactivity    | ir_interactivity    | 📋 flow:Planner   | Document user interactions: click handlers, form submissions, state mutations, and data flow. Output: Interaction inventory.                       |
| semantic-ir-extraction | ir_business_object  | ir_business_object  | 📋 flow:Planner   | Identify domain entities displayed or manipulated by the UI and their CRUD operations. Output: Business object catalog.                            |
| semantic-ir-extraction | ir_annotate         | ir_annotate         | 📋 flow:Planner   | Overlay visual markers on screenshot identifying components, features, and interactions. Output: Annotated screenshot.                             |
| semantic-ir-extraction | ir_ascii            | ir_ascii            | 📋 flow:Planner   | Create text-based diagrams showing UI state transitions and user flows. Output: ASCII state machine diagram.                                       |
| semantic-ir-extraction | ir_review           | Review              | 👀 flow:Reviewer  | Validate completeness and accuracy of Semantic IR against source UI. Criteria: All visible elements mapped, interactions documented.               |
| ui-build-from-ir       | uiRebuild_build     | uiRebuild_build     | 🔧 flow:Developer | Implement UI from Semantic IR specification, matching visual layout and behavior. Preserve semantic structure over visual mimicry.                 |
| ui-build-from-ir       | uiRebuild_review    | Review              | 👀 flow:Reviewer  | Compare rebuilt UI against original screenshot and Semantic IR. Verify functional equivalence and semantic fidelity.                               |
| unbiased-review        | final_review        | Review              | 👀 flow:Reviewer  | Verify rebuilt UI captures essential purpose (Platonic Form) not just appearance. Test: Could this IR reconstruct the UI in a different framework? |
| delivery               | lint_format         | Lint & Format       | 🔧 flow:Developer | Run lint and format checks. Auto-fix issues where possible.                                                                                        |
| delivery               | commit              | Commit Changes      | 🔧 flow:Developer | Commit all changes with a descriptive message                                                                                                      |
