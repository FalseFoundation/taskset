---
'@taskset/contracts': minor
'@taskset/core': minor
'@taskset/cli': minor
---

Add optional task `order` metadata for user-controlled sequencing. The CLI can
set, clear, and sort by order; core queries and generated views sort ordered
tasks first, place unordered tasks after them, and use task IDs as the
deterministic tie breaker.
