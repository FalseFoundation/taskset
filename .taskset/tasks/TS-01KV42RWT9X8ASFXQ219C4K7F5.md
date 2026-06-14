---
schemaVersion: 2
id: TS-01KV42RWT9X8ASFXQ219C4K7F5
title: Expand defineConfig with statuses and validated project options
status: todo
priority: high
createdAt: 2026-06-14 22:06 UTC
updatedAt: 2026-06-14 22:06 UTC
labels:
  - config
  - contracts
  - core
files:
  - taskset.config.ts
  - packages/contracts/src/config.ts
  - packages/core/src/config
  - packages/core/src/tasks/taskRepository.ts
  - packages/cli/src/cli.ts
  - docs/configuration.md
---

## Context

`defineConfig` currently supports project metadata, task defaults, and configured priorities. Extend the public configuration contract so repositories can select and order active statuses alongside priorities and adopt other justified behavior or creation-default options without turning configuration into a second task store.

## Acceptance Criteria

- `tasks.statuses` can select and order statuses from the supported vocabulary, and task defaults must reference an enabled status.
- Creation, update, lifecycle transitions, listing, generated views, diagnostics, and configuration output consistently respect configured statuses.
- The design audits additional useful configuration candidates and adds only options with clear repository-level behavior, ownership, validation, and defaults.
- Configuration cannot relocate `.taskset/`, redefine canonical entity data, or create client-specific domain semantics.
- Unknown fields, empty active vocabularies, invalid defaults, duplicates, and unsupported values produce actionable validation errors.
- Public types, `defineConfig`, CLI JSON output, tests, examples, docs, standards, and Changesets stay aligned.

## Planning Note

Do not implement config fields, validators, or supporting functions as part of this planning work.
