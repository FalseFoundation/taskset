---
title: Task Files
description: The canonical Markdown representation for Taskset work items.
---

# Task Files

Task files live under `.taskset/tasks/`. YAML frontmatter owns structured
metadata and the Markdown body owns durable human context.

```markdown
---
id: TS-01J00000000000000000000000
title: Add task validation
status: doing
priority: high
owner: platform
assignees:
  - maintainer
reviewers:
  - reviewer
team: core
estimate: 90
effort: 3
risk: high
dueDate: 2026-06-30
createdAt: 2026-06-12
updatedAt: 2026-06-12 09:30 UTC
labels:
  - core
dependsOn: []
related: []
duplicates: []
files:
  - packages/core/src/tasks/taskFile.ts
directories:
  - packages/core
projects:
  - taskset
---

# Context

Explain why the task exists.
```

## Canonical Data

Required fields are `id`, `title`, `status`, `createdAt`, and `updatedAt`.
Task IDs are immutable `TS-` prefixed ULIDs.

Task files use one strict versionless metadata shape. Optional fields:

- Planning: `priority`, `estimate` in integer minutes, `effort` as a finite
  nonnegative number, `risk`, and `dueDate`
- People: `owner`, `assignees`, `reviewers`, and `team`
- Relationships: `dependsOn`, `related`, `duplicates`, and `parent`
- Scope: `labels`, `files`, `directories`, and `projects`

People and project values are trimmed free-form strings. Arrays must not
contain duplicates. Paths are normalized repository-relative POSIX paths.
Dates use `YYYY-MM-DD` or `YYYY-MM-DD HH:mm UTC`; documented legacy
millisecond ISO UTC timestamps remain readable.

Unknown fields, invalid enum values, self-links, duplicate list values, path
traversal, and an `updatedAt` earlier than `createdAt` are rejected.

## Compatibility Cutover

Task metadata no longer carries `schemaVersion`. Versioned task frontmatter is
invalid input and fails with a schema diagnostic rather than being silently
rewritten. Repositories created with earlier Taskset releases must convert
task files by removing only the `schemaVersion` field from task frontmatter
while preserving all other metadata and Markdown body content. Take a Git
commit or `taskset snapshot create` checkpoint before converting existing
repositories.

## Relationships

`dependsOn`, `related`, `duplicates`, and `parent` are canonical. Taskset
derives:

- `blockedBy`: direct dependencies
- `blocks`: direct inverse dependencies
- `children`: direct inverse parents
- `subtasks`: all transitive descendants

Use `--include-derived` with task list or JSON task show output. Derived values
are never written to canonical Markdown. The graph validates missing targets,
self-links, dependency cycles, and parent cycles.

## Writes And Lifecycle

Taskset serializes fields deterministically, normalizes line endings to LF,
preserves the Markdown body, and emits one final newline. Canonical mutations
use failure-safe file operations.

Allowed lifecycle transitions are:

- `todo` to `doing`, `blocked`, or `canceled`
- `doing` to `todo`, `blocked`, `done`, or `canceled`
- `blocked` to `todo`, `doing`, or `canceled`
- `done` and `canceled` are terminal

Deletion is rejected while another task has an inbound canonical relationship
to the target. `--remove-dependencies` repairs those references and removes the
target in one transaction.

## Queries And Derived State

`task list` supports metadata, relationship, planning range, timestamp range,
text, file, and directory filters. Numeric and timestamp ranges are inclusive:

```bash
taskset task list --file packages/core --impact --json
taskset task list --estimate-min 30 --estimate-max 120 --risk high
taskset task list --duplicate TS-01J00000000000000000000000
```

Repeated enum, person, project, file, and directory values use OR within the
same option. Repeated labels require every requested label. Different filter
categories compose with AND. For example, two `--file` values match either
path, while adding `--owner` requires both the path match and owner match.
`--file` is the unified containment query over task files and task directories;
`--directory` matches only canonical directory metadata. All path inputs are
normalized relative to the repository before matching.

Planning filters are `--estimate-min`, `--estimate-max`, `--effort-min`, and
`--effort-max`. Timestamp filters are `--due-before`, `--due-after`,
`--created-before`, `--created-after`, `--updated-before`, and
`--updated-after`. Title and Markdown body use `--search`. Exact task IDs use
`task show` or relationship filters rather than a redundant list ID filter.

With `--impact`, every direct filter is applied first, then the graph adds tasks
that transitively depend on those direct matches. JSON output uses
`{ "direct": [...], "impacted": [...] }`; `--include-derived` adds relationship
projections to records in both groups.

`.taskset/cache/` and `.taskset/generated/` are disposable. Generated status,
priority, project, and assignee indexes are deterministic projections and
refresh on a best-effort basis after canonical mutations.

## Snapshots

Git remains the normal history. `.taskset/snapshots/` contains immutable,
non-authoritative safety checkpoints:

```bash
taskset snapshot create
taskset snapshot list
taskset snapshot restore <snapshot-id>
taskset snapshot restore <snapshot-id> --apply
```

Restore previews by default and requires `--apply` to mutate canonical tasks.
