---
id: TS-01KV3GAFMVPMBQP0KBYMX9H0VN
title: Add snapshot-backed task schema migration
status: done
priority: urgent
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - migration
  - snapshot
dependsOn:
  - TS-01KV3GACPZHPXW3BX7B6NECHE2
  - TS-01KV3GAE5451Y0S0J3E5Q1F8AC
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
