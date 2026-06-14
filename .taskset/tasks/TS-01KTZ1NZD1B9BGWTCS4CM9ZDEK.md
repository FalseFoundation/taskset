---
schemaVersion: 1
id: TS-01KTZ1NZD1B9BGWTCS4CM9ZDEK
title: Add file-to-task and impact analysis queries
status: done
priority: medium
createdAt: 2026-06-12 23:11 UTC
updatedAt: 2026-06-13 01:13 UTC
labels:
  - taskset
  - core
  - impact
dependsOn:
  - TS-01KTZ1NBDS4SZ094ZM082NSD5S
files:
  - packages/core/src/projects
  - packages/core/src/search
  - packages/cli/src/cli.ts
---

## Context

Task metadata can reference repository files, but core cannot yet answer which work relates to a changed file or directory. This query is needed by CLI, editor, MCP, and monorepo workflows.

## Acceptance Criteria

- Core normalizes repository-relative POSIX paths and matches tasks by file or directory.
- Queries can include directly related tasks and, when requested, dependency-graph impact.
- Paths outside the repository and ambiguous normalization are rejected with actionable errors.
- CLI exposes a scriptable `tasks-for-file` command with JSON output.
- Fixture tests cover files, directories, monorepo package boundaries, no matches, and stable ordering.
