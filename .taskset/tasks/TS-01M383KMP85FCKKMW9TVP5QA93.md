---
id: TS-01M383KMP85FCKKMW9TVP5QA93
title: Add an editor-first task edit command
status: todo
priority: medium
owner: junkieshuffle
createdAt: 2026-09-23 21:44 UTC
updatedAt: 2026-09-23 21:44 UTC
labels:
  - cli
  - editing
related:
  - TS-01M383K4931ZFJZMZ7SG9A2DN2
files:
  - packages/cli/src/cli.ts
  - packages/cli/src/cli.test.ts
  - docs
---

## Outcome

Let people edit a task in its canonical Markdown form through `taskset task edit <id>`.

## Scope

- Resolve the task file safely inside `.taskset/tasks/`.
- Open it with `$VISUAL`, falling back to `$EDITOR`.
- Validate the edited task after the editor exits and report actionable errors.
- Document non-interactive and missing-editor behavior.

## Acceptance criteria

- The command never creates an alternate task representation.
- A valid edit is immediately visible to list/show/query commands.
- Invalid edits fail clearly without hiding the canonical file.

## Changeset

- `@taskset/cli`: minor release for the new command.
