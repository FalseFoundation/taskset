---
id: 7759ab
title: Expand task relationship graph projections
status: done
priority: high
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - graph
dependsOn:
  - .taskset/tasks/0000013-introduce-task-metadata-schema-version-2-d5c25a.md
files:
  - packages/core/src/graph
  - packages/core/src/tasks
---

## Context

Canonical relationships need reusable derived inverse and hierarchy projections without persisting duplicate authorities.

## Acceptance Criteria

- Canonical fields are dependsOn, related, duplicates, and parent.
- Core derives blockedBy, blocks, children, and transitive subtasks deterministically.
- Graph validation covers missing targets, self-links, duplicate values, and dependency or parent cycles.
- Query/show APIs expose derived projections only when requested.
