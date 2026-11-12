---
id: 78a33d
title: Make large-repository mutations and queries linear-time
status: done
priority: medium
owner: junkieshuffle
assignees:
  - junkieshuffle
createdAt: 2026-11-12 11:30 UTC
updatedAt: 2026-11-12 11:40 UTC
labels:
  - taskset
related:
  - .taskset/research/0000002-large-repository-mutation-performance-8a7ed4.md
directories:
  - packages/core/src
  - packages/cli/src
---

## Outcome

Make task and document creation, editing, and querying scale linearly with the affected entity set without duplicated repository-wide parsing or unrelated generated-view rebuilds.

## In scope

- [x] Measure and isolate full-repository work on create, update, and query paths.
- [x] Remove redundant canonical parsing from task query/list normalization.
- [x] Refresh only affected generated-view scopes and reuse validated records.
- [x] Add regression tests and benchmark evidence for large repositories.
- [x] Document the performance model and operational behavior.
- [x] Add the required Changeset.

## Acceptance criteria

- A single task mutation performs one canonical task scan and does not rebuild unrelated document scopes.
- Queries avoid the previous Markdown serialize-and-parse normalization round trip.
- Canonical Markdown remains authoritative and full repair/rebuild paths remain available.
- Core and CLI tests, type checks, and repository checks pass.

## Benchmark

Controlled local fixture with 1,000 tasks and 1,000 research documents:

- Task query: 211 ms before, 149 ms after.
- Task creation: 732 ms before, 384 ms after.

Timing is evidence, not a CI threshold.

## Changeset

Patch release for @taskset/core and @taskset/cli; note faster large-repository mutations and queries with unchanged Markdown as canonical truth.
