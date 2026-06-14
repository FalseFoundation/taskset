---
schemaVersion: 2
id: TS-01KV3JHWQZ6814GY5CY68AX9FW
title: Harden migration snapshot and generated-view failure paths
status: todo
priority: high
createdAt: 2026-06-14 17:23 UTC
updatedAt: 2026-06-14 17:23 UTC
labels:
  - migration
  - snapshot
  - generated
files:
  - packages/core/src/migrations
  - packages/core/src/snapshots
  - packages/core/src/generated
  - packages/core/src/tasks/taskRepository.ts
  - packages/core/src/tasks/taskRepository.test.ts
  - packages/cli/src/cli.test.ts
---

# Context

The happy paths are covered, but the original test plan also required atomic failure behavior and generated-view warning guarantees. Those cases were not completed.

# Scope

- Validate all snapshot task sources and the restored graph before any canonical mutation.
- Cover corrupt manifests, checksums, unsafe paths, missing files, and stale concurrent state.
- Add multi-file failure tests proving migration and restore roll back without partial canonical writes.
- Verify migration idempotence and snapshot immutability.
- Inject generated-view failures and prove create, update, delete, migration, and restore remain successful while returning or emitting warnings.
- Verify automatic refresh removes deleted-task entries and replaces stale generated output.

# Acceptance Criteria

- Invalid or corrupt snapshots cannot write canonical tasks.
- Migration and restore leave all original files intact after simulated mid-transaction failures.
- Re-running migration on v2 data is a no-op.
- Generated-view failures never invalidate successful canonical mutations and are observable as warnings.
- Failure behavior is covered in core and CLI tests.
