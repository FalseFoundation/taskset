---
schemaVersion: 2
id: TS-01KV3GAJFG7S9T0Z8AQYJG8M5D
title: Expand task relationship graph projections
status: done
priority: high
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - graph
dependsOn:
  - TS-01KV3GAH24AD5MH7SDZ918BPHP
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
