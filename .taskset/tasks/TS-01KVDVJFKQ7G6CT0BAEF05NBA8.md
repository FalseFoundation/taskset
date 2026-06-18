---
id: TS-01KVDVJFKQ7G6CT0BAEF05NBA8
title: Require documentation updates with related changes
status: todo
priority: medium
createdAt: 2026-06-18 17:13 UTC
updatedAt: 2026-06-18 17:13 UTC
labels:
  - docs
  - workflow
  - standards
related:
  - TS-01KVDVJ4ZGEYG59BCQESTGQ743
files:
  - skills/standards/SKILL.md
  - skills/standards/references/workflows.md
  - skills/standards/references/release.md
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
