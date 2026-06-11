---
title: Task Files
description: The planned canonical Markdown representation for Taskset work items.
---

# Task Files

Task files are planned to live under `.taskset/tasks/`. Each file combines YAML
frontmatter for structured fields with Markdown for durable human context.

```markdown
---
id: TS-01J...
title: Add task validation
status: doing
priority: high
createdAt: 2026-06-12T00:00:00.000Z
updatedAt: 2026-06-12T00:00:00.000Z
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
- IDs are immutable and must remain collision-safe across branches.
- Timestamps use ISO 8601 UTC strings.
- Code references use repository-relative POSIX paths.

## Relationships

Taskset stores one canonical relationship direction when another direction can
be derived. For example, `blocks` should be derived from another task's
`dependsOn` rather than independently maintained.

The graph must detect duplicate IDs, missing references, and dependency cycles.

## Writes

Taskset must preserve human-authored Markdown, serialize metadata
deterministically, and use failure-safe file replacement. Reads never silently
repair invalid data. A diagnostic or future `doctor` command makes repairs
explicit.

## History

Git is the normal history for task files. See the
[snapshot decision](../architecture/decisions/0003-snapshot-policy.md) for the
limited safety-checkpoint use case.
