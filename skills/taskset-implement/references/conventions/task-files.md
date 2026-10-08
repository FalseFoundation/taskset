# Task File Conventions

Canonical Taskset entity metadata and Markdown file rules.

## Taskset Entity Files

Use YAML frontmatter for machine metadata and Markdown for human context:

```markdown
---
id: a1b2c3
title: Add task validation
status: doing
priority: high
order: 10
createdAt: 2026-06-12
updatedAt: 2026-06-12 09:30 UTC
labels:
  - core
dependsOn: []
files:
  - packages/core/src/tasks/validateTask.ts
---

# Context

Describe why the work exists.

# Acceptance Criteria

- [ ] Invalid statuses produce an actionable diagnostic.
```

Filename: `0000001-add-task-validation-a1b2c3.md`

Rules:

- Require `id`, `title`, `status`, `createdAt`, and `updatedAt`.
- Read and serialize one strict versionless task shape. Reject legacy
  versioned task frontmatter instead of silently migrating or repairing it.
- Accept people, planning, canonical relationship, path, and project metadata
  only through the shared strict schema.
- Use `todo`, `doing`, `blocked`, `done`, and `canceled` for task status.
- Use `low`, `medium`, `high`, and `urgent` for task priority.
- Priority is the sole measure of task importance. Do not add a second,
  overlapping importance field.
- `order` is the sole user-controlled sequence field. It is an optional finite
  nonnegative number. Lower values sort first, missing values sort after
  ordered tasks, and duplicate values fall back to task ID ordering.
- Repository configuration may select and order the active values from that
  vocabulary. Defaults and task creation must respect the configured list.
- Define one canonical representation for each field.
- Use repository-relative POSIX paths in persisted metadata.
- Serialize new timestamps as `YYYY-MM-DD` or `YYYY-MM-DD HH:mm UTC`. Continue
  reading the documented legacy ISO 8601 UTC form until a compatibility change
  explicitly removes it.
- Keep IDs immutable and compare them exactly.
- Format new task and document IDs as 5-6 character lowercase hex values.
  Store display order in the filename as `{sequence}-{slug}-{id}.md`. Keep
  legacy `TS-` ULIDs and sequential `0000001-title` IDs readable only so
  `sync` / `task migrate-ids` can rewrite them, normalize filenames, repair
  duplicate sequence prefixes by `createdAt`, and update canonical
  relationships atomically.
- Preserve user-authored body text and meaningful list order.
- Use stable key ordering and one final newline in generated output.
- Generated metadata indexes cover supported non-ID metadata fields, group
  timestamp values by calendar date, and keep generated filenames readable
  instead of URL-encoding spaces or path separators.
- Omit absent optional fields consistently; do not alternate between missing,
  empty, and `null` without schema meaning.
- Validate enum values, dates, paths, IDs, and relationship targets centrally.
- Validate normalized CLI arguments and public core inputs with Zod schemas.
  Keep `parseArgs` limited to tokenization and use `superRefine` for
  cross-option rules.
- Do not infer `updatedAt` or lifecycle timestamps differently in each client.
- Do not write derived inverse relationships into files unless the schema makes
  them independently authoritative.
- Keep `dependsOn`, `related`, `duplicates`, and `parent` canonical. Derive
  `blockedBy`, `blocks`, `children`, and `subtasks`.
- Resolve relationship inputs through a shared alias index. Accept full
  repository-relative paths, unique basenames, stems, and immutable IDs, but
  serialize complete canonical paths for human authoring. Quote numeric-looking
  identity and reference strings so YAML preserves their type.
- Treat schema additions, removals, defaults, and coercions as compatibility
  decisions.
- Reject unknown fields, duplicate list values, self-dependencies,
  non-normalized paths, and an `updatedAt` value earlier than `createdAt`.
- Never silently repair a file during a read. `doctor` may propose or perform
  explicit fixes with user-visible output.

Keep schemas and static contracts in `@taskset/contracts`. Keep parsing
orchestration, defaults, transitions, validation policy, and migrations in
`@taskset/core`. Keep generic YAML/Markdown mechanics in `@taskset/utils` only
when they are not Taskset-specific.

Put generic date, time, and mathematical operations in `@taskset/utils` when
they have no task-domain policy. Prefer names such as `parseDate` over
task-specific wrappers such as `parseTaskDate`.
