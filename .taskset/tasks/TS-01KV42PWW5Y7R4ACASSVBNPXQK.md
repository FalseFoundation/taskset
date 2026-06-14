---
schemaVersion: 2
id: TS-01KV42PWW5Y7R4ACASSVBNPXQK
title: Remove task schema versions and unify the canonical format
status: todo
priority: urgent
createdAt: 2026-06-14 22:05 UTC
updatedAt: 2026-06-14 22:05 UTC
labels:
  - contracts
  - schema
  - breaking
files:
  - packages/contracts/src/task.ts
  - packages/core/src/tasks/taskFile.ts
  - packages/core/src/tasks/taskRepository.ts
  - packages/core/src/migrations
  - docs/task-files.md
  - skills/standards/references/architecture.md
  - skills/standards/references/conventions.md
---

## Context

Task files currently carry `schemaVersion` and support separate version 1 and version 2 shapes. The canonical format should become one strict, versionless task contract so readers, writers, documentation, and repository standards no longer branch on schema version.

## Acceptance Criteria

- The canonical task interface and serialized frontmatter no longer contain `schemaVersion`.
- Parsing, validation, serialization, synchronization, diagnostics, snapshots, generated views, fixtures, and public examples use one strict task shape.
- The compatibility cutover for existing version 1 and version 2 files is explicitly decided and documented before removal; unsupported or ambiguous input fails with actionable diagnostics rather than silent repair.
- Existing task metadata and Markdown bodies remain lossless through the approved conversion path.
- Public package contracts, user docs, maintainer docs, standards, tests, and breaking Changesets agree on the versionless format.

## Planning Note

This task records the breaking contract change only. Do not implement migration code, helper functions, or scripts as part of this planning work.
