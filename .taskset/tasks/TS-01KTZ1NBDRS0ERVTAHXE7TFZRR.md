---
schemaVersion: 1
id: TS-01KTZ1NBDRS0ERVTAHXE7TFZRR
title: Define conflict-aware synchronization contracts
status: done
priority: high
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-13 01:13 UTC
labels:
  - taskset
  - core
  - sync
files:
  - packages/core/src/sync
  - packages/contracts/src
  - docs/maintainers/architecture
---

## Context

Taskset needs synchronization with explicit external adapters without allowing a remote service to silently replace canonical `.taskset/` files. The direction, identity mapping, conflict behavior, and dry-run result must be defined before implementing a provider.

## Acceptance Criteria

- Define typed pull, push, and bidirectional synchronization plans and results.
- Specify external identity mapping without adding a second authoritative task store.
- Define stale-read detection, field-level conflict reporting, deletion behavior, and idempotency.
- Require dry-run support and fail before mutation when conflicts are unresolved.
- Document which policy belongs in core and which behavior belongs in provider adapters.
- Add contract tests for unchanged, created, updated, deleted, and conflicting records.
