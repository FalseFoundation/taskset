---
id: 04e69c
title: Require documentation updates with related changes
status: todo
priority: medium
order: 70
createdAt: 2026-06-18 17:13 UTC
updatedAt: 2026-06-18 17:29 UTC
labels:
  - docs
  - workflow
  - standards
related:
  - .taskset/tasks/0000033-audit-usage-docs-maintainer-docs-and-readmes-for-current-behavior-67b0e3.md
files:
  - skills/taskset-implement/SKILL.md
  - skills/taskset-implement/references/workflows.md
  - skills/taskset-implement/references/release.md
  - docs/maintainers/development/documentation.md
---

## Context

Documentation should be updated as part of each related product, architecture, command, persisted-format, or workflow change instead of being left for later cleanup. The repository standards already mention docs in definition-of-done, but the workflow needs an explicit task to make that expectation clear and actionable.

## Acceptance Criteria

- [ ] Define when a code, schema, command, package, architecture, or workflow change requires usage docs, maintainer docs, README files, or standards updates.
- [ ] Add the documentation-update rule to the appropriate maintainer workflow guidance and standards reference.
- [ ] Clarify how agents and maintainers should identify the affected documentation surfaces before completion.
- [ ] Keep the rule compatible with Changesets and release completion requirements.
- [ ] Include validation expectations for changed docs or website routes.

## Planning Note

This task defines a future workflow improvement only. Do not update the documentation workflow as part of creating the task.
