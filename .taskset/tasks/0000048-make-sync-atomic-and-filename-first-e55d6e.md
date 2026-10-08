---
id: e55d6e
title: Make sync atomic and filename-first
status: doing
priority: urgent
owner: junkieshuffle
assignees:
  - junkieshuffle
createdAt: 2026-10-08 09:45 UTC
updatedAt: 2026-10-08 09:45 UTC
labels:
  - sync
  - migration
  - diagnostics
  - references
directories:
  - packages/core/src
  - packages/cli/src
  - docs
  - skills
projects:
  - taskset
---

# Outcome

Make repository sync preflight all canonical entities, report complete actionable diagnostics, safely normalize recoverable files, migrate references atomically, and use canonical repository-relative filenames in human-facing relationships and output.

# Checklist

- [ ] Add shared aggregate validation and structured diagnostics for sync and doctor.
- [ ] Preserve numeric-looking identity/reference strings and diagnose YAML coercion.
- [ ] Infer missing document types by canonical directory in safe-fix mode.
- [ ] Enforce every document template heading through shared validation.
- [ ] Build a cross-entity alias index and resolve legacy/mixed references.
- [ ] Serialize and display filename-first relationships with backward-compatible inputs.
- [ ] Rewrite proven prose references without touching unrelated content.
- [ ] Stage, validate, and atomically publish sync plans; support dry-run and idempotency.
- [ ] Update CLI help, public docs, agent guidance, and implementation standards.
- [ ] Add a compatible Changeset for affected public packages.
- [ ] Run focused, package, repository, CLI fixture, and idempotency validation.

# Acceptance Criteria

- Sync aggregates preflight errors and never mutates canonical data on unsafe input.
- Dry-run exposes every planned mutation; fix mode performs only documented safe repairs.
- Canonical relationships use repository-relative filenames while legacy IDs remain accepted input aliases.
- Doctor and sync share validity rules for all document templates.
- Migration is atomic and idempotent, including inbound relationship and managed-prose rewrites.
- JSON remains machine-readable and progress stays on stderr.

# Changeset

Required: compatible minor releases for @taskset/core and @taskset/cli, plus dependent public packages only if their exported contracts change.
