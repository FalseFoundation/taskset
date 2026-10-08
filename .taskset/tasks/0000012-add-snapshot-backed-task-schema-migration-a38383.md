---
id: a38383
title: Add snapshot-backed task schema migration
status: done
priority: urgent
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - migration
  - snapshot
dependsOn:
  - .taskset/tasks/0000010-adopt-zod-validation-at-public-boundaries-0a9a79.md
  - .taskset/tasks/0000011-move-strict-date-handling-to-generic-utilities-4ed970.md
files:
  - packages/core/src/snapshots
  - packages/core/src/migrations
  - packages/cli/src/cli.ts
---

## Context

Task schema v2 needs an explicit, recoverable bulk migration rather than silent rewrites.

## Acceptance Criteria

- Immutable Taskset snapshots contain canonical task files and a manifest.
- CLI supports snapshot create, list, preview restore, and explicit apply.
- `taskset migrate --to 2` previews by default and snapshots before apply.
- Migration and restore are deterministic, idempotent, stale-aware, and failure-safe.
