---
id: 93a32e
title: Implement synchronization planning and atomic apply
status: done
priority: high
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-13 01:13 UTC
labels:
  - taskset
  - core
  - sync
dependsOn:
  - f4e803
  - e21acd
  - e05d3d
  - 6c6d91
files:
  - packages/core/src/sync
  - packages/core/src/tasks/taskRepository.ts
---

## Context

After the synchronization contract is defined and task CRUD is complete, core needs provider-neutral orchestration that computes changes, surfaces conflicts, and applies approved mutations through existing validated repository operations.

## Acceptance Criteria

- Core computes deterministic pull, push, and bidirectional plans from canonical tasks and adapter records.
- Dry-run returns creates, updates, deletions, unchanged records, and conflicts without filesystem mutation.
- Apply revalidates stale inputs, aborts unresolved conflicts, and uses atomic core CRUD operations.
- Repeating an applied synchronization is idempotent.
- No remote state or cache becomes authoritative over `.taskset/` files.
- Integration tests use an in-memory adapter and cover partial adapter failure without partial canonical mutation.
