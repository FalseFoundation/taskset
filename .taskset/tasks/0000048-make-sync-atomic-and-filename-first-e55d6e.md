---
id: e55d6e
title: Make sync atomic and filename-first
status: done
priority: urgent
owner: junkieshuffle
assignees:
  - junkieshuffle
createdAt: 2026-10-08 09:45 UTC
updatedAt: 2026-10-08 10:19 UTC
labels:
  - sync
  - migration
  - diagnostics
  - references
related:
  - .taskset/decisions/0000004-use-canonical-filenames-for-human-facing-entity-references-e90081.md
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

- [x] Add shared aggregate validation and structured diagnostics for sync and doctor.
- [x] Preserve numeric-looking identity/reference strings and diagnose YAML coercion.
- [x] Infer missing document types by canonical directory in safe-fix mode.
- [x] Enforce every document template heading through shared validation.
- [x] Build a cross-entity alias index and resolve legacy/mixed references.
- [x] Serialize and display filename-first relationships with backward-compatible inputs.
- [x] Rewrite proven prose references without touching unrelated content.
- [x] Stage, validate, and atomically publish sync plans; support dry-run and idempotency.
- [x] Update CLI help, public docs, agent guidance, and implementation standards.
- [x] Add a compatible Changeset for affected public packages.
- [x] Run focused, package, repository, CLI fixture, and idempotency validation.

# Acceptance Criteria

- Sync aggregates preflight errors and never mutates canonical data on unsafe input.
- Dry-run exposes every planned mutation; fix mode performs only documented safe repairs.
- Canonical relationships use repository-relative filenames while legacy IDs remain accepted input aliases.
- Doctor and sync share validity rules for all document templates.
- Migration is atomic and idempotent, including inbound relationship and managed-prose rewrites.
- JSON remains machine-readable and progress stays on stderr.

# Changeset

Added `.changeset/calm-files-sync.md` with compatible minor releases for @taskset/contracts, @taskset/core, and @taskset/cli.
