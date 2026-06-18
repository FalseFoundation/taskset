---
id: TS-01KV42Q7YD78WC60BQHSH8YMZH
title: Add explicit task ordering and ordered generated views
status: done
priority: high
order: 10
createdAt: 2026-06-14 22:06 UTC
updatedAt: 2026-06-18 17:34 UTC
labels:
  - contracts
  - ordering
  - generated
dependsOn:
  - TS-01KV42PWW5Y7R4ACASSVBNPXQK
files:
  - packages/contracts/src/task.ts
  - packages/core/src/tasks
  - packages/core/src/search
  - packages/core/src/generated
  - packages/cli/src/cli.ts
  - docs/task-files.md
  - .taskset/generated
---

## Context

Priority describes importance but does not provide a stable user-controlled sequence. Introduce one task metadata field, choosing the final name such as `order` after contract review, that is solely responsible for explicit task ordering. Generated status and metadata views must expose that sequence clearly.

## Acceptance Criteria

- The contract selects one unambiguous field name and value model for user-controlled ordering without overloading priority or the disposable task index.
- Validation defines uniqueness or tie behavior, missing-value behavior, update semantics, and deterministic fallback ordering.
- Core list and query behavior can sort by the explicit order consistently across CLI and future clients.
- Generated status and metadata views render tasks in explicit order and display the order value in a human-readable way.
- Regeneration from canonical tasks is deterministic and removes stale output; `.taskset/generated/` remains disposable and non-authoritative.
- Contracts, core behavior, CLI options/output, tests, docs, standards, and release metadata are updated together.

## Planning Note

Do not implement the field, sorting functions, or generation changes as part of this planning work.
