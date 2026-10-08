---
id: 67b0e3
title: Audit usage docs, maintainer docs, and READMEs for current behavior
status: todo
priority: high
order: 60
createdAt: 2026-06-18 17:13 UTC
updatedAt: 2026-06-18 17:29 UTC
labels:
  - docs
  - readme
  - compatibility
related:
  - .taskset/tasks/0000024-remove-task-schema-versions-and-unify-the-canonical-format-116b1f.md
  - .taskset/tasks/0000027-move-maintainer-documentation-into-a-separate-docs-route-1e2079.md
files:
  - README.md
  - docs/task-files.md
  - docs/_meta.ts
  - docs/maintainers/development/documentation.md
  - packages/cli/README.md
  - packages/core/README.md
  - packages/contracts/README.md
  - packages/utils/README.md
  - skills/taskset-implement/references/conventions.md
---

## Context

Recent changes removed task metadata versioning and adjusted documentation routing, but usage docs, maintainer docs, and README files may still describe older behavior. Legacy version-field examples are known stale examples; audit for other mismatches instead of fixing only that wording.

## Acceptance Criteria

- [ ] Search usage docs, maintainer docs, package READMEs, and standards for stale persisted-format, command, route, and workflow references.
- [ ] Remove or rewrite remaining legacy version-field guidance so docs describe the strict versionless task shape.
- [ ] Confirm public examples use current commands, package names, docs routes, task fields, and generated-view behavior.
- [ ] Keep maintainer-only workflow and architecture guidance out of primary usage docs while linking it from the correct route.
- [ ] Update `skills/taskset-implement` references when the audit changes authoritative repository rules.
- [ ] Run the relevant docs/site or repository checks for the surfaces changed by the audit.

## Planning Note

This task is for a documentation consistency audit after recent behavior changes. Do not perform the audit as part of defining this task.
