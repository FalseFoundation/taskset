---
id: d5c25a
title: Introduce task metadata schema version 2
status: done
priority: urgent
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - contracts
  - schema
dependsOn:
  - .taskset/tasks/0000012-add-snapshot-backed-task-schema-migration-a38383.md
files:
  - packages/contracts/src/task.ts
  - packages/core/src/tasks/taskFile.ts
  - packages/core/src/tasks/taskRepository.ts
---

## Context

Task metadata needs people, planning, relationship, directory, and project fields while retaining strict persisted-format behavior.

## Acceptance Criteria

- Readers accept schema versions 1 and 2; new and updated tasks serialize as version 2.
- Version 2 supports owner, assignees, reviewers, team, estimate, effort, risk, dueDate, related, duplicates, parent, directories, and projects.
- Values, paths, dates, duplicates, and relationship IDs are centrally validated.
- Round-trip and compatibility fixtures cover every field.
