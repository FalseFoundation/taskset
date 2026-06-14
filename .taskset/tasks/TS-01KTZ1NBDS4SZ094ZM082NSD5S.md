---
schemaVersion: 1
id: TS-01KTZ1NBDS4SZ094ZM082NSD5S
title: Add task filtering, sorting, and search queries
status: done
priority: medium
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-13 01:13 UTC
labels:
  - taskset
  - core
  - search
files:
  - packages/core/src/search
  - packages/core/src/tasks/taskRepository.ts
---

## Context

Clients currently receive the complete task list and would need to duplicate filtering and search semantics. Core should expose stable queries over canonical task data before more interfaces are built.

## Acceptance Criteria

- Core supports filters for status, priority, labels, dependency, and related file paths.
- Text search covers task titles and Markdown bodies with documented matching behavior.
- Query ordering is deterministic and callers can select supported sort keys without changing domain semantics.
- Query APIs operate from canonical files or a disposable rebuilt index.
- Tests cover combined filters, empty results, Unicode text, and stable ordering.
