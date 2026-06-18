---
id: TS-01KV3GAKX29CNB1HT3XBB51R5N
title: Unify file and directory impact queries in task list
status: done
priority: high
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - cli
  - search
dependsOn:
  - TS-01KV3GAH24AD5MH7SDZ918BPHP
files:
  - packages/core/src/search
  - packages/core/src/projects
  - packages/cli/src/cli.ts
---

## Context

`tasks-for-file` duplicates task listing while providing stronger path and impact semantics.

## Acceptance Criteria

- Remove the standalone `tasks-for-file` command.
- `task list` supports repeatable normalized file and directory filters.
- `--impact` returns deterministic direct and transitive dependent groups.
- New metadata fields have appropriate query filters and sorts.
- CLI and documentation describe the breaking replacement.
