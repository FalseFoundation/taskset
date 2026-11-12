---
id: f7e04d
title: Skip unchanged generated-view rebuilds
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
  - .taskset/research/0000002-large-repository-mutation-performance-8a7ed4.md
directories:
  - packages/core/src/generated
---

## Outcome

Skip generated-view sorting and filesystem rewrites when indexed metadata has not changed.

## Checklist

- [x] Fingerprint only data represented by generated views.
- [x] Reuse an unchanged generated scope from its manifest.
- [x] Cover body-only task and document edits.
- [x] Update performance documentation and Changeset.

## Changeset

Extended the pending patch Changeset for @taskset/core and @taskset/cli.
