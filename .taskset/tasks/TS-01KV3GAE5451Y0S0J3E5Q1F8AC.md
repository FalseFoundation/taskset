---
id: TS-01KV3GAE5451Y0S0J3E5Q1F8AC
title: Move strict date handling to generic utilities
status: done
priority: high
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - utils
  - breaking
files:
  - packages/utils/src
  - packages/contracts/src/task.ts
---

## Context

Strict UTC date parsing and formatting is reusable domain-light behavior but currently has Taskset-specific public names.

## Acceptance Criteria

- `@taskset/utils` exports strict `parseDate` and `formatDate`.
- Task contracts consume the utility implementation.
- Task-specific timestamp exports are removed with compatibility documented.
- Tests preserve all accepted and rejected timestamp forms.
