---
id: 0000016-generate-disposable-task-metadata-views
title: Generate disposable task metadata views
status: done
priority: medium
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - generated
dependsOn:
  - 0000014-expand-task-relationship-graph-projections
  - 0000015-unify-file-and-directory-impact-queries-in-task-list
files:
  - packages/core/src/generated
  - .taskset/generated
  - packages/cli/src/cli.ts
---

## Context

Humans and tooling need browsable status, priority, project, and assignee indexes without creating another source of truth.

## Acceptance Criteria

- `taskset generate` atomically rebuilds deterministic Markdown views and a versioned fingerprint manifest.
- Views group tasks by status, priority, project, and assignee using encoded filenames and sorted links.
- Canonical writes, migration, and restore trigger best-effort refresh.
- Missing, stale, or corrupt generated output is safely replaceable.
- Epic views remain deferred until canonical epic entities exist.
