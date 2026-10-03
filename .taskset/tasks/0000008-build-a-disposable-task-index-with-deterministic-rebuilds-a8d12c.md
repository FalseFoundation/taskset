---
id: a8d12c
title: Build a disposable task index with deterministic rebuilds
status: done
priority: medium
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-13 01:13 UTC
labels:
  - taskset
  - core
  - index
dependsOn:
  - e05d3d
  - ed5457
files:
  - packages/core/src/indexing
  - .taskset/cache
---

## Context

Repeated graph and query operations will need a faster read model, but canonical Markdown must remain the only persistent authority. Core needs an index that can always be deleted and rebuilt.

## Acceptance Criteria

- Core builds an in-memory index from canonical task files with deterministic results.
- Any optional `.taskset/cache/` representation is versioned, disposable, and never required for correctness.
- Stale or corrupt cache data triggers a safe rebuild rather than changing canonical files.
- Create, update, and delete operations have an explicit invalidation strategy.
- Tests prove equivalent results before and after cache deletion and cover malformed cache recovery.
