---
id: TS-01KV42QJ2EVWG9D9K97NK7FM5T
title: Design memorable collision-resistant task IDs
status: todo
priority: urgent
createdAt: 2026-06-14 22:06 UTC
updatedAt: 2026-06-14 22:06 UTC
labels:
  - contracts
  - identifiers
  - breaking
dependsOn:
  - TS-01KV42PWW5Y7R4ACASSVBNPXQK
files:
  - packages/contracts/src/task.ts
  - packages/core/src/tasks/taskId.ts
  - packages/core/src/tasks/taskRepository.ts
  - packages/core/src/graph
  - packages/cli/src/cli.ts
  - docs/task-files.md
  - skills/standards/references/architecture.md
  - skills/standards/references/conventions.md
---

## Context

Uppercase ULID task IDs are collision-resistant but difficult for people to remember and discuss. Evaluate a Changesets-style memorable random identifier made from readable words while preserving Git-native branch safety and immutable references.

## Acceptance Criteria

- A short design decision compares candidate formats on memorability, entropy, filename safety, case sensitivity, branch collision risk, generation without central coordination, and copy/paste ergonomics.
- The selected format has a documented namespace, grammar, normalization policy, collision strategy, retry behavior, and practical entropy target.
- IDs remain immutable and safe in filenames, YAML, CLI arguments, links, relationships, generated views, and synchronization contracts.
- Compatibility for existing ULID IDs and mixed repositories is explicitly decided before changing validation or generation.
- Graph integrity, duplicate detection, fixtures, CLI output, docs, standards, and breaking Changesets cover the selected system.
- **File naming** for task files adopts Changesets-style human-readable slugs (e.g. `design-memorable-task-ids.md`) derived from the task title, while the `id` field in the frontmatter remains the canonical ULID (e.g. `TS-01KV42QJ2EVWG9D9K97NK7FM5T`).
- **Generated output** produces a sibling `generated/ulid/` directory containing copies of all tasks named by their ULID (e.g. `ulid/TS-01KV42QJ2EVWG9D9K97NK7FM5T.md`), providing stable machine-readable references alongside the human-readable filenames.
- The mapping between human-readable filename and ULID filename is authoritative via the `id` frontmatter field; no separate index file is required.
- Tooling (CLI, graph, sync, fixtures) resolves tasks by either filename form, always treating the `id` field as the canonical identifier.

## Planning Note

This task is for design and future implementation scope. Do not add ID generators, conversion functions, or migration scripts as part of this planning work.
