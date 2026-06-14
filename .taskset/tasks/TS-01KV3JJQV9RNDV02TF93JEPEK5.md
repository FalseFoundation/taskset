---
schemaVersion: 2
id: TS-01KV3JJQV9RNDV02TF93JEPEK5
title: Complete focused TSDoc and complex-code comment audit
status: todo
priority: medium
createdAt: 2026-06-14 17:23 UTC
updatedAt: 2026-06-14 17:23 UTC
labels:
  - documentation
  - standards
dependsOn:
  - TS-01KV3JHHPAAEXS6KY18EZN6A21
  - TS-01KV3JHWQZ6814GY5CY68AX9FW
  - TS-01KV3JJ9W81E9DQH8NSWF4YWQD
files:
  - packages/core/src
  - packages/contracts/src
  - packages/utils/src
  - skills/standards/references/conventions.md
---

# Context

The previous implementation only added TSDoc to selected graph, transaction, synchronization, migration, generation, snapshot, task-file, and date entry points. It did not complete the requested overall audit of heavy or confusing public APIs, functions, and classes.

# Scope

- Audit exported APIs in configuration, diagnostics, graph, indexing, paths, repository transactions, search, synchronization, migrations, snapshots, generated views, task files, task repositories, contracts, and utilities.
- Add focused TSDoc where callers need invariants, side effects, failure modes, canonical-versus-derived behavior, atomicity, or compatibility explained.
- Add short comments before non-obvious algorithms and state transitions, especially graph traversal/cycle detection, synchronization merging, transaction rollback, migration/restore validation, generated-directory swapping, and metadata validation.
- Do not comment obvious assignments, trivial wrappers, or straightforward control flow.

# Acceptance Criteria

- Every non-obvious public API has concise useful TSDoc.
- Complex runtime blocks have only the comments needed to explain intent and invariants.
- Documentation accurately reflects the final validation, query, migration, snapshot, and generation behavior.
- Biome, package builds, and tests remain clean.
