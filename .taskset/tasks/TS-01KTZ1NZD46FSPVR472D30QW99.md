---
schemaVersion: 1
id: TS-01KTZ1NZD46FSPVR472D30QW99
title: Add repository doctor diagnostics
status: todo
priority: medium
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-12 23:11 UTC
labels:
  - taskset
  - core
  - diagnostics
dependsOn:
  - TS-01KTZ1NBDRQ5Y2T9NCV0D7HZ6H
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
