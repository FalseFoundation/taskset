---
id: e90081
type: decision
title: Use canonical filenames for human-facing entity references
status: accepted
createdAt: 2026-10-08 10:15 UTC
updatedAt: 2026-10-08 10:16 UTC
related:
  - .taskset/tasks/0000048-make-sync-atomic-and-filename-first-e55d6e.md
---

# Use canonical filenames for human-facing entity references

## Context

Opaque IDs are stable internally but make authoring, review, and prose difficult. Canonical filenames already carry sequence, slug, and identity.

## Decision

Persist complete repository-relative canonical filenames in relationship fields and show filenames plus titles in human output. Resolve paths, unique basenames, stems, and IDs through one immutable-ID index. Keep IDs in JSON for compatibility.

## Alternatives

Continue exposing bare IDs, or persist only basenames. Bare IDs are opaque; basenames can be ambiguous across entity directories.

## Consequences

Filename changes require atomic inbound-reference rewrites. Ambiguity must list candidate paths. Numeric-looking IDs remain quoted compatibility inputs.

## Migration

`taskset sync --fix --dry-run --json` plans safe normalization in a staged copy. `taskset sync --fix --json` validates and atomically publishes canonical files before rebuilding disposable views.

## Status

Accepted.
