---
id: TS-01KTXKXVGZR1YG2K7S79PYJH3B
title: Add task update and lifecycle commands
status: done
priority: high
createdAt: 2026-06-12 09:52 UTC
updatedAt: 2026-06-13 01:13 UTC
labels:
  - taskset
files:
  - packages/core/src/tasks/taskRepository.ts
  - packages/cli/src/cli.ts
---

## Context

The self-hosted repository can create, list, and show tasks, but it cannot yet change task metadata or lifecycle state through the CLI.

## Acceptance Criteria

- Core exposes an atomic task update operation.
- CLI supports editing task fields and changing status.
- Existing task validation and deterministic serialization remain intact.
- Unit and CLI tests cover successful updates and invalid transitions.
