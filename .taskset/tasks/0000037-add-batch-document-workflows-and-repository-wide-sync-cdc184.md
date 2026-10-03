---
id: cdc184
title: Add batch document workflows and repository-wide sync
status: done
priority: urgent
owner: junkieshuffle
createdAt: 2026-09-28 20:24 UTC
updatedAt: 2026-09-28 20:43 UTC
labels:
  - taskset
  - documents
  - migration
files:
  - packages/core
  - packages/cli
  - skills
---

## Outcome

Extend Taskset with paced batch document operations, repository-wide migration reference repair, a one-command sync workflow, and document-aware agent guidance.

## Checklist

- [x] Install and audit relevant agent skills
- [x] Add paced batch create/import/export/update operations with progress
- [x] Add repository-wide task-reference rewrite during ID migration
- [x] Add or extend the sync command for migration, synchronization, and generation
- [x] Rename standards skill to taskset-implement and expand both skills
- [x] Add focused core and CLI TDD coverage
- [x] Make pnpm build, test, and check pass

## Changeset

Required: @taskset/contracts, @taskset/core, and @taskset/cli; major because persisted migration and CLI behavior expand.
