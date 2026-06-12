---
title: Task Files
description: The canonical Markdown representation for Taskset work items.
---

# Task Files

Task files live under `.taskset/tasks/`. Each file combines YAML frontmatter for
structured fields with Markdown for durable human context.

```markdown
---
schemaVersion: 1
id: TS-01J00000000000000000000000
title: Add task validation
status: doing
priority: high
createdAt: 2026-06-12
updatedAt: 2026-06-12 09:30 UTC
labels:
  - core
dependsOn: []
files:
  - packages/core/src/tasks/validateTask.ts
---

# Context

Explain why the task exists.

# Acceptance Criteria

- [ ] Invalid statuses produce an actionable diagnostic.
```

## Canonical Data

- Frontmatter owns machine-readable metadata.
- The Markdown body owns narrative context and checklists.
- A value must not have two independently editable representations.
- `schemaVersion`, `id`, `title`, `status`, `createdAt`, and `updatedAt` are
  required.
- `priority`, `labels`, `dependsOn`, and `files` are optional. When present,
  empty arrays have explicit meaning and are preserved.
- Task IDs use `TS-` followed by a 26-character uppercase ULID and are
  immutable.
- Status values are `todo`, `doing`, `blocked`, `done`, or `canceled`.
- Priority values are `low`, `medium`, `high`, or `urgent`.
- Timestamps use human-readable UTC strings. Use `YYYY-MM-DD` when the date is
  enough, or `YYYY-MM-DD HH:mm UTC` when the hour and minute matter. Existing
  ISO 8601 UTC timestamps remain readable for compatibility.
- Code references use repository-relative POSIX paths.
- Unknown fields, duplicate list values, self-dependencies, path traversal, and
  timestamps earlier than `createdAt` are rejected.

## Compatibility

The initial format is `schemaVersion: 1`. Unsupported versions are rejected
instead of guessed or silently rewritten. There is no legacy task format to
migrate yet.

## Relationships

Taskset stores one canonical relationship direction when another direction can
be derived. For example, `blocks` should be derived from another task's
`dependsOn` rather than independently maintained.

The graph must detect duplicate IDs, missing references, and dependency cycles.

## Writes

Taskset provides strict parsing, deterministic serialization, repository
discovery, atomic task creation, listing, and display. It normalizes line
endings to LF, writes fields in canonical order, preserves meaningful Markdown
content, and emits one final newline. Reads never silently repair invalid data.

Update, removal, lifecycle transitions, and repository diagnostics remain
future operations. A diagnostic or future `doctor` command will make repairs
explicit.

## History

Git is the normal history for task files. Taskset-specific snapshots, when
introduced, are limited to explicit safety checkpoints around destructive
operations.
