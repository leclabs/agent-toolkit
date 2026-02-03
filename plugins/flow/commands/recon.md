---
name: recon
description: dive deep and learn
argument-hints: [paths=./]
---

If `--help` is in the arguments, display the following usage guide and stop:

```
/flow:recon [paths]

Dive deep into a project to understand its structure, patterns, and data flow.

Arguments:
  paths    Paths to explore (default: ./)

Examples:
  /flow:recon                Explore current directory
  /flow:recon src/auth       Explore the auth module
  /flow:recon src/ docs/     Explore multiple paths
```

---

## Project Exploration

**Goal**: Understand this project well enough to implement new features that match existing patterns.

**Target:** {paths} or cwd → pages, modules, documents, ... requiring deep understanding

**Deliver**:

1. How features are structured in this codebase (patterns to follow)
2. Per-page: data flow, key abstractions, anything surprising
3. Gaps or ambiguities that would block implementation
4. **Be prepared** to discuss **in-depth** with the user

---
