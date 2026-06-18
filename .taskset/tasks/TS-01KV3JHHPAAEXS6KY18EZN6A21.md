---
id: TS-01KV3JHHPAAEXS6KY18EZN6A21
title: Finish Zod validation across public core boundaries
status: done
priority: high
createdAt: 2026-06-14 17:23 UTC
updatedAt: 2026-06-15 20:36 UTC
labels:
  - validation
  - core
files:
  - packages/core/src/index.ts
  - packages/core/src/config
  - packages/core/src/diagnostics
  - packages/core/src/graph
  - packages/core/src/indexing
  - packages/core/src/projects
  - packages/core/src/repository
  - packages/core/src/tasks
  - packages/cli/src/cli.test.ts
---

# Context

The schema v2 work added Zod to major mutation and query paths, but it did not satisfy the original requirement that all public core inputs be validated consistently. Several exported operations still trust typed arguments or option objects without a runtime schema.

# Scope

- Inventory every export from `@taskset/core` that accepts caller-supplied data.
- Add and export focused Zod schemas for remaining public inputs and options, including repository discovery/initialization paths, graph/index inputs, delete/options, diagnostics, and other uncovered entry points where runtime validation is meaningful.
- Normalize Zod issues into stable typed core errors rather than leaking raw exceptions inconsistently.
- Keep `parseArgs` limited to tokenization and retain CLI usage exit code 2.
- Add CLI coverage for issue rendering and `superRefine` set/clear conflicts.

# Acceptance Criteria

- Every public core boundary has an explicit runtime-validation decision documented in code or tests.
- Invalid public inputs fail deterministically with field-level issues.
- CLI cross-option failures render actionable issues and return exit code 2.
- Existing valid API behavior remains compatible.
