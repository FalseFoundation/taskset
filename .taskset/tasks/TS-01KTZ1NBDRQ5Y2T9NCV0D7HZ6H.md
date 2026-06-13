---
schemaVersion: 1
id: TS-01KTZ1NBDRQ5Y2T9NCV0D7HZ6H
title: Build the task dependency graph and integrity validation
status: todo
priority: high
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-12 23:11 UTC
labels:
  - taskset
  - core
  - graph
files:
  - packages/core/src/graph
  - packages/core/src/tasks/taskRepository.ts
---

## Context

Task relationships are stored through `dependsOn`, but core does not yet construct a reusable graph or validate repository-wide relationship integrity. Every interface needs the same deterministic graph semantics.

## Acceptance Criteria

- Core builds a deterministic task graph from canonical task files.
- Duplicate IDs, missing dependency targets, self-dependencies, and cycles produce typed, actionable diagnostics.
- Derived `blocks` relationships are computed from `dependsOn` rather than persisted.
- Task creation and updates can validate relationship changes through the shared graph policy.
- Tests cover valid graphs, broken references, cycles, and stable traversal ordering.
