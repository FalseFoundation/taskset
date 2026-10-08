---
id: dc39db
title: Unify file and directory impact queries in task list
status: done
priority: high
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - cli
  - search
dependsOn:
  - .taskset/tasks/0000013-introduce-task-metadata-schema-version-2-d5c25a.md
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
