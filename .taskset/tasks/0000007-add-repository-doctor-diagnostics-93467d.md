---
id: 93467d
title: Add repository doctor diagnostics
status: done
priority: medium
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-13 01:13 UTC
labels:
  - taskset
  - core
  - diagnostics
dependsOn:
  - .taskset/tasks/0000002-build-the-task-dependency-graph-and-integrity-validation-e05d3d.md
files:
  - packages/core/src/diagnostics
  - packages/cli/src/cli.ts
---

## Context

Reads currently stop at the first invalid task file. Maintainers need a non-mutating repository-wide diagnostic operation that reports all actionable format, path, duplicate-ID, and graph problems.

## Acceptance Criteria

- Core scans canonical task files and returns structured diagnostics without silently repairing data.
- Diagnostics include malformed frontmatter, schema failures, duplicate IDs, unsafe paths, missing references, and cycles.
- CLI exposes `taskset doctor` with human and JSON output and a nonzero exit code for invalid repositories.
- Output ordering is deterministic and identifies paths, fields, and remediation guidance.
- Tests cover multiple simultaneous failures and confirm the command does not mutate files.
