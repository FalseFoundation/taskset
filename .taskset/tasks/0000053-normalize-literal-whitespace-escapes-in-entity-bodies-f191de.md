---
id: f191de
title: Normalize literal whitespace escapes in entity bodies
status: done
priority: medium
owner: junkieshuffle
assignees:
  - junkieshuffle
createdAt: 2026-11-12 11:41 UTC
updatedAt: 2026-11-12 11:46 UTC
labels:
  - taskset
related:
  - .taskset/tasks/0000051-make-large-repository-mutations-and-queries-linear-time-78a33d.md
  - .taskset/lessons/0000001-pass-real-whitespace-and-normalize-accidental-escapes-11740c.md
directories:
  - packages/core/src
  - packages/cli/src
---

## Outcome

Prevent accidental literal whitespace escape sequences from being persisted in newly created or updated task and document bodies.

## Checklist

- [x] Normalize literal backslash-n, backslash-r-backslash-n, and backslash-t outside Markdown code.
- [x] Preserve intentional inline and fenced code examples.
- [x] Cover task, document, import, and CLI mutation paths.
- [x] Update user and agent guidance and the pending Changeset.

## Changeset

Extended the pending patch Changeset for @taskset/core and @taskset/cli.
