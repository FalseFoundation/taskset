---
title: "ADR 0003: Snapshot Policy"
description: Use Git for history and reserve Taskset snapshots for explicit safety checkpoints.
---

# ADR 0003: Snapshot Policy

- Status: Accepted
- Date: 2026-06-12

## Context

Taskset needs safe mutation and recovery, but Git already records durable
project history. A second automatic history system would duplicate state and
confuse authority.

## Decision

- Git remains the normal task history and rollback system.
- Do not include a general snapshot subsystem in the MVP.
- Prefer dry runs, atomic writes, validation, diffs, and Git-aware warnings.
- A future explicit snapshot feature may protect uncommitted state before
  migrations, imports, repair commands, or bulk mutation.
- Snapshots are immutable, non-authoritative, conflict-aware on restore, and
  removable without changing current project state.

## Consequences

The MVP stays smaller and avoids hidden history. Snapshot work begins only when
a concrete destructive workflow cannot be made adequately safe with Git and
atomic file operations.
