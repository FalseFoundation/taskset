---
schemaVersion: 1
id: TS-01KTZ1NZD416CWN7205WZ88NZ9
title: Add guarded task deletion and removal commands
status: done
priority: high
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-13 01:13 UTC
labels:
  - taskset
  - core
  - crud
dependsOn:
  - TS-01KTXKXVGZR1YG2K7S79PYJH3B
  - TS-01KTZ1NBDRQ5Y2T9NCV0D7HZ6H
files:
  - packages/core/src/tasks/taskRepository.ts
  - packages/cli/src/cli.ts
---

## Context

Create, read, list, and planned update operations do not complete the task CRUD lifecycle. Removal must account for inbound dependencies and filesystem failure without leaving invalid canonical state.

## Acceptance Criteria

- Core exposes an explicit atomic task deletion operation.
- Deletion is rejected when other tasks depend on the target unless a documented override or repair plan is selected.
- CLI supports a non-interactive `task delete` command with structured output and stable exit codes.
- Missing tasks, dependency blockers, and filesystem failures produce typed diagnostics.
- Tests verify successful removal, blocked removal, no partial mutation, and CLI JSON output.
