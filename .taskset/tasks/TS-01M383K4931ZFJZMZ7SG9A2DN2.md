---
id: TS-01M383K4931ZFJZMZ7SG9A2DN2
title: Make task search token-aware
status: done
priority: high
owner: junkieshuffle
createdAt: 2026-09-23 21:43 UTC
updatedAt: 2026-09-23 21:47 UTC
labels:
  - search
  - core
files:
  - packages/core/src/search/taskQuery.ts
  - packages/core/src/search/taskQuery.test.ts
  - packages/cli/src/cli.test.ts
  - docs/cli-reference.md
  - docs/task-files.md
  - skills/taskset/SKILL.md
  - .changeset/calm-pandas-search.md
---

## Outcome

Make free-text task search useful for natural multi-word queries without requiring an exact contiguous phrase.

## Work

- [x] Match normalized query terms independently across task titles and bodies.
- [x] Add focused unit and CLI-level regression coverage.
- [x] Document the search semantics for users and agents.
- [x] Run focused and repository validation.

## Acceptance criteria

- Every non-empty query term must occur in the normalized title/body haystack, regardless of order or adjacency.
- Repeated whitespace and Unicode case normalization continue to work.
- Existing filters and deterministic sorting remain unchanged.

## Changeset

- `@taskset/core`: patch release explaining token-aware free-text search.
