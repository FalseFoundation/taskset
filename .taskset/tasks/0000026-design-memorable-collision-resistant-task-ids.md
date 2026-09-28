---
id: 0000026-design-memorable-collision-resistant-task-ids
title: Design memorable collision-resistant task IDs
status: done
priority: urgent
order: 20
createdAt: 2026-06-14 22:06 UTC
updatedAt: 2026-09-28 19:14 UTC
labels:
  - contracts
  - identifiers
  - breaking
dependsOn:
  - 0000024-remove-task-schema-versions-and-unify-the-canonical-format
files:
  - packages/contracts/src/task.ts
  - packages/core/src/tasks/taskId.ts
  - packages/core/src/tasks/taskRepository.ts
  - packages/core/src/graph
  - packages/cli/src/cli.ts
  - docs/task-files.md
  - skills/taskset-implement/references/architecture.md
  - skills/taskset-implement/references/conventions.md
---

## Context

Uppercase ULID task IDs were collision-resistant but difficult for people to
remember and discuss. Taskset now uses a repository-local seven-digit sequence
and a normalized title slug, matching the established flow-document convention.

## Acceptance Criteria

- New tasks use immutable `0000001-short-title` IDs and matching filenames.
- Title slugs are normalized lowercase ASCII and remain unchanged when a title is edited.
- Legacy ULIDs remain readable for an explicit migration window.
- `task migrate-ids` atomically renames files and rewrites every canonical task relationship.
- Graph integrity, synchronization, fixtures, CLI output, docs, standards, and a Changeset cover the selected system.

## Planning Note

The earlier ULID-plus-display-filename proposal was superseded by the explicit
request for sequential, title-derived canonical IDs.
