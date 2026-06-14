---
"@taskset/cli": major
"@taskset/core": major
"@taskset/contracts": major
"@taskset/utils": minor
---

Expand canonical task metadata to schema v2, replace `tasks-for-file` with
unified path and impact queries, add derived relationship projections,
generated metadata views, snapshots, and explicit migration commands.

Public CLI and core inputs now use Zod validation. Strict UTC date handling
moves to the generic `parseDate` and `formatDate` utilities; the old
task-specific timestamp exports are removed.
