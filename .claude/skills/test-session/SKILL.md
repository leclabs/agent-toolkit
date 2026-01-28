---
description: Test skill to verify session ID availability
---

# Test Session ID

**Session ID (template substitution):** `${CLAUDE_SESSION_ID}`

**Task List ID (env var):** Check `$CLAUDE_CODE_TASK_LIST_ID`

The task directory resolves to:
```
~/.claude/tasks/${CLAUDE_CODE_TASK_LIST_ID:-${CLAUDE_SESSION_ID}}/
```

Run `echo $CLAUDE_CODE_TASK_LIST_ID` to see if the env var is set. If set, it takes priority over the session ID.
