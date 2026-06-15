---
schemaVersion: 2
id: TS-01KV3JJ9W81E9DQH8NSWF4YWQD
title: Complete metadata query filters and integration coverage
status: done
priority: high
createdAt: 2026-06-14 17:23 UTC
updatedAt: 2026-06-15 20:45 UTC
labels:
  - search
  - cli
files:
  - packages/core/src/search/taskQuery.ts
  - packages/core/src/search/taskQuery.test.ts
  - packages/cli/src/cli.ts
  - packages/cli/src/cli.test.ts
---

# Context

Unified path queries are implemented, but the original request for appropriate filters and sorts across the new metadata and the full query test matrix was only partially completed.

# Scope

- Define and implement useful query semantics for uncovered schema v2 metadata, including estimates, effort, duplicate relationships, and any required numeric or date ranges.
- Confirm repeatable file and directory filters have explicit OR/AND semantics and normalized containment behavior.
- Add repository-level `queryTasks` tests for path normalization, combined metadata/path filters, no matches, direct-before-impact expansion, deterministic ordering, and grouped JSON output.
- Add CLI tests for repeated file/directory options and `--include-derived`.

# Acceptance Criteria

- Every sortable schema v2 field has an intentional corresponding filter decision.
- File and directory filter composition is documented and tested.
- Impact expansion occurs only after all direct filters.
- Core and CLI tests cover no-match, combined-filter, derived, and JSON result shapes.
